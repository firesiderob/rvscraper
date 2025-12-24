/**
 * AI-Enhanced Contact Extractor Service
 *
 * Uses Claude API to intelligently extract contact information from websites.
 * Better at finding:
 * - Obfuscated emails (info [at] company [dot] com)
 * - Owner/decision-maker names and titles
 * - Best contact email when multiple exist
 * - Context-aware extraction
 */

const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client (lazy initialization)
let anthropic = null;

function getAnthropicClient() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

/**
 * Strip HTML to plain text while preserving mailto links
 */
function stripHtmlToText(html) {
  if (!html) return '';

  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/href=["']mailto:([^"']+)["']/gi, ' EMAIL: $1 ');
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');

  return text.trim();
}

/**
 * Use AI to extract contact info from page content
 */
async function extractWithAI(pageContent, businessName, websiteUrl) {
  const client = getAnthropicClient();
  if (!client) {
    console.log('    AI extraction unavailable (no API key)');
    return null;
  }

  // Truncate content to fit in context
  const truncatedContent = pageContent.substring(0, 40000);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `Extract contact information from this business website.

Business Name: ${businessName}
Website: ${websiteUrl}

Website Content:
---
${truncatedContent}
---

Extract:
1. Email addresses - look for mailto: links, plain emails, AND obfuscated formats like:
   - "info [at] company [dot] com"
   - "email: info(at)company.com"
   - "contact AT company DOT com"

2. Owner/decision-maker - look for names with titles like:
   - Owner, President, CEO, Founder, General Manager, Director
   - "Founded by...", "Meet the owner...", "About us" sections

3. Phone numbers - primary business phone

Respond in this exact JSON format:
{
  "emails": ["email1@example.com"],
  "bestEmail": "email1@example.com",
  "ownerName": "John Smith",
  "ownerTitle": "Owner",
  "phone": "555-123-4567",
  "confidence": "high|medium|low",
  "notes": "brief explanation"
}

If a field is not found, use null. Only return valid JSON.`
        }
      ]
    });

    const text = response.content[0].text.trim();

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (parseError) {
      console.log('    Warning: Could not parse AI response');
      return null;
    }
  } catch (error) {
    console.log(`    AI extraction error: ${error.message}`);
    return null;
  }
}

/**
 * Regex-based email extraction (fallback)
 */
function extractEmailsRegex(content) {
  const emailRegex = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
  const matches = content.match(emailRegex);
  if (!matches) return [];

  const junkTerms = ['sentry', 'example', 'wix.com', 'domain.com', '.png', '.jpg', '.gif', '.svg',
    'uhaul.com', 'godaddy', 'wordpress', 'cloudflare', 'bootstrap', 'google', 'facebook', 'twitter'];
  const genericPrefixes = ['privacy', 'legal', 'abuse', 'noreply', 'no-reply', 'webmaster'];

  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    if (junkTerms.some(term => lower.includes(term))) return false;
    if (genericPrefixes.some(prefix => lower.startsWith(prefix))) return false;
    return true;
  });
}

/**
 * Regex-based owner name extraction (fallback)
 */
function extractOwnerNameRegex(content) {
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
      if (name.length < 30 && !/\d/.test(name)) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Select best email from list
 */
function selectBestEmail(emails, businessName) {
  if (!emails || emails.length === 0) return null;

  const businessSlug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Priority 1: Email with business name
  let best = emails.find(e => e.toLowerCase().includes(businessSlug));

  // Priority 2: Personal-looking email (first.last)
  if (!best) {
    best = emails.find(e => {
      const local = e.split('@')[0].toLowerCase();
      return local.includes('.') || (local.length > 3 && local.length < 20 && !/\d{3,}/.test(local));
    });
  }

  // Priority 3: info@, contact@, hello@
  if (!best) {
    best = emails.find(e => {
      const local = e.split('@')[0].toLowerCase();
      return ['info', 'contact', 'hello', 'admin', 'owner'].includes(local);
    });
  }

  return best || emails[0];
}

/**
 * Main extraction function - works with Puppeteer browser instance
 *
 * @param {Browser} browser - Puppeteer browser instance
 * @param {string} url - Website URL to scrape
 * @param {string} businessName - Name of the business
 * @param {object} options - Options { useAI: boolean }
 */
async function extractContactInfo(browser, url, businessName, options = {}) {
  const { useAI = true } = options;

  console.log(`Visiting ${url} to find contact info...`);
  let page = null;
  let email = null;
  let ownerName = null;
  let aiResult = null;

  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Collect all page content
    let allContent = '';

    // 1. Fetch homepage
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    let homepageContent = await page.content().catch(() => '');
    allContent += `\n=== HOMEPAGE ===\n${stripHtmlToText(homepageContent)}`;

    // 2. Check for mailto: links (always do this - fast and reliable)
    const mailtoEmails = await page.evaluate(() => {
      const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      return mailtoLinks.map(link => {
        const href = link.getAttribute('href');
        return href.replace('mailto:', '').split('?')[0];
      });
    }).catch(() => []);

    // 3. Find and visit contact/about pages
    const potentialLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(l => {
          const text = l.innerText.toLowerCase();
          const href = l.href.toLowerCase();
          return (
            text.includes('contact') || text.includes('about') ||
            text.includes('team') || text.includes('staff') ||
            href.includes('contact') || href.includes('about')
          );
        })
        .map(l => l.href)
        .filter(href => href && !href.includes('facebook') && !href.includes('twitter'))
        .slice(0, 3);
    }).catch(() => []);

    for (const link of potentialLinks) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        const pageContent = await page.content().catch(() => '');
        const pagePath = new URL(link).pathname;
        allContent += `\n=== ${pagePath.toUpperCase()} PAGE ===\n${stripHtmlToText(pageContent)}`;

        // Also check for mailto on these pages
        const pageMailtos = await page.evaluate(() => {
          const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
          return mailtoLinks.map(link => link.getAttribute('href').replace('mailto:', '').split('?')[0]);
        }).catch(() => []);
        mailtoEmails.push(...pageMailtos);
      } catch (e) {
        // Continue on error
      }
    }

    // 4. Try AI extraction if enabled and API key exists
    if (useAI && process.env.ANTHROPIC_API_KEY && allContent.length > 100) {
      console.log('    Using AI extraction...');
      aiResult = await extractWithAI(allContent, businessName, url);

      if (aiResult) {
        if (aiResult.bestEmail) {
          email = aiResult.bestEmail;
          console.log(`    ✓ AI found email: ${email} (${aiResult.confidence})`);
        }
        if (aiResult.ownerName) {
          ownerName = aiResult.ownerName;
          if (aiResult.ownerTitle) {
            console.log(`    ✓ AI found owner: ${ownerName} (${aiResult.ownerTitle})`);
          } else {
            console.log(`    ✓ AI found owner: ${ownerName}`);
          }
        }
      }
    }

    // 5. Fallback to regex if AI didn't find email
    if (!email) {
      // First try mailto links
      const uniqueMailtos = [...new Set(mailtoEmails)].filter(e => e && e.includes('@'));
      if (uniqueMailtos.length > 0) {
        email = selectBestEmail(uniqueMailtos, businessName);
        console.log(`    ✓ Found mailto email: ${email}`);
      } else {
        // Try regex extraction
        const regexEmails = extractEmailsRegex(allContent);
        if (regexEmails.length > 0) {
          email = selectBestEmail(regexEmails, businessName);
          console.log(`    ✓ Found regex email: ${email}`);
        }
      }
    }

    // 6. Fallback to regex for owner name
    if (!ownerName) {
      ownerName = extractOwnerNameRegex(allContent);
      if (ownerName) {
        console.log(`    ✓ Found owner (regex): ${ownerName}`);
      }
    }

    await page.close();

    return {
      email,
      ownerName,
      ownerTitle: aiResult?.ownerTitle || null,
      phone: aiResult?.phone || null,
      confidence: aiResult?.confidence || (email ? 'regex' : 'none'),
      method: aiResult ? 'ai' : 'regex'
    };

  } catch (err) {
    console.log(`Failed to scrape website ${url}: ${err.message}`);
    if (page) await page.close().catch(() => {});
    return { email: null, ownerName: null, method: 'error' };
  }
}

/**
 * Standalone extraction without Puppeteer (uses fetch)
 * Good for batch processing or when browser isn't available
 */
async function extractContactInfoFetch(websiteUrl, businessName, options = {}) {
  const { useAI = true } = options;

  console.log(`Fetching ${websiteUrl} for contact info...`);

  async function fetchPage(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      return null;
    }
  }

  function normalizeUrl(url) {
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  const baseUrl = normalizeUrl(websiteUrl);
  if (!baseUrl) return { email: null, ownerName: null, method: 'error' };

  let allContent = '';
  let email = null;
  let ownerName = null;
  let aiResult = null;

  // Fetch homepage
  const homepage = await fetchPage(baseUrl);
  if (homepage) {
    allContent += `\n=== HOMEPAGE ===\n${stripHtmlToText(homepage)}`;
  }

  // Try contact pages
  const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
  for (const path of contactPaths) {
    const pageContent = await fetchPage(baseUrl + path);
    if (pageContent) {
      allContent += `\n=== ${path.toUpperCase()} ===\n${stripHtmlToText(pageContent)}`;
      break; // Usually one is enough
    }
  }

  if (!allContent.trim()) {
    return { email: null, ownerName: null, method: 'error', notes: 'Could not fetch pages' };
  }

  // Try AI extraction
  if (useAI && process.env.ANTHROPIC_API_KEY) {
    console.log('    Using AI extraction...');
    aiResult = await extractWithAI(allContent, businessName, websiteUrl);

    if (aiResult) {
      email = aiResult.bestEmail;
      ownerName = aiResult.ownerName;

      if (email) console.log(`    ✓ AI found email: ${email}`);
      if (ownerName) console.log(`    ✓ AI found owner: ${ownerName}`);
    }
  }

  // Fallback to regex
  if (!email) {
    const regexEmails = extractEmailsRegex(allContent);
    if (regexEmails.length > 0) {
      email = selectBestEmail(regexEmails, businessName);
      console.log(`    ✓ Found regex email: ${email}`);
    }
  }

  if (!ownerName) {
    ownerName = extractOwnerNameRegex(allContent);
    if (ownerName) console.log(`    ✓ Found owner (regex): ${ownerName}`);
  }

  return {
    email,
    ownerName,
    ownerTitle: aiResult?.ownerTitle || null,
    phone: aiResult?.phone || null,
    confidence: aiResult?.confidence || (email ? 'regex' : 'none'),
    method: aiResult ? 'ai' : 'regex'
  };
}

module.exports = {
  extractContactInfo,
  extractContactInfoFetch,
  extractWithAI,
  extractEmailsRegex,
  extractOwnerNameRegex,
  selectBestEmail
};
