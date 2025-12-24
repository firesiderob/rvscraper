/**
 * AI-Enhanced Email Scraper for RVTI Technician Websites
 *
 * Uses Claude API to intelligently extract contact emails from websites.
 * Much better at finding:
 * - Obfuscated emails (info [at] company [dot] com)
 * - Emails in complex page structures
 * - The "best" contact email when multiple are found
 * - Contact info from messy HTML
 *
 * Usage:
 *   node scripts/scrapeEmailsWithAI.js                    # Scrape sites without emails
 *   node scripts/scrapeEmailsWithAI.js --limit 10        # Limit to 10 sites
 *   node scripts/scrapeEmailsWithAI.js --all             # Re-scrape all sites
 *   node scripts/scrapeEmailsWithAI.js --update-db       # Also update MongoDB
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const DATA_DIR = path.join(__dirname, '../data');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Common contact page paths to check
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
];

async function fetchPage(url, timeout = 15000) {
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

function normalizeUrl(url) {
  if (!url) return null;

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

function stripHtmlToText(html) {
  if (!html) return '';

  // Remove script and style tags completely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Keep mailto: links visible
  text = text.replace(/href=["']mailto:([^"']+)["']/gi, ' EMAIL: $1 ');

  // Replace common elements with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');

  return text.trim();
}

async function extractEmailWithAI(pageContent, businessName, websiteUrl) {
  // Truncate content to fit in context window (roughly 50k chars for safety)
  const truncatedContent = pageContent.substring(0, 50000);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are extracting contact email addresses from a business website.

Business Name: ${businessName}
Website: ${websiteUrl}

Here is the text content from the website:
---
${truncatedContent}
---

Your task:
1. Find any email addresses on this page
2. Look for obfuscated emails like "info [at] company [dot] com" or "email: info(at)company.com"
3. Identify the BEST contact email for reaching this business (prefer info@, contact@, or owner names over generic ones)

Respond in this exact JSON format:
{
  "emails_found": ["email1@example.com", "email2@example.com"],
  "best_email": "email1@example.com",
  "confidence": "high|medium|low",
  "notes": "brief note about where email was found or why confidence level"
}

If no email is found, respond with:
{
  "emails_found": [],
  "best_email": null,
  "confidence": "none",
  "notes": "reason no email was found"
}

IMPORTANT: Only return valid JSON, no other text.`
        }
      ]
    });

    const text = response.content[0].text.trim();

    // Parse JSON response
    try {
      // Try to extract JSON if there's extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (parseError) {
      console.log(`    Warning: Could not parse AI response`);
      return { emails_found: [], best_email: null, confidence: 'error', notes: 'Parse error' };
    }
  } catch (error) {
    console.log(`    AI Error: ${error.message}`);
    return { emails_found: [], best_email: null, confidence: 'error', notes: error.message };
  }
}

async function scrapeWebsiteWithAI(websiteUrl, businessName) {
  const baseUrl = normalizeUrl(websiteUrl);
  if (!baseUrl) return { emails_found: [], best_email: null, confidence: 'error', notes: 'Invalid URL' };

  let allContent = '';

  // Scrape homepage
  console.log(`    Fetching homepage...`);
  const homepage = await fetchPage(baseUrl);
  if (homepage) {
    allContent += `\n=== HOMEPAGE ===\n${stripHtmlToText(homepage)}`;
  }

  // Try contact pages
  for (const contactPath of CONTACT_PATHS) {
    const contactUrl = baseUrl + contactPath;
    console.log(`    Trying ${contactPath}...`);
    const contactPage = await fetchPage(contactUrl);
    if (contactPage) {
      allContent += `\n=== ${contactPath.toUpperCase()} PAGE ===\n${stripHtmlToText(contactPage)}`;
      break; // Usually one contact page is enough
    }
  }

  if (!allContent.trim()) {
    return { emails_found: [], best_email: null, confidence: 'error', notes: 'Could not fetch any pages' };
  }

  // Use AI to extract emails
  console.log(`    Analyzing with Claude AI...`);
  return await extractEmailWithAI(allContent, businessName, websiteUrl);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not found in .env file');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : null;
  const updateDb = args.includes('--update-db');
  const scrapeAll = args.includes('--all');

  // Load technicians data
  const dataFile = path.join(DATA_DIR, 'rvti_nearby_technicians.json');
  if (!fs.existsSync(dataFile)) {
    console.error('Data file not found. Run scrapeRvtiTechs.js first.');
    process.exit(1);
  }

  // Load previous scrape results to skip already-found emails
  const previousResultsFile = path.join(DATA_DIR, 'rvti_emails_scraped.json');
  let previousResults = [];
  if (fs.existsSync(previousResultsFile)) {
    previousResults = JSON.parse(fs.readFileSync(previousResultsFile, 'utf-8'));
  }
  const alreadyFound = new Set(
    previousResults.filter(r => r.primaryEmail).map(r => r.id)
  );

  const technicians = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  let withWebsites = technicians.filter(t => t.website);

  // By default, only process those without emails found yet
  if (!scrapeAll) {
    withWebsites = withWebsites.filter(t => !alreadyFound.has(t.id));
  }

  console.log('========================================');
  console.log('AI-Enhanced Email Scraper (Claude)');
  console.log('========================================');
  console.log(`Total technicians: ${technicians.length}`);
  console.log(`With websites: ${technicians.filter(t => t.website).length}`);
  console.log(`Already have emails: ${alreadyFound.size}`);
  console.log(`To process: ${withWebsites.length}`);
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
      const aiResult = await scrapeWebsiteWithAI(tech.website, tech.businessName);

      if (aiResult.best_email) {
        console.log(`    ✓ Found: ${aiResult.best_email} (${aiResult.confidence})`);
        if (aiResult.notes) console.log(`    Note: ${aiResult.notes}`);
        foundCount++;
        results.push({
          id: tech.id,
          businessName: tech.businessName,
          website: tech.website,
          emails: aiResult.emails_found,
          primaryEmail: aiResult.best_email,
          confidence: aiResult.confidence,
          notes: aiResult.notes,
          method: 'ai',
        });
      } else {
        console.log(`    ✗ No email found (${aiResult.confidence})`);
        if (aiResult.notes) console.log(`    Note: ${aiResult.notes}`);
        results.push({
          id: tech.id,
          businessName: tech.businessName,
          website: tech.website,
          emails: [],
          primaryEmail: null,
          confidence: aiResult.confidence,
          notes: aiResult.notes,
          method: 'ai',
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
        method: 'ai',
      });
    }

    // Rate limiting - be nice to both websites and API
    await sleep(1000);
  }

  // Merge with previous results
  const allResults = [...previousResults];
  for (const newResult of results) {
    const existingIndex = allResults.findIndex(r => r.id === newResult.id);
    if (existingIndex >= 0) {
      // Update if we found an email this time
      if (newResult.primaryEmail) {
        allResults[existingIndex] = newResult;
      }
    } else {
      allResults.push(newResult);
    }
  }

  // Save results
  const outputFile = path.join(DATA_DIR, 'rvti_emails_scraped.json');
  fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

  // Create CSV of all found emails
  const csvRows = ['id,businessName,email,website,confidence,method'];
  for (const r of allResults) {
    if (r.primaryEmail) {
      const confidence = r.confidence || 'unknown';
      const method = r.method || 'regex';
      csvRows.push(`${r.id},"${r.businessName.replace(/"/g, '""')}",${r.primaryEmail},"${r.website}",${confidence},${method}`);
    }
  }
  const csvFile = path.join(DATA_DIR, 'rvti_emails_found.csv');
  fs.writeFileSync(csvFile, csvRows.join('\n'));

  // Summary
  const totalWithEmails = allResults.filter(r => r.primaryEmail).length;

  console.log('');
  console.log('========================================');
  console.log('This Run Summary');
  console.log('========================================');
  console.log(`Processed: ${toProcess.length}`);
  console.log(`New emails found: ${foundCount}`);
  console.log(`No email: ${toProcess.length - foundCount - errorCount}`);
  console.log(`Errors: ${errorCount}`);
  if (toProcess.length > 0) {
    console.log(`Success rate: ${((foundCount / toProcess.length) * 100).toFixed(1)}%`);
  }

  console.log('');
  console.log('========================================');
  console.log('Overall Summary');
  console.log('========================================');
  console.log(`Total with emails: ${totalWithEmails}`);
  console.log(`Total without: ${allResults.length - totalWithEmails}`);
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
