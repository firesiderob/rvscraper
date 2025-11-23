// backend/src/scrapers/uhaulScraper.js
const puppeteer = require('puppeteer');
const Lead = require('../models/Lead');

const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

async function scrapeUHaulLocations(state, limit = 50) {
    console.log(`Scraping U-Haul locations for ${state}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // Navigate to U-Haul location finder
        await page.goto(`https://www.uhaul.com/Locations/${state}/`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for location listings to load
        await page.waitForSelector('.location-result', { timeout: 10000 }).catch(() => {
            console.log('No locations found or selector changed');
        });

        // Extract location data
        const locations = await page.evaluate(() => {
            const results = [];
            const locationElements = document.querySelectorAll('.location-result');

            locationElements.forEach(el => {
                const nameEl = el.querySelector('.location-name');
                const addressEl = el.querySelector('.location-address');
                const phoneEl = el.querySelector('.location-phone');

                if (nameEl && addressEl) {
                    results.push({
                        businessName: nameEl.textContent.trim(),
                        address: addressEl.textContent.trim(),
                        phone: phoneEl ? phoneEl.textContent.trim() : null
                    });
                }
            });

            return results;
        });

        console.log(`Found ${locations.length} U-Haul locations in ${state}`);

        // Save to database
        const savedLeads = [];
        for (const location of locations.slice(0, limit)) {
            try {
                // Parse address
                const addressParts = location.address.split(',');
                const city = addressParts[0]?.trim();
                const stateZip = addressParts[1]?.trim().split(' ');
                const zip = stateZip?.[stateZip.length - 1];

                // Check if lead already exists
                const existing = await Lead.findOne({
                    businessName: location.businessName,
                    state: state
                });

                if (!existing) {
                    const lead = new Lead({
                        businessName: location.businessName,
                        type: 'U-Haul',
                        address: location.address,
                        city: city,
                        state: state,
                        zip: zip,
                        phone: location.phone,
                        source: 'U-Haul Scraper'
                    });

                    await lead.save();
                    savedLeads.push(lead);
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
            const leads = await scrapeUHaulLocations(state, limit);
            results.push({ state, count: leads.length, leads });

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`Error scraping ${state}:`, error.message);
            results.push({ state, error: error.message });
        }
    }

    return results;
}

module.exports = {
    scrapeUHaulLocations,
    scrapeAllStates,
    US_STATES
};
