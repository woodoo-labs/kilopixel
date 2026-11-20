// Cost of the hit walk inside real animation frames, measured 2026-11-20 for
// design/2026-10-30_framework_compatibility_plan.md §23.9 on examples/test49.html.
// Usage: node design/prototypes/2026-10-30_framework_compatibility/hit_walk_in_frame.js [headful|headless] [page]
//   page: a path below the repo (default examples/test49.html); NOFILL=1 makes fillStyle / strokeStyle no-ops on
//   pxl.dummyCtx (the exact test without parsing colors).
// Starts its own static server for the repo with cross-origin isolation headers (port 8125), so performance.now() has
// 5 µs resolution instead of 100 µs. The pointer stays off the stage, so the engine's own walk doesn't run. Each
// frame times one variant once, at the start of InteractionEngine.process() (where the engine walks: start of the
// frame, before any drawing), in rotation, 200 samples each. Compare with a warm loop (hit_walk_bench.html): the
// same work there is about 10× cheaper.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8125;
const MODE = process.argv[2] || 'headful';
const PAGE = `http://localhost:${PORT}/${process.argv[3] || 'examples/test49.html'}`;
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `new Promise((done) => {
  if (${!!process.env.NOFILL}) for (const p of ['fillStyle', 'strokeStyle']) Object.defineProperty(pxl.dummyCtx, p, { set() {}, get() { return '#000'; } });
  const stage = document.querySelector('pxl-stage'), ix = stage.interaction, ctx = pxl.dummyCtx;
  // A point inside most shapes of test49 (36 overlapping circles); on other pages any point over the stage
  const X = 480, Y = 520, u = stage.unit;
  const shapes = [...stage.querySelectorAll('*')].filter((el) => el.draw);
  const inside = shapes.filter((s) => s.mayContainPoint(X, Y));
  const walk = () => ix.findShapeAt(X, Y);
  const touchCanvas = () => { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.isPointInPath(0, 0); ctx.restore(); };
  const touchStyle = () => shapes[0].cssStyle().pointerEvents;
  // The canvas part of an exact test, with a circle path of the shape's size (r of test49's circles)
  const pathTests = (withFill) => () => {
    for (const s of inside) {
      const m = s.getGlobalMatrix();
      ctx.save();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4] * u, m[5] * u);
      ctx.beginPath();
      ctx.arc(0, 0, (s.attributeValues.r || 100) * u, 0, 2 * Math.PI);
      if (withFill) ctx.fillStyle = s.attributeValues.fill;
      ctx.isPointInPath(X * u, Y * u);
      ctx.restore();
    }
  };
  const variants = {
    'walk (first in the frame)': [null, walk],
    'walk after a canvas call and a style read': [() => { touchCanvas(); touchStyle(); }, walk],
    'second walk in the frame': [walk, walk],
    'first canvas call alone': [null, touchCanvas],
    'first style read alone': [null, touchStyle],
    ['box checks, ' + shapes.length + ' shapes']: [null, () => { for (const s of shapes) s.mayContainPoint(X, Y); }],
    ['style reads, ' + shapes.length + ' shapes']: [null, () => { for (const s of shapes) s.cssStyle().pointerEvents; }],
    ['hitsShape, the ' + inside.length + ' with the point in their box']: [null, () => {
      pxl._hitX = X * u; pxl._hitY = Y * u;
      for (const s of inside) ix.hitsShape(s, X, Y);
    }],
    ['path tests x' + inside.length + ', no fillStyle']: [null, pathTests(false)],
    ['path tests x' + inside.length + ', fillStyle = its color']: [null, pathTests(true)],
    ['fillStyle x' + inside.length + ', each its color']: [null, () => { for (const s of inside) ctx.fillStyle = s.attributeValues.fill; }]
  };
  const names = Object.keys(variants), sum = {}, n = {};
  let res = Infinity;
  for (let k = 0; k < 1e5; k++) { const a = performance.now(), b = performance.now(); if (b > a) res = Math.min(res, b - a); }
  const I = pxl.InteractionEngine.prototype, process = I.process;
  let i = 0;
  I.process = function() {
    if (i < names.length * 205) {
      const name = names[i % names.length], [pre, f] = variants[name];
      if (pre) pre();
      const t0 = performance.now();
      f();
      const dt = performance.now() - t0;
      if (i >= names.length * 5) { sum[name] = (sum[name] || 0) + dt; n[name] = (n[name] || 0) + 1; }
      if (++i === names.length * 205) {
        const r = { crossOriginIsolated: self.crossOriginIsolated, 'timer resolution µs': +(res * 1000).toFixed(1) };
        for (const k of names) r[k + ' (µs)'] = +(sum[k] / n[k] * 1000).toFixed(1);
        r.samplesEach = n[names[0]];
        done(r);
      }
    }
    return process.call(this);
  };
})`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function startBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-walk-'));
  const flags = ['--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1280,1000',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'];
  if (MODE === 'headless') flags.unshift('--headless=new');
  const child = spawn(BROWSER, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve) => {
    let out = '';
    child.stderr.on('data', (c) => { out += c; const m = out.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  });
  const socket = new WebSocket(endpoint);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  let id = 1;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const i = id++;
    pending.set(i, { resolve, reject });
    socket.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  return { child, socket, send };
}

(async () => {
  const server = await startServer();
  const b = await startBrowser();
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  await b.send('Page.enable', {}, s);
  await b.send('Runtime.enable', {}, s);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
  await b.send('Page.navigate', { url: PAGE }, s);
  await sleep(1500);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }, s);
  const r = await b.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true, awaitPromise: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  console.log(`${MODE}${process.env.NOFILL ? ', NOFILL' : ''}: ${PAGE}, once per animation frame, pointer off the stage`);
  for (const [k, v] of Object.entries(r.result.value)) console.log(`  ${k.padEnd(52)} ${v}`);
  try { await b.send('Browser.close'); } catch (e) {}
  b.socket.close();
  b.child.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
