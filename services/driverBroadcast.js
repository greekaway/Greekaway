/**
 * Driver SSE Broadcaster + Auto-Broadcast Logic
 * Manages SSE connections for driver panels and broadcasts
 * new transfer requests to eligible drivers.
 *
 * SSE events:
 *   "new-request"   — urgent card data
 *   "request-taken"  — someone accepted (close card for others)
 *   "request-expired" — timeout reached
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'moveathens', 'data', 'driver_panel_ui.json');

// Lazy-load DB for broadcast log persistence
let _db = null;
function getDb() {
  if (_db) return _db;
  try { _db = require('../db'); } catch { _db = null; }
  return _db;
}

// Lazy-load push sender (avoids circular dependency at startup)
let _sendPush = null;
function getSendPush() {
  if (_sendPush) return _sendPush;
  try {
    _sendPush = require('../moveathens/server/moveathens-driver-panel-push').sendPushToDriver;
  } catch { _sendPush = null; }
  return _sendPush;
}

// Map<driverPhone, Set<res>>  (one driver can have multiple tabs)
const CLIENTS = new Map();

// Active broadcasts: Map<requestId, { timer, request, sentTo }>
const activeBroadcasts = new Map();

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

// ── SSE Client Management ──

function addClient(driverPhone, res) {
  if (!CLIENTS.has(driverPhone)) CLIENTS.set(driverPhone, new Set());
  CLIENTS.get(driverPhone).add(res);
}

function removeClient(driverPhone, res) {
  const set = CLIENTS.get(driverPhone);
  if (set) {
    set.delete(res);
    if (set.size === 0) CLIENTS.delete(driverPhone);
  }
}

function sendToDriver(driverPhone, event, data) {
  const set = CLIENTS.get(driverPhone);
  if (!set || set.size === 0) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of Array.from(set)) {
    try { res.write(payload); } catch { set.delete(res); }
  }
  return true;
}

function broadcastToAll(event, data) {
  for (const [phone] of CLIENTS) {
    sendToDriver(phone, event, data);
  }
}

// ── Vehicle Type Matching ──

function matchesVehicle(driver, vehicleTypeId) {
  if (!vehicleTypeId) return true; // no vehicle requirement = any driver
  // Driver must have a current vehicle selected to receive requests
  if (!driver.current_vehicle_type) return false;
  return driver.current_vehicle_type === vehicleTypeId;
}

// ── Build card data from request (uses admin config for field visibility) ──

/** Enrich request with lat/lng from zones + destinations (not stored on row) */
async function enrichRequestCoords(request) {
  if (request._coordsEnriched) return request;
  try {
    const moveathensData = require('../src/server/data/moveathens');
    if (request.destination_id && !request.destination_lat) {
      const dests = await moveathensData.getDestinations({ activeOnly: false });
      const dest = dests.find(d => d.id === request.destination_id);
      if (dest) { request.destination_lat = dest.lat || null; request.destination_lng = dest.lng || null; }
    }
    if (request.origin_zone_id && !request.hotel_lat) {
      const zones = await moveathensData.getZones({ activeOnly: false });
      const zone = zones.find(z => z.id === request.origin_zone_id);
      if (zone) { request.hotel_lat = zone.lat || null; request.hotel_lng = zone.lng || null; }
    }
  } catch { /* ignore — coords are optional */ }
  request._coordsEnriched = true;
  return request;
}

function buildCardData(request, cardType) {
  const config = loadConfig();
  const fields = config.routeCard?.[cardType] || [];
  const visible = fields
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order);

  const fieldMap = {
    price: request.price,
    origin: request.is_arrival ? request.destination_name : (request.hotel_name || request.origin_zone_name),
    destination: request.is_arrival ? (request.hotel_name || request.origin_zone_name) : request.destination_name,
    datetime: request.scheduled_date
      ? `${request.scheduled_date} ${request.scheduled_time || ''}`
      : 'Άμεσα',
    hotel_name: request.hotel_name,
    room_number: request.room_number,
    passengers: request.passengers,
    luggage: (request.luggage_large || 0) + (request.luggage_medium || 0) + (request.luggage_cabin || 0),
    vehicle_type: request.vehicle_name || request.vehicle_type_id,
    flight_info: request.flight_number || '',
    notes: request.notes || '',
    commission: request.commission_driver || 0
  };

  return {
    requestId: request.id,
    cardType,
    fields: visible.map(f => ({
      id: f.id,
      label: f.label,
      value: fieldMap[f.id] ?? ''
    })),
    is_arrival: request.is_arrival,
    booking_type: request.booking_type,
    hotel_lat: request.hotel_lat || null,
    hotel_lng: request.hotel_lng || null,
    destination_lat: request.destination_lat || null,
    destination_lng: request.destination_lng || null
  };
}

// ── Auto-Broadcast ──

async function autoBroadcast(request, driversData) {
  const config = loadConfig();
  const acceptance = config.acceptance || {};

  if (!acceptance.autoBroadcast) {
    console.log('[broadcast] Auto-broadcast disabled, skipping request', request.id);
    return;
  }

  // Scheduled requests are handled by polling in the appointments tab — no SSE push needed
  if (request.booking_type === 'scheduled') {
    console.log('[broadcast] Scheduled request', request.id, '— skipping SSE (polling handles it)');
    return;
  }

  // Get eligible drivers: active + not blocked + matching vehicle + not busy
  const allDrivers = await driversData.getDrivers(true); // active only
  let eligible = allDrivers.filter(d => !d.is_blocked && matchesVehicle(d, request.vehicle_type_id));

  // Exclude drivers with an active route (accepted/arrived)
  try {
    const requestsData = require('../src/server/data/moveathens-requests');
    const accepted = await requestsData.getRequests({ status: 'accepted' });
    const arrived = await requestsData.getRequests({ status: 'arrived' });
    const busyPhones = new Set([...accepted, ...arrived].map(r => r.driver_phone).filter(Boolean));
    if (busyPhones.size > 0) {
      const before = eligible.length;
      eligible = eligible.filter(d => !busyPhones.has(d.phone));
      if (eligible.length < before) {
        console.log(`[broadcast] Excluded ${before - eligible.length} busy driver(s) with active routes`);
      }
    }
  } catch (err) {
    console.error('[broadcast] Failed to check busy drivers:', err.message);
  }

  if (eligible.length === 0) {
    console.log('[broadcast] No eligible drivers for request', request.id);
    return;
  }

  // Enrich with coordinates before building card
  await enrichRequestCoords(request);
  const cardData = buildCardData(request, 'urgent');
  const sentTo = [];

  // Build push notification text
  const origin = request.is_arrival ? request.destination_name : (request.hotel_name || request.origin_zone_name);
  const destination = request.is_arrival ? (request.hotel_name || request.origin_zone_name) : request.destination_name;
  const pushTitle = '🚕 Νέο Αίτημα Transfer';
  const pushBody = `${origin} → ${destination}` + (request.price ? ` • ${request.price}€` : '');

  for (const driver of eligible) {
    const sent = sendToDriver(driver.phone, 'new-request', cardData);
    if (sent) sentTo.push(driver.phone);

    // Also send Web Push (works even if app is in background / during phone call)
    const sendPush = getSendPush();
    if (sendPush) {
      sendPush(driver.phone, pushTitle, pushBody, { requestId: request.id }, 'new-request-' + request.id)
        .catch(() => { /* silent — SSE is primary */ });
    }
  }

  console.log(`[broadcast] Request ${request.id} sent to ${sentTo.length}/${eligible.length} online drivers`);

  // Set timeout for expiry
  const timeoutMin = acceptance.broadcastTimeoutMinutes || 5;
  const timer = setTimeout(() => {
    expireBroadcast(request.id);
  }, timeoutMin * 60 * 1000);

  activeBroadcasts.set(request.id, { timer, request, sentTo });

  // Persist broadcast log to DB
  const db = getDb();
  if (db && db.isAvailable()) {
    db.ma.logBroadcast(request.id, eligible.map(d => d.phone))
      .catch(e => console.error('[broadcast] log DB error:', e.message));
  }
}

// ── Expiry ──

function expireBroadcast(requestId) {
  const broadcast = activeBroadcasts.get(requestId);
  if (!broadcast) return;

  clearTimeout(broadcast.timer);
  activeBroadcasts.delete(requestId);

  // Mark all pending entries as expired in DB
  const db = getDb();
  if (db && db.isAvailable()) {
    db.ma.markBroadcastExpired(requestId)
      .catch(e => console.error('[broadcast] expire DB error:', e.message));
  }

  // Notify all connected drivers
  broadcastToAll('request-expired', { requestId });

  console.log(`[broadcast] Request ${requestId} expired (no driver accepted)`);

  // Notify admin via adminSse if available
  try {
    const adminSse = require('./adminSse');
    adminSse.broadcast({
      type: 'driver-panel-expired',
      requestId,
      message: `⚠️ Δεν βρέθηκε οδηγός για αίτημα ${requestId}`
    });
  } catch { /* adminSse not available */ }
}

// ── Accept ──

function onRequestAccepted(requestId, driverPhone) {
  const broadcast = activeBroadcasts.get(requestId);
  if (broadcast) {
    clearTimeout(broadcast.timer);
    activeBroadcasts.delete(requestId);
  }

  // Mark accepted in DB log
  const db = getDb();
  if (db && db.isAvailable()) {
    db.ma.markBroadcastAccepted(requestId, driverPhone)
      .catch(e => console.error('[broadcast] accept DB error:', e.message));
  }

  // Notify all other drivers that this request is taken
  broadcastToAll('request-taken', { requestId, acceptedBy: driverPhone });
}

// ── Query ──

function getConnectedCount() {
  let count = 0;
  for (const set of CLIENTS.values()) count += set.size;
  return count;
}

function isDriverOnline(phone) {
  const set = CLIENTS.get(phone);
  return set ? set.size > 0 : false;
}

function getActiveBroadcastForRequest(requestId) {
  return activeBroadcasts.get(requestId) || null;
}

module.exports = {
  addClient,
  removeClient,
  sendToDriver,
  broadcastToAll,
  autoBroadcast,
  onRequestAccepted,
  expireBroadcast,
  buildCardData,
  enrichRequestCoords,
  getConnectedCount,
  isDriverOnline,
  getActiveBroadcastForRequest
};
