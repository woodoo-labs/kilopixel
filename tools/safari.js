// Runs Kilopixel's checks in real Safari through safaridriver (WebDriver, built into macOS), without npm packages:
// the test pages, the sweep of every docs and example page for console messages, the text and canvas measurements of
// the custom shapes plan (design/2026-11-20_custom_shapes_plan.md §5.3, engine-independent), and a few screenshots.
// Made for the manual GitHub Actions workflow .github/workflows/safari.yml (macOS runner); on a Mac it runs the same
// way after `sudo safaridriver --enable` once. Node 22+ (global fetch).
//
//   node tools/safari.js            results in scratch/safari/ (results.json, summary.md, screenshots)
//
// safaridriver can't read the console, so the script serves the repository itself and puts a small script at the top
// of every HTML page that records console warnings and errors in window.__pxlLog. Exits with 1 when a test fails or a
// page logs anything; the measurements are reported, not judged.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'scratch', 'safari');
const SERVER_PORT = 8125;
const DRIVER_PORT = 4444;
const BASE = `http://localhost:${SERVER_PORT}`;
const PROTOTYPES = 'design/prototypes/2026-11-20_custom_shapes/logical_units';

const TEST_PAGES = ['tests/unit.html', 'tests/index.html', 'tests/render.html', 'tests/frameworks.html'];
const SCREENSHOTS = [
  ['docs/custom-shapes.html', '#sec3Stage'],
  ['docs/text.html', 'pxl-stage'],
  ['examples/test23.html', 'pxl-stage']
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =========================================================================
// The server: the repository's files, with the console hook in every page
// =========================================================================

const HOOK = `<script>window.__pxlLog = [];
for (const level of ['warn', 'error']) {
  const original = console[level];
  console[level] = function(...args) { window.__pxlLog.push(level + ': ' + args.map(String).join(' ').slice(0, 300)); return original.apply(this, args); };
}
addEventListener('error', (e) => window.__pxlLog.push('uncaught: ' + e.message));
addEventListener('unhandledrejection', (e) => window.__pxlLog.push('unhandled rejection: ' + (e.reason && e.reason.message || e.reason)));
</script>`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.zip': 'application/zip',
  '.ts': 'text/plain', '.md': 'text/plain' };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, BASE).pathname);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    let body = fs.readFileSync(file);
    if (ext === '.html') {
      const text = body.toString('utf8');
      const at = text.search(/<head[^>]*>/i);
      body = at < 0 ? HOOK + text : text.replace(/<head[^>]*>/i, (tag) => tag + HOOK);
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(SERVER_PORT, () => resolve(server)));
}

// =========================================================================
// WebDriver: plain HTTP to safaridriver
// =========================================================================

let sessionId = null;

async function command(method, route, body) {
  // New session: POST /session; everything else is relative to the session (route '' is the session itself)
  const url = `http://localhost:${DRIVER_PORT}/session${route === '/session' ? '' : `/${sessionId}${route}`}`;
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  if (json.value && json.value.error) throw new Error(`${route}: ${json.value.error}: ${json.value.message}`);
  return json.value;
}

const open = (page) => command('POST', '/url', { url: `${BASE}/${page}` });
const run = (script) => command('POST', '/execute/sync', { script, args: [] });
// The script resolves a promise; its value comes back
const runAsync = (expression) => command('POST', '/execute/async', {
  script: `const done = arguments[arguments.length - 1];
    Promise.resolve().then(() => (${expression})).then((value) => done({ value }), (e) => done({ error: String(e && e.stack || e) }));`,
  args: []
}).then((r) => { if (r.error) throw new Error(r.error); return r.value; });

async function startDriver() {
  const driver = spawn('safaridriver', ['-p', String(DRIVER_PORT)], { stdio: 'inherit' });
  for (let i = 0; i < 50; i++) {
    try {
      const status = await (await fetch(`http://localhost:${DRIVER_PORT}/status`)).json();
      if (status.value && status.value.ready !== false) break;
    } catch (e) { /* not listening yet */ }
    await sleep(200);
  }
  const session = await command('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sessionId = session.sessionId;
  await command('POST', '/timeouts', { script: 600000, pageLoad: 120000 });
  try { await command('POST', '/window/rect', { width: 1280, height: 900 }); } catch (e) { console.log(`window size: ${e.message}`); }
  return driver;
}

// =========================================================================
// The checks
// =========================================================================

// A test page runs its tests on load and sets window.kilopixelTests when done (tests/runner.js)
async function testPage(page) {
  const started = Date.now();
  await open(page);
  let report = null;
  while (!report && Date.now() - started < 600000) {
    await sleep(1000);
    report = await run('return window.kilopixelTests || null;');
  }
  if (!report) return { page, error: 'no result after 10 minutes', seconds: (Date.now() - started) / 1000 };
  const failed = report.results.filter((r) => r.status === 'failed' || r.status === 'fixed')
    .map((r) => `${r.section ? r.section + ' / ' : ''}${r.name}: ${r.error || r.status}`);
  const log = await run('return window.__pxlLog;');
  return { page, passed: report.passed, total: report.total, known: report.known, ok: report.ok, failed,
    console: log, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

// Every docs and example page: loaded, given a moment to draw, then its console messages
async function sweep() {
  const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`);
  const out = [];
  for (const page of [...list('docs'), ...list('examples')]) {
    try {
      await open(page);
      await sleep(1500);
      out.push({ page, console: await run('return window.__pxlLog || ["no hook"];') });
    } catch (e) {
      out.push({ page, console: [`driver: ${e.message}`] });
    }
  }
  return out;
}

// The 600 text cases of the custom shapes plan (canvas only, no engine): today vs. logical units
async function textMeasurement() {
  await open(`${PROTOTYPES}/text_tests.html`);
  return runAsync(`runTextTests().then((summary) => {
    const edge = (r) => { const W = r.canvas.width, H = r.canvas.height, d = r.data; let R = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 64 && x > R) R = x; return R; };
    const drift = {};
    for (const r of window.textRows) { const k = edge(r.b) - edge(r.a); drift[k] = (drift[k] || 0) + 1; }
    // The cases whose widths differ most, with the font size each method sets: today size × u, logical units size
    const widest = window.textRows.map((r) => ({ font: r.font, weight: r.weight, size: r.size, u: r.u, dpr: r.dpr,
      stroke: r.stroke, fontPxToday: +(r.size * r.u).toFixed(3), widthToday: r.widthToday, widthLogical: r.widthLogical,
      difference: +(Math.abs(r.widthToday - r.widthLogical) / r.widthLogical * 100).toFixed(2) }))
      .sort((p, q) => q.difference - p.difference).slice(0, 12);
    return { browser: navigator.userAgent, summary, rightEdgeDriftDevicePx: drift, widest };
  })`);
}

// Which ways of reading pixels back work in this Safari: a plain canvas, one with willReadFrequently, and a plain
// canvas copied into a willReadFrequently one (drawImage, createImageBitmap); then a page's layer canvas the same way
async function readbackProbe() {
  const probe = `(async () => {
    const out = {};
    const make = (options) => { const c = document.createElement('canvas'); c.width = 50; c.height = 50;
      const g = c.getContext('2d', options); g.fillStyle = '#f00'; g.fillRect(10, 10, 30, 30); return c; };
    const read = (canvas) => { const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(25, 25, 1, 1).data; return Array.from(d).join(','); };
    const attempt = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + e.name + ': ' + e.message; } };
    const copyTo = (source) => { const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0); return c; };
    await attempt('plain getImageData', () => Array.from(make().getContext('2d').getImageData(25, 25, 1, 1).data).join(','));
    await attempt('willReadFrequently getImageData', () => read(make({ willReadFrequently: true })));
    await attempt('plain → drawImage → willReadFrequently', () => read(copyTo(make())));
    await attempt('plain → createImageBitmap → willReadFrequently', async () => read(copyTo(await createImageBitmap(make()))));
    await attempt('plain toDataURL length', () => make().toDataURL().length);
    // resize() sizes the layers and draws once, also when the page doesn't get animation frames
    const stage = document.querySelector('pxl-stage'), layer = stage && stage.querySelector('pxl-layer');
    if (layer) {
      stage.resize();
      const canvas = layer._canvas, copy = copyTo(canvas), d = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height).data;
      let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
      out['layer canvas copied: painted pixels'] = ink + ' of ' + (d.length / 4);
    }
    return out;
  })()`;
  await open('docs/circle.html');
  await sleep(1500);
  return runAsync(probe);
}

async function canvasMeasurement() {
  await open(`${PROTOTYPES}/canvas_tests.html`);
  return run('return runAllTests();');
}

async function screenshots() {
  const files = [];
  for (const [page, selector] of SCREENSHOTS) {
    await open(page);
    await run(`const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.scrollIntoView({ block: 'center' });`);
    await sleep(1500);
    const png = await command('GET', '/screenshot');
    const name = page.replace(/[/.]/g, '_') + '.png';
    fs.writeFileSync(path.join(OUT, name), Buffer.from(png, 'base64'));
    files.push(name);
  }
  return files;
}

// =========================================================================
// Report
// =========================================================================

function summaryMarkdown(r) {
  const lines = ['# Kilopixel in Safari', '', `\`${r.browser}\``, '', '## Test Pages', '',
    '| Page | Result | Seconds |', '|---|---|---|'];
  for (const t of r.tests) {
    lines.push(t.error ? `| ${t.page} | ${t.error} | ${t.seconds} |`
      : `| ${t.page} | ${t.passed}/${t.total} passed${t.known ? `, ${t.known} known` : ''} | ${t.seconds} |`);
  }
  for (const t of r.tests) for (const f of t.failed || []) lines.push(`- ✗ ${t.page}: ${f.replace(/\n/g, ' ')}`);
  const noisy = r.sweep.filter((p) => p.console.length);
  lines.push('', '## Page Sweep', '', `${r.sweep.length} pages, ${noisy.length} with console messages.`, '');
  for (const p of noisy) lines.push(`- ${p.page}: ${p.console.slice(0, 3).join(' | ').replace(/\n/g, ' ')}`);
  if (r.text) {
    const s = r.text.summary;
    lines.push('', '## Text: Today vs. Logical Units', '',
      `${s.cases} cases, ${s.identicalCases} identical; ${s.share} of the ink pixels differ by more than 64 / 255; ` +
      `widths differ by up to ${s.maxRelativeWidthDifference}.`, '',
      `Right edge drift in device pixels (logical − today): \`${JSON.stringify(r.text.rightEdgeDriftDevicePx)}\``, '',
      'Widest differences (today draws size × u px; logical units draw size px on a canvas scaled by u):', '',
      '| Font | Size | u | DPR | Font px today | Width today | Width logical | Difference |', '|---|---|---|---|---|---|---|---|');
    for (const w of r.text.widest || []) {
      lines.push(`| ${w.font} ${w.weight}${w.stroke ? ' outlined' : ''} | ${w.size} | ${w.u} | ${w.dpr} | ${w.fontPxToday} | ` +
        `${w.widthToday.toFixed(2)} | ${w.widthLogical.toFixed(2)} | ${w.difference} % |`);
    }
  }
  if (r.readback) {
    lines.push('', '## Pixel Readback', '', '| Way | Result |', '|---|---|');
    for (const [way, value] of Object.entries(r.readback)) lines.push(`| ${way} | ${String(value).replace(/\|/g, '/')} |`);
  }
  if (r.canvas) lines.push('', '## Canvas Rules', '', '```json', JSON.stringify(r.canvas, null, 1), '```');
  for (const [name, message] of Object.entries(r.errors)) lines.push('', `**${name} failed:** ${message}`);
  lines.push('', `Screenshots (artifact): ${r.screenshots.join(', ')}`);
  return lines.join('\n') + '\n';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const driver = await startDriver();
  const result = { browser: '', readback: null, tests: [], sweep: [], text: null, canvas: null, screenshots: [], errors: {} };
  const step = async (name, fn) => {
    console.log(`Safari: ${name} …`);
    try { return await fn(); } catch (e) { result.errors[name] = e.message; console.log(`  failed: ${e.message}`); return null; }
  };
  try {
    await open('docs/index.html');
    result.browser = await run('return navigator.userAgent;');
    result.readback = await step('readback probe', readbackProbe);
    for (const page of TEST_PAGES) {
      const t = await step(page, () => testPage(page));
      if (t) result.tests.push(t);
    }
    result.sweep = (await step('page sweep', sweep)) || [];
    result.text = await step('text measurement', textMeasurement);
    result.canvas = await step('canvas measurement', canvasMeasurement);
    result.screenshots = (await step('screenshots', screenshots)) || [];
  } finally {
    try { await command('DELETE', ''); } catch (e) { /* session already gone */ }
    driver.kill();
    server.close();
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(result, null, 1));
  const markdown = summaryMarkdown(result);
  fs.writeFileSync(path.join(OUT, 'summary.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  const failed = result.tests.some((t) => !t.ok) || result.sweep.some((p) => p.console.length) ||
    Object.keys(result.errors).length > 0;
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { startServer };
