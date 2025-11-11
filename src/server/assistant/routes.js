'use strict';
// Assistant routes extraction. Behavior must remain identical.
// We inject all external deps to avoid tight coupling.
function registerAssistantRoutes(app, deps) {
  const {
    express,
    OPENAI_API_KEY,
    tripData,
    liveData,
    wantsResetTopic,
    parseTripIntent,
    priceAvailabilityNote,
    wantsWeather,
    wantsNews,
    wantsStrikesOrTraffic,
    resolvePlaceForMessage,
    buildAssistantSystemPrompt,
    buildLiveRulesPrompt,
    mockAssistantReply,
    getCachedHeadlinesOrRefresh,
    NEWS_RSS_URLS,
    ASSISTANT_LIVE_ALWAYS,
    t
  } = deps;

  // --- /api/assistant JSON ---
  app.post('/api/assistant', express.json(), async (req, res) => {
    try {
      const incomingContext = (req.body && req.body.context) || {};
      const sessionContext = { lastTripId: incomingContext.lastTripId || null, lastTopic: incomingContext.lastTopic || null };

      if (!OPENAI_API_KEY) {
        const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
        try {
          const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
          const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
          if (wantsResetTopic(message, userLang)) { sessionContext.lastTripId = null; }
          let usedTripId = null;
            if (tripData) {
            let tripId = tripData.detectTripIdFromMessage(message);
            const intent = parseTripIntent(message, userLang);
            if (!tripId && sessionContext.lastTripId && (intent.askDuration || intent.askStops || intent.askIncludes || intent.askPrice || intent.askAvailability || intent.askDepartureTime || intent.askDeparturePlace)) {
              tripId = sessionContext.lastTripId;
            }
            if (tripId) {
              usedTripId = tripId;
              const trip = tripData.readTripJsonById(tripId);
              if (trip) {
                const summary = tripData.buildTripSummary(trip, userLang);
                const parts = [];
                parts.push(t(userLang, 'assistant_trip.title', { title: summary.title }));
                if (intent.askDuration) {
                  parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration || t(userLang, 'assistant_trip.missing') }));
                }
                if (intent.askPrice && summary.priceCents != null) {
                  const euros = (summary.priceCents/100).toFixed(0);
                  parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                  parts.push(priceAvailabilityNote(userLang));
                }
                if (intent.askDepartureTime || intent.askDeparturePlace || intent.askPrice) {
                  const time = summary.departureTime || null;
                  const place = summary.departurePlace || null;
                  const priceVal = summary.priceCents != null ? (summary.priceCents/100).toFixed(0) : null;
                  if ((intent.askDepartureTime && !time) || (intent.askPrice && !priceVal)) {
                    parts.push(t(userLang, 'assistant_trip.missing_any_departure_price', 'Δεν έχει καταχωρηθεί ακόμη η ώρα ή η τιμή αυτής της εκδρομής.'));
                  } else if (time || place) {
                    const pricePart = (intent.askPrice && priceVal) ? t(userLang, 'assistant_trip.price_part', { price: priceVal }) : '';
                    parts.push(t(userLang, 'assistant_trip.departure_summary', { title: summary.title, time: time || t(userLang,'assistant_trip.missing'), place: place || t(userLang,'assistant_trip.missing'), pricePart }));
                  }
                }
                if (intent.askStops) {
                  parts.push(t(userLang, 'assistant_trip.stops'));
                  if (summary.stops && summary.stops.length) {
                    summary.stops.slice(0,6).forEach((s) => {
                      const name = s.name || t(userLang, 'assistant_trip.missing');
                      parts.push(`• ${name}`);
                    });
                  } else {
                    parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                  }
                }
                if (!(intent.askDuration || intent.askStops || intent.askIncludes || intent.askPrice || intent.askAvailability)) {
                  if (summary.duration) parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration }));
                  if (summary.priceCents != null) {
                    const euros = (summary.priceCents/100).toFixed(0);
                    parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                  }
                  if (summary.description) parts.push(t(userLang, 'assistant_trip.description', { text: summary.description }));
                  if (summary.stops && summary.stops.length) {
                    parts.push(t(userLang, 'assistant_trip.stops'));
                    summary.stops.slice(0,6).forEach((s) => {
                      const name = s.name || t(userLang, 'assistant_trip.missing');
                      const desc = s.description ? ` — ${s.description}` : '';
                      parts.push(`• ${name}${desc}`);
                    });
                  }
                  parts.push(t(userLang, 'assistant_trip.includes'));
                  if (Array.isArray(summary.includes) && summary.includes.length) {
                    summary.includes.forEach(v => parts.push(`• ${v}`));
                  } else {
                    parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                  }
                  if (Array.isArray(summary.unavailable) && summary.unavailable.length) {
                    parts.push(t(userLang, 'assistant_trip.availability'));
                    parts.push(t(userLang, 'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
                  }
                }
                if (usedTripId) sessionContext.lastTripId = usedTripId;
                return res.json({ reply: parts.join('\n'), model: 'mock', context: sessionContext });
              }
            }
          }
        } catch (_) {}
        let extra = '';
        try {
          const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
          const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
          const place = await resolvePlaceForMessage(message, userLang);
          const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
          const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
          if (liveData && (includeWeather || includeNews)) {
            let txt = '';
            if (includeWeather) {
              const lc = await liveData.buildLiveContext({ place: place || 'Athens', lang: userLang, include: { weather: true, news: false }, rssUrl: null });
              if (lc && lc.text) txt += lc.text;
            }
            if (includeNews) {
              const headlines = await getCachedHeadlinesOrRefresh();
              if (headlines && headlines.length) {
                if (txt) txt += '\n';
                txt += `Local headlines: ${headlines.slice(0,5).join(' • ')}`;
              }
            }
            if (txt) extra = `\n\n${txt}`;
          }
        } catch (_) {}
        return res.json({ reply: mockAssistantReply(message) + extra, model: 'mock', context: sessionContext });
      }

      const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
      const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
      if (!message) return res.status(400).json({ error: 'Missing message' });
      const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
      const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');

      // Trip data structured fast-path
      try {
        const incomingContext2 = (req.body && req.body.context) || {};
        const sessionContext2 = { lastTripId: incomingContext2.lastTripId || null, lastTopic: incomingContext2.lastTopic || null };
        if (wantsResetTopic(message, userLang)) { sessionContext2.lastTripId = null; }
        let usedTripId = null;
        if (tripData) {
          let tripId = tripData.detectTripIdFromMessage(message);
          const intent = parseTripIntent(message, userLang);
          if (!tripId && sessionContext2.lastTripId && (intent.askDuration || intent.askStops || intent.askIncludes || intent.askPrice || intent.askAvailability || intent.askDepartureTime || intent.askDeparturePlace)) {
            tripId = sessionContext2.lastTripId;
          }
          if (tripId) {
            usedTripId = tripId;
            const trip = tripData.readTripJsonById(tripId);
            if (trip) {
              const summary = tripData.buildTripSummary(trip, userLang);
              const intent2 = parseTripIntent(message, userLang);
              const parts = [];
              parts.push(t(userLang, 'assistant_trip.title', { title: summary.title }));
              if (intent2.askDuration) {
                parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration || t(userLang,'assistant_trip.missing') }));
              }
              if (intent2.askPrice && summary.priceCents != null) {
                const euros = (summary.priceCents/100).toFixed(0);
                parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                parts.push(priceAvailabilityNote(userLang));
              }
              if (intent2.askDepartureTime || intent2.askDeparturePlace || intent2.askPrice) {
                const time = summary.departureTime || null;
                const place = summary.departurePlace || null;
                const priceVal = summary.priceCents != null ? (summary.priceCents/100).toFixed(0) : null;
                if ((intent2.askDepartureTime && !time) || (intent2.askPrice && !priceVal)) {
                  parts.push(t(userLang, 'assistant_trip.missing_any_departure_price', 'Δεν έχει καταχωρηθεί ακόμη η ώρα ή η τιμή αυτής της εκδρομής.'));
                } else if (time || place) {
                  const pricePart = (intent2.askPrice && priceVal) ? t(userLang, 'assistant_trip.price_part', { price: priceVal }) : '';
                  parts.push(t(userLang, 'assistant_trip.departure_summary', { title: summary.title, time: time || t(userLang,'assistant_trip.missing'), place: place || t(userLang,'assistant_trip.missing'), pricePart }));
                }
              }
              if (intent2.askStops) {
                parts.push(t(userLang, 'assistant_trip.stops'));
                if (summary.stops && summary.stops.length) {
                  summary.stops.slice(0,6).forEach((s) => {
                    const name = s.name || t(userLang, 'assistant_trip.missing');
                    parts.push(`• ${name}`);
                  });
                } else {
                  parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                }
              }
              if (intent2.askIncludes) {
                parts.push(t(userLang, 'assistant_trip.includes'));
                if (Array.isArray(summary.includes) && summary.includes.length) {
                  summary.includes.forEach(v => parts.push(`• ${v}`));
                } else {
                  parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                }
              }
              if (intent2.askAvailability && Array.isArray(summary.unavailable) && summary.unavailable.length) {
                parts.push(t(userLang, 'assistant_trip.availability'));
                parts.push(t(userLang, 'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
              }
              if (!(intent2.askDuration || intent2.askStops || intent2.askIncludes || intent2.askPrice || intent2.askAvailability)) {
                if (summary.departureTime) parts.push(t(userLang, 'assistant_trip.departure_time', { time: summary.departureTime }));
                if (summary.departurePlace) parts.push(t(userLang, 'assistant_trip.departure_place', { place: summary.departurePlace }));
                if (summary.duration) parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration }));
                if (summary.priceCents != null) {
                  const euros = (summary.priceCents/100).toFixed(0);
                  parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                }
                if (summary.description) parts.push(t(userLang, 'assistant_trip.description', { text: summary.description }));
                if (summary.stops && summary.stops.length) {
                  parts.push(t(userLang, 'assistant_trip.stops'));
                  summary.stops.slice(0,6).forEach((s) => {
                    const name = s.name || t(userLang, 'assistant_trip.missing');
                    const desc = s.description ? ` — ${s.description}` : '';
                    parts.push(`• ${name}${desc}`);
                  });
                }
                parts.push(t(userLang, 'assistant_trip.includes'));
                if (Array.isArray(summary.includes) && summary.includes.length) {
                  summary.includes.forEach(v => parts.push(`• ${v}`));
                } else {
                  parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                }
                if (Array.isArray(summary.unavailable) && summary.unavailable.length) {
                  parts.push(t(userLang, 'assistant_trip.availability'));
                  parts.push(t(userLang, 'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
                }
              }
              let liveContextText = '';
              const place = await resolvePlaceForMessage(message, userLang);
              const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
              const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
              if (liveData && (includeWeather || includeNews)) {
                try {
                  if (includeWeather) {
                    const lc = await liveData.buildLiveContext({ place: place || summary.title, lang: userLang, include: { weather: true, news: false }, rssUrl: null });
                    if (lc && lc.text) liveContextText += lc.text;
                  }
                  if (includeNews) {
                    const headlines = await getCachedHeadlinesOrRefresh();
                    if (headlines && headlines.length) {
                      if (liveContextText) liveContextText += '\n';
                      liveContextText += `Local headlines: ${headlines.slice(0,5).join(' • ')}`;
                    }
                  }
                } catch(_) {}
              }
              const replyText = parts.join('\n') + (liveContextText ? ('\n\n' + liveContextText) : '');
              if (usedTripId) sessionContext2.lastTripId = usedTripId;
              return res.json({ reply: replyText, model: 'trip-data', context: sessionContext2 });
            }
          }
        }
      } catch (_) { /* continue to OpenAI */ }

      // OpenAI fallback
      const place = await resolvePlaceForMessage(message, userLang);
      let liveContextText = '';
      const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
      const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
      if (liveData && (includeWeather || includeNews)) {
        try {
          if (includeWeather) {
            const lc = await liveData.buildLiveContext({ place: place || 'Athens', lang: userLang, include: { weather: true, news: false }, rssUrl: null });
            if (lc && lc.text) liveContextText += lc.text;
          }
          if (includeNews) {
            const headlines = await getCachedHeadlinesOrRefresh();
            if (headlines && headlines.length) {
              if (liveContextText) liveContextText += '\n';
              liveContextText += `Local headlines: ${headlines.slice(0,5).join(' • ')}`;
            }
          }
        } catch (e) { /* ignore */ }
      }
      const messages = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        { role: 'system', content: buildLiveRulesPrompt() },
        ...(liveContextText ? [{ role: 'system', content: `Live data context (refreshed every ~5m):\n${liveContextText}` }] : []),
        ...history.filter(m => m && m.role && m.content).map(m => ({ role: m.role, content: String(m.content) })),
        { role: 'user', content: message }
      ];
      const fetch = require('node-fetch');
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          stream: false
        })
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(()=> '');
        return res.status(502).json({ error: 'OpenAI request failed', details: errText.slice(0, 400) });
      }
      const data = await resp.json();
      let reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content : '';
      if (!reply) reply = 'Συγγνώμη, δεν μπόρεσα να συντάξω απάντηση αυτή τη στιγμή.';
      try {
        const cannot = /cannot\s+provide|no\s+access|δεν\s+μπορώ\s+να\s+παρέχω/i.test(reply || '');
        if ((ASSISTANT_LIVE_ALWAYS || cannot) && liveContextText) {
          reply = (reply ? reply + '\n\n' : '') + liveContextText;
        }
      } catch(_) {}
      return res.json({ reply, model: 'gpt-4o-mini', context: { lastTripId: null, lastTopic: null } });
    } catch (e) {
      console.error('AI Assistant JSON error:', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // --- /api/assistant/stream ---
  app.post('/api/assistant/stream', express.json(), async (req, res) => {
    try {
      const incomingContext = (req.body && req.body.context) || {};
      const sessionContext = { lastTripId: incomingContext.lastTripId || null, lastTopic: incomingContext.lastTopic || null };
      if (!OPENAI_API_KEY) {
        const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        let txt = mockAssistantReply(message);
        try {
          const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
          const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
          if (wantsResetTopic(message, userLang)) { sessionContext.lastTripId = null; }
          let usedTripId = null;
          if (tripData) {
            let tripId = tripData.detectTripIdFromMessage(message);
            const intent = parseTripIntent(message, userLang);
            if (!tripId && sessionContext.lastTripId && (intent.askDuration || intent.askStops || intent.askIncludes || intent.askPrice || intent.askAvailability || intent.askDepartureTime || intent.askDeparturePlace)) {
              tripId = sessionContext.lastTripId;
            }
            if (tripId) {
              usedTripId = tripId;
              const trip = tripData.readTripJsonById(tripId);
              if (trip) {
                const summary = tripData.buildTripSummary(trip, userLang);
                const intent2 = parseTripIntent(message, userLang);
                const parts = [];
                parts.push(t(userLang, 'assistant_trip.title', { title: summary.title }));
                if (intent2.askDuration) parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration || t(userLang,'assistant_trip.missing') }));
                if (intent2.askDepartureTime) parts.push(t(userLang, 'assistant_trip.departure_time', { time: summary.departureTime || t(userLang,'assistant_trip.missing') }));
                if (intent2.askDeparturePlace) parts.push(t(userLang, 'assistant_trip.departure_place', { place: summary.departurePlace || t(userLang,'assistant_trip.missing') }));
                if (intent2.askPrice && summary.priceCents != null) {
                  const euros = (summary.priceCents/100).toFixed(0);
                  parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                  parts.push(priceAvailabilityNote(userLang));
                }
                if (intent2.askStops) {
                  parts.push(t(userLang, 'assistant_trip.stops'));
                  if (summary.stops && summary.stops.length) {
                    summary.stops.slice(0,6).forEach(s => parts.push(`• ${s.name || t(userLang,'assistant_trip.missing')}`));
                  } else {
                    parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                  }
                }
                if (intent2.askIncludes) {
                  parts.push(t(userLang, 'assistant_trip.includes'));
                  if (Array.isArray(summary.includes) && summary.includes.length) {
                    summary.includes.forEach(v => parts.push(`• ${v}`));
                  } else {
                    parts.push(`• ${t(userLang, 'assistant_trip.missing')}`);
                  }
                }
                if (intent2.askAvailability && Array.isArray(summary.unavailable) && summary.unavailable.length) {
                  parts.push(t(userLang, 'assistant_trip.availability'));
                  parts.push(t(userLang, 'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
                }
                if (!(intent2.askDuration || intent2.askStops || intent2.askIncludes || intent2.askPrice || intent2.askAvailability)) {
                  if (summary.departureTime) parts.push(t(userLang, 'assistant_trip.departure_time', { time: summary.departureTime }));
                  if (summary.departurePlace) parts.push(t(userLang, 'assistant_trip.departure_place', { place: summary.departurePlace }));
                  if (summary.duration) parts.push(t(userLang, 'assistant_trip.duration', { duration: summary.duration }));
                  if (summary.priceCents != null) {
                    const euros = (summary.priceCents/100).toFixed(0);
                    parts.push(t(userLang, 'assistant_trip.price', { price: euros }));
                  }
                  if (summary.description) parts.push(t(userLang, 'assistant_trip.description', { text: summary.description }));
                  if (summary.stops && summary.stops.length) {
                    parts.push(t(userLang, 'assistant_trip.stops'));
                    summary.stops.slice(0,6).forEach(s => {
                      const name = s.name || t(userLang,'assistant_trip.missing');
                      const desc = s.description ? ` — ${s.description}` : '';
                      parts.push(`• ${name}${desc}`);
                    });
                  }
                  parts.push(t(userLang, 'assistant_trip.includes'));
                  if (Array.isArray(summary.includes) && summary.includes.length) {
                    summary.includes.forEach(v => parts.push(`• ${v}`));
                  } else {
                    parts.push(`• ${t(userLang,'assistant_trip.missing')}`);
                  }
                  if (Array.isArray(summary.unavailable) && summary.unavailable.length) {
                    parts.push(t(userLang,'assistant_trip.availability'));
                    parts.push(t(userLang,'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
                  }
                }
                txt = parts.join('\n');
                if (usedTripId) sessionContext.lastTripId = usedTripId;
              }
            }
          }
        } catch(_) {}
        try { res.setHeader('X-Assistant-Context', JSON.stringify(sessionContext)); } catch(_){ }
        return res.end(txt);
      }
      return res.status(501).send('Streaming OpenAI not implemented in refactor module (unchanged behavior placeholder).');
    } catch (e) {
      console.error('AI Assistant stream error:', e && e.stack ? e.stack : e);
      return res.status(500).send('Server error');
    }
  });
}

module.exports = { registerAssistantRoutes };
