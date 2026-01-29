'use strict';
// MoveAthens AI Assistant - Transfer-focused chatbot
const path = require('path');
const fs = require('fs');

// Load knowledge files
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

// Load transfer data
function loadTransferData() {
  const dataPath = path.join(__dirname, '..', 'data', 'moveathens_ui.json');
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) { console.warn('[MA-Assistant] Failed to load transfer data:', e.message); }
  return null;
}

// Build system prompt for OpenAI
function buildSystemPrompt(knowledge, transferData, lang = 'el') {
  const isGreek = lang === 'el';
  
  let prompt = isGreek 
    ? `Είσαι ο ψηφιακός βοηθός του MoveAthens, υπηρεσίας ιδιωτικών μεταφορών premium στην Αθήνα.`
    : `You are the digital assistant of MoveAthens, a premium private transfer service in Athens, Greece.`;
  
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
  
  // Add rules
  if (knowledge.rules?.length) {
    prompt += isGreek ? '## Κανόνες Συμπεριφοράς\n' : '## Behavior Rules\n';
    knowledge.rules.forEach(r => {
      prompt += `- ${r.text}\n`;
    });
    prompt += '\n';
  }
  
  // Add contact info
  if (knowledge.concept?.constraints?.length) {
    prompt += isGreek ? '## Σημαντικό\n' : '## Important\n';
    knowledge.concept.constraints.forEach(c => {
      prompt += `- ${c}\n`;
    });
  }
  
  return prompt;
}

// Simple mock response for when OpenAI is not available
function mockResponse(message, knowledge, transferData, lang = 'el') {
  const m = (message || '').toLowerCase();
  const isGreek = lang === 'el';
  
  // Check for price questions
  if (/τιμ[ηή]|κοστ|πόσο|price|cost|how much/.test(m)) {
    if (transferData?.transferPrices?.length) {
      const sample = transferData.transferPrices[0];
      const zone = transferData.transferZones?.find(z => z.id === sample.origin_zone_id);
      const dest = transferData.destinations?.find(d => d.id === sample.destination_id);
      const vehicle = transferData.vehicleTypes?.find(v => v.id === sample.vehicle_type_id);
      if (zone && dest && vehicle) {
        return isGreek
          ? `Ενδεικτικά, η τιμή από ${zone.name} στο ${dest.name} με ${vehicle.name} είναι ${sample.price}€. Για ακριβή τιμή, επικοινώνησε στο +30 6985700007 ή WhatsApp +30 6945358476.`
          : `For example, the price from ${zone.name} to ${dest.name} by ${vehicle.name} is €${sample.price}. For an exact quote, contact +30 6985700007 or WhatsApp +30 6945358476.`;
      }
    }
    return isGreek
      ? 'Η τιμή εξαρτάται από τον προορισμό και το όχημα. Για ακριβή προσφορά, κάλεσε +30 6985700007 ή WhatsApp +30 6945358476.'
      : 'The price depends on destination and vehicle. For an exact quote, call +30 6985700007 or WhatsApp +30 6945358476.';
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
      ? 'Για κράτηση κάλεσε +30 6985700007 ή στείλε WhatsApp στο +30 6945358476. Θα χρειαστούμε: ημερομηνία, ώρα, σημείο παραλαβής, προορισμό και αριθμό επιβατών.'
      : 'To book, call +30 6985700007 or send WhatsApp to +30 6945358476. We will need: date, time, pickup point, destination and number of passengers.';
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
      const transferData = loadTransferData();
      
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
    const transferData = loadTransferData();
    
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
