/**
 * Import RVTI Certified Technicians into MongoDB
 *
 * Usage:
 *   node scripts/importRvtiTechs.js                 # Import nearby techs only
 *   node scripts/importRvtiTechs.js --all           # Import all techs
 *   node scripts/importRvtiTechs.js --dry-run       # Preview without importing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import Lead model
const Lead = require('../src/models/Lead');

const DATA_DIR = path.join(__dirname, '../data');

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment variables');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
}

async function importTechnicians(options = {}) {
  const { importAll = false, dryRun = false } = options;

  // Choose which file to import
  const filename = importAll ? 'rvti_all_technicians.json' : 'rvti_nearby_technicians.json';
  const filepath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Data file not found: ${filepath}\nRun 'node scripts/scrapeRvtiTechs.js' first to generate the data.`);
  }

  console.log(`\nLoading technicians from ${filename}...`);
  const technicians = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  console.log(`Found ${technicians.length} technicians to import`);

  if (dryRun) {
    console.log('\n=== DRY RUN MODE - No data will be imported ===\n');
  }

  // Stats tracking
  const stats = {
    total: technicians.length,
    imported: 0,
    skipped: 0,
    updated: 0,
    errors: 0
  };

  // Get existing RVTI leads to check for duplicates
  console.log('Checking for existing RVTI leads...');
  const existingLeads = await Lead.find({ source: 'RVTI' }).select('businessName phone').lean();
  const existingPhones = new Set(existingLeads.map(l => normalizePhone(l.phone)).filter(Boolean));
  const existingNames = new Set(existingLeads.map(l => l.businessName?.toLowerCase()).filter(Boolean));
  console.log(`Found ${existingLeads.length} existing RVTI leads in database`);

  // Process each technician
  for (const tech of technicians) {
    try {
      // Skip if missing required fields
      if (!tech.businessName || !tech.state) {
        console.log(`  Skipping (missing required fields): ${tech.businessName || 'Unknown'}`);
        stats.skipped++;
        continue;
      }

      // Check for duplicates
      const normalizedPhone = normalizePhone(tech.phone);
      const normalizedName = tech.businessName.toLowerCase();

      if (existingPhones.has(normalizedPhone) || existingNames.has(normalizedName)) {
        // Update existing record instead of creating duplicate
        if (!dryRun) {
          const updateResult = await Lead.findOneAndUpdate(
            {
              source: 'RVTI',
              $or: [
                { phone: tech.phone },
                { businessName: tech.businessName }
              ]
            },
            {
              $set: {
                website: tech.website || undefined,
                'rvtiData.nearestFranchise': tech.nearestFranchise,
                'rvtiData.distanceToFranchise': tech.distanceToFranchise,
                'rvtiData.latitude': tech.latitude,
                'rvtiData.longitude': tech.longitude,
                updatedAt: new Date()
              }
            }
          );
          if (updateResult) {
            stats.updated++;
          } else {
            stats.skipped++;
          }
        } else {
          stats.skipped++;
        }
        continue;
      }

      // Create new lead
      const leadData = {
        businessName: tech.businessName,
        type: 'RV Tech',
        address: tech.streetAddress || tech.fullAddress,
        city: tech.city,
        state: tech.state,
        zip: tech.zip,
        phone: tech.phone || '',
        website: tech.website || '',
        source: 'RVTI',
        leadSource: 'RVTI',
        status: 'New',
        notes: tech.nearestFranchise
          ? `RVTI Certified Technician. Nearest franchise: ${tech.nearestFranchise} (${tech.distanceToFranchise} miles)`
          : 'RVTI Certified Technician',
        // Store RVTI-specific data in a subdocument
        rvtiData: {
          certifiedTech: true,
          nearestFranchise: tech.nearestFranchise || null,
          distanceToFranchise: tech.distanceToFranchise || null,
          latitude: tech.latitude,
          longitude: tech.longitude,
          websiteTitle: tech.websiteTitle || ''
        }
      };

      if (!dryRun) {
        const newLead = new Lead(leadData);
        await newLead.save();
        stats.imported++;

        // Add to tracking sets
        if (normalizedPhone) existingPhones.add(normalizedPhone);
        existingNames.add(normalizedName);
      } else {
        stats.imported++;
      }

      // Progress indicator
      if ((stats.imported + stats.updated + stats.skipped) % 50 === 0) {
        console.log(`  Processed ${stats.imported + stats.updated + stats.skipped}/${stats.total}...`);
      }

    } catch (error) {
      console.error(`  Error importing ${tech.businessName}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
}

function normalizePhone(phone) {
  if (!phone) return null;
  // Remove all non-digits
  return phone.replace(/\D/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  const importAll = args.includes('--all');
  const dryRun = args.includes('--dry-run');

  try {
    await connectDB();

    console.log('\n========================================');
    console.log('RVTI Certified Technicians Import');
    console.log('========================================');
    console.log(`Mode: ${importAll ? 'ALL technicians' : 'NEARBY technicians only (75-mile radius)'}`);
    if (dryRun) console.log('DRY RUN - No changes will be made');

    const stats = await importTechnicians({ importAll, dryRun });

    console.log('\n========================================');
    console.log('Import Summary');
    console.log('========================================');
    console.log(`Total processed: ${stats.total}`);
    console.log(`New records imported: ${stats.imported}`);
    console.log(`Existing records updated: ${stats.updated}`);
    console.log(`Skipped (duplicates/invalid): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);

    if (dryRun) {
      console.log('\n(Dry run - no actual changes made)');
    }

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { importTechnicians };
