// Survey for TODO §52 (design/done/2026-11-27_text_template_plan.md §7): how many <pxl-text> elements rely on the default
// alignment (no align / no baseline attribute), and how many text values sit in escaped code snippets of the docs.
// Run: node design/prototypes/2026-11-27_text_template/text_alignment_survey.js
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '../../..'));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'download', 'types'].includes(entry.name)) walk(p, out); }
    else if (/\.(html|js)$/.test(entry.name) && !/pxl(\.min)?\.js$/.test(entry.name)) out.push(p);
  }
  return out;
}
const files = [...walk('docs'), ...walk('examples'), ...walk('tests')];

let elements = 0, noAlign = 0, noBaseline = 0, neither = 0, snippetTexts = 0;
const perFolder = {};
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<pxl-text\b([^>]*)>/g)) {
    const attrs = m[1];
    elements++;
    const a = /\salign=/.test(attrs), b = /\sbaseline=/.test(attrs);
    if (!a) noAlign++;
    if (!b) noBaseline++;
    if (!a && !b) neither++;
    const folder = file.split(path.sep)[0];
    perFolder[folder] = (perFolder[folder] || 0) + (!a || !b ? 1 : 0);
  }
  // Escaped snippets shown on docs pages: &lt;pxl-text … text=&quot;…&quot;
  snippetTexts += (src.match(/&lt;pxl-text\b[^]*?text=(&quot;|")/g) || []).length;
}
console.log(`<pxl-text> elements: ${elements}`);
console.log(`  without align: ${noAlign}, without baseline: ${noBaseline}, without both: ${neither}`);
console.log(`  relying on at least one default, by folder: ${JSON.stringify(perFolder)}`);
console.log(`text values inside escaped docs snippets: ${snippetTexts}`);
