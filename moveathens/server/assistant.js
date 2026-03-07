'use strict';
// MoveAthens AI Assistant - Transfer-focused chatbot
const path = require('path');
const fs = require('fs');

// Import data layer for dynamic DB access
let maData = null;
try {
  maData = require('../../src/server/data/moveathens');
} catch (e) {
  console.warn('[MA-Assistant] Could not load moveathens data layer:', e.message);
}

// Load knowledge files (static rules/concept - can be overridden by DB config)
function loadKnowledge() {
  const base = path.join(__dirname, '..', 'data', 'knowledge');
  const knowledge = { concept: null, faqs: [], rules: [] };
  
  try {
    const conceptPath = path.join(base, 'moveathens_concept.json');
    if (fs.existsSync(conceptPath)) {
      knowledge.concept = JSON.parse(fs.readFileSync(conceptPath, 'utf8'));
    }
  } catch (e) { console.warn('[MA-Assistant] Failed to load concept:', e.message); }
  
  try {
    const faqPath = path.join(base, 'moveathens_faq.json');
    if (fs.existsSync(faqPath)) {
      const data = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
      knowledge.faqs = data.faqs || [];
    }
  } catch (e) { console.warn('[MA-Assistant] Failed to load faqs:', e.message); }
  
  try {
    const rulesPath = path.join(base, 'moveathens_rules.json');
    if (fs.existsSync(rulesPath)) {
      const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
      knowledge.rules = data.rules || [];
    }
  } catch (e) { console.warn('[MA-Assistant] Failed to load rules:', e.message); }
  
  return knowledge;
}

// Load transfer data dynamically from database
async function loadTransferData() {
  // Try to load from database via data layer
  if (maData) {
    try {
      const [config, zones, vehicles, destinations, prices, categories] = await Promise.all([
        maData.getConfig().catch(() => null),
        maData.getZones().catch(() => []),
        maData.getVehicleTypes().catch(() => []),
        maData.getDestinations().catch(() => []),
        maData.getPrices().catch(() => []),
        maData.getDestinationCategories ? maData.getDestinationCategories().catch(() => []) : Promise.resolve([])
      ]);
      
      console.log('[MA-Assistant] Loaded data from DB:', {
        zones: zones?.length || 0,
        vehicles: vehicles?.length || 0,
        destinations: destinations?.length || 0,
        prices: prices?.length || 0,
        categories: categories?.length || 0
      });
      
      return {
        config,
        transferZones: zones,
        vehicleTypes: vehicles,
        destinations,
        transferPrices: prices,
        categories
      };
    } catch (e) {
      console.warn('[MA-Assistant] Failed to load from DB:', e.message);
    }
  }
  
  // Fallback to JSON file (local development only)
  const dataPath = path.join(__dirname, '..', 'data', 'moveathens_ui.json');
  try {
    if (fs.existsSync(dataPath)) {
      console.log('[MA-Assistant] Fallback to JSON file');
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) { console.warn('[MA-Assistant] Failed to load transfer data:', e.message); }
  return null;
}

// Build system prompt for OpenAI
function buildSystemPrompt(knowledge, transferData, lang = 'el') {
  const isGreek = lang === 'el';
  
  // Get vehicle names for intro
  const vehicleNames = (transferData?.vehicleTypes || [])
    .filter(v => v.is_active !== false)
    .map(v => v.name)
    .join(', ');
  
  let prompt = isGreek 
    ? `Είσαι ο ψηφιακός βοηθός του MoveAthens, υπηρεσίας μεταφορών στην Αθήνα.

ΣΗΜΑΝΤΙΚΟ: Διαβάζεις δεδομένα ΜΟΝΟ από τη βάση δεδομένων. Αν σε ρωτήσουν για κάποιο όχημα, ΨΑΞΕ στη λίστα "Διαθέσιμα Οχήματα" παρακάτω. Αν υπάρχει, απάντησε ότι ΝΑΙ το έχουμε. Μην αρνείσαι χωρίς να ελέγξεις.

Τα οχήματά μας: ${vehicleNames || 'διάφορα οχήματα'}.`
    : `You are the digital assistant of MoveAthens, a transfer service in Athens, Greece.

IMPORTANT: You read data ONLY from the database. If asked about a vehicle, SEARCH the "Available Vehicles" list below. If it exists, answer YES we have it. Don't refuse without checking.

Our vehicles: ${vehicleNames || 'various vehicles'}.`;
  
  prompt += '\n\n';
  
  // Add concept/overview
  if (knowledge.concept?.overview) {
    const ov = knowledge.concept.overview;
    prompt += isGreek ? '## Σχετικά με εμάς\n' : '## About Us\n';
    prompt += `${ov.purpose}\n\n`;
  }
  
  // Add services
  if (knowledge.concept?.services?.length) {
    prompt += isGreek ? '## Υπηρεσίες\n' : '## Services\n';
    knowledge.concept.services.forEach(s => {
      prompt += `- **${s.name}**: ${s.description}\n`;
    });
    prompt += '\n';
  }
  
  // Add vehicles from transfer data
  if (transferData?.vehicleTypes?.length) {
    prompt += isGreek ? '## Διαθέσιμα Οχήματα\n' : '## Available Vehicles\n';
    transferData.vehicleTypes.forEach(v => {
      prompt += isGreek
        ? `- **${v.name}**: έως ${v.max_passengers} επιβάτες, ${v.luggage_large} μεγάλες + ${v.luggage_medium} μεσαίες βαλίτσες\n`
        : `- **${v.name}**: up to ${v.max_passengers} passengers, ${v.luggage_large} large + ${v.luggage_medium} medium luggage\n`;
    });
    prompt += '\n';
  }
  
  // Add zones
  if (transferData?.transferZones?.length) {
    prompt += isGreek ? '## Ζώνες Εξυπηρέτησης\n' : '## Service Zones\n';
    transferData.transferZones.filter(z => z.is_active).forEach(z => {
      prompt += `- ${z.name}\n`;
    });
    prompt += '\n';
  }
  
  // Add destinations
  if (transferData?.destinations?.length) {
    prompt += isGreek ? '## Προορισμοί που καλύπτουμε\n' : '## Destinations we cover\n';
    transferData.destinations.filter(d => d.is_active).forEach(d => {
      if (d.description) {
        prompt += `- **${d.name}**: ${d.description}\n`;
      } else {
        prompt += `- ${d.name}\n`;
      }
    });
    prompt += '\n';
  }

  // Add categories (attractions, restaurants, etc.) from admin panel
  if (transferData?.categories?.length) {
    prompt += isGreek ? '## Κατηγορίες & Αξιοθέατα\n' : '## Categories & Attractions\n';
    transferData.categories.filter(c => c.is_active !== false).forEach(c => {
      if (c.description) {
        prompt += `- **${c.name}**: ${c.description}\n`;
      } else {
        prompt += `- ${c.name}\n`;
      }
    });
    prompt += '\n';
  }

  // Add sample prices
  if (transferData?.transferPrices?.length) {
    prompt += isGreek ? '## Ενδεικτικές Τιμές\n' : '## Sample Prices\n';
    const prices = transferData.transferPrices.slice(0, 6);
    prices.forEach(p => {
      const zone = transferData.transferZones?.find(z => z.id === p.origin_zone_id);
      const dest = transferData.destinations?.find(d => d.id === p.destination_id);
      const vehicle = transferData.vehicleTypes?.find(v => v.id === p.vehicle_type_id);
      if (zone && dest && vehicle) {
        prompt += isGreek
          ? `- ${zone.name} → ${dest.name} με ${vehicle.name}: ${p.price}€ (${p.tariff === 'day' ? 'ημέρα' : 'νύχτα'})\n`
          : `- ${zone.name} → ${dest.name} by ${vehicle.name}: €${p.price} (${p.tariff})\n`;
      }
    });
    prompt += '\n';
  }
  
  // Add rules (replace hardcoded phone numbers with dynamic config)
  if (knowledge.rules?.length) {
    const phone = transferData?.config?.phoneNumber || '';
    const whatsapp = transferData?.config?.whatsappNumber || '';
    prompt += isGreek ? '## Κανόνες Συμπεριφοράς\n' : '## Behavior Rules\n';
    knowledge.rules.forEach(r => {
      let text = r.text;
      // Skip contact rule — we inject dynamic contact below
      if (r.id === 'contact') return;
      prompt += `- ${text}\n`;
    });
    prompt += '\n';
  }
  
  // Add DYNAMIC contact info from admin config (NOT hardcoded)
  const cfgPhone = transferData?.config?.phoneNumber || '';
  const cfgWhatsapp = transferData?.config?.whatsappNumber || '';
  if (cfgPhone || cfgWhatsapp) {
    prompt += isGreek ? '## Στοιχεία Επικοινωνίας (από admin panel)\n' : '## Contact Info (from admin panel)\n';
    if (cfgPhone) {
      prompt += isGreek ? `- Τηλέφωνο: ${cfgPhone}\n` : `- Phone: ${cfgPhone}\n`;
    }
    if (cfgWhatsapp) {
      prompt += `- WhatsApp: ${cfgWhatsapp}\n`;
    }
    prompt += isGreek
      ? '- Δεν κάνουμε κρατήσεις μέσω chat - μόνο πληροφορίες και τιμές\n'
      : '- We do not take bookings via chat - info and prices only\n';
    prompt += isGreek
      ? '- Τιμές ημέρας (06:00-00:00) και νύχτας (00:00-06:00) διαφέρουν\n'
      : '- Day (06:00-00:00) and night (00:00-06:00) prices differ\n';
    prompt += '\n';
  }

  // Add company / legal info (aboutUs fields) from admin panel
  const cfg = transferData?.config || {};
  const aboutFields = [
    { key: 'aboutUsCompanyName', label: isGreek ? 'Επωνυμία' : 'Company Name' },
    { key: 'aboutUsAfm', label: isGreek ? 'ΑΦΜ' : 'Tax ID' },
    { key: 'aboutUsDoy', label: isGreek ? 'ΔΟΥ' : 'Tax Office' },
    { key: 'aboutUsActivity', label: isGreek ? 'Δραστηριότητα' : 'Activity' },
    { key: 'aboutUsAddress', label: isGreek ? 'Διεύθυνση' : 'Address' },
    { key: 'aboutUsManager', label: isGreek ? 'Υπεύθυνος' : 'Manager' },
    { key: 'aboutUsPhone', label: isGreek ? 'Τηλέφωνο' : 'Phone' },
    { key: 'aboutUsEmail', label: 'Email' },
    { key: 'aboutUsWebsite', label: 'Website' },
  ];
  const filledAbout = aboutFields.filter(f => cfg[f.key]);
  if (filledAbout.length) {
    prompt += isGreek ? '## Νομικά Στοιχεία Εταιρείας\n' : '## Company Legal Info\n';
    filledAbout.forEach(f => { prompt += `- ${f.label}: ${cfg[f.key]}\n`; });
    prompt += '\n';
  }

  // Add admin info sections (cancellation, compliance, FAQ) from admin panel
  const infoSections = [
    { title: cfg.infoCancellationTitle, content: cfg.infoCancellationContent, label: isGreek ? 'Πολιτική Ακύρωσης' : 'Cancellation Policy' },
    { title: cfg.infoComplianceTitle, content: cfg.infoComplianceContent, label: isGreek ? 'Συμμόρφωση' : 'Compliance' },
    { title: cfg.infoFaqTitle, content: cfg.infoFaqContent, label: isGreek ? 'Συχνές Ερωτήσεις' : 'FAQ' },
    { title: cfg.infoPageTitle, content: cfg.infoPageContent, label: isGreek ? 'Γενικές Πληροφορίες' : 'General Info' },
  ];
  const hasInfoSections = infoSections.some(s => s.content);
  if (hasInfoSections) {
    prompt += isGreek ? '## Πληροφορίες από Admin Panel\n' : '## Info from Admin Panel\n';
    infoSections.forEach(s => {
      if (s.content) {
        prompt += `### ${s.title || s.label}\n${s.content}\n\n`;
      }
    });
  }
  
  return prompt;
}

// Simple mock response for when OpenAI is not available
function mockResponse(message, knowledge, transferData, lang = 'el') {
  const m = (message || '').toLowerCase();
  const isGreek = lang === 'el';
  
  // Dynamic contact info from config
  const phone = transferData?.config?.phoneNumber || '';
  const whatsapp = transferData?.config?.whatsappNumber || '';
  const contactSuffix = (isGreek)
    ? (phone ? ` Τηλέφωνο: ${phone}.` : '') + (whatsapp ? ` WhatsApp: ${whatsapp}.` : '')
    : (phone ? ` Phone: ${phone}.` : '') + (whatsapp ? ` WhatsApp: ${whatsapp}.` : '');

  // Check for price questions
  if (/τιμ[ηή]|κοστ|πόσο|price|cost|how much/.test(m)) {
    if (transferData?.transferPrices?.length) {
      const sample = transferData.transferPrices[0];
      const zone = transferData.transferZones?.find(z => z.id === sample.origin_zone_id);
      const dest = transferData.destinations?.find(d => d.id === sample.destination_id);
      const vehicle = transferData.vehicleTypes?.find(v => v.id === sample.vehicle_type_id);
      if (zone && dest && vehicle) {
        return isGreek
          ? `Ενδεικτικά, η τιμή από ${zone.name} στο ${dest.name} με ${vehicle.name} είναι ${sample.price}€. Για ακριβή τιμή, επικοινώνησε μαζί μας.${contactSuffix}`
          : `For example, the price from ${zone.name} to ${dest.name} by ${vehicle.name} is €${sample.price}. For an exact quote, contact us.${contactSuffix}`;
      }
    }
    return isGreek
      ? `Η τιμή εξαρτάται από τον προορισμό και το όχημα.${contactSuffix}`
      : `The price depends on destination and vehicle.${contactSuffix}`;
  }
  
  // Check if user asks about a SPECIFIC vehicle by name (taxi, sedan, van, etc.)
  if (transferData?.vehicleTypes?.length) {
    // Normalize function to handle accents and variations
    const normalize = (str) => str.toLowerCase()
      .replace(/ά/g, 'α').replace(/έ/g, 'ε').replace(/ή/g, 'η')
      .replace(/ί/g, 'ι').replace(/ό/g, 'ο').replace(/ύ/g, 'υ').replace(/ώ/g, 'ω');
    
    const normalizedMessage = normalize(m);
    
    // Check if any vehicle name appears in the message
    const foundVehicle = transferData.vehicleTypes.find(v => {
      if (v.is_active === false) return false;
      const normalizedName = normalize(v.name);
      // Also check for "taxi" when vehicle is "ταξί"
      const isTaxi = normalizedName === 'ταξι' && (normalizedMessage.includes('taxi') || normalizedMessage.includes('ταξι'));
      return normalizedMessage.includes(normalizedName) || isTaxi;
    });
    
    if (foundVehicle) {
      return isGreek
        ? `Ναι, έχουμε ${foundVehicle.name}! Χωρητικότητα: έως ${foundVehicle.max_passengers} επιβάτες, ${foundVehicle.luggage_large} μεγάλες + ${foundVehicle.luggage_medium} μεσαίες βαλίτσες. Θέλεις να μάθεις την τιμή για κάποιο συγκεκριμένο δρομολόγιο;`
        : `Yes, we have ${foundVehicle.name}! Capacity: up to ${foundVehicle.max_passengers} passengers, ${foundVehicle.luggage_large} large + ${foundVehicle.luggage_medium} medium luggage. Would you like to know the price for a specific route?`;
    }
  }
  
  // Check for vehicle questions
  if (/όχημα|αυτοκίνητο|van|sedan|vehicle|car|χωρ[αά]/.test(m)) {
    if (transferData?.vehicleTypes?.length) {
      const vehicles = transferData.vehicleTypes.map(v => 
        isGreek
          ? `${v.name}: έως ${v.max_passengers} άτομα, ${v.luggage_large}+${v.luggage_medium} βαλίτσες`
          : `${v.name}: up to ${v.max_passengers} people, ${v.luggage_large}+${v.luggage_medium} luggage`
      ).join('. ');
      return isGreek
        ? `Έχουμε διαθέσιμα: ${vehicles}. Τι χρειάζεσαι;`
        : `We have available: ${vehicles}. What do you need?`;
    }
  }
  
  // Check for booking questions
  if (/κράτηση|book|reserve|κλείσ/.test(m)) {
    return isGreek
      ? `Για κράτηση επικοινώνησε μαζί μας.${contactSuffix} Θα χρειαστούμε: ημερομηνία, ώρα, σημείο παραλαβής, προορισμό και αριθμό επιβατών.`
      : `To book, contact us.${contactSuffix} We will need: date, time, pickup point, destination and number of passengers.`;
  }

  // Check for destination questions
  if (/προορισμ|destination|που πάτε|που πηγαίνετε|τι καλύπτ|where.*go|what.*cover|places/.test(m)) {
    if (transferData?.destinations?.length) {
      const activeDestinations = transferData.destinations.filter(d => d.is_active);
      if (activeDestinations.length > 0) {
        const destList = activeDestinations.map(d => {
          if (d.description) {
            return `**${d.name}** - ${d.description}`;
          }
          return d.name;
        }).join('\n- ');
        return isGreek
          ? `Καλύπτουμε μεταφορές προς τους παρακάτω προορισμούς:\n- ${destList}\n\nΑν θες πληροφορίες για κάποιον συγκεκριμένο προορισμό ή τιμή, πες μου!`
          : `We cover transfers to the following destinations:\n- ${destList}\n\nIf you want info about a specific destination or price, let me know!`;
      }
    }
    return isGreek
      ? 'Καλύπτουμε μεταφορές σε όλη την Αττική - αεροδρόμιο, λιμάνια, αξιοθέατα και ξενοδοχεία. Πες μου τον προορισμό σου για περισσότερες πληροφορίες!'
      : 'We cover transfers across Attica - airport, ports, attractions and hotels. Tell me your destination for more info!';
  }
  
  // Check for FAQ matches
  for (const faq of (knowledge.faqs || [])) {
    const keywords = faq.q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matches = keywords.filter(k => m.includes(k));
    if (matches.length >= 2 || (keywords.length === 1 && matches.length === 1)) {
      return faq.a;
    }
  }
  
  // Default greeting/help
  if (/γεια|καλημέρα|καλησπέρα|hello|hi|hey/.test(m)) {
    return isGreek
      ? 'Γεια σου! 👋 Είμαι ο βοηθός του MoveAthens. Μπορώ να σε βοηθήσω με τιμές transfers, διαθέσιμα οχήματα ή πληροφορίες για κράτηση. Τι θα ήθελες;'
      : 'Hello! 👋 I\'m the MoveAthens assistant. I can help you with transfer prices, available vehicles or booking info. How can I help?';
  }
  
  // Default response
  return isGreek
    ? 'Είμαι εδώ να βοηθήσω με μεταφορές στην Αθήνα. Μπορώ να σε ενημερώσω για τιμές, οχήματα ή τρόπο κράτησης. Πες μου τι χρειάζεσαι!'
    : 'I\'m here to help with transfers in Athens. I can inform you about prices, vehicles or how to book. Tell me what you need!';
}

// Register routes
function registerMoveAthensAssistantRoutes(app, deps = {}) {
  const { OPENAI_API_KEY } = deps;
  
  // POST /api/moveathens/assistant
  app.post('/api/moveathens/assistant', async (req, res) => {
    try {
      const message = (req.body?.message || '').trim();
      const history = req.body?.history || [];
      const lang = req.body?.lang || 'el';
      
      if (!message) {
        return res.status(400).json({ error: 'Message required' });
      }
      
      const knowledge = loadKnowledge();
      const transferData = await loadTransferData();
      
      // If no OpenAI key, use mock responses
      if (!OPENAI_API_KEY) {
        const reply = mockResponse(message, knowledge, transferData, lang);
        return res.json({ reply, mode: 'mock' });
      }
      
      // Call OpenAI
      try {
        const systemPrompt = buildSystemPrompt(knowledge, transferData, lang);
        
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ];
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 500,
            temperature: 0.7
          })
        });
        
        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }
        
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'No response';
        
        return res.json({ reply, mode: 'openai' });
      } catch (aiError) {
        console.error('[MA-Assistant] OpenAI error, falling back to mock:', aiError.message);
        const reply = mockResponse(message, knowledge, transferData, lang);
        return res.json({ reply, mode: 'mock-fallback' });
      }
    } catch (error) {
      console.error('[MA-Assistant] Error:', error);
      return res.status(500).json({ error: 'Assistant error' });
    }
  });
  
  // Streaming endpoint
  app.post('/api/moveathens/assistant/stream', async (req, res) => {
    const message = (req.body?.message || '').trim();
    const history = req.body?.history || [];
    const lang = req.body?.lang || 'el';
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    const knowledge = loadKnowledge();
    const transferData = await loadTransferData();
    
    if (!OPENAI_API_KEY) {
      // For mock, just return JSON (no streaming)
      const reply = mockResponse(message, knowledge, transferData, lang);
      return res.json({ reply, mode: 'mock' });
    }
    
    try {
      const systemPrompt = buildSystemPrompt(knowledge, transferData, lang);
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ];
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          const jsonStr = line.replace('data: ', '').trim();
          if (jsonStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) { /* skip parse errors */ }
        }
      }
      
      res.end();
    } catch (error) {
      console.error('[MA-Assistant] Stream error:', error);
      // Fallback to mock
      const reply = mockResponse(message, knowledge, transferData, lang);
      return res.json({ reply, mode: 'mock-fallback' });
    }
  });
  
  console.log('[MoveAthens] Assistant routes registered');
}

module.exports = { registerMoveAthensAssistantRoutes, loadKnowledge, loadTransferData, buildSystemPrompt, mockResponse };
