// Survey for the text-as-template idea (design/2026-11-27_release_0_1_plan.md §4): every text="…" value and every attribute value with backticks in the
// current pages (docs, examples, tests), classified. Run: node design/prototypes/2026-11-27_release_0_1/text_survey.js
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '../../..'));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'download'].includes(entry.name)) walk(p, out); }
    else if (/\.(html|js)$/.test(entry.name) && !/pxl(\.min)?\.js$|kilopixel/.test(entry.name)) out.push(p);
  }
  return out;
}
const files = [...walk('docs'), ...walk('examples'), ...walk('tests')].filter((f) => !f.includes(path.join('tests', 'types')));

// Attribute values in double quotes (HTML); a value may contain single quotes and backticks
const attr = /\s([a-z][a-z0-9-]*)="([^"]*)"/g;
const textKinds = {};
const textExamples = {};
const backtickByAttr = {};
const backtickExamples = {};
const add = (map, key, n = 1) => { map[key] = (map[key] || 0) + n; };
const example = (map, key, value, file) => { (map[key] ||= []).length < 4 && map[key].push(`${value}   [${file}]`); };

function classify(v) {
  if (v === '') return 'empty';
  if (/^`[^`]*`$/.test(v)) return v.includes('${') ? 'backtick template with ${}' : 'backtick, no ${}';
  if (/^'[^']*'$/.test(v)) return 'single-quoted text';
  if (v.includes('`')) return 'expression with a template inside';
  if (/\bref\.|\bt\b|\(|\?|\+/.test(v)) return 'expression (ref, t, call, ternary, +)';
  if (/^[A-Za-z ]+$/.test(v)) return 'plain words';
  if (/^-?\d*\.?\d+$/.test(v)) return 'a number';
  return 'other plain text (digits, punctuation)';
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(attr)) {
    const [, name, value] = m;
    if (!/<pxl-/.test(src.slice(Math.max(0, src.lastIndexOf('<', m.index)), m.index + 1))) continue;
    if (name === 'text') {
      const kind = classify(value);
      add(textKinds, kind);
      example(textExamples, kind, value, file);
    }
    if (value.includes('`') && !name.startsWith('pxl-on-') && !name.startsWith('on')) {
      add(backtickByAttr, name);
      example(backtickExamples, name, value, file);
    }
  }
}
console.log('== text="…" values by kind');
for (const [k, n] of Object.entries(textKinds).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${k}`);
  for (const e of textExamples[k]) console.log(`        ${e.slice(0, 150)}`);
}
console.log('\n== attribute values with backticks, by attribute');
for (const [k, n] of Object.entries(backtickByAttr).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${k}`);
  for (const e of backtickExamples[k]) console.log(`        ${e.slice(0, 150)}`);
}
