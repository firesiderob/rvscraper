const puppeteer = require('puppeteer');

async function extractContactInfo(browser, url, businessName) {
    console.log(`Visiting ${url} to find contact info...`);
    let page = null;
    let email = null;
    let ownerName = null;

    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Fast timeout, don't wait too long
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });

        // Initialize emails array
        let emails = null;

        // 1. Check for mailto: links first (most reliable)
        const mailtoEmails = await page.evaluate(() => {
            const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
            return mailtoLinks.map(link => {
                const href = link.getAttribute('href');
                return href.replace('mailto:', '').split('?')[0]; // Remove query params
            });
        });

        if (mailtoEmails && mailtoEmails.length > 0) {
            emails = mailtoEmails;
            console.log(`Found ${mailtoEmails.length} mailto: emails`);
        }

        // 2. Check homepage content for emails and owner name
        if (!emails || emails.length === 0 || !ownerName) {
            let content = await page.content();
            if (!emails || emails.length === 0) {
                emails = extractEmails(content);
                if (emails.length > 0) console.log(`Found ${emails.length} emails in homepage content`);
            }
            if (!ownerName) {
                ownerName = extractOwnerName(content);
                if (ownerName) console.log(`Found owner: ${ownerName}`);
            }
        }

        // 3. Check footer specifically (often contains contact email)
        if (!emails || emails.length === 0) {
            const footerEmails = await page.evaluate(() => {
                const footer = document.querySelector('footer');
                return footer ? footer.innerText : '';
            });
            if (footerEmails) {
                const footerEmailList = extractEmails(footerEmails);
                if (footerEmailList && footerEmailList.length > 0) {
                    emails = footerEmailList;
                    console.log(`Found ${footerEmailList.length} emails in footer`);
                }
            }
        }

        // 4. Look for "Contact", "About", "Team" pages
        if (!emails || emails.length === 0 || !ownerName) {
            const potentialLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links
                    .filter(l => {
                        const text = l.innerText.toLowerCase();
                        const href = l.href.toLowerCase();
                        return (
                            text.includes('contact') ||
                            text.includes('about') ||
                            text.includes('team') ||
                            text.includes('staff') ||
                            text.includes('leadership') ||
                            href.includes('contact') ||
                            href.includes('about') ||
                            href.includes('team')
                        );
                    })
                    .map(l => l.href)
                    .filter(href => href && !href.includes('facebook') && !href.includes('twitter'))
                    .slice(0, 5); // Check up to 5 pages
            });

            if (potentialLinks.length > 0) {
                console.log(`Checking ${potentialLinks.length} pages for contact/owner info...`);

                for (const link of potentialLinks) {
                    if (emails && emails.length > 0 && ownerName) break; // Stop if we found both
                    try {
                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });

                        // Check mailto links first
                        const pageMailtoEmails = await page.evaluate(() => {
                            const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
                            return mailtoLinks.map(link => {
                                const href = link.getAttribute('href');
                                return href.replace('mailto:', '').split('?')[0];
                            });
                        });

                        if (pageMailtoEmails && pageMailtoEmails.length > 0) {
                            emails = pageMailtoEmails;
                            console.log(`Found ${pageMailtoEmails.length} mailto: emails on ${link}`);
                        }

                        const pageContent = await page.content();

                        // Check for emails if we don't have them
                        if (!emails || emails.length === 0) {
                            const pageEmails = extractEmails(pageContent);
                            if (pageEmails && pageEmails.length > 0) {
                                emails = pageEmails;
                                console.log(`Found ${pageEmails.length} emails on ${link}`);
                            }
                        }

                        // Check for owner if we don't have it
                        if (!ownerName) {
                            ownerName = extractOwnerName(pageContent);
                            if (ownerName) console.log(`Found owner on ${link}: ${ownerName}`);
                        }

                    } catch (e) {
                        // console.log(`Failed to check ${link}: ${e.message}`);
                    }
                }
            }
        }

        if (emails && emails.length > 0) {
            // Filter out junk and generic corporate emails
            const junkTerms = ['sentry', 'example', 'wix.com', 'domain.com', '.png', '.jpg', '.gif', '.svg', 'uhaul.com', 'godaddy', 'wordpress', 'cloudflare', 'bootstrap', 'splide', 'intl-segmenter', 'segmenter', 'polyfill', 'webpack', 'babel', 'google', 'facebook', 'twitter', 'instagram'];
            const genericPrefixes = ['privacy', 'legal', 'abuse', 'press', 'media', 'jobs', 'careers', 'noreply', 'no-reply', 'webmaster', 'equipmentrecovery', 'reservations', 'support', 'help', 'sales', 'marketing'];

            const validEmails = emails.filter(e => {
                const lower = e.toLowerCase();
                if (junkTerms.some(term => lower.includes(term))) return false;
                if (genericPrefixes.some(prefix => lower.startsWith(prefix))) return false;
                return true;
            });

            if (validEmails.length > 0) {
                const businessNameSlug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Priority 1: Email with business name
                let bestEmail = validEmails.find(e => e.toLowerCase().includes(businessNameSlug));

                // Priority 2: Email that looks like a person (first.last, firstname)
                if (!bestEmail) {
                    bestEmail = validEmails.find(e => {
                        const localPart = e.split('@')[0].toLowerCase();
                        return localPart.includes('.') ||
                            (localPart.length > 3 && localPart.length < 20 && !/\d{3,}/.test(localPart));
                    });
                }

                // Priority 3: info@, contact@, hello@
                if (!bestEmail) {
                    bestEmail = validEmails.find(e => {
                        const localPart = e.split('@')[0].toLowerCase();
                        return ['info', 'contact', 'hello', 'admin', 'owner'].includes(localPart);
                    });
                }

                // Priority 4: Just take the first valid one
                if (!bestEmail) bestEmail = validEmails[0];

                email = bestEmail;
                console.log(`✓ Found email: ${email}`);
            }
        }

        await page.close();
        return { email, ownerName };

    } catch (err) {
        console.log(`Failed to scrape website ${url}: ${err.message}`);
        if (page) await page.close().catch(() => { });
        return { email: null, ownerName: null };
    }
}

function extractOwnerName(content) {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const patterns = [
        /Owner[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
        /President[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
        /CEO[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
        /Founder[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
        /Founded by[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
        /General Manager[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            if (name.length < 30 && !/\d/.test(name) && !name.toLowerCase().includes('contact')) {
                return name;
            }
        }
    }
    return null;
}

function extractEmails(content) {
    const emailRegex = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
    const matches = content.match(emailRegex);

    if (!matches) return [];

    const validEmails = matches.filter(email => {
        const lower = email.toLowerCase();
        if (/@\d+\./.test(lower)) return false;
        const parts = lower.split('@');
        if (parts.length !== 2) return false;
        const [localPart, domain] = parts;
        if (!localPart || /^\d+$/.test(localPart)) return false;
        const domainParts = domain.split('.');
        if (domainParts.length < 2) return false;
        const tld = domainParts[domainParts.length - 1];
        if (!tld || tld.length < 2 || /\d/.test(tld)) return false;
        const domainName = domainParts.slice(0, -1).join('.');
        if (!/[a-z]/.test(domainName)) return false;
        return true;
    });

    return [...new Set(validEmails)];
}

module.exports = { extractContactInfo };
