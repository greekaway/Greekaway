/**
 * MoveAthens Transfer Requests — Data Layer
 * Handles CRUD for transfer requests created when hotel clicks WhatsApp.
 * Uses PostgreSQL when available, falls back to in-memory store + JSON.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'moveathens', 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'transfer_requests.json');

let db = null;
let dbAvailable = false;
let memoryStore = []; // fallback when no DB

function makeId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ---- JSON file fallback ----
function loadFromFile() {
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[ma-requests] Failed to read JSON:', e.message);
  }
  return [];
}

function saveToFile(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[ma-requests] Failed to write JSON:', e.message);
  }
}

// ---- Init ----
async function init() {
  try {
    db = require('../../../db');
    if (db && db.isAvailable && db.isAvailable()) {
      dbAvailable = true;
      console.log('[ma-requests] Using PostgreSQL');
    } else {
      dbAvailable = false;
    }
  } catch (e) {
    dbAvailable = false;
  }
  if (!dbAvailable) {
    memoryStore = loadFromFile();
    console.log('[ma-requests] Using JSON fallback,', memoryStore.length, 'requests loaded');
  }
}

// ---- CRUD ----
async function createRequest(data) {
  await init();
  const id = data.id || makeId('req');
  const token = data.accept_token || makeToken();
  const now = new Date().toISOString();

  const record = {
    id,
    origin_zone_id: data.origin_zone_id || '',
    origin_zone_name: data.origin_zone_name || '',
    hotel_name: data.hotel_name || '',
    hotel_address: data.hotel_address || '',
    hotel_municipality: data.hotel_municipality || '',
    destination_id: data.destination_id || '',
    destination_name: data.destination_name || '',
    vehicle_type_id: data.vehicle_type_id || '',
    vehicle_name: data.vehicle_name || '',
    tariff: data.tariff || 'day',
    booking_type: data.booking_type || 'instant',
    scheduled_date: data.scheduled_date || '',
    scheduled_time: data.scheduled_time || '',
    passenger_name: data.passenger_name || '',
    room_number: data.room_number || '',
    passengers: parseInt(data.passengers, 10) || 0,
    luggage_large: parseInt(data.luggage_large, 10) || 0,
    luggage_medium: parseInt(data.luggage_medium, 10) || 0,
    luggage_cabin: parseInt(data.luggage_cabin, 10) || 0,
    payment_method: data.payment_method || 'cash',
    price: parseFloat(data.price) || 0,
    commission_driver: parseFloat(data.commission_driver) || 0,
    commission_hotel: parseFloat(data.commission_hotel) || 0,
    commission_service: parseFloat(data.commission_service) || 0,
    driver_id: null,
    driver_phone: '',
    accept_token: token,
    status: 'pending',
    created_at: now,
    sent_at: null,
    accepted_at: null,
    confirmed_at: null,
    expired_at: null,
    updated_at: now
  };

  if (dbAvailable) {
    try {
      return await db.ma.createRequest(record);
    } catch (e) {
      console.error('[ma-requests] DB createRequest failed:', e.message);
    }
  }

  memoryStore.push(record);
  saveToFile(memoryStore);
  return record;
}

async function getRequests(filters = {}) {
  await init();
  if (dbAvailable) {
    try {
      return await db.ma.getRequests(filters);
    } catch (e) {
      console.error('[ma-requests] DB getRequests failed:', e.message);
    }
  }
  let list = [...memoryStore];
  if (filters.status) list = list.filter(r => r.status === filters.status);
  if (filters.driver_id) list = list.filter(r => r.driver_id === filters.driver_id);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (filters.limit) list = list.slice(0, filters.limit);
  return list;
}

async function getRequestById(id) {
  await init();
  if (dbAvailable) {
    try {
      return await db.ma.getRequestById(id);
    } catch (e) {
      console.error('[ma-requests] DB getRequestById failed:', e.message);
    }
  }
  return memoryStore.find(r => r.id === id) || null;
}

async function getRequestByToken(token) {
  await init();
  if (dbAvailable) {
    try {
      return await db.ma.getRequestByToken(token);
    } catch (e) {
      console.error('[ma-requests] DB getRequestByToken failed:', e.message);
    }
  }
  return memoryStore.find(r => r.accept_token === token) || null;
}

async function updateRequest(id, data) {
  await init();
  data.updated_at = new Date().toISOString();

  if (dbAvailable) {
    try {
      return await db.ma.updateRequest(id, data);
    } catch (e) {
      console.error('[ma-requests] DB updateRequest failed:', e.message);
    }
  }
  const idx = memoryStore.findIndex(r => r.id === id);
  if (idx < 0) return null;
  memoryStore[idx] = { ...memoryStore[idx], ...data };
  saveToFile(memoryStore);
  return memoryStore[idx];
}

async function deleteRequest(id) {
  await init();
  if (dbAvailable) {
    try {
      return await db.ma.deleteRequest(id);
    } catch (e) {
      console.error('[ma-requests] DB deleteRequest failed:', e.message);
    }
  }
  const before = memoryStore.length;
  memoryStore = memoryStore.filter(r => r.id !== id);
  saveToFile(memoryStore);
  return memoryStore.length < before;
}

async function expireOldRequests(cutoffMs = 3600000) {
  await init();
  if (dbAvailable) {
    try {
      return await db.ma.expireOldRequests(cutoffMs);
    } catch (e) {
      console.error('[ma-requests] DB expireOldRequests failed:', e.message);
    }
  }
  // JSON fallback
  const cutoff = Date.now() - cutoffMs;
  const now = new Date().toISOString();
  const expired = [];
  memoryStore.forEach(r => {
    if (r.status === 'pending' && new Date(r.created_at).getTime() < cutoff) {
      r.status = 'expired';
      r.expired_at = now;
      r.updated_at = now;
      expired.push(r);
    }
  });
  if (expired.length) saveToFile(memoryStore);
  return expired;
}

module.exports = {
  init,
  makeId,
  makeToken,
  createRequest,
  getRequests,
  getRequestById,
  getRequestByToken,
  updateRequest,
  deleteRequest,
  expireOldRequests
};
