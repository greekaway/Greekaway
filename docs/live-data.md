# Greekaway Assistant — Live Data

This adds live data to the AI assistant while keeping `data/ai/knowledge.json` as the static knowledge base.

What’s included
- Current weather for a destination using Open-Meteo (no API key required) or a custom provider via WEATHER_API_URL
- Optional local news headlines via one or more RSS feeds (configurable)
- A tiny in-memory cache (~5 minutes for fetches, ~3 hours scheduled prefetch for news) to avoid performance issues and API rate limits
- Extensible design to add more sources later

## How it works

- The assistant UI (`public/js/assistant.js`) talks to server endpoints `/api/assistant` and `/api/assistant/stream`.
- On the server (`server.js`), incoming messages are lightly analyzed:
  - If the text mentions a known destination (from `public/data/tripindex.json`) or contains weather keywords, the server fetches live weather.
  - If no known destination is detected, the server now tries a lightweight geocoding fallback that extracts a likely place name from the message (e.g. «σε Αράχοβα», "weather in Delphi") and geocodes it via Open‑Meteo’s geocoding API.
  - The live data is injected as an extra system message: “Live data context …”.
  - The model (or mock) then composes the final answer and can naturally include the live snippet in the user’s language.
- All remote calls are cached for 5 minutes.

## Endpoints

- /api/assistant (POST): Main assistant (JSON). Live data is auto-injected when relevant.
- /api/assistant/stream (POST): Streaming assistant. Live data is auto-injected when relevant.
- /api/live/weather (GET): Utility endpoint for quick tests: `?place=Lefkada&lang=en`
 - /api/live/news (GET): Returns aggregated cached headlines and last update time. Enabled only when at least one RSS URL is configured.

## Configuration

- OPENAI_API_KEY (optional in dev): Without a key, the assistant returns a friendly mock. The mock also appends live data when relevant so you can test the integration locally.
- WEATHER_API_URL (optional): Override the default forecast endpoint. Must be compatible with Open-Meteo’s `current_weather=true` response shape.
- NEWS_RSS_URL / NEWS_RSS_URL_1 / NEWS_RSS_URL_2 (optional): Provide one or more RSS URLs to enable headlines injection. Multiple sources are aggregated and deduplicated.

## Extending with new data sources

The live layer is in `live/liveData.js`. It exposes a small contract:

- geocodePlace(name, lang)
- getCurrentWeatherByPlace(placeName, lang)
- getRssHeadlines(rssUrl, max)
- buildLiveContext({ place, lang, include, rssUrl }) → { text, meta }  // rssUrl can be a string or an array of URLs

To add a new source (e.g., public holidays, ferry status):
1. Add a new function that fetches and caches data (use `fetchJsonWithCache` or similar).
2. Compose a short, factual snippet (English is fine; the model will translate in context).
3. Update `buildLiveContext` to include it behind a flag.
4. Pass the flag from `server.js` when you want it enabled.

## Notes

- Open-Meteo is keyless and fast. If you prefer another provider (e.g., OpenWeatherMap), swap the implementation in `live/liveData.js` and read the API key from env.
- Caching is in-memory; resets on server restart. For longer retention, plug a Redis cache (same key strategy) without changing the assistant API.
- Destination detection uses the multilingual titles from `public/data/tripindex.json`. If you add trips or translations, detection improves automatically.
 - In addition, dynamic geocoding from free‑form user messages is used as a fallback, so queries like “Καιρός στην Αράχοβα” resolve correctly even if the location isn’t a trip title.
