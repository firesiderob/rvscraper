const fs = require('fs');

// Read the source CSV
const sourceFile = '/Users/robboirun/Downloads/rvti(2).csv';
const outputFile = '/Users/robboirun/Downloads/facebook_lookalike_audience.csv';

const content = fs.readFileSync(sourceFile, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

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

// Facebook CSV header
const fbHeader = 'email,phone,city,state,zip,country,fn,ln,company';

const fbRows = [fbHeader];

// Skip header row
for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);

  // Fields: Business Name, Type, Address, City, State, Zip, Phone, Email, Website, Status, Source, Notes
  const businessName = fields[0] || '';
  const city = fields[3] || '';
  const state = fields[4] || '';
  const zip = fields[5] || '';
  const phone = (fields[6] || '').replace(/[^0-9]/g, ''); // Clean phone number
  const email = fields[7] || '';

  // Only include if we have email OR phone
  if (email || phone) {
    // Format phone for Facebook (add country code if 10 digits)
    let formattedPhone = phone;
    if (phone.length === 10) {
      formattedPhone = '1' + phone;
    }

    const row = [
      email,
      formattedPhone,
      city,
      state,
      zip,
      'US',
      '', // first name (empty for now)
      '', // last name (empty for now)
      businessName
    ].map(f => '"' + f + '"').join(',');

    fbRows.push(row);
  }
}

fs.writeFileSync(outputFile, fbRows.join('\n'));
console.log('Created Facebook CSV with ' + (fbRows.length - 1) + ' leads');
console.log('Output: ' + outputFile);
