#!/usr/bin/env node
let s='';
process.stdin.on('data',c=>s+=c).on('end',()=>{
  try { const j = JSON.parse(s); if (j && j.token) process.stdout.write(j.token); else process.exit(2); }
  catch(e){ process.exit(1); }
});
