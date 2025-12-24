/**
 * Create Clean Facebook Custom Audience CSV
 * Filters out junk emails and formats data properly for Facebook upload
 */

const fs = require('fs');

const inputFile = '/Users/robboirun/Downloads/enriched_leads.csv';
const outputFile = '/Users/robboirun/Downloads/facebook_audience_clean.csv';

// Junk email patterns to filter out
const junkEmailPatterns = [
  'sentry-next.wixpress.com',
  'support@webador.com',
  'noreply@',
  'no-reply@',
  'donotreply@',
  '@example.com',
  '@test.com',
  'admin@admin',
  'info@info'
];

function isJunkEmail(email) {
  if (!email) return true;
  const lower = email.toLowerCase();
  return junkEmailPatterns.some(pattern => lower.includes(pattern));
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isJunkEmail(email);
}

function cleanPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  // Add country code if 10 digits
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

// Parse CSV line handling quotes
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

// Read and process
const content = fs.readFileSync(inputFile, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

// Facebook required format
const fbHeader = 'email,phone,city,state,zip,country,fn,ln';
const rows = [fbHeader];

let stats = {
  total: 0,
  withEmail: 0,
  withPhone: 0,
  withName: 0,
  withBoth: 0,
  skippedJunk: 0
};

// Skip header
for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);

  // enriched_leads.csv format:
  // email,phone,city,state,zip,country,fn,ln,company,linkedin,personal_email,original_email,website
  const email = fields[0] || '';
  const phone = fields[1] || '';
  const city = fields[2] || '';
  const state = fields[3] || '';
  const zip = fields[4] || '';
  const firstName = fields[6] || '';
  const lastName = fields[7] || '';
  const personalEmail = fields[10] || '';

  // Use personal email if available and valid, otherwise use main email
  let bestEmail = '';
  if (isValidEmail(personalEmail)) {
    bestEmail = personalEmail;
  } else if (isValidEmail(email)) {
    bestEmail = email;
  }

  const cleanedPhone = cleanPhone(phone);

  // Skip if we have neither email nor phone
  if (!bestEmail && !cleanedPhone) {
    continue;
  }

  // Skip junk emails
  if (bestEmail && isJunkEmail(bestEmail)) {
    stats.skippedJunk++;
    bestEmail = '';
  }

  // Still need something to identify the person
  if (!bestEmail && !cleanedPhone) {
    continue;
  }

  stats.total++;
  if (bestEmail) stats.withEmail++;
  if (cleanedPhone) stats.withPhone++;
  if (firstName) stats.withName++;
  if (bestEmail && cleanedPhone) stats.withBoth++;

  const row = [
    bestEmail,
    cleanedPhone,
    city,
    state,
    zip,
    'US',
    firstName,
    lastName
  ].map(f => '"' + (f || '').replace(/"/g, '""') + '"').join(',');

  rows.push(row);
}

fs.writeFileSync(outputFile, rows.join('\n'));

console.log('='.repeat(50));
console.log('CLEAN FACEBOOK AUDIENCE CSV CREATED');
console.log('='.repeat(50));
console.log('');
console.log('Output: ' + outputFile);
console.log('');
console.log('Statistics:');
console.log('  Total leads:        ' + stats.total);
console.log('  With valid email:   ' + stats.withEmail);
console.log('  With phone:         ' + stats.withPhone);
console.log('  With owner name:    ' + stats.withName);
console.log('  With email + phone: ' + stats.withBoth);
console.log('  Junk emails removed:' + stats.skippedJunk);
console.log('');
console.log('='.repeat(50));
