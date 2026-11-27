// Runs a page next to this file in headless Chrome over the DevTools protocol (no packages, Node 22+) and prints its
// result (design/done/2026-11-26_isolation_box_plan.md). The dev server must run (node tools/serve.js, port 8124).
//   node design/prototypes/2026-11-26_isolation_box/run.js                       edge_cases.html: full vs. box isolation
//   PAGE=test48_variants.html DPR=2 node design/prototypes/2026-11-26_isolation_box/run.js    test48 variants, frame rates
//   PAGE=reach.html node design/prototypes/2026-11-26_isolation_box/run.js      isolated shapes on every docs and example page
// DPR: device pixel ratio (--force-device-scale-factor); FLAGS: more Chrome flags (--disable-gpu: software drawing);
// EXPR: the expression to evaluate instead of the page's default. result.json goes to scratch/isolation_box/.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const WORK = path.join(ROOT, 'scratch', 'isolation_box');
fs.mkdirSync(WORK, { recursive: true });
// reach.html reads the page list from scratch/isolation_box/pages.json
const list = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.html')).sort().map((f) => `${d}/${f}`);
fs.writeFileSync(path.join(WORK, 'pages.json'), JSON.stringify([...list('docs'), ...list('examples')]
  .filter((p) => /pxl\.min\.js/.test(fs.readFileSync(path.join(ROOT, p), 'utf8')))));
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-isolation-box-'));
const flags = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--window-size=1500,1000', ...(process.env.DPR ? [`--force-device-scale-factor=${process.env.DPR}`] : []),
  ...(process.env.FLAGS ? process.env.FLAGS.split(' ') : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`];
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
  await send('Page.navigate', { url: `http://localhost:8124/design/prototypes/2026-11-26_isolation_box/${process.env.PAGE || 'edge_cases.html'}` }, sessionId);
  await new Promise((r) => setTimeout(r, 2000));
  const started = Date.now();
  const r = await send('Runtime.evaluate', { expression: process.env.EXPR || ({ 'test48_variants.html': 'measureAll()', 'reach.html': 'reach()' }[process.env.PAGE] || 'runChecks()'), awaitPromise: true, returnByValue: true, timeout: 3600000 }, sessionId);
  if (r.exceptionDetails) {
    console.log('ERROR', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  } else {
    const v = r.result.value;
    fs.writeFileSync(path.join(WORK, 'result.json'), JSON.stringify(v, null, 1));
    console.log(JSON.stringify(v, null, 1));
  }
  console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);
  child.kill();
  process.exit(0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
