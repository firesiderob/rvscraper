// backend/src/scrapers/rvTechScraper.js
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Lead = require('../models/Lead');
const { extractContactInfo } = require('../services/contactExtractor');

const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

async function scrapeRVTechs(state, city = '', limit = 50) {
    console.log(`Scraping RV techs for ${state}${city ? `, ${city}` : ''}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // Search Yellow Pages for RV repair services
        const searchQuery = `RV+repair+${state}${city ? `+${city}` : ''}`;
        await page.goto(`https://www.yellowpages.com/search?search_terms=${searchQuery}&geo_location_terms=${state}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for results
        await page.waitForSelector('.result', { timeout: 10000 }).catch(() => {
            console.log('No results found');
        });

        // Extract business data
        const businesses = await page.evaluate(() => {
            const results = [];
            const businessElements = document.querySelectorAll('.result');

            businessElements.forEach(el => {
                const nameEl = el.querySelector('.business-name');
                const addressEl = el.querySelector('.street-address');
                const cityStateEl = el.querySelector('.locality');
                const phoneEl = el.querySelector('.phones');
                const websiteEl = el.querySelector('.track-visit-website');

                if (nameEl) {
                    let website = websiteEl ? websiteEl.getAttribute('href') : null;
                    if (website && website.includes('yellowpages.com')) website = null;

                    results.push({
                        businessName: nameEl.textContent.trim(),
                        address: addressEl ? addressEl.textContent.trim() : null,
                        cityState: cityStateEl ? cityStateEl.textContent.trim() : null,
                        phone: phoneEl ? phoneEl.textContent.trim() : null,
                        website: website
                    });
                }
            });

            return results;
        });

        console.log(`Found ${businesses.length} RV tech businesses in ${state}`);

        // Save to database
        const savedLeads = [];
        for (const business of businesses.slice(0, limit)) {
            let email = null;
            let ownerName = null;

            // Visit website to find email/owner if available
            if (business.website) {
                try {
                    const contactInfo = await extractContactInfo(browser, business.website, business.businessName);
                    email = contactInfo.email;
                    ownerName = contactInfo.ownerName;
                } catch (err) {
                    console.error(`Error extracting contact info for ${business.businessName}: ${err.message}`);
                }
            }

            try {
                // Parse city/state
                const cityStateParts = business.cityState?.split(',') || [];
                const cityName = cityStateParts[0]?.trim() || city;
                const stateCode = cityStateParts[1]?.trim().split(' ')[0] || state;

                // Check if lead already exists
                const existing = await Lead.findOne({
                    businessName: business.businessName,
                    state: stateCode
                });

                if (!existing) {
                    const lead = new Lead({
                        businessName: business.businessName,
                        type: 'RV Tech',
                        address: business.address,
                        city: cityName,
                        state: stateCode,
                        phone: business.phone,
                        email: email,
                        website: business.website,
                        source: 'RV Tech Scraper (Yellow Pages)',
                        notes: ownerName ? `Possible Owner: ${ownerName}` : undefined
                    });

                    await lead.save();
                    savedLeads.push(lead);
                } else {
                    let updated = false;
                    if (email && !existing.email) {
                        existing.email = email;
                        updated = true;
                    }
                    if (ownerName && !existing.notes?.includes('Owner')) {
                        const currentNotes = existing.notes || '';
                        existing.notes = currentNotes ? `${currentNotes}. Possible Owner: ${ownerName}` : `Possible Owner: ${ownerName}`;
                        updated = true;
                    }
                    if (updated) {
                        await existing.save();
                        savedLeads.push(existing);
                    }
                }
            } catch (error) {
                console.error(`Error saving lead: ${error.message}`);
            }
        }

        await browser.close();
        return savedLeads;

    } catch (error) {
        await browser.close();
        throw error;
    }
}

async function scrapeAllStates(limit = 10) {
    const results = [];

    for (const state of US_STATES) {
        try {
            const leads = await scrapeRVTechs(state, '', limit);
            results.push({ state, count: leads.length, leads });

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error(`Error scraping ${state}:`, error.message);
            results.push({ state, error: error.message });
        }
    }

    return results;
}

module.exports = {
    scrapeRVTechs,
    scrapeAllStates,
    US_STATES
};
