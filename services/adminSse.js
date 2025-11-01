// services/adminSse.js
// A tiny shared SSE broadcaster for admin dashboards

const CLIENTS = new Set();

function addClient(res) {
  CLIENTS.add(res);
}

function removeClient(res) {
  CLIENTS.delete(res);
}

function broadcast(payload) {
  try {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of Array.from(CLIENTS)) {
      try { res.write(data); } catch (_) { CLIENTS.delete(res); }
    }
  } catch (_) {}
}

module.exports = { addClient, removeClient, broadcast };
