const fs = require('fs');
const path = require('path');

function findHtmlFiles(dir){
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for(const e of entries){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) out.push(...findHtmlFiles(p));
    else if(e.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

function extractKeysFromHtml(file){
  const s = fs.readFileSync(file,'utf8');
  const keys = new Set();
  const re = /data-i18n(?:-placeholder|-title|-value)?\s*=\s*"([^"]+)"/g;
  let m;
  while((m=re.exec(s))){ keys.add(m[1]); }
  return Array.from(keys);
}

function loadJsons(i18nDir){
  const files = fs.readdirSync(i18nDir).filter(f=>f.endsWith('.json'));
  const out = {};
  for(const f of files){
    try{ out[f.replace(/\.json$/,'')] = JSON.parse(fs.readFileSync(path.join(i18nDir,f),'utf8')); }
    catch(e){ out[f.replace(/\.json$/,'')] = {}; }
  }
  return out;
}

function lookup(obj, path){
  if(!path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for(const p of parts){ if(cur && Object.prototype.hasOwnProperty.call(cur,p)) cur = cur[p]; else return undefined; }
  return cur;
}

const htmlFiles = findHtmlFiles(path.join(__dirname,'..','public'));
const i18n = loadJsons(path.join(__dirname,'..','public','i18n'));

const report = {};
for(const hf of htmlFiles){
  const keys = extractKeysFromHtml(hf);
  if(keys.length===0) continue;
  for(const lang of Object.keys(i18n)){
    for(const k of keys){
      const v = lookup(i18n[lang], k);
      if(v === undefined){
        report[lang] = report[lang] || {};
        report[lang][k] = report[lang][k] || [];
        report[lang][k].push(path.relative(process.cwd(), hf));
      }
    }
  }
}

if(Object.keys(report).length===0){
  console.log('All keys present in all i18n files.');
  process.exit(0);
}
console.log('Missing translation keys per language:');
for(const lang of Object.keys(report)){
  console.log('\n== ' + lang + ' ==');
  for(const k of Object.keys(report[lang])){
    console.log(`- ${k}: used in ${report[lang][k].slice(0,5).join(', ')}${report[lang][k].length>5 ? ' (+'+(report[lang][k].length-5)+' more)': ''}`);
  }
}
process.exit(1);
