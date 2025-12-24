const fs = require('fs');
const path = require('path');
const { franchiseLocations } = require('./franchiseLocations');

const RVTI_URL = 'https://www.rvti.org/find-certified-technician';

async function scrapeRvtiTechnicians() {
  console.log('Starting RVTI Certified Technician scraper...');
  console.log(`Fetching ${RVTI_URL}...`);

  const response = await fetch(RVTI_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  console.log(`Received ${html.length} bytes of HTML`);

  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '../data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Save raw HTML for debugging
  const debugPath = path.join(dataDir, 'rvti_debug.html');
  fs.writeFileSync(debugPath, html);
  console.log(`Saved debug HTML to ${debugPath}`);

  // Extract the dealershipMap data - look for array of objects with title/position/address
  console.log('Extracting technician data...');

  // Try different patterns to find the data
  let technicians = null;

  // Pattern 1: Look for dealershipMap = [...]
  const dealerMapMatch = html.match(/dealershipMap\s*=\s*(\[[\s\S]*?\]);/);
  if (dealerMapMatch) {
    try {
      technicians = JSON.parse(dealerMapMatch[1]);
      console.log('Found data via dealershipMap pattern');
    } catch (e) {
      console.log('Failed to parse dealershipMap:', e.message);
    }
  }

  // Pattern 2: Look for markers array in various formats
  if (!technicians) {
    const markersMatch = html.match(/markers["\s]*[:=]\s*(\[[\s\S]*?\])[,;}\n]/);
    if (markersMatch) {
      try {
        technicians = JSON.parse(markersMatch[1]);
        console.log('Found data via markers pattern');
      } catch (e) {
        console.log('Failed to parse markers:', e.message);
      }
    }
  }

  // Pattern 3: Look for the JSON array directly (starts with [{"title"...)
  if (!technicians) {
    // Find all potential JSON arrays
    const jsonMatches = html.matchAll(/\[\s*\{\s*"title"\s*:\s*"[^"]+"\s*,[\s\S]*?"position"[\s\S]*?\}\s*\]/g);
    for (const match of jsonMatches) {
      try {
        technicians = JSON.parse(match[0]);
        console.log('Found data via direct JSON pattern');
        break;
      } catch (e) {
        // Try next match
      }
    }
  }

  // Pattern 4: Look for data in a script tag with specific structure
  if (!technicians) {
    const scriptMatch = html.match(/<script[^>]*>[\s\S]*?(\[\s*\{[\s\S]*?"title"[\s\S]*?"address"[\s\S]*?\}\s*\])[\s\S]*?<\/script>/);
    if (scriptMatch) {
      try {
        technicians = JSON.parse(scriptMatch[1]);
        console.log('Found data via script tag pattern');
      } catch (e) {
        console.log('Failed to parse script tag data:', e.message);
      }
    }
  }

  // Pattern 5: Extract any JSON that looks like location data
  if (!technicians) {
    // Look for individual entries and collect them
    const entryPattern = /\{\s*"title"\s*:\s*"([^"]+)"[\s\S]*?"position"\s*:\s*\{[^}]+\}[\s\S]*?"address"\s*:\s*"([^"]+)"[^}]*\}/g;
    const entries = [];
    let match;
    while ((match = entryPattern.exec(html)) !== null) {
      try {
        // Clean up the matched JSON
        let jsonStr = match[0];
        // Make sure it's valid JSON
        const entry = JSON.parse(jsonStr);
        entries.push(entry);
      } catch (e) {
        // Skip invalid entries
      }
    }
    if (entries.length > 0) {
      technicians = entries;
      console.log(`Found ${entries.length} entries via individual pattern matching`);
    }
  }

  if (!technicians || technicians.length === 0) {
    // Last resort: try to extract from a more permissive pattern
    console.log('Trying permissive extraction...');

    // Find content between [ and ] that contains "title" and "position"
    const permissiveMatch = html.match(/\[(?:[^[\]]*(?:\[[^\]]*\])?)*"title"(?:[^[\]]*(?:\[[^\]]*\])?)*"position"(?:[^[\]]*(?:\[[^\]]*\])?)*\]/);
    if (permissiveMatch) {
      try {
        technicians = JSON.parse(permissiveMatch[0]);
        console.log('Found data via permissive pattern');
      } catch (e) {
        console.log('Permissive pattern failed:', e.message);
      }
    }
  }

  if (!technicians || technicians.length === 0) {
    console.log('\nCould not automatically extract data. Please check rvti_debug.html');
    console.log('You may need to manually find the data structure in the HTML.');

    // Show some clues from the HTML
    const hasTitle = html.includes('"title"');
    const hasPosition = html.includes('"position"');
    const hasAddress = html.includes('"address"');
    console.log(`\nClues found in HTML:`);
    console.log(`  Contains "title": ${hasTitle}`);
    console.log(`  Contains "position": ${hasPosition}`);
    console.log(`  Contains "address": ${hasAddress}`);

    throw new Error('Could not extract technician data from page');
  }

  return processResults(technicians);
}

function processResults(technicians) {
  console.log(`Processing ${technicians.length} technicians...`);

  // Normalize and clean the data
  const cleaned = technicians.map((tech, index) => {
    // Parse address into components
    const addressParts = parseAddress(tech.address || '');

    return {
      id: index + 1,
      businessName: tech.title || '',
      fullAddress: tech.address || '',
      streetAddress: addressParts.streetAddress,
      city: addressParts.city,
      state: addressParts.stateAbbr || addressParts.state,
      stateFull: addressParts.state,
      zip: addressParts.zip,
      country: tech.country || 'US',
      phone: tech.phone || '',
      website: tech.website?.url || '',
      websiteTitle: tech.website?.title || '',
      latitude: tech.position?.lat || null,
      longitude: tech.position?.lng || null,
      source: 'RVTI',
      certifiedTech: true
    };
  });

  return cleaned;
}

function parseAddress(address) {
  // Try to extract city, state, and zip from address string
  // Format: "Street, City, State ZIP, Country" (e.g., "13405 County Road 1600, Wolfforth, Texas 79382, United States")
  const result = { city: '', state: '', zip: '', streetAddress: '' };

  if (!address) return result;

  // Split by comma
  const parts = address.split(',').map(p => p.trim());

  // Format is typically: [Street, City, State ZIP, Country]
  if (parts.length >= 3) {
    // Last part is usually country - skip it
    // Second to last is "State ZIP"
    const stateZipPart = parts[parts.length - 2];

    // Extract state and zip from "Texas 79382" or "Missouri 63084"
    const stateZipMatch = stateZipPart.match(/^([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      result.state = stateZipMatch[1].trim();
      result.zip = stateZipMatch[2];
    } else {
      // Maybe just state without zip
      result.state = stateZipPart;
    }

    // City is third from last
    if (parts.length >= 4) {
      result.city = parts[parts.length - 3];
    }

    // Street address is everything before city
    if (parts.length >= 4) {
      result.streetAddress = parts.slice(0, parts.length - 3).join(', ');
    }
  }

  // Convert full state names to abbreviations for consistency
  const stateAbbreviations = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC',
    // Canadian provinces
    'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB', 'New Brunswick': 'NB',
    'Newfoundland and Labrador': 'NL', 'Nova Scotia': 'NS', 'Ontario': 'ON', 'Prince Edward Island': 'PE',
    'Quebec': 'QC', 'Saskatchewan': 'SK', 'Northwest Territories': 'NT', 'Nunavut': 'NU', 'Yukon': 'YT'
  };

  if (result.state && stateAbbreviations[result.state]) {
    result.stateAbbr = stateAbbreviations[result.state];
  } else {
    result.stateAbbr = result.state; // Keep as-is if already abbreviated or not found
  }

  return result;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  // Haversine formula to calculate distance between two points
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function filterByRadius(technicians, franchiseLocations, radiusMiles = 75) {
  const results = [];

  for (const tech of technicians) {
    if (!tech.latitude || !tech.longitude) continue;

    for (const franchise of franchiseLocations) {
      const distance = calculateDistance(
        tech.latitude,
        tech.longitude,
        franchise.lat,
        franchise.lng
      );

      if (distance <= radiusMiles) {
        results.push({
          ...tech,
          nearestFranchise: franchise.name,
          distanceToFranchise: Math.round(distance * 10) / 10
        });
        break; // Only add once, even if near multiple franchises
      }
    }
  }

  return results;
}

function exportToCSV(data, filename) {
  if (data.length === 0) {
    console.log('No data to export to CSV');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    });
    csvRows.push(values.join(','));
  }

  fs.writeFileSync(filename, csvRows.join('\n'));
  console.log(`Exported ${data.length} records to ${filename}`);
}

function exportToJSON(data, filename) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Exported ${data.length} records to ${filename}`);
}

async function main() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '../data');
    fs.mkdirSync(dataDir, { recursive: true });

    // Scrape all technicians
    const allTechnicians = await scrapeRvtiTechnicians();

    // Export all technicians
    const allJsonPath = path.join(dataDir, 'rvti_all_technicians.json');
    const allCsvPath = path.join(dataDir, 'rvti_all_technicians.csv');

    exportToJSON(allTechnicians, allJsonPath);
    exportToCSV(allTechnicians, allCsvPath);

    // Fireside franchise locations loaded from franchiseLocations.js
    console.log(`\nUsing ${franchiseLocations.length} Fireside franchise locations for radius filtering...`);

    // Filter by 75-mile radius
    const nearbyTechnicians = filterByRadius(allTechnicians, franchiseLocations, 75);

    // Export filtered technicians
    const filteredJsonPath = path.join(dataDir, 'rvti_nearby_technicians.json');
    const filteredCsvPath = path.join(dataDir, 'rvti_nearby_technicians.csv');

    exportToJSON(nearbyTechnicians, filteredJsonPath);
    exportToCSV(nearbyTechnicians, filteredCsvPath);

    console.log('\n=== Summary ===');
    console.log(`Total technicians found: ${allTechnicians.length}`);
    console.log(`Technicians within 75 miles of franchise: ${nearbyTechnicians.length}`);
    console.log(`\nFiles saved to: ${dataDir}`);

    // Show breakdown by state
    const stateCount = {};
    for (const tech of allTechnicians) {
      const state = tech.state || 'Unknown';
      stateCount[state] = (stateCount[state] || 0) + 1;
    }
    console.log('\nTechnicians by state:');
    Object.entries(stateCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([state, count]) => {
        console.log(`  ${state}: ${count}`);
      });

    return { allTechnicians, nearbyTechnicians };

  } catch (error) {
    console.error('Scraper failed:', error);
    process.exit(1);
  }
}

// Export functions for use as module
module.exports = {
  scrapeRvtiTechnicians,
  filterByRadius,
  calculateDistance,
  exportToCSV,
  exportToJSON
};

// Run if called directly
if (require.main === module) {
  main();
}
