#!/usr/bin/env node
const svc = require('../services/dispatchService');
const id = process.argv[2];
(async () => {
  if (!id) { console.error('Usage: node tools/manual_dispatch.js <booking_id>'); process.exit(1); }
  const res = await svc.queue(id, { sent_by: 'manual', override: true });
  console.log(JSON.stringify(res));
})();
