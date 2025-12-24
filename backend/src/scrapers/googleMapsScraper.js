// backend/src/scrapers/googleMapsScraper.js
const puppeteer = require('puppeteer');
const Lead = require('../models/Lead');
const { extractContactInfo } = require('../services/aiContactExtractor');

async function searchGoogleMaps(query, limit = 20) {
    console.log(`Searching Google Maps for: ${query}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();

    // Set stealth headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
        } catch (e) {
            console.log('Feed selector not found');
        }

        await autoScroll(page);

        // Extract basic data including website URL
        const businesses = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('div[role="article"]');

            items.forEach(item => {
                const ariaLabel = item.getAttribute('aria-label');
                if (!ariaLabel) return;

                const textContent = item.innerText;

                // Try to find website link
                const links = Array.from(item.querySelectorAll('a'));
                let website = null;

                for (const link of links) {
                    const href = link.href;
                    if (href && !href.includes('google.com') && !href.includes('tel:')) {
                        website = href;
                        break;
                    }
                    if (link.innerText.includes('Website')) {
                        website = link.href;
                        break;
                    }
                }

                // Phone regex
                const phoneRegex = /(\(\d{3}\)\s\d{3}-\d{4})|(\d{3}-\d{3}-\d{4})/;
                const phoneMatch = textContent.match(phoneRegex);

                results.push({
                    businessName: ariaLabel,
                    phone: phoneMatch ? phoneMatch[0] : null,
                    website: website,
                    rawText: textContent
                });
            });

            return results;
        });

        console.log(`Found ${businesses.length} results. Starting deep research for emails...`);

        // Deep Research: Visit websites to find emails
        const savedLeads = [];
        for (const business of businesses.slice(0, limit)) {
            let email = null;
            let ownerName = null;
            let address = parseAddress(business.rawText, query);

            // If we found a website, visit it to find email
            if (business.website) {
                const contactInfo = await extractContactInfo(browser, business.website, business.businessName);
                email = contactInfo.email;
                ownerName = contactInfo.ownerName;
            }

            try {
                // Determine state from address or query
                let state = address.state;
                if (!state) {
                    const stateMatch = query.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
                    if (stateMatch) state = stateMatch[0].toUpperCase();
                    else state = 'Unknown';
                }

                const existing = await Lead.findOne({
                    businessName: business.businessName,
                    state: state
                });

                if (!existing) {
                    const lead = new Lead({
                        businessName: business.businessName,
                        type: query.toLowerCase().includes('u-haul') ? 'U-Haul' : 'RV Tech',
                        address: address.fullAddress || 'See Google Maps',
                        city: address.city || 'Unknown',
                        state: state,
                        phone: business.phone,
                        email: email,
                        website: business.website,
                        source: `Google Maps Search: ${query}`,
                        notes: ownerName ? `Possible Owner/Contact: ${ownerName}` : undefined
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

                    // Update address if we have a better one
                    if (address.fullAddress && existing.address === 'See Google Maps') {
                        existing.address = address.fullAddress;
                        existing.city = address.city || existing.city;
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

function parseAddress(rawText, query = '') {
    // Attempt to find City, State Zip pattern
    // Example: "123 Main St, Dallas, TX 75001"
    const addressRegex = /([^,]+),\s+([A-Z]{2})\s+(\d{5})/;
    const match = rawText.match(addressRegex);

    if (match) {
        return {
            city: match[1].trim(),
            state: match[2],
            zip: match[3],
            fullAddress: match[0]
        };
    }

    // Fallback: Try to just find State and Zip
    const stateZipRegex = /\b([A-Z]{2})\s+(\d{5})\b/;
    const stateZipMatch = rawText.match(stateZipRegex);

    if (stateZipMatch) {
        const lines = rawText.split('\n');
        const addressLine = lines.find(line => line.includes(stateZipMatch[0])) || rawText.split('\n')[0];

        return {
            city: null,
            state: stateZipMatch[1],
            zip: stateZipMatch[2],
            fullAddress: addressLine.trim()
        };
    }

    // Fallback 2: Look for street address pattern (starts with number) and use query for City/State
    // Common format: "Category · 123 Main St" or just "123 Main St"
    const lines = rawText.split('\n');
    for (const line of lines) {
        // Check if line contains a street address (starts with number, has street type)
        // Or if it has a dot separator
        let potentialAddress = line;
        if (line.includes('·')) {
            const parts = line.split('·');
            // Usually the address is the last part if it contains a number
            const lastPart = parts[parts.length - 1].trim();
            if (/\d+/.test(lastPart)) {
                potentialAddress = lastPart;
            }
        }

        // Simple check: starts with number and has letters
        if (/^\d+\s+[A-Za-z]/.test(potentialAddress)) {
            // Infer City/State from query
            // Query: "RV repair Austin TX" -> City: Austin, State: TX
            let city = 'Unknown';
            let state = 'Unknown';

            // Try to extract state from query
            const stateMatch = query.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
            if (stateMatch) {
                state = stateMatch[0].toUpperCase();
                // Assume word before state is city
                const queryParts = query.split(' ');
                const stateIndex = queryParts.findIndex(p => p.toUpperCase() === state);
                if (stateIndex > 0) {
                    city = queryParts[stateIndex - 1].replace(/,/g, ''); // Simple heuristic
                }
            }

            return {
                city: city,
                state: state,
                zip: null,
                fullAddress: `${potentialAddress}, ${city}, ${state}`
            };
        }
    }

    return { city: null, state: null, zip: null, fullAddress: null };
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');
        if (!wrapper) return;

        await new Promise((resolve) => {
            let lastHeight = 0;
            let unchangedCount = 0;
            const distance = 1000;

            const timer = setInterval(() => {
                const currentHeight = wrapper.scrollHeight;
                wrapper.scrollBy(0, distance);

                // If height hasn't changed, increment counter
                if (currentHeight === lastHeight) {
                    unchangedCount++;
                    // Stop after 3 consecutive unchanged scrolls
                    if (unchangedCount >= 3) {
                        clearInterval(timer);
                        resolve();
                    }
                } else {
                    unchangedCount = 0; // Reset counter if height changed
                }

                lastHeight = currentHeight;
            }, 2000);
        });
    });
}

module.exports = { searchGoogleMaps };
