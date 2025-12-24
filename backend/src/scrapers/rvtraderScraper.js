// backend/src/scrapers/rvtraderScraper.js
const puppeteer = require('puppeteer');
const Lead = require('../models/Lead');

async function scrapeRVTrader(state, city = '', rvType = '', limit = 50) {
    console.log(`Scraping RVTrader for: ${city ? city + ', ' : ''}${state}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // Build search URL
        // Build search URL (use sellerType=private if supported, otherwise omit)
        let baseUrl = `https://www.rvtrader.com/search-results?state=${state.toUpperCase()}`;
        if (city) baseUrl += `&city=${encodeURIComponent(city)}`;
        if (rvType) baseUrl += `&type=${encodeURIComponent(rvType)}`;
        // Attempt to use private seller filter; if it causes redirect or no results, we'll fallback later
        let searchUrl = `${baseUrl}&sellerType=private`;

        // Initial navigation with sellerType
        console.log(`Navigating to: ${searchUrl}`);
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 120000 });
        } catch (e) {
            console.warn('Initial navigation failed:', e.message);
        }

        // Check for listings with updated selector
        let linkCount = await page.$$eval('a[href*="/listing/"]', els => els.length);
        console.log(`Link count with sellerType=private: ${linkCount}`);

        if (linkCount === 0) {
            console.log('No links found with sellerType filter, retrying without...');
            searchUrl = searchUrl.replace('&sellerType=private', '');
            console.log(`Navigating to: ${searchUrl}`);
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            linkCount = await page.$$eval('a[href*="/listing/"]', els => els.length);
            console.log(`Link count without sellerType: ${linkCount}`);
        }

        // Wait for listings to load
        try {
            await page.waitForSelector('a[href*="/listing/"]', { timeout: 10000 });
        } catch (e) {
            console.log('No listings found');
            await browser.close();
            return [];
        }

        // Scroll to load more results
        await autoScroll(page, limit);

        // Extract listing data
        const listings = await page.evaluate(() => {
            const results = [];
            // Find all listing links
            const links = Array.from(document.querySelectorAll('a[href*="/listing/"]'));

            // Group by card (parent container)
            const cards = new Set();
            links.forEach(link => {
                // Walk up to find a container that looks like a card
                let parent = link.parentElement;
                let card = null;
                while (parent && parent.tagName !== 'BODY') {
                    // Heuristic: card usually has a class with 'card' or 'listing' or contains price/title
                    // But simpler: just go up 3-4 levels or find a specific container
                    // Let's assume the card is a few levels up. 
                    // We can check if it contains the text "Private seller" or "Dealer" to confirm it's a card.
                    if (parent.innerText.includes('View details') || parent.innerText.includes('$')) {
                        card = parent;
                        // Don't break immediately, find the outermost card container
                        // But we want the specific card.
                        // Let's stop at a div that looks substantial
                        if (parent.tagName === 'DIV' && parent.className.includes('tide-')) {
                            break;
                        }
                    }
                    parent = parent.parentElement;
                }
                if (card) cards.add(card);
            });

            cards.forEach(card => {
                try {
                    const text = card.innerText;
                    const isPrivate = text.toLowerCase().includes('private seller');

                    // If we want only private sellers, filter here
                    // But we might have removed the URL filter, so we MUST filter here.
                    // However, if the user requested private sellers, we should prioritize them.
                    // For now, let's extract all and filter in the main loop if needed, 
                    // OR just return isPrivate flag.

                    // Extract details
                    const titleElement = card.querySelector('a[href*="/listing/"]');
                    const title = titleElement ? titleElement.innerText.trim() : '';
                    const link = titleElement ? titleElement.href : '';

                    // Price
                    const priceMatch = text.match(/\$[\d,]+/);
                    const priceText = priceMatch ? priceMatch[0] : 'N/A';
                    const price = priceText !== 'N/A' ? parseInt(priceText.replace(/[^0-9]/g, '')) : null;

                    // Location
                    // Usually "City, ST"
                    const locationMatch = text.match(/([A-Za-z\s]+, [A-Z]{2})/);
                    const location = locationMatch ? locationMatch[0] : '';

                    // Extract year, make, model from title
                    let year = null;
                    let make = '';
                    let model = '';
                    const titleParts = title.split(' ');
                    if (titleParts.length > 0 && !isNaN(titleParts[0])) {
                        year = parseInt(titleParts[0]);
                        make = titleParts.length > 1 ? titleParts[1] : '';
                        model = titleParts.slice(2).join(' ');
                    }

                    if (title && link) {
                        results.push({
                            title,
                            price,
                            location,
                            link,
                            sellerName: isPrivate ? 'Private Seller' : 'Dealer',
                            year,
                            make,
                            model,
                            isPrivate
                        });
                    }
                } catch (err) {
                    console.log('Error parsing listing:', err);
                }
            });

            return results;
        });

        console.log(`Found ${listings.length} RVTrader listings`);

        // Import contact extractor and validators
        const { extractContactInfo } = require('../services/aiContactExtractor');
        const { validatePhone, validateEmail, validateName } = require('../utils/validators');

        // Save leads after extracting contact info from listing pages
        const savedLeads = [];
        for (const listing of listings.slice(0, limit)) {
            if (!listing.link) continue;

            try {
                // Parse location
                const [cityName, stateName] = listing.location.split(',').map(s => s.trim());

                // Check if lead already exists by website URL
                const existing = await Lead.findOne({ website: listing.link });

                // Only process new private seller listings
                if (!existing && listing.isPrivate) {
                    console.log(`\nExtracting contact info for: ${listing.title}...`);

                    // Open listing page to extract contact info
                    const listingPage = await browser.newPage();
                    await listingPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                    let sellerName = null;
                    let phone = null;
                    let email = null;

                    try {
                        await listingPage.goto(listing.link, { waitUntil: 'networkidle2', timeout: 30000 });
                        await listingPage.waitForTimeout(2000); // Wait for dynamic content

                        // PHASE 2A IMPROVEMENT #1: Click-to-reveal phone numbers
                        const phoneButtonSelectors = [
                            'button[data-qaid*="phone"]',
                            'button:has-text("Show Phone")',
                            'button:has-text("Call Now")',
                            '[class*="reveal-phone"]',
                            'button[class*="phone"]'
                        ];

                        for (const selector of phoneButtonSelectors) {
                            try {
                                const button = await listingPage.$(selector);
                                if (button) {
                                    console.log(`Clicking phone reveal button: ${selector}`);
                                    await button.click();
                                    await listingPage.waitForTimeout(1500); // Wait for reveal
                                    break;
                                }
                            } catch (e) {
                                // Continue to next selector
                            }
                        }

                        // Extract contact information from listing page
                        const contactData = await listingPage.evaluate(() => {
                            let name = null;
                            let phoneNum = null;
                            let emailAddr = null;

                            // Try to find seller name (various selectors)
                            const nameSelectors = [
                                '[data-qaid="cntnm-sellerName"]',
                                '.seller-name',
                                '[class*="seller"] h3',
                                '[class*="dealer"] h2',
                                '.contact-seller-name',
                                '.seller-info h2',
                                '.seller-info h3'
                            ];

                            for (const selector of nameSelectors) {
                                const el = document.querySelector(selector);
                                if (el && el.innerText.trim() && !el.innerText.toLowerCase().includes('dealer')) {
                                    name = el.innerText.trim();
                                    break;
                                }
                            }

                            // Try to find phone number (after click-to-reveal)
                            const phoneSelectors = [
                                'a[href^="tel:"]',
                                '[data-qaid="cntnm-phone"]',
                                '[data-qaid*="phone"]',
                                '[class*="phone-number"]',
                                '[class*="phone"]',
                                'button[class*="phone"]'
                            ];

                            for (const selector of phoneSelectors) {
                                const el = document.querySelector(selector);
                                if (el) {
                                    const href = el.getAttribute('href');
                                    if (href && href.startsWith('tel:')) {
                                        phoneNum = href.replace('tel:', '');
                                    } else {
                                        const text = el.innerText || el.textContent;
                                        const phoneMatch = text.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
                                        if (phoneMatch) phoneNum = phoneMatch[1];
                                    }
                                    if (phoneNum) break;
                                }
                            }

                            // Try to find email
                            const emailLink = document.querySelector('a[href^="mailto:"]');
                            if (emailLink) {
                                emailAddr = emailLink.getAttribute('href').replace('mailto:', '');
                            }

                            return { name, phoneNum, emailAddr };
                        });

                        sellerName = contactData.name;
                        phone = contactData.phoneNum;
                        email = contactData.emailAddr;

                        // If no email found on page, try using contactExtractor service
                        if (!email) {
                            console.log('No email on listing page, trying contactExtractor...');
                            try {
                                const extractedInfo = await extractContactInfo(listing.link, browser);
                                if (extractedInfo.email) {
                                    email = extractedInfo.email;
                                    console.log(`Found email via contactExtractor: ${email}`);
                                }
                                if (extractedInfo.ownerName && !sellerName) {
                                    sellerName = extractedInfo.ownerName;
                                }
                            } catch (extractError) {
                                console.log('ContactExtractor failed:', extractError.message);
                            }
                        }

                    } catch (pageError) {
                        console.log(`Error extracting contact from listing page: ${pageError.message}`);
                    } finally {
                        await listingPage.close();
                    }

                    // PHASE 2A IMPROVEMENT #2 & #3: Validate phone and email
                    const validatedPhone = validatePhone(phone);
                    const emailResult = validateEmail(email);

                    // Only use email if it passes validation and quality threshold
                    const validatedEmail = (emailResult.valid && emailResult.score >= 50)
                        ? emailResult.email
                        : null;

                    // PHASE 2A IMPROVEMENT #4: Validate and use ownerName
                    const validatedName = validateName(sellerName);

                    // Log validation results
                    if (phone && !validatedPhone) {
                        console.log(`⚠️  Invalid phone number filtered: ${phone}`);
                    }
                    if (email && !validatedEmail) {
                        console.log(`⚠️  Low-quality email filtered: ${email} (score: ${emailResult.score}, reason: ${emailResult.reason})`);
                    }

                    // Add delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 2500));

                    // Save lead with validated contact info and ownerName field
                    const lead = new Lead({
                        ownerName: validatedName,  // PHASE 2A: Use dedicated field
                        businessName: `${listing.year || ''} ${listing.make} ${listing.model}`.trim() || 'RV Owner',
                        type: 'RV Owner',
                        address: 'See Listing',
                        city: cityName || 'Unknown',
                        state: stateName || state,
                        phone: validatedPhone || 'Contact via listing',
                        email: validatedEmail,
                        website: listing.link,
                        source: `RVTrader: ${state}${city ? ' - ' + city : ''}`,
                        leadSource: 'RVTrader',
                        rvDetails: {
                            make: listing.make,
                            model: listing.model,
                            year: listing.year,
                            price: listing.price,
                            listingUrl: listing.link,
                            sellerType: 'Private Seller'
                        },
                        notes: `RV: ${listing.year} ${listing.make} ${listing.model}. Price: $${listing.price?.toLocaleString()}. ${validatedPhone ? 'Phone: ' + validatedPhone + '.' : ''} ${validatedEmail ? 'Email: ' + validatedEmail + '.' : ''} Listing: ${listing.link}`
                    });

                    await lead.save();
                    savedLeads.push(lead);
                    console.log(`✅ Saved: ${validatedName || 'RV Owner'} - ${listing.title} (${cityName}, ${stateName})${validatedPhone ? ' | Phone: ✓' : ''}${validatedEmail ? ' | Email: ✓ (score: ' + emailResult.score + ')' : ''}`);
                }
            } catch (error) {
                console.error(`Error saving listing: ${error.message}`);
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
            const maxScrolls = Math.ceil(maxResults / 20); // ~20 results per page

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

module.exports = { scrapeRVTrader };
