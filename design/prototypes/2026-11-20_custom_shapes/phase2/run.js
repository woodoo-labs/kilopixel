// Compares two engine builds (design/2026-11-20_custom_shapes_plan.md §17, phase 2) in headless Chrome over the DevTools
// protocol (no packages, Node 22+), in a window of their own so timers aren't throttled like in a background tab.
// The dev server must run (node tools/serve.js, port 8124).
//   node design/prototypes/2026-11-20_custom_shapes/phase2/run.js pixels <old commit>   every docs and example page, pixel by pixel
//   node design/prototypes/2026-11-20_custom_shapes/phase2/run.js bench <old commit>    frame times of five scenes
// Old engine: dist/pxl.min.js of <old commit> (default HEAD); new engine: today's dist/pxl.min.js (node build.js first).
// Both are copied to scratch/phase2/, where the pages here load them from, with the page list.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mode = process.argv[2] || 'pixels';
const ROOT = path.resolve(__dirname, '../../../..');
const WORK = path.join(ROOT, 'scratch', 'phase2');
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'old.min.js'), execSync(`git show ${process.argv[3] || 'HEAD'}:dist/pxl.min.js`, { cwd: ROOT }));
fs.copyFileSync(path.join(ROOT, 'dist', 'pxl.min.js'), path.join(WORK, 'new.min.js'));
const list = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.html')).sort().map((f) => `${d}/${f}`);
fs.writeFileSync(path.join(WORK, 'pages.json'), JSON.stringify([...list('docs'), ...list('examples')]
  .filter((p) => /pxl.min.js/.test(fs.readFileSync(path.join(ROOT, p), 'utf8')))));
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-phase2-'));
// The benchmark keeps the GPU, like a real page; the pixel comparison uses software drawing, which is deterministic
const flags = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--window-size=1400,1000', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  ...(mode === 'pixels' ? ['--disable-gpu'] : [])];

const child = spawn(BROWSER, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let id = 0;
const pending = new Map();

(async () => {
  const endpoint = await new Promise((resolve) => {
    let out = '';
    child.stderr.on('data', (c) => { out += c; const m = out.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  });
  const socket = new WebSocket(endpoint);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, { resolve, reject }); socket.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  const page = mode === 'pixels' ? 'pixels.html' : 'bench.html';
  await send('Page.navigate', { url: `http://localhost:8124/design/prototypes/2026-11-20_custom_shapes/phase2/${page}` }, sessionId);
  await new Promise((r) => setTimeout(r, 3000));
  const expression = mode === 'pixels' ? 'comparePages()' : 'benchAll()';
  const started = Date.now();
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 3600000 }, sessionId);
  if (r.exceptionDetails) console.log('ERROR', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  else console.log(JSON.stringify(r.result.value, null, 1));
  console.log(`${mode}: ${((Date.now() - started) / 1000).toFixed(0)} s`);
  child.kill();
  process.exit(0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
