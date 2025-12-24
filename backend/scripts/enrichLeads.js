/**
 * Lead Enrichment Script
 * Researches each lead to find owner names, LinkedIn profiles, and personal emails
 *
 * Usage: node scripts/enrichLeads.js
 */

require('dotenv').config();
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const sourceFile = '/Users/robboirun/Downloads/rvti(2).csv';
const outputFile = '/Users/robboirun/Downloads/enriched_leads.csv';
const progressFile = '/Users/robboirun/Downloads/enrichment_progress.json';

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between requests
const BATCH_SIZE = 10; // Process 10 leads then save progress

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse CSV properly handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Fetch webpage content
async function fetchWebpage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    // Strip HTML tags for simpler processing
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .substring(0, 8000); // Limit text size
    return text;
  } catch (error) {
    return null;
  }
}

// Use Claude to extract owner info from text
async function extractOwnerInfo(businessName, websiteText, state) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this text from the website of "${businessName}" (an RV repair/service business in ${state}).

Extract the following information if available:
1. Owner/Founder name (first and last name)
2. Any personal email addresses (not generic like info@ or contact@)
3. LinkedIn profile URL if mentioned

Website text:
${websiteText}

Respond in JSON format only:
{
  "ownerFirstName": "string or null",
  "ownerLastName": "string or null",
  "personalEmail": "string or null",
  "linkedinUrl": "string or null",
  "confidence": "high/medium/low"
}`
      }]
    });

    const content = response.content[0].text;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Claude API error:', error.message);
    return null;
  }
}

// Search for business owner using web search simulation via about/contact pages
async function searchForOwner(businessName, website, state) {
  let websiteText = '';

  if (website) {
    // Try to fetch main page and about/contact pages
    const urls = [
      website,
      website.replace(/\/$/, '') + '/about',
      website.replace(/\/$/, '') + '/about-us',
      website.replace(/\/$/, '') + '/contact',
      website.replace(/\/$/, '') + '/team'
    ];

    for (const url of urls) {
      const text = await fetchWebpage(url);
      if (text) {
        websiteText += ' ' + text;
      }
      await sleep(500); // Small delay between page fetches
    }
  }

  if (websiteText.length > 100) {
    return await extractOwnerInfo(businessName, websiteText, state);
  }

  return null;
}

// Load progress
function loadProgress() {
  try {
    if (fs.existsSync(progressFile)) {
      return JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
    }
  } catch (e) {}
  return { processedIndices: [], enrichedData: {} };
}

// Save progress
function saveProgress(progress) {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

// Main function
async function enrichLeads() {
  console.log('='.repeat(60));
  console.log('Lead Enrichment Script');
  console.log('='.repeat(60));

  // Read source file
  const content = fs.readFileSync(sourceFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  console.log(`Total leads to process: ${lines.length - 1}`);

  // Load previous progress
  const progress = loadProgress();
  console.log(`Previously processed: ${progress.processedIndices.length} leads`);

  let processed = 0;
  let enriched = 0;

  for (let i = 1; i < lines.length; i++) {
    // Skip if already processed
    if (progress.processedIndices.includes(i)) {
      continue;
    }

    const fields = parseCSVLine(lines[i]);

    // Fields: Business Name, Type, Address, City, State, Zip, Phone, Email, Website
    const businessName = fields[0] || '';
    const city = fields[3] || '';
    const state = fields[4] || '';
    const zip = fields[5] || '';
    const phone = fields[6] || '';
    const existingEmail = fields[7] || '';
    const website = fields[8] || '';

    console.log(`\n[${i}/${lines.length - 1}] Processing: ${businessName}`);

    // Skip if no website to research
    if (!website) {
      console.log('  ⏭️  No website, skipping...');
      progress.processedIndices.push(i);
      progress.enrichedData[i] = {
        businessName,
        noWebsite: true,
        ownerFirstName: null,
        ownerLastName: null,
        personalEmail: null,
        linkedinUrl: null
      };
      continue;
    }

    console.log(`  🔍 Researching: ${website}`);

    try {
      const ownerInfo = await searchForOwner(businessName, website, state);

      if (ownerInfo) {
        console.log(`  ✅ Found info:`, JSON.stringify(ownerInfo));
        enriched++;

        progress.enrichedData[i] = {
          businessName,
          city,
          state,
          zip,
          phone,
          existingEmail,
          website,
          ...ownerInfo
        };
      } else {
        console.log('  ❌ No owner info found');
        progress.enrichedData[i] = {
          businessName,
          city,
          state,
          zip,
          phone,
          existingEmail,
          website,
          ownerFirstName: null,
          ownerLastName: null,
          personalEmail: null,
          linkedinUrl: null
        };
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      progress.enrichedData[i] = {
        businessName,
        error: error.message
      };
    }

    progress.processedIndices.push(i);
    processed++;

    // Save progress every BATCH_SIZE leads
    if (processed % BATCH_SIZE === 0) {
      saveProgress(progress);
      console.log(`\n📁 Progress saved (${progress.processedIndices.length} total processed)`);
    }

    // Rate limiting
    await sleep(DELAY_BETWEEN_REQUESTS);
  }

  // Final save
  saveProgress(progress);

  // Generate enriched CSV
  console.log('\n' + '='.repeat(60));
  console.log('Generating enriched CSV...');

  const csvHeader = 'email,phone,city,state,zip,country,fn,ln,company,linkedin,personal_email,original_email,website';
  const csvRows = [csvHeader];

  for (const [index, data] of Object.entries(progress.enrichedData)) {
    if (data.noWebsite && !data.phone && !data.existingEmail) continue;

    const phone = (data.phone || '').replace(/[^0-9]/g, '');
    let formattedPhone = phone;
    if (phone.length === 10) {
      formattedPhone = '1' + phone;
    }

    // Use personal email if found, otherwise use existing
    const primaryEmail = data.personalEmail || data.existingEmail || '';

    const row = [
      primaryEmail,
      formattedPhone,
      data.city || '',
      data.state || '',
      data.zip || '',
      'US',
      data.ownerFirstName || '',
      data.ownerLastName || '',
      data.businessName || '',
      data.linkedinUrl || '',
      data.personalEmail || '',
      data.existingEmail || '',
      data.website || ''
    ].map(f => '"' + (f || '').replace(/"/g, '""') + '"').join(',');

    csvRows.push(row);
  }

  fs.writeFileSync(outputFile, csvRows.join('\n'));

  console.log('='.repeat(60));
  console.log('COMPLETE!');
  console.log(`Total processed: ${progress.processedIndices.length}`);
  console.log(`Enriched with owner info: ${enriched}`);
  console.log(`Output file: ${outputFile}`);
  console.log('='.repeat(60));
}

// Run
enrichLeads().catch(console.error);
