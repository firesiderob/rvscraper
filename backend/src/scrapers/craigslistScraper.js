// backend/src/scrapers/craigslistScraper.js
const puppeteer = require('puppeteer');
const Lead = require('../models/Lead');

// City to Craigslist subdomain mapping (major cities)
const cityToSubdomain = {
    // Texas
    'austin': 'austin',
    'dallas': 'dallas',
    'houston': 'houston',
    'san antonio': 'sanantonio',
    // California
    'los angeles': 'losangeles',
    'san diego': 'sandiego',
    'san francisco': 'sfbay',
    'sacramento': 'sacramento',
    // Florida
    'miami': 'miami',
    'orlando': 'orlando',
    'tampa': 'tampa',
    'jacksonville': 'jacksonville',
    // New York
    'new york': 'newyork',
    'buffalo': 'buffalo',
    // Add more as needed
};

async function scrapeCraigslist(city, state, limit = 50) {
    console.log(`Scraping Craigslist RVs for: ${city}, ${state}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // Get Craigslist subdomain
        const subdomain = cityToSubdomain[city.toLowerCase()] || city.toLowerCase().replace(/\s+/g, '');

        // Build search URL - /search/rva is RVs (all), /search/rvs is RVs by owner
        // Use /search/rva to get all listings, then filter in code
        const searchUrl = `https://${subdomain}.craigslist.org/search/rva`;

        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for listings - Craigslist uses gallery view
        try {
            await page.waitForSelector('a[href*="/rvs/"], a[href*="/rvd/"]', { timeout: 10000 });
            console.log('✅ Found listing links on page');
        } catch (e) {
            console.log('❌ No listings found - selector not matching');
            console.log('   Page title:', await page.title());
            console.log('   URL:', page.url());
            await browser.close();
            return [];
        }

        // Scroll to load more
        await autoScroll(page, limit);

        // Extract listing URLs and basic info - gallery view structure
        const listings = await page.evaluate(() => {
            const results = [];
            // Find all gallery cards
            const cards = document.querySelectorAll('.gallery-card');

            cards.forEach(card => {
                try {
                    // Get the main link
                    const linkEl = card.querySelector('a.cl-search-anchor.posting-title');
                    if (!linkEl) return;

                    const url = linkEl.href;
                    const title = linkEl.innerText.trim();

                    // Get price
                    const priceEl = card.querySelector('.priceinfo, .price');
                    const priceText = priceEl ? priceEl.innerText.trim() : '';
                    const price = priceText ? parseInt(priceText.replace(/[^0-9]/g, '')) : null;

                    // Get location
                    const locationEl = card.querySelector('.location');
                    const location = locationEl ? locationEl.innerText.trim() : '';

                    // Filter out dealers (keep only /rvs/ not /rvd/)
                    const isOwner = url && url.includes('/rvs/');

                    if (url && isOwner) {
                        results.push({
                            url,
                            title,
                            price,
                            location
                        });
                    }
                } catch (err) {
                    // Skip this listing
                }
            });

            return results;
        });

        console.log(`Found ${listings.length} Craigslist owner listings (filtered out dealers)`);

        // Import validators for Phase 2A
        const { validatePhone, validateEmail, validateName } = require('../utils/validators');

        // Visit each listing to get contact info
        const savedLeads = [];
        for (const listing of listings.slice(0, limit)) {
            try {
                console.log(`\nVisiting listing: ${listing.title}...`);
                const listingPage = await browser.newPage();
                await listingPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

                await listingPage.goto(listing.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });

                // Extract contact info and details
                const details = await listingPage.evaluate(() => {
                    const info = {
                        phone: null,
                        email: null,
                        sellerName: null,
                        description: '',
                        postingBody: ''
                    };

                    // Get posting body
                    const bodyEl = document.querySelector('#postingbody');
                    if (bodyEl) {
                        info.postingBody = bodyEl.innerText;
                        info.description = bodyEl.innerText;
                    }

                    // Try to extract seller name from description
                    // Common patterns: "Contact John", "Call Mike", "Ask for Sarah"
                    const namePatterns = [
                        /(?:contact|call|ask for|text|email)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                        /(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                        /(?:seller|owner):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
                    ];

                    for (const pattern of namePatterns) {
                        const match = info.postingBody.match(pattern);
                        if (match) {
                            info.sellerName = match[1].trim();
                            break;
                        }
                    }

                    // Extract phone numbers from text
                    const phoneRegex = /(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
                    const phoneMatches = (info.postingBody || '').match(phoneRegex);
                    if (phoneMatches && phoneMatches.length > 0) {
                        // Take first phone number found
                        info.phone = phoneMatches[0];
                    }

                    // Extract email addresses from text
                    const emailRegex = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
                    const emailMatches = (info.postingBody || '').match(emailRegex);
                    if (emailMatches) {
                        // Filter out craigslist/example emails
                        const validEmails = emailMatches.filter(e => {
                            const lower = e.toLowerCase();
                            return !lower.includes('craigslist') &&
                                !lower.includes('example') &&
                                !/@\d+\./.test(lower) &&
                                !lower.includes('noreply');
                        });
                        if (validEmails.length > 0) info.email = validEmails[0];
                    }

                    return info;
                });

                await listingPage.close();

                // PHASE 2A: Validate extracted contact info
                const validatedPhone = validatePhone(details.phone);
                const emailResult = validateEmail(details.email);
                const validatedEmail = (emailResult.valid && emailResult.score >= 50)
                    ? emailResult.email
                    : null;
                const validatedName = validateName(details.sellerName);

                // Log validation results
                if (details.phone && !validatedPhone) {
                    console.log(`⚠️  Invalid phone filtered: ${details.phone}`);
                }
                if (details.email && !validatedEmail) {
                    console.log(`⚠️  Low-quality email filtered: ${details.email} (score: ${emailResult.score})`);
                }

                // Parse RV details from title
                const titleLower = listing.title.toLowerCase();
                let rvType = 'RV';
                if (titleLower.includes('class a')) rvType = 'Class A';
                else if (titleLower.includes('class b')) rvType = 'Class B';
                else if (titleLower.includes('class c')) rvType = 'Class C';
                else if (titleLower.includes('travel trailer')) rvType = 'Travel Trailer';
                else if (titleLower.includes('fifth wheel')) rvType = 'Fifth Wheel';
                else if (titleLower.includes('motorhome')) rvType = 'Motorhome';
                else if (titleLower.includes('camper')) rvType = 'Camper';

                // Extract year and make/model from title
                const yearMatch = listing.title.match(/\b(19|20)\d{2}\b/);
                const year = yearMatch ? parseInt(yearMatch[0]) : null;

                // Try to extract make/model
                let make = '';
                let model = '';
                const titleParts = listing.title.split(/\s+/);
                if (year && titleParts.length > 2) {
                    // After year, next word might be make
                    const yearIndex = titleParts.findIndex(p => p === year.toString());
                    if (yearIndex >= 0 && yearIndex < titleParts.length - 1) {
                        make = titleParts[yearIndex + 1];
                        if (yearIndex < titleParts.length - 2) {
                            model = titleParts.slice(yearIndex + 2).join(' ');
                        }
                    }
                }

                // Check for existing lead (avoid duplicates by phone or website)
                let existing = null;
                if (validatedPhone) {
                    existing = await Lead.findOne({
                        phone: validatedPhone,
                        state: state
                    });
                }
                if (!existing) {
                    existing = await Lead.findOne({ website: listing.url });
                }

                // Only save if has contact info and not duplicate
                if (!existing && (validatedPhone || validatedEmail)) {
                    const lead = new Lead({
                        ownerName: validatedName,  // PHASE 2A: Use dedicated field
                        businessName: `${year || ''} ${make} ${model || rvType}`.trim() || listing.title || 'RV Owner',
                        type: 'RV Owner',
                        address: listing.location || 'See Listing',
                        city: city,
                        state: state,
                        phone: validatedPhone,
                        email: validatedEmail,
                        website: listing.url,
                        source: `Craigslist: ${city}, ${state}`,
                        leadSource: 'Craigslist',
                        rvDetails: {
                            rvType: rvType,
                            make: make,
                            model: model,
                            year: year,
                            price: listing.price,
                            listingUrl: listing.url
                        },
                        notes: `${details.description.substring(0, 200)}...`
                    });

                    await lead.save();
                    savedLeads.push(lead);
                    console.log(`✅ Saved: ${validatedName || 'RV Owner'} - ${listing.title}${validatedPhone ? ' | Phone: ✓' : ''}${validatedEmail ? ' | Email: ✓ (score: ' + emailResult.score + ')' : ''}`);
                } else if (existing) {
                    console.log(`⏭️  Skipped duplicate: ${listing.title}`);
                } else {
                    console.log(`⏭️  Skipped (no valid contact info): ${listing.title}`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`Error processing listing: ${error.message}`);
            }
        }

        await browser.close();
        return savedLeads;

    } catch (error) {
        await browser.close();
        throw error;
    }
}

async function autoScroll(page, maxResults) {
    await page.evaluate(async (maxResults) => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 1000;
            let scrollCount = 0;
            const maxScrolls = Math.ceil(maxResults / 120); // Craigslist loads 120 per page

            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                scrollCount++;

                if (scrollCount >= maxScrolls || totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1500);
        });
    }, maxResults);
}

module.exports = { scrapeCraigslist };
