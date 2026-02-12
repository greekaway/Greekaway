#!/usr/bin/env node
'use strict';
/**
 * Migration Script: JSON Files → PostgreSQL
 * 
 * This script migrates existing data from JSON files to PostgreSQL database.
 * Run this ONCE after setting up your PostgreSQL database.
 * 
 * Usage:
 *   DATABASE_URL=postgres://... node tools/migrate_to_postgres.js
 * 
 * Options:
 *   --dry-run    Preview what would be migrated without making changes
 *   --force      Overwrite existing data in database
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TRIPS_DIR = path.join(DATA_DIR, 'trips');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const MOVEATHENS_DIR = path.join(ROOT_DIR, 'moveathens', 'data');
const MOVEATHENS_CONFIG_FILE = path.join(MOVEATHENS_DIR, 'moveathens_ui.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

let db = null;
let stats = {
  categories: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  trips: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  zones: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  vehicles: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  destCategories: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  destinations: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  prices: { found: 0, migrated: 0, skipped: 0, errors: 0 },
  config: { found: 0, migrated: 0, skipped: 0, errors: 0 }
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  JSON → PostgreSQL Migration Tool');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  if (FORCE) {
    console.log('⚠️  FORCE MODE - Existing data will be overwritten\n');
  }
  
  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable not set');
    console.error('   Example: DATABASE_URL=postgres://user:pass@host:5432/dbname');
    process.exit(1);
  }
  
  // Initialize database
  console.log('📡 Connecting to PostgreSQL...');
  try {
    db = require('../db');
    const connected = await db.init();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    console.log('✅ Connected to PostgreSQL\n');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
  
  // Run migrations if needed
  if (!DRY_RUN) {
    console.log('📋 Running schema migrations...');
    try {
      await db.runMigrations();
      console.log('✅ Schema ready\n');
    } catch (err) {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    }
  }
  
  // CHECK: If database already has data, skip migration (unless --force)
  // This prevents overwriting data added via admin panel
  if (!FORCE && !DRY_RUN) {
    try {
      const existingVehicles = await db.ma.getVehicleTypes();
      const existingTrips = await db.gk.listTrips();
      const existingCategories = await db.gk.getCategories();
      
      const totalExisting = (existingVehicles?.length || 0) + (existingTrips?.length || 0) + (existingCategories?.length || 0);
      
      if (totalExisting > 0) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  ℹ️  DATABASE ALREADY HAS DATA - SKIPPING MIGRATION');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`   Found: ${existingVehicles?.length || 0} vehicles, ${existingTrips?.length || 0} trips, ${existingCategories?.length || 0} categories`);
        console.log('   The database is the source of truth. Data added via admin panel is preserved.');
        console.log('   Use --force flag to overwrite existing data from JSON files.\n');
        await db.close();
        console.log('✨ No migration needed - database is up to date!');
        process.exit(0);
      }
    } catch (checkErr) {
      console.log('   ⚠️  Could not check existing data, proceeding with migration...\n');
    }
  }
  
  // Migrate Greekaway Categories
  await migrateCategories();
  
  // Migrate Greekaway Trips
  await migrateTrips();
  
  // Migrate MoveAthens data
  await migrateMoveAthens();
  
  // Print summary
  printSummary();
  
  await db.close();
  console.log('\n✨ Migration complete!');
}

// =========================================================
// GREEKAWAY CATEGORIES
// =========================================================

async function migrateCategories() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('📁 Migrating Greekaway Categories');
  console.log('─────────────────────────────────────────────────────────────────');
  
  if (!fs.existsSync(CATEGORIES_FILE)) {
    console.log('   ⚠️  categories.json not found, skipping\n');
    return;
  }
  
  try {
    const raw = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const categories = JSON.parse(raw || '[]');
    stats.categories.found = categories.length;
    console.log(`   Found ${categories.length} categories\n`);
    
    for (const cat of categories) {
      try {
        // Check if exists
        if (!FORCE) {
          const existing = await db.gk.getCategoryBySlug(cat.slug);
          if (existing) {
            console.log(`   ⏭️  ${cat.slug} - already exists (skipped)`);
            stats.categories.skipped++;
            continue;
          }
        }
        
        if (DRY_RUN) {
          console.log(`   📝 ${cat.slug} - would migrate`);
          stats.categories.migrated++;
          continue;
        }
        
        await db.gk.upsertCategory({
          id: cat.id,
          title: cat.title,
          slug: cat.slug,
          icon_path: cat.iconPath || '',
          display_order: cat.order || 0,
          published: !!cat.published
        });
        
        console.log(`   ✅ ${cat.slug} - migrated`);
        stats.categories.migrated++;
      } catch (err) {
        console.log(`   ❌ ${cat.slug} - failed: ${err.message}`);
        stats.categories.errors++;
      }
    }
  } catch (err) {
    console.error('   ❌ Failed to read categories:', err.message);
  }
  console.log();
}

// =========================================================
// GREEKAWAY TRIPS
// =========================================================

async function migrateTrips() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('📁 Migrating Greekaway Trips');
  console.log('─────────────────────────────────────────────────────────────────');
  
  if (!fs.existsSync(TRIPS_DIR)) {
    console.log('   ⚠️  trips directory not found, skipping\n');
    return;
  }
  
  try {
    const files = fs.readdirSync(TRIPS_DIR).filter(f => f.endsWith('.json') && f !== '_template.json');
    stats.trips.found = files.length;
    console.log(`   Found ${files.length} trip files\n`);
    
    for (const filename of files) {
      const slug = filename.replace('.json', '');
      try {
        const raw = fs.readFileSync(path.join(TRIPS_DIR, filename), 'utf8');
        const trip = JSON.parse(raw);
        
        // Check if exists
        if (!FORCE) {
          const existing = await db.gk.getTripBySlug(slug);
          if (existing) {
            console.log(`   ⏭️  ${slug} - already exists (skipped)`);
            stats.trips.skipped++;
            continue;
          }
        }
        
        if (DRY_RUN) {
          console.log(`   📝 ${slug} - would migrate`);
          stats.trips.migrated++;
          continue;
        }
        
        await db.gk.upsertTrip({
          id: trip.id,
          slug: trip.slug || slug,
          title: trip.title || '',
          subtitle: trip.subtitle,
          teaser: trip.teaser,
          category: trip.category,
          active: trip.active !== false,
          default_mode: trip.defaultMode || 'van',
          icon_path: trip.iconPath,
          cover_image: trip.coverImage,
          featured_image: trip.featuredImage,
          hero_video_url: trip.heroVideoURL,
          hero_thumbnail: trip.heroThumbnail,
          currency: trip.currency || 'EUR',
          tags: trip.tags || [],
          gallery: trip.gallery || [],
          videos: trip.videos || [],
          modes: trip.modes || {}
        });
        
        console.log(`   ✅ ${slug} - migrated`);
        stats.trips.migrated++;
      } catch (err) {
        console.log(`   ❌ ${slug} - failed: ${err.message}`);
        stats.trips.errors++;
      }
    }
  } catch (err) {
    console.error('   ❌ Failed to read trips:', err.message);
  }
  console.log();
}

// =========================================================
// MOVEATHENS DATA
// =========================================================

async function migrateMoveAthens() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('📁 Migrating MoveAthens Data');
  console.log('─────────────────────────────────────────────────────────────────');
  
  if (!fs.existsSync(MOVEATHENS_CONFIG_FILE)) {
    console.log('   ⚠️  moveathens_ui.json not found, skipping\n');
    return;
  }
  
  try {
    const raw = fs.readFileSync(MOVEATHENS_CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw);
    
    // Migrate config
    console.log('\n   📋 Config:');
    stats.config.found = 1;
    if (!DRY_RUN) {
      try {
        await db.ma.updateConfig({
          heroVideoUrl: config.heroVideoUrl,
          heroLogoUrl: config.heroLogoUrl,
          heroHeadline: config.heroHeadline,
          heroSubtext: config.heroSubtext,
          footerLabels: config.footerLabels,
          footerIcons: config.footerIcons,
          phoneNumber: config.phoneNumber,
          whatsappNumber: config.whatsappNumber,
          companyEmail: config.companyEmail,
          ctaLabels: config.ctaLabels,
          contactLabels: config.contactLabels,
          hotelContextLabels: config.hotelContextLabels,
          hotelEmailSubjectPrefix: config.hotelEmailSubjectPrefix,
          infoPageTitle: config.infoPageTitle,
          infoPageContent: config.infoPageContent
        });
        console.log('      ✅ Config migrated');
        stats.config.migrated = 1;
      } catch (err) {
        console.log(`      ❌ Config failed: ${err.message}`);
        stats.config.errors = 1;
      }
    } else {
      console.log('      📝 Would migrate config');
      stats.config.migrated = 1;
    }
    
    // Migrate zones
    console.log('\n   🗺️  Transfer Zones:');
    const zones = config.transferZones || [];
    stats.zones.found = zones.length;
    for (const zone of zones) {
      try {
        if (!FORCE) {
          const existing = await db.ma.getZoneById(zone.id);
          if (existing) {
            console.log(`      ⏭️  ${zone.name} (${zone.id}) - exists`);
            stats.zones.skipped++;
            continue;
          }
        }
        if (DRY_RUN) {
          console.log(`      📝 ${zone.name} - would migrate`);
          stats.zones.migrated++;
          continue;
        }
        await db.ma.upsertZone({
          id: zone.id,
          name: zone.name,
          description: zone.description,
          zone_type: zone.type,
          is_active: zone.is_active
        });
        console.log(`      ✅ ${zone.name} - migrated`);
        stats.zones.migrated++;
      } catch (err) {
        console.log(`      ❌ ${zone.name} - failed: ${err.message}`);
        stats.zones.errors++;
      }
    }
    
    // Migrate vehicles
    console.log('\n   🚗 Vehicle Types:');
    const vehicles = config.vehicleTypes || [];
    stats.vehicles.found = vehicles.length;
    for (const v of vehicles) {
      try {
        if (!FORCE) {
          const existing = await db.ma.getVehicleTypeById(v.id);
          if (existing) {
            console.log(`      ⏭️  ${v.name} (${v.id}) - exists`);
            stats.vehicles.skipped++;
            continue;
          }
        }
        if (DRY_RUN) {
          console.log(`      📝 ${v.name} - would migrate`);
          stats.vehicles.migrated++;
          continue;
        }
        await db.ma.upsertVehicleType({
          id: v.id,
          name: v.name,
          description: v.description,
          image_url: v.imageUrl,
          max_passengers: v.max_passengers,
          luggage_large: v.luggage_large,
          luggage_medium: v.luggage_medium,
          luggage_cabin: v.luggage_cabin,
          display_order: v.display_order,
          is_active: v.is_active
        });
        console.log(`      ✅ ${v.name} - migrated`);
        stats.vehicles.migrated++;
      } catch (err) {
        console.log(`      ❌ ${v.name} - failed: ${err.message}`);
        stats.vehicles.errors++;
      }
    }
    
    // Migrate destination categories
    console.log('\n   📂 Destination Categories:');
    const destCats = config.destinationCategories || [];
    stats.destCategories.found = destCats.length;
    for (const cat of destCats) {
      try {
        if (!FORCE) {
          const existing = await db.ma.getDestinationCategoryById(cat.id);
          if (existing) {
            console.log(`      ⏭️  ${cat.name} (${cat.id}) - exists`);
            stats.destCategories.skipped++;
            continue;
          }
        }
        if (DRY_RUN) {
          console.log(`      📝 ${cat.name} - would migrate`);
          stats.destCategories.migrated++;
          continue;
        }
        await db.ma.upsertDestinationCategory({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          display_order: cat.display_order,
          is_active: cat.is_active,
          is_arrival: cat.is_arrival ?? false
        });
        console.log(`      ✅ ${cat.name} - migrated`);
        stats.destCategories.migrated++;
      } catch (err) {
        console.log(`      ❌ ${cat.name} - failed: ${err.message}`);
        stats.destCategories.errors++;
      }
    }
    
    // Migrate destinations
    console.log('\n   📍 Destinations:');
    const dests = config.destinations || [];
    stats.destinations.found = dests.length;
    for (const dest of dests) {
      try {
        if (!FORCE) {
          const existing = await db.ma.getDestinationById(dest.id);
          if (existing) {
            console.log(`      ⏭️  ${dest.name} (${dest.id}) - exists`);
            stats.destinations.skipped++;
            continue;
          }
        }
        if (DRY_RUN) {
          console.log(`      📝 ${dest.name} - would migrate`);
          stats.destinations.migrated++;
          continue;
        }
        await db.ma.upsertDestination({
          id: dest.id,
          name: dest.name,
          description: dest.description,
          category_id: dest.category_id,
          zone_id: dest.zone_id,
          display_order: dest.display_order,
          is_active: dest.is_active
        });
        console.log(`      ✅ ${dest.name} - migrated`);
        stats.destinations.migrated++;
      } catch (err) {
        console.log(`      ❌ ${dest.name} - failed: ${err.message}`);
        stats.destinations.errors++;
      }
    }
    
    // Migrate prices
    console.log('\n   💰 Transfer Prices:');
    const prices = config.transferPrices || [];
    stats.prices.found = prices.length;
    for (const price of prices) {
      try {
        if (DRY_RUN) {
          console.log(`      📝 ${price.id} (€${price.price}) - would migrate`);
          stats.prices.migrated++;
          continue;
        }
        await db.ma.upsertPrice({
          id: price.id,
          origin_zone_id: price.origin_zone_id,
          destination_id: price.destination_id,
          vehicle_type_id: price.vehicle_type_id,
          tariff: price.tariff || 'day',
          price: price.price
        });
        console.log(`      ✅ ${price.id} (€${price.price}) - migrated`);
        stats.prices.migrated++;
      } catch (err) {
        console.log(`      ❌ ${price.id} - failed: ${err.message}`);
        stats.prices.errors++;
      }
    }
    
  } catch (err) {
    console.error('   ❌ Failed to read MoveAthens config:', err.message);
  }
  console.log();
}

// =========================================================
// SUMMARY
// =========================================================

function printSummary() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  
  const tableData = [
    ['Entity', 'Found', 'Migrated', 'Skipped', 'Errors'],
    ['─────────────────────', '─────', '────────', '───────', '──────'],
    ['GK Categories', stats.categories.found, stats.categories.migrated, stats.categories.skipped, stats.categories.errors],
    ['GK Trips', stats.trips.found, stats.trips.migrated, stats.trips.skipped, stats.trips.errors],
    ['MA Config', stats.config.found, stats.config.migrated, stats.config.skipped, stats.config.errors],
    ['MA Zones', stats.zones.found, stats.zones.migrated, stats.zones.skipped, stats.zones.errors],
    ['MA Vehicles', stats.vehicles.found, stats.vehicles.migrated, stats.vehicles.skipped, stats.vehicles.errors],
    ['MA Dest Categories', stats.destCategories.found, stats.destCategories.migrated, stats.destCategories.skipped, stats.destCategories.errors],
    ['MA Destinations', stats.destinations.found, stats.destinations.migrated, stats.destinations.skipped, stats.destinations.errors],
    ['MA Prices', stats.prices.found, stats.prices.migrated, stats.prices.skipped, stats.prices.errors]
  ];
  
  for (const row of tableData) {
    console.log(`  ${String(row[0]).padEnd(22)} ${String(row[1]).padStart(5)} ${String(row[2]).padStart(8)} ${String(row[3]).padStart(7)} ${String(row[4]).padStart(6)}`);
  }
  
  const totalFound = Object.values(stats).reduce((a, s) => a + s.found, 0);
  const totalMigrated = Object.values(stats).reduce((a, s) => a + s.migrated, 0);
  const totalSkipped = Object.values(stats).reduce((a, s) => a + s.skipped, 0);
  const totalErrors = Object.values(stats).reduce((a, s) => a + s.errors, 0);
  
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(totalFound).padStart(5)} ${String(totalMigrated).padStart(8)} ${String(totalSkipped).padStart(7)} ${String(totalErrors).padStart(6)}`);
  console.log();
  
  if (DRY_RUN) {
    console.log('  ℹ️  This was a dry run. Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
