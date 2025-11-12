'use strict';
const fs = require('fs');
const path = require('path');

// Simple cached loaders with mtime checks so changes to files are picked up automatically
let CACHE = {
  policies: { data: null, mtime: 0, pathTried: null },
  knowledge: { data: null, mtime: 0, pathTried: null },
};

function statMtime(p){ try { return fs.statSync(p).mtimeMs || 0; } catch(_) { return 0; } }

function resolvePoliciesPath(){
  // Keep exact file as-is under repo root
  return path.join(__dirname, '..', '..', '..', 'policies.json');
}

function resolveKnowledgePath(){
  // Prefer /data/knowledge.json then /assistant/knowledge.json
  const base = path.join(__dirname, '..', '..', '..');
  const candidates = [ path.join(base, 'data', 'knowledge.json'), path.join(base, 'assistant', 'knowledge.json') ];
  for (const p of candidates){ try { fs.accessSync(p, fs.constants.R_OK); return p; } catch(_){} }
  return candidates[0]; // default to data/knowledge.json (even if missing)
}

function loadJsonSafe(p){ try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(_) { return null; } }

function loadPolicies(){
  const p = resolvePoliciesPath();
  const mtime = statMtime(p);
  if (CACHE.policies.pathTried !== p || mtime !== CACHE.policies.mtime){
    CACHE.policies = { data: loadJsonSafe(p), mtime, pathTried: p };
  }
  return CACHE.policies.data;
}

function loadKnowledge(){
  const p = resolveKnowledgePath();
  const mtime = statMtime(p);
  if (CACHE.knowledge.pathTried !== p || mtime !== CACHE.knowledge.mtime){
    CACHE.knowledge = { data: loadJsonSafe(p), mtime, pathTried: p };
  }
  return CACHE.knowledge.data;
}

function rulesLoaded(){
  const pol = loadPolicies();
  const kn = loadKnowledge();
  return !!(pol && kn);
}

function fallbackMissingMessage(lang){
  const L = String(lang || '').toLowerCase();
  const gr = L.startsWith('el');
  return gr ? 'Οι λειτουργικοί κανόνες εκδρομών δεν έχουν φορτωθεί προσωρινά' : 'Operational trip rules are temporarily not loaded';
}

// Build a compact system prompt that the LLM can use to ground answers about policies
function buildPoliciesKnowledgePrompt(){
  const pol = loadPolicies();
  const kn = loadKnowledge();
  if (!pol || !kn) return fallbackMissingMessage('el');

  // Extract a few concrete numbers/flags from policies.json when available
  const exec = pol.trip_execution || {};
  const pickup = pol.pickup_policy || {};
  const dispatch = pol.dispatch_policy || {};

  const minParticipants = Number(exec.min_participants || 0) || 0;
  const maxVehicleSeats = Number(exec.max_participants || 0) || 0; // if present
  const maxPickupKm = Number(exec.max_pickup_distance_km || 0) || 0;
  const elasticTrigger = exec.elastic_mode_trigger && (exec.elastic_mode_trigger.threshold || null);

  const lines = [];
  lines.push('Κανόνες λειτουργίας Greekaway (σύνοψη για απαντήσεις):');
  // Human layer
  if (kn.trip_rules && kn.trip_rules.start_condition) lines.push(`• Εκκίνηση: ${kn.trip_rules.start_condition}`);
  if (minParticipants) lines.push(`• Ελάχιστη πληρότητα: ${minParticipants} άτομα ανά εκδρομή.`);
  if (kn.trip_rules && kn.trip_rules.max_participants) lines.push(`• Μέγιστη πληρότητα: ${kn.trip_rules.max_participants}`);
  if (maxPickupKm) lines.push(`• Απόσταση παραλαβών: τυπικό μέγιστο περίπου ${maxPickupKm} km μεταξύ επιβατών, αλλιώς δημιουργείται επιπλέον όχημα.`);
  if (kn.trip_rules && kn.trip_rules.pickup_logic) lines.push(`• Λογική παραλαβής: ${kn.trip_rules.pickup_logic}`);
  if (elasticTrigger) lines.push(`• Ελαστική λειτουργία: μπορεί να ενεργοποιηθεί κάτω από ${elasticTrigger} άτομα για να μη χαθεί η εκδρομή.`);
  if (kn.trip_rules && kn.trip_rules.vehicle_types) lines.push(`• Τύποι οχημάτων: ${kn.trip_rules.vehicle_types}`);

  if (kn.pickup_policy && kn.pickup_policy.address_confirmation) lines.push(`• Επιβεβαίωση διεύθυνσης: ${kn.pickup_policy.address_confirmation}`);
  if (pickup.require_coordinates) lines.push('• Οι συντεταγμένες παραλαβής είναι υποχρεωτικές όταν ο κανόνας είναι ενεργός.');
  if (kn.pickup_policy && kn.pickup_policy.location_detection) lines.push(`• Αυτόματος εντοπισμός: ${kn.pickup_policy.location_detection}`);

  if (kn.dispatch_policy && kn.dispatch_policy.driver_notification) lines.push(`• Ενημέρωση οδηγού: ${kn.dispatch_policy.driver_notification}`);
  if (kn.dispatch_policy && kn.dispatch_policy.start_time) lines.push(`• Χρόνος αναχώρησης: ${kn.dispatch_policy.start_time}`);

  // Final instruction to the model
  lines.push('Όταν σε ρωτούν για λειτουργικούς κανόνες (π.χ. ελάχιστα άτομα, πότε ξεκινά το όχημα, τι γίνεται με απομακρυσμένες παραλαβές), απάντησε συνοπτικά βασισμένος στους παραπάνω κανόνες.');
  return lines.join('\n');
}

// Very small heuristic responder for mock mode (no OpenAI) – covers common questions
function maybeAnswerPolicyQuestion(message, lang){
  const pol = loadPolicies();
  const kn = loadKnowledge();
  if (!pol || !kn) return fallbackMissingMessage(lang);
  const m = String(message || '').toLowerCase();
  const isEl = String(lang||'').toLowerCase().startsWith('el');

  const exec = pol.trip_execution || {};
  const minP = Number(exec.min_participants || 0) || 0;
  const maxKm = Number(exec.max_pickup_distance_km || 0) || 0;
  const startInfo = kn.dispatch_policy && kn.dispatch_policy.start_time || '';

  // Q: πόσα άτομα χρειάζονται / min participants
  if (/(πόσα|ποσα).*?(άτομα|ατομα)|ελάχιστη\s*πληρότητα|minimum|min|least|min\s*participants|minimum\s*people/.test(m)){
    return isEl ? `Η ελάχιστη πληρότητα για να πραγματοποιηθεί μια εκδρομή είναι ${minP} άτομα.` : `Minimum participants for a trip: ${minP} people.`;
  }

  // Q: τι γίνεται αν είμαι μακριά / remote pickup / distances
  if (/(μακρι|far|distance|pickup|παραλαβ).*(μακρι|πολύ|far|distan|km)|((μακρι|far).*(υπόλοιπ|υπολοιπ|others))/.test(m)){
    if (isEl){
      return maxKm
        ? `Αν οι αποστάσεις μεταξύ επιβατών είναι μεγάλες (π.χ. > ~${maxKm} km), το σύστημα μπορεί να δημιουργήσει επιπλέον όχημα για να αποφευχθούν καθυστερήσεις.`
        : 'Αν οι αποστάσεις μεταξύ επιβατών είναι μεγάλες, το σύστημα μπορεί να δημιουργήσει επιπλέον όχημα για να αποφευχθούν καθυστερήσεις.';
    } else {
      return maxKm
        ? `If passengers are far apart (e.g., > ~${maxKm} km), the system may assign an extra vehicle to avoid long detours.`
        : 'If passengers are far apart, the system may assign an extra vehicle to avoid delays.';
    }
  }

  // Q: πότε ξεκινά το όχημα / start time
  if (/(πότε|ποτε|start|αναχωρ|depart|departure).*?(όχημα|van|bus|vehicle|trip|εκδρομ)/.test(m)){
    return isEl ? (startInfo || 'Το όχημα αναχωρεί λίγο μετά την ολοκλήρωση των παραλαβών.') : 'The vehicle departs shortly after all pickups are completed.';
  }

  // Q: πόσες στάσεις μπορεί να κάνει – not explicit; answer generally
  if (/(πόσες|ποσες|how\s+many).*?(στάσεις|στασεις|stops)/.test(m)){
    return isEl ? 'Οι στάσεις εξαρτώνται από τη διαδρομή και τις παραλαβές. Τυπικά περιλαμβάνονται οι προκαθορισμένες στάσεις της εκδρομής και οι απαραίτητες παραλαβές.'
                 : 'Stops depend on the route and pickups. Typically include predefined tour stops and necessary pickups.';
  }

  // If none matched, return null to let other logic proceed
  return null;
}

module.exports = {
  loadPolicies,
  loadKnowledge,
  rulesLoaded,
  fallbackMissingMessage,
  buildPoliciesKnowledgePrompt,
  maybeAnswerPolicyQuestion,
};
