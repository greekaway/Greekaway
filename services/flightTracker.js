/**
 * MoveAthens Flight Tracker — AeroAPI (FlightAware) Integration
 *
 * Responsibilities:
 *  1. lookupFlight(ident)  → Validate + fetch live flight data from AeroAPI
 *  2. scheduleSecondCheck()→ Background poller that fires the 2nd call X min before ETA
 *  3. Caching / rate-limit handling / graceful fallback
 *
 * Config keys read from MoveAthens ui-config:
 *   - flightTrackingEnabled  (boolean, default true)
 *   - flightCheckMinsBefore  (integer, default 25)
 */
'use strict';

const maLogger = require('./maLogger');

// ── AeroAPI configuration ──
const AEROAPI_BASE  = 'https://aeroapi.flightaware.com/aeroapi';
const AEROAPI_KEY   = process.env.FLIGHTAWARE_API_KEY || '';

// In-memory cache: flightIdent → { data, fetchedAt }
const cache = new Map();
const CACHE_TTL_MS  = 10 * 60 * 1000; // 10 min — avoid redundant calls

// ── Normalise flight number: "oa 123" → "OA123" ──
function normaliseFlight(raw) {
  if (!raw) return '';
  return raw.toUpperCase().replace(/\s+/g, '');
}

// ── Core AeroAPI call ──
async function callAeroAPI(endpoint) {
  if (!AEROAPI_KEY) {
    console.warn('[flight-tracker] No FLIGHTAWARE_API_KEY set — skipping');
    return { ok: false, error: 'API key not configured' };
  }

  const url = `${AEROAPI_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: { 'x-apikey': AEROAPI_KEY, 'Accept': 'application/json' }
    });

    if (res.status === 429) {
      maLogger.log('warn', 'flight-tracker', { msg: 'Rate limited by AeroAPI', status: 429 });
      return { ok: false, error: 'Rate limited — try again later', status: 429 };
    }
    if (res.status === 401 || res.status === 403) {
      maLogger.log('error', 'flight-tracker', { msg: 'AeroAPI auth failure', status: res.status });
      return { ok: false, error: 'API authentication failed', status: res.status };
    }
    if (!res.ok) {
      return { ok: false, error: `AeroAPI error ${res.status}`, status: res.status };
    }

    const json = await res.json();
    return { ok: true, data: json };
  } catch (err) {
    maLogger.log('error', 'flight-tracker', { msg: 'AeroAPI fetch error', error: err.message });
    return { ok: false, error: err.message };
  }
}

// ── Pick the best (most relevant) flight from AeroAPI response ──
function pickBestFlight(flights, scheduledDate) {
  if (!flights || !flights.length) return null;

  // If we have a scheduled_date from the booking, prefer flights on that date
  if (scheduledDate) {
    const targetDate = scheduledDate.slice(0, 10); // YYYY-MM-DD
    const sameDayFlights = flights.filter(f => {
      const dep = f.scheduled_out || f.scheduled_off || '';
      return dep.slice(0, 10) === targetDate;
    });
    if (sameDayFlights.length) return sameDayFlights[0];
  }

  // Otherwise pick the first upcoming or most recent flight
  const now = new Date();
  // Sort by scheduled departure ascending
  const sorted = [...flights].sort((a, b) => {
    const da = new Date(a.scheduled_out || a.scheduled_off || 0);
    const db = new Date(b.scheduled_out || b.scheduled_off || 0);
    return da - db;
  });

  // Find nearest future flight
  const future = sorted.find(f => {
    const t = new Date(f.estimated_on || f.scheduled_on || f.scheduled_out || 0);
    return t > now;
  });
  return future || sorted[sorted.length - 1]; // fallback to latest
}

// ── Common airline ICAO → friendly name map ──
const AIRLINE_NAMES = {
  'SEH': 'Sky Express', 'AEE': 'Aegean Airlines', 'OAL': 'Olympic Air',
  'RYR': 'Ryanair', 'EZY': 'easyJet', 'WZZ': 'Wizz Air',
  'VLG': 'Vueling', 'DLH': 'Lufthansa', 'BAW': 'British Airways',
  'AFR': 'Air France', 'KLM': 'KLM', 'SAS': 'SAS',
  'AZA': 'ITA Airways', 'THY': 'Turkish Airlines', 'SWR': 'Swiss',
  'AUA': 'Austrian', 'TAP': 'TAP Portugal', 'IBE': 'Iberia',
  'UAE': 'Emirates', 'ETD': 'Etihad', 'QTR': 'Qatar Airways',
  'ELY': 'El Al', 'TRA': 'Transavia', 'BEL': 'Brussels Airlines',
  'NOZ': 'Norwegian', 'FIN': 'Finnair', 'LOT': 'LOT Polish',
  'ROT': 'TAROM', 'BMS': 'Blue Air', 'TVS': 'SmartWings',
  'CFG': 'Condor', 'TUI': 'TUI fly', 'VOE': 'Volotea',
  'HFA': 'Arkia', 'MAC': 'Air Arabia Maroc', 'RAM': 'Royal Air Maroc',
  'FDB': 'flydubai', 'GWI': 'Eurowings', 'NLY': 'Niki/Lauda',
  'ENT': 'Enter Air', 'NAX': 'Norse Atlantic', 'SXS': 'SunExpress'
};

function resolveAirlineName(operator, operatorIata, ident) {
  if (AIRLINE_NAMES[operator]) return AIRLINE_NAMES[operator];
  // Fallback: use IATA operator code or strip numbers from ident
  return operatorIata || operator || ident?.replace(/[0-9]/g, '') || '';
}

// ── Map AeroAPI flight → our simplified format ──
function mapFlightData(f) {
  // AeroAPI status field: null, "Scheduled", "En Route / On Time", "Arrived / Landed", etc.
  let status = 'unknown';
  const raw = (f.status || '').toLowerCase();
  if (raw.includes('scheduled') || raw.includes('filed'))   status = 'scheduled';
  else if (raw.includes('en route') || raw.includes('active')) status = 'en_route';
  else if (raw.includes('landed') || raw.includes('arrived'))  status = 'landed';
  else if (raw.includes('cancelled') || raw.includes('canceled')) status = 'cancelled';
  else if (raw.includes('diverted'))                           status = 'diverted';

  // Use best available arrival estimate
  const eta = f.estimated_on || f.scheduled_on || null;

  return {
    flight_ident:    f.ident || '',
    flight_status:   status,
    flight_airline:  resolveAirlineName(f.operator_icao || f.operator, f.operator_iata, f.ident),
    flight_origin:   f.origin?.city || f.origin?.name || f.origin?.code_iata || '',
    flight_origin_code: f.origin?.code_iata || '',
    flight_eta:      eta,
    flight_actual_arrival: f.actual_on || null,
    flight_gate:     f.gate_destination || '',
    flight_terminal: f.terminal_destination || '',
    raw: f
  };
}

/**
 * lookupFlight — The "1st call": validate flight + get live data
 * @param {string} rawIdent — User-typed flight number (e.g. "oa 123")
 * @param {string} [scheduledDate] — Booking date "YYYY-MM-DD" to pick correct flight
 * @returns {{ ok, flight?, error? }}
 */
async function lookupFlight(rawIdent, scheduledDate) {
  const ident = normaliseFlight(rawIdent);
  if (!ident) return { ok: false, error: 'Empty flight number' };

  // Check cache
  const cached = cache.get(ident);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return { ok: true, flight: cached.data, fromCache: true };
  }

  const result = await callAeroAPI(`/flights/${ident}`);
  if (!result.ok) return result;

  const flights = result.data?.flights || [];
  if (!flights.length) {
    return { ok: false, error: 'Flight not found' };
  }

  const best = pickBestFlight(flights, scheduledDate);
  if (!best) return { ok: false, error: 'No matching flight found' };

  const mapped = mapFlightData(best);

  // Update cache
  cache.set(ident, { data: mapped, fetchedAt: Date.now() });

  return { ok: true, flight: mapped };
}

/**
 * refreshFlight — The "2nd call": update flight status (same logic, fresh call)
 * Forces cache bypass.
 */
async function refreshFlight(rawIdent, scheduledDate) {
  const ident = normaliseFlight(rawIdent);
  if (!ident) return { ok: false, error: 'Empty flight number' };

  // Bust cache for this ident
  cache.delete(ident);

  return lookupFlight(ident, scheduledDate);
}

// ────────────────────────────────────────────────────
// Background Poller — 2nd call scheduler
// Runs every 2 minutes, checks if any tracked flights
// are within X minutes of their ETA.
// ────────────────────────────────────────────────────
let pollerInterval = null;
let getConfigFn    = null;   // injected at startup
let requestsDataFn = null;   // injected at startup

function startPoller(deps) {
  if (!deps || !deps.getConfig || !deps.requestsData) {
    console.warn('[flight-tracker] startPoller: missing deps — poller NOT started');
    return;
  }
  getConfigFn    = deps.getConfig;
  requestsDataFn = deps.requestsData;

  // Run every 2 minutes
  pollerInterval = setInterval(pollFlights, 2 * 60 * 1000);
  console.log('[flight-tracker] Background poller started (every 2 min)');
}

function stopPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

async function pollFlights() {
  try {
    if (!getConfigFn || !requestsDataFn) return;

    // Read admin setting
    const config = await getConfigFn();
    const enabled  = config?.flightTrackingEnabled !== false; // default ON
    const minsBefore = parseInt(config?.flightCheckMinsBefore, 10) || 25;

    if (!enabled) return;

    // Get all active arrival requests with flight tracking ON
    const allRequests = await requestsDataFn.getRequests({});
    const trackable = allRequests.filter(r =>
      r.flight_tracking_active &&
      r.flight_number &&
      r.status !== 'expired' &&
      r.status !== 'cancelled' &&
      r.status !== 'completed'
    );

    if (!trackable.length) return;

    const now = Date.now();

    for (const req of trackable) {
      // Skip if recently checked (< 5 min ago)
      if (req.flight_last_checked) {
        const lastChecked = new Date(req.flight_last_checked).getTime();
        if (now - lastChecked < 5 * 60 * 1000) continue;
      }

      // Already landed? No need to poll again
      if (req.flight_status === 'landed') continue;

      // Check if we are within the admin-defined window before ETA
      const eta = req.flight_eta ? new Date(req.flight_eta).getTime() : null;
      if (!eta) continue; // no ETA stored yet — skip

      const minsUntilEta = (eta - now) / (60 * 1000);

      // Poll if within the window (or past ETA but not yet landed)
      if (minsUntilEta <= minsBefore) {
        console.log(`[flight-tracker] Polling flight ${req.flight_number} for request ${req.id} (${Math.round(minsUntilEta)} min to ETA)`);

        const result = await refreshFlight(req.flight_number, req.scheduled_date);
        if (result.ok && result.flight) {
          const f = result.flight;
          await requestsDataFn.updateRequest(req.id, {
            flight_status:        f.flight_status,
            flight_airline:       f.flight_airline,
            flight_origin:        f.flight_origin,
            flight_eta:           f.flight_eta || req.flight_eta,
            flight_actual_arrival: f.flight_actual_arrival || null,
            flight_gate:          f.flight_gate || req.flight_gate,
            flight_terminal:      f.flight_terminal || req.flight_terminal,
            flight_last_checked:  new Date().toISOString(),
            flight_raw_json:      JSON.stringify(f.raw)
          });

          // If flight has landed, mark tracking done
          if (f.flight_status === 'landed') {
            await requestsDataFn.updateRequest(req.id, {
              flight_tracking_active: false,
              flight_actual_arrival:  f.flight_actual_arrival || f.flight_eta
            });
            console.log(`[flight-tracker] Flight ${req.flight_number} LANDED — tracking done for ${req.id}`);
          }
        } else {
          // Log error but don't break — continue with next request
          console.warn(`[flight-tracker] Poll failed for ${req.flight_number}:`, result.error);
          await requestsDataFn.updateRequest(req.id, {
            flight_last_checked: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error('[flight-tracker] Poller error:', err.message);
  }
}

module.exports = {
  normaliseFlight,
  lookupFlight,
  refreshFlight,
  startPoller,
  stopPoller,
  // Exposed for testing
  _mapFlightData: mapFlightData,
  _pickBestFlight: pickBestFlight
};
