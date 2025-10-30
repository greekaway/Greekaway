try { require('dotenv').config(); } catch(_){}
const mask = (s) => s ? `${s[0]}${'*'.repeat(Math.max(0, s.length-2))}${s.length>1?s[s.length-1]:''}` : '(empty)';
const u = process.env.ADMIN_USER || '';
const p = process.env.ADMIN_PASS || '';
console.log(JSON.stringify({
  ADMIN_USER_present: !!u,
  ADMIN_PASS_present: !!p,
  ADMIN_USER_masked: u ? mask(u) : null,
  ADMIN_PASS_masked: p ? mask(p) : null
}, null, 2));
