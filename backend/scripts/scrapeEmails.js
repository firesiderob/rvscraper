/**
 * Email Scraper for RVTI Technician Websites
 *
 * Visits each tech's website and extracts email addresses from:
 * - mailto: links
 * - Contact pages
 * - Footer content
 * - Plain text email patterns
 *
 * Usage:
 *   node scripts/scrapeEmails.js              # Scrape all
 *   node scripts/scrapeEmails.js --limit 50   # Limit to 50 sites
 *   node scripts/scrapeEmails.js --update-db  # Also update MongoDB
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common contact page paths to check
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/get-in-touch',
  '/reach-us',
  '/connect',
];

// Domains to skip (social media, generic services)
const SKIP_DOMAINS = [
  'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com',
  'google.com', 'gmail.com', 'outlook.com', 'yahoo.com',
  'wixsite.com', 'squarespace.com', 'godaddy.com',
  'example.com', 'sentry.io', 'cloudflare.com'
];

// Common non-business email patterns to filter out
const SKIP_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^admin@/i,
  /^webmaster@/i,
  /^hostmaster@/i,
  /^postmaster@/i,
  /^support@.*\.(wix|squarespace|godaddy)/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
];

async function fetchPage(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
}

function extractEmails(html) {
  if (!html) return [];

  // Find all email-like strings
  const matches = html.match(EMAIL_REGEX) || [];

  // Dedupe and filter
  const unique = [...new Set(matches)];

  return unique.filter(email => {
    // Skip if matches any skip pattern
    for (const pattern of SKIP_EMAIL_PATTERNS) {
      if (pattern.test(email)) return false;
    }

    // Skip if from a social/service domain
    const domain = email.split('@')[1]?.toLowerCase();
    for (const skipDomain of SKIP_DOMAINS) {
      if (domain?.includes(skipDomain)) return false;
    }

    // Basic validation
    if (email.length < 6 || email.length > 100) return false;

    return true;
  });
}

function normalizeUrl(url) {
  if (!url) return null;

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

async function scrapeWebsiteForEmails(websiteUrl) {
  const baseUrl = normalizeUrl(websiteUrl);
  if (!baseUrl) return [];

  const allEmails = new Set();

  // Scrape homepage
  console.log(`    Fetching homepage...`);
  const homepage = await fetchPage(baseUrl);
  if (homepage) {
    extractEmails(homepage).forEach(e => allEmails.add(e.toLowerCase()));
  }

  // If we found emails on homepage, might be enough
  if (allEmails.size > 0) {
    return [...allEmails];
  }

  // Try contact pages
  for (const contactPath of CONTACT_PATHS) {
    const contactUrl = baseUrl + contactPath;
    console.log(`    Trying ${contactPath}...`);
    const contactPage = await fetchPage(contactUrl);
    if (contactPage) {
      extractEmails(contactPage).forEach(e => allEmails.add(e.toLowerCase()));
      if (allEmails.size > 0) break; // Found some, stop looking
    }
  }

  return [...allEmails];
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : null;
  const updateDb = args.includes('--update-db');

  // Load technicians data
  const dataFile = path.join(DATA_DIR, 'rvti_nearby_technicians.json');
  if (!fs.existsSync(dataFile)) {
    console.error('Data file not found. Run scrapeRvtiTechs.js first.');
    process.exit(1);
  }

  const technicians = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  const withWebsites = technicians.filter(t => t.website);

  console.log('========================================');
  console.log('RVTI Technician Email Scraper');
  console.log('========================================');
  console.log(`Total technicians: ${technicians.length}`);
  console.log(`With websites: ${withWebsites.length}`);
  if (limit) console.log(`Limiting to: ${limit}`);
  console.log('');

  const toProcess = limit ? withWebsites.slice(0, limit) : withWebsites;
  const results = [];
  let foundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const tech = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${tech.businessName}`);
    console.log(`    Website: ${tech.website}`);

    try {
      const emails = await scrapeWebsiteForEmails(tech.website);

      if (emails.length > 0) {
        console.log(`    ✓ Found: ${emails.join(', ')}`);
        foundCount++;
        results.push({
          id: tech.id,
          businessName: tech.businessName,
          website: tech.website,
          emails: emails,
          primaryEmail: emails[0], // First found is usually best
        });
      } else {
        console.log(`    ✗ No email found`);
        results.push({
          id: tech.id,
          businessName: tech.businessName,
          website: tech.website,
          emails: [],
          primaryEmail: null,
        });
      }
    } catch (error) {
      console.log(`    ✗ Error: ${error.message}`);
      errorCount++;
      results.push({
        id: tech.id,
        businessName: tech.businessName,
        website: tech.website,
        emails: [],
        primaryEmail: null,
        error: error.message,
      });
    }

    // Small delay to be polite to servers
    await sleep(500);
  }

  // Save results
  const outputFile = path.join(DATA_DIR, 'rvti_emails_scraped.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  // Create a simple CSV of found emails
  const csvRows = ['id,businessName,email,website'];
  for (const r of results) {
    if (r.primaryEmail) {
      csvRows.push(`${r.id},"${r.businessName.replace(/"/g, '""')}",${r.primaryEmail},"${r.website}"`);
    }
  }
  const csvFile = path.join(DATA_DIR, 'rvti_emails_found.csv');
  fs.writeFileSync(csvFile, csvRows.join('\n'));

  console.log('');
  console.log('========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Emails found: ${foundCount}`);
  console.log(`No email: ${toProcess.length - foundCount - errorCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Success rate: ${((foundCount / toProcess.length) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`Results saved to: ${outputFile}`);
  console.log(`CSV saved to: ${csvFile}`);

  // Update database if requested
  if (updateDb) {
    console.log('');
    console.log('Updating database...');
    await updateDatabase(results);
  }
}

async function updateDatabase(results) {
  const mongoose = require('mongoose');
  const Lead = require('../src/models/Lead');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  let updated = 0;
  for (const result of results) {
    if (result.primaryEmail) {
      const updateResult = await Lead.updateOne(
        { businessName: result.businessName, source: 'RVTI' },
        { $set: { email: result.primaryEmail } }
      );
      if (updateResult.modifiedCount > 0) {
        updated++;
      }
    }
  }

  console.log(`Updated ${updated} records with emails`);
  await mongoose.disconnect();
}

// Run
main().catch(console.error);
