// Migration of every <pxl-text> on the docs, example and test pages to text templates and centered defaults
// (design/done/2026-11-27_text_template_plan.md §7):
//   text: quotes and backticks removed, expressions turned into templates (${…}), a literal ${ escaped as \${;
//   align / baseline: "start" / "alphabetic" added where a label relied on the old default, "center" / "middle" removed.
// Then it checks every changed text: the old engine (the committed dist/pxl.js, `git show HEAD:dist/pxl.js`) and the new
// one (dist/pxl.js) run in Node vm contexts with the same fake ref values; both must show the same text.
// Run from anywhere: node design/prototypes/2026-11-27_text_template/migrate.js [--dry]
// Writes a report to scratch/text_migration_report.txt.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const root = path.join(__dirname, '../../..');
process.chdir(root);
const DRY = process.argv.includes('--dry');

// --- Files ---
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'download', 'types', 'fixtures'].includes(entry.name)) walk(p, out);
    } else if (/\.(html|js)$/.test(entry.name) && !/pxl(\.min)?\.js$/.test(entry.name)) {
      out.push(p.split(path.sep).join('/'));
    }
  }
  return out;
}
// --skip=a,b leaves those files out (pages migrated or edited by hand)
const SKIP = (process.argv.find((a) => a.startsWith('--skip=')) || '--skip=').slice(7).split(',').filter(Boolean);
// --only=a,b migrates just those files
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '--only=').slice(7).split(',').filter(Boolean);
const files = [...walk('docs'), ...walk('examples'), ...walk('tests')]
  .filter((f) => f !== 'tests/runner.js' && !SKIP.includes(f) && (ONLY.length === 0 || ONLY.includes(f)));

// --- Tag parsing ---
// Returns { attrs: [{ name, start, end, valueStart, valueEnd, quote }], end } for the tag starting at `start`
// (the position after "<pxl-text" / "&lt;pxl-text"), or null if it can't be read.
function readTag(src, start) {
  const attrs = [];
  let i = start;
  while (i < src.length) {
    while (/\s/.test(src[i])) i++;
    if (src[i] === '>' || src.startsWith('/>', i) || src.startsWith('&gt;', i)) return { attrs, end: i };
    if (src.startsWith('${', i)) { // a JS interpolation inside a test's template string: ${BLACK}
      const close = src.indexOf('}', i);
      if (close < 0) return null;
      i = close + 1;
      continue;
    }
    const name = /^[:@a-zA-Z_][\w:.@-]*/.exec(src.slice(i, i + 60));
    if (!name) return null;
    const attrStart = i;
    i += name[0].length;
    if (src[i] !== '=') { attrs.push({ name: name[0], start: attrStart, end: i, valueStart: -1, valueEnd: -1 }); continue; }
    i++;
    const quote = src[i];
    if (quote === '"' || quote === '\'') {
      // A docs snippet marks live values: size="<mark id="…">70</mark>", fill="linear(<mark …>45</mark>, …)"
      let close = i + 1;
      while (close < src.length && src[close] !== quote) {
        close = src.startsWith('<mark', close) ? src.indexOf('</mark>', close) + 7 : close + 1;
      }
      if (close >= src.length) close = -1;
      if (close < 0) return null;
      attrs.push({ name: name[0], start: attrStart, end: close + 1, valueStart: i + 1, valueEnd: close, quote });
      i = close + 1;
    } else if (quote === '{') {
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      attrs.push({ name: name[0], start: attrStart, end: j + 1, valueStart: i, valueEnd: j + 1, quote: '{' });
      i = j + 1;
    } else {
      return null;
    }
  }
  return null;
}

// Script regions of an HTML file (a .js file is one region): tags inside them are in JavaScript strings
function scriptRanges(file, src) {
  if (file.endsWith('.js')) return [[0, src.length]];
  const ranges = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// --- Text values ---
// Splits code at top-level + signs. null if the code has other top-level operators (then it is wrapped whole).
function splitConcatenation(code) {
  const terms = [];
  let depth = 0, start = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '\'' || c === '`') {
      const close = code.indexOf(c, i + 1);
      if (close < 0) return null;
      if (c === '`' && code.slice(i, close).includes('`')) return null;
      i = close;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0) {
      if (c === '+') { terms.push(code.slice(start, i).trim()); start = i + 1; }
      else if ('?:-*/%<>=!&|,'.includes(c)) return null;
    }
  }
  terms.push(code.slice(start).trim());
  return terms.some((t) => t === '') ? null : terms;
}
const escapeLiteral = (text) => text.replace(/\$\{/g, '\\${');
const isSingleQuoted = (t) => /^'[^']*'$/.test(t);
const isBacktick = (t) => /^`[^`]*`$/.test(t);

// Today's rules (language §3.1) on a text value, without compiling: what kind it is
function oldKind(v) {
  if (v === '') return 'empty';
  if (isBacktick(v)) return 'backtick';
  if (isSingleQuoted(v)) return 'quoted';
  if (/^&quot;((?!&quot;).)*&quot;$/.test(v)) return 'dquoted';
  if (/(^|[^.])\bt\b|\bref\.|\btoLocal\(|\(|\[|(?:\d\s*[-+*/%<>=!&|]|[-+*/%<>=!&|]\s*\d)|['"`]\s*\+|\+\s*['"`]/.test(v)) return 'code';
  return 'plain';
}

// The new value of a text attribute, or null when it stays
function newText(v) {
  const kind = oldKind(v);
  if (kind === 'empty') return null;
  if (kind === 'quoted') return { value: escapeLiteral(v.slice(1, -1)), kind };
  if (kind === 'dquoted') return { value: escapeLiteral(v.slice(6, -6)), kind };
  if (kind === 'backtick') return { value: v.slice(1, -1), kind };
  if (kind === 'plain') return v.includes('${') ? { value: escapeLiteral(v), kind } : null;
  // Code: a concatenation becomes a template; anything else is wrapped whole
  const terms = splitConcatenation(v);
  if (terms && terms.some((t) => isSingleQuoted(t) || isBacktick(t))) {
    let out = '';
    let leading = [];
    let seenLiteral = false;
    for (const term of terms) {
      const literal = isSingleQuoted(term) || isBacktick(term);
      if (!seenLiteral && !literal) { leading.push(term); continue; }
      if (!seenLiteral && leading.length) out += '${' + leading.join(' + ') + '}';
      seenLiteral = true;
      if (isSingleQuoted(term)) out += escapeLiteral(term.slice(1, -1));
      else if (isBacktick(term)) out += term.slice(1, -1);
      else out += '${' + term + '}';
    }
    return { value: out, kind: 'concatenation' };
  }
  // A code block with return statements (language §3.2) becomes a function called in place
  if (/\breturn\b/.test(v)) return { value: '${(() => { ' + v + ' })()}', kind: 'expression' };
  return { value: '${' + v + '}', kind: 'expression' };
}

// --- Migration ---
const report = [];
const checks = []; // { file, line, oldValue, newValue } in HTML context, for the engine comparison
const manual = [];
const counts = {};
const count = (k) => { counts[k] = (counts[k] || 0) + 1; };

// --from-head: read each page as committed (git show HEAD:<file>) instead of the working copy, except the files listed
// after --keep= (comma-separated), which are read as they are
const FROM_HEAD = process.argv.includes('--from-head');
const KEEP = (process.argv.find((a) => a.startsWith('--keep=')) || '--keep=').slice(7).split(',').filter(Boolean);
const readSource = (file) => (FROM_HEAD && !KEEP.includes(file)
  ? execSync(`git show HEAD:${file}`, { encoding: 'utf8', maxBuffer: 1e8 })
  : fs.readFileSync(file, 'utf8'));

for (const file of files) {
  const src = readSource(file);
  if (!/(<|&lt;)pxl-text\b/.test(src)) continue;
  const ranges = scriptRanges(file, src);
  const tagEdits = []; // [start, end, new text of the attribute area]
  const re = /(<|&lt;)pxl-text(?=[\s>&/])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    const inScript = ranges.some(([a, b]) => m.index > a && m.index < b);
    const areaStart = m.index + m[0].length;
    const tag = readTag(src, areaStart);
    if (!tag) { manual.push(`${file}:${line}  tag not readable`); continue; }
    count('tags');
    const byName = Object.fromEntries(tag.attrs.map((a) => [a.name, a]));
    const edits = []; // inside this tag's attribute area, absolute positions, never overlapping
    const inserts = [];

    // text
    const text = byName.text;
    if (text && text.quote !== '{') {
      const v = src.slice(text.valueStart, text.valueEnd);
      // In a script the value is JavaScript source: backslashes stay as written, ${ and backticks need a person
      if (inScript && /\$\{|`/.test(v)) {
        manual.push(`${file}:${line}  text in a script string with \${ or a backtick: ${v}`);
      } else {
        const result = newText(v);
        if (result) {
          let value = result.value;
          if (inScript) value = value.replace(/\$\{/g, '\\${'); // a JS template string would interpolate it
          if (text.quote === '"' && value.includes('"')) manual.push(`${file}:${line}  new value contains a double quote: ${value}`);
          else {
            edits.push([text.valueStart, text.valueEnd, value]);
            count(`text ${result.kind}`);
            if (result.kind === 'concatenation' || result.kind === 'expression') report.push(`${file}:${line}\n    ${v}\n  → ${value}`);
            if (!inScript) checks.push({ file, line, oldValue: v, newValue: value });
          }
        }
      }
    }

    // align / baseline (static attributes only; bindings such as :align or align={…} stay)
    for (const [name, oldDefault, newDefault] of [['align', 'start', 'center'], ['baseline', 'alphabetic', 'middle']]) {
      const a = byName[name];
      const bound = byName[':' + name] || (a && a.quote === '{');
      if (bound) continue;
      if (!a) {
        inserts.push(` ${name}="${oldDefault}"`);
        count(`${name} added`);
      } else if (src.slice(a.valueStart, a.valueEnd) === newDefault) {
        // The attribute and the spaces before it on its line (never the line break: an emptied line is removed below)
        let s = a.start;
        while (s > areaStart && /[ \t]/.test(src[s - 1])) s--;
        if (src[s - 1] === '\n') { // first on its line: keep the indentation, take the spaces after it
          let e = a.end;
          while (/[ \t]/.test(src[e])) e++;
          edits.push([a.start, e, '']);
        } else {
          edits.push([s, a.end, '']);
        }
        count(`${name}="${newDefault}" removed`);
      }
    }
    if (edits.length === 0 && inserts.length === 0) continue;

    // The tag's attribute area rebuilt: edits from the end, emptied lines removed, insertions at the end
    // Removals next to each other (align="center" baseline="middle") may share the spaces between them: merged
    edits.sort((x, y) => x[0] - y[0]);
    for (let k = edits.length - 1; k > 0; k--) {
      const [p, q] = [edits[k - 1], edits[k]];
      if (p[2] === '' && q[2] === '' && q[0] <= p[1]) { p[1] = Math.max(p[1], q[1]); edits.splice(k, 1); }
    }
    edits.reverse();
    let area = src.slice(areaStart, tag.end);
    for (const [s, e, r] of edits) area = area.slice(0, s - areaStart) + r + area.slice(e - areaStart);
    area = area.replace(/\n[ \t]*(?=\n)/g, '').replace(/\n[ \t]*$/, '');
    if (inserts.length) area = area.replace(/\s+$/, '') + inserts.join('');
    tagEdits.push([areaStart, tag.end, area]);
  }
  if (tagEdits.length === 0) continue;
  let out = src;
  for (const [s, e, r] of tagEdits.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + r + out.slice(e);
  if (!DRY) fs.writeFileSync(file, out);
}

// --- Engine comparison ---
function engine(source) {
  const anything = new Proxy(function() {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anything), apply: () => anything, construct: () => anything });
  const registry = new Map();
  const context = {
    console: { warn() {}, error() {}, log() {} }, HTMLElement: class {}, ShadowRoot: class {}, PointerEvent: class {},
    MouseEvent: class {}, customElements: { define: (tag, cls) => registry.set(tag, cls), get: (tag) => registry.get(tag) },
    document: anything, getComputedStyle: () => anything, requestAnimationFrame: () => 0, performance: { now: () => 0 },
    setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {}, ResizeObserver: anything,
    IntersectionObserver: anything, MutationObserver: anything, MessageChannel: anything, CSS: anything,
    navigator: anything, location: anything
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.pxl;
}
const oldPxl = engine(execSync('git show HEAD:dist/pxl.js', { encoding: 'utf8', maxBuffer: 1e8 }));
const newPxl = engine(fs.readFileSync('dist/pxl.js', 'utf8'));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// The same fake values in both engines: every ref.<id>.<name> is a number from the name, isHovered / isPressed false
const fakeValues = () => new Proxy({}, {
  get: (t, k) => (typeof k !== 'string' ? undefined : /^is/.test(k) ? false : k === '$node' ? {} : [...k].reduce((a, c) => a + c.charCodeAt(0), 0) % 97 + 0.5)
});
function show(pxl, value, isNew) {
  const parsed = isNew ? pxl.parseTemplate(value) : pxl.parseAttributeValue(value);
  let result = parsed;
  if (typeof parsed === 'function') {
    for (const id of parsed.sourceIds) pxl.nodes[id] = fakeValues();
    if (parsed.usesToLocal) return '(toLocal: not compared)';
    result = parsed.call({ parentContainer: null }, 1.234);
  }
  return result === null || result === undefined ? '' : String(result).replace(/\\n/g, '\n');
}
const mismatches = [];
for (const c of checks) {
  try {
    const before = show(oldPxl, decode(c.oldValue), false);
    const after = show(newPxl, decode(c.newValue), true);
    if (before !== after && !before.includes('(toLocal')) mismatches.push(`${c.file}:${c.line}\n    ${c.oldValue} → ${JSON.stringify(before)}\n    ${c.newValue} → ${JSON.stringify(after)}`);
  } catch (e) {
    mismatches.push(`${c.file}:${c.line}  ${e.message}: ${c.oldValue} → ${c.newValue}`);
  }
}

const summary = [
  `${DRY ? 'DRY RUN, nothing written' : 'Files written'}`,
  `counts: ${JSON.stringify(counts, null, 1)}`,
  `compared with the old engine: ${checks.length}, different: ${mismatches.length}`,
  `for a check by hand: ${manual.length}`
].join('\n');
fs.mkdirSync('scratch', { recursive: true });
fs.writeFileSync('scratch/text_migration_report.txt', [summary, '', '== DIFFERENT', ...mismatches, '', '== BY HAND', ...manual, '', '== EXPRESSIONS REWRITTEN', ...report].join('\n'));
console.log(summary);
