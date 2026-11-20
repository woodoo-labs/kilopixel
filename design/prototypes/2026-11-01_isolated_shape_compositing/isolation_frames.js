// Measured 2026-11-20 for design/2026-11-01_isolated_shape_compositing_plan.md §3.4 and §4: the isolation patch
// (isolation_patch.html) in real frames. Prints the transform check, then fps and CPU time per frame of
// Stage.render() for each mode (direct, full scratch canvas, bounding box) with n animated masked ellipses.
// Usage: node design/prototypes/2026-11-01_isolated_shape_compositing/isolation_frames.js [headful|headless]
//   DSF=2 the device scale factor (default 2), NS=5,20 the shape counts (default 5,20).
// Starts its own static server with cross-origin isolation headers on port 8125 (5 µs timer). Use headful: headless
// Chrome has no real GPU, and the GPU cost shows only as a lower fps.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8125;
const MODE = process.argv[2] || 'headful';
const DSF = Number(process.env.DSF || 2);
const PAGE = `http://localhost:${PORT}/design/prototypes/2026-11-01_isolated_shape_compositing/isolation_patch.html`;
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = (mode, n) => `new Promise((done) => {
  buildBench(${n});
  window.ISO = '${mode}';
  let frames = 0, cpu = 0, on = false;
  const render = pxl.Stage.prototype.render;
  pxl.Stage.prototype.render = function(t) {
    const t0 = performance.now();
    render.call(this, t);
    if (on) { cpu += performance.now() - t0; frames++; }
  };
  setTimeout(() => {
    on = true;
    const start = performance.now();
    setTimeout(() => {
      on = false;
      pxl.Stage.prototype.render = render;
      const secs = (performance.now() - start) / 1000;
      done({ mode: '${mode}', n: ${n}, fps: +(frames / secs).toFixed(1), cpuMsPerFrame: +(cpu / frames).toFixed(3) });
    }, 3000);
  }, 700);
})`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function startBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-iso-'));
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
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: DSF, mobile: false }, s);
  await b.send('Page.navigate', { url: PAGE }, s);
  await sleep(1500);
  const tr = await b.send('Runtime.evaluate', { expression: 'window.transformResult', returnByValue: true }, s);
  console.log(`${MODE}, deviceScaleFactor ${DSF}: transform check ${JSON.stringify(tr.result.value)}`);
  for (const n of (process.env.NS || "5,20").split(",").map(Number)) for (const mode of ['direct', 'full', 'bbox', 'direct', 'full', 'bbox']) {
    const r = await b.send('Runtime.evaluate', { expression: MEASURE(mode, n), returnByValue: true, awaitPromise: true }, s);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    const v = r.result.value;
    console.log(`  ${String(v.n).padStart(3)} shapes  ${v.mode.padEnd(7)} ${String(v.fps).padStart(5)} fps   ${v.cpuMsPerFrame.toFixed(3).padStart(7)} ms CPU per frame`);
  }
  try { await b.send('Browser.close'); } catch (e) {}
  b.socket.close();
  b.child.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
