// Counts frames and redraws on every docs and example page for two engine builds, and compares the pixels at the end
// (design/2026-11-20_evaluation_model_plan.md, step 2). Runs redraws.html (next to this file) in headless Chrome over the
// DevTools protocol (no packages, Node 22+).
// The dev server must run (node tools/serve.js, port 8124).
//   node design/prototypes/2026-11-20_evaluation_model/run.js <old commit>      old: dist/pxl.min.js of that commit (default HEAD); new: today's dist/pxl.min.js
// The engines, the page list and result.json go to scratch/evaluation_model/. Prints the summary and every page whose counts or pixels differ.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const WORK = path.join(ROOT, 'scratch', 'evaluation_model');
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'old.min.js'), execSync(`git show ${process.argv[2] || 'HEAD'}:dist/pxl.min.js`, { cwd: ROOT }));
fs.copyFileSync(path.join(ROOT, 'dist', 'pxl.min.js'), path.join(WORK, 'new.min.js'));
const list = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.html')).sort().map((f) => `${d}/${f}`);
fs.writeFileSync(path.join(WORK, 'pages.json'), JSON.stringify([...list('docs'), ...list('examples')]
  .filter((p) => /pxl\.min\.js/.test(fs.readFileSync(path.join(ROOT, p), 'utf8')))));
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-step2-'));
const flags = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--disable-gpu',
  '--window-size=1400,1000', '--remote-debugging-port=0', `--user-data-dir=${profile}`];
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
  await send('Page.navigate', { url: 'http://localhost:8124/design/prototypes/2026-11-20_evaluation_model/redraws.html' }, sessionId);
  await new Promise((r) => setTimeout(r, 2000));
  const started = Date.now();
  const r = await send('Runtime.evaluate', { expression: 'measureAll()', awaitPromise: true, returnByValue: true, timeout: 3600000 }, sessionId);
  if (r.exceptionDetails) {
    console.log('ERROR', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  } else {
    const v = r.result.value;
    fs.writeFileSync(path.join(WORK, 'result.json'), JSON.stringify(v, null, 1));
    const { results, ...summary } = v;
    console.log(JSON.stringify(summary));
    for (const p of results) {
      if (p.error || p.differ || p.framesOld !== p.framesNew || p.clearsOld !== p.clearsNew) {
        console.log(`${p.page}: frames ${p.framesOld} -> ${p.framesNew}, clears ${p.clearsOld} -> ${p.clearsNew}` +
          `${p.differ ? `, ${p.differ} layers differ` : ''}${p.unstable ? `, ${p.unstable} unstable` : ''}${p.error ? `, ERROR ${p.error}` : ''}`);
      }
    }
  }
  console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);
  child.kill();
  process.exit(0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
