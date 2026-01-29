const fs = require('fs');

console.log('═══════════════════════════════════════════════════════════');
console.log('   🤖 AI ASSISTANT - MoveAthens DATA ACCESS TEST');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. Test Knowledge file
console.log('📘 1. KNOWLEDGE FILE (οδηγίες για τον AI):');
try {
  const knowledge = JSON.parse(fs.readFileSync('moveathens/data/knowledge.json', 'utf8'));
  console.log('   ✅ Διαβάστηκε επιτυχώς');
  console.log('   → Σκοπός:', knowledge.purpose);
  console.log('   → Πηγές δεδομένων:', Object.keys(knowledge.data_sources).join(', '));
} catch(e) {
  console.log('   ❌ Σφάλμα:', e.message);
}

// 2. Test UI Config
console.log('\n📊 2. UI CONFIG (κύρια πηγή δεδομένων):');
try {
  const config = JSON.parse(fs.readFileSync('moveathens/data/moveathens_ui.json', 'utf8'));
  console.log('   ✅ Διαβάστηκε επιτυχώς');
  
  // Vehicles
  console.log('\n   🚗 ΟΧΗΜΑΤΑ (vehicleTypes):');
  (config.vehicleTypes || []).forEach(v => {
    console.log('      •', v.name, '- max:', v.max_passengers, 'επιβάτες,', v.luggage_large, 'μεγάλες βαλίτσες');
  });
  
  // Zones
  console.log('\n   📍 ΖΩΝΕΣ (transferZones):');
  (config.transferZones || []).forEach(z => {
    console.log('      •', z.name);
  });
  
  // Categories
  console.log('\n   📂 ΚΑΤΗΓΟΡΙΕΣ (destinationCategories):');
  (config.destinationCategories || []).forEach(c => {
    console.log('      •', c.name);
  });
  
  // Destinations
  console.log('\n   🎯 ΠΡΟΟΡΙΣΜΟΙ (destinations):');
  (config.destinations || []).forEach(d => {
    console.log('      •', d.name);
  });
  
  // Prices
  console.log('\n   💰 ΤΙΜΕΣ (transferPrices):');
  const prices = config.transferPrices || [];
  console.log('      Βρέθηκαν', prices.length, 'εγγραφές τιμών');
  
  // Info Page Content
  console.log('\n   📄 ΠΛΗΡΟΦΟΡΙΕΣ (infoPageContent):');
  if (config.infoPageContent && config.infoPageContent.trim()) {
    const preview = config.infoPageContent.substring(0, 150).replace(/\n/g, ' ');
    console.log('      ✅ Υπάρχει περιεχόμενο');
    console.log('      Preview:', preview + '...');
  } else {
    console.log('      ⚠️  Κενό - χρειάζεται να συμπληρωθεί');
  }
  
  // Contact
  console.log('\n   📞 ΕΠΙΚΟΙΝΩΝΙΑ:');
  console.log('      • Τηλέφωνο:', config.phoneNumber || '(δεν έχει οριστεί)');
  console.log('      • WhatsApp:', config.whatsappNumber || '(δεν έχει οριστεί)');
  console.log('      • Email:', config.companyEmail || '(δεν έχει οριστεί)');
  
} catch(e) {
  console.log('   ❌ Σφάλμα:', e.message);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('   📋 ΣΥΝΟΨΗ');
console.log('═══════════════════════════════════════════════════════════');
console.log('   Ο AI βοηθός μπορεί να διαβάσει:');
console.log('   ✅ Οχήματα (τύπος, χωρητικότητα, βαλίτσες)');
console.log('   ✅ Ζώνες αναχώρησης');
console.log('   ✅ Κατηγορίες & Προορισμούς');
console.log('   ✅ Τιμές (ημερήσιες/νυχτερινές)');
console.log('   ✅ Στοιχεία επικοινωνίας');
console.log('   ✅ Πληροφορίες πολιτικής (από infoPageContent)');
console.log('═══════════════════════════════════════════════════════════\n');
