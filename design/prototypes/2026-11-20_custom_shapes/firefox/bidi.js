// Runs an expression in headless Firefox over WebDriver BiDi (built into Firefox), no packages; Node 22+ (global WebSocket).
// node design/prototypes/2026-11-20_custom_shapes/firefox/bidi.js <url> <expression or file.js> [--dpr 2] [--size 1400x1000]
//   [--shot file.png] [--then expression]
// The expression may return a promise; its value is printed as JSON, with the page's console messages. If the value has
// clickAt: [[x, y], …] (viewport CSS pixels), those points get real mouse clicks before --then runs. The dev server must
// run; the measurements of the plan's §5.3 (P = design/prototypes/2026-11-20_custom_shapes, B = $P/firefox/bidi.js):
//   node $B http://localhost:8124/$P/logical_units/text_tests.html $P/firefox/text_expr.js --dpr 2
//   node $B http://localhost:8124/$P/logical_units/harness.html $P/firefox/sweep_expr.js --dpr 2
//   node $B http://localhost:8124/$P/template/rich.html $P/firefox/rich_expr.js --then "document.getElementById('clicks').value"
//   node $B http://localhost:8124/examples/test23.html $P/firefox/sbs_expr.js --shot scratch/test23.png
// To look at the results in any browser: firefox/text_view.html and firefox/compare.html on the dev server.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const dpr = opt('--dpr', '1');
const [w, h] = opt('--size', '1400x1000').split('x').map(Number);
const shot = opt('--shot', null);
const then = opt('--then', null);
const logs = [];
const [url, expressionArg] = args;
const expression = /\.js$/.test(expressionArg) ? fs.readFileSync(expressionArg, 'utf8') : expressionArg;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-bidi-'));
fs.writeFileSync(path.join(profile, 'user.js'), [
  `user_pref("layout.css.devPixelsPerPx", "${dpr}");`,
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
  'user_pref("browser.aboutwelcome.enabled", false);',
].join('\n'));

const ff = spawn(FIREFOX, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port=0',
  `--width=${w}`, `--height=${h}`], { stdio: ['ignore', 'pipe', 'pipe'] });

let id = 0;
const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

const timeout = setTimeout(() => { console.error('timeout'); ff.kill(); process.exit(2); }, 600000);

let buffer = '';
const onOutput = async (chunk) => {
  buffer += chunk;
  const m = buffer.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
  if (!m) return;
  ff.stderr.off('data', onOutput);
  ff.stdout.off('data', onOutput);
  const ws = new WebSocket(m[1] + '/session');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'log.entryAdded') logs.push(`${msg.params.level}: ${msg.params.text}`.slice(0, 200));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.error + ': ' + msg.message)); else p.resolve(msg.result);
    }
  };
  ws.onopen = async () => {
    let code = 0;
    try {
      await send(ws, 'session.new', { capabilities: {} });
      const tree = await send(ws, 'browsingContext.getTree', {});
      const context = tree.contexts[0].context;
      await send(ws, 'session.subscribe', { events: ['log.entryAdded'] });
      await send(ws, 'browsingContext.navigate', { context, url, wait: 'complete' });
      const evaluate = async (expr) => {
        const r = await send(ws, 'script.evaluate', {
          expression: `(async () => JSON.stringify(await (${expr})))()`, target: { context }, awaitPromise: true,
        });
        if (r.type === 'exception') throw new Error('EXCEPTION ' + r.exceptionDetails.text);
        return JSON.parse(r.result.value);
      };
      const result = await evaluate(expression);
      console.log(JSON.stringify({ firefox: true, devicePixelRatio: Number(dpr), result }));
      // The expression may ask for real mouse clicks (viewport CSS px), then --then runs
      if (result && result.clickAt) {
        for (const [x, y] of result.clickAt) {
          await send(ws, 'input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', actions: [
            { type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 50 },
            { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 150 },
          ] }] });
        }
      }
      if (then) console.log(JSON.stringify({ then: await evaluate(then) }));
      console.log(JSON.stringify({ console: logs }));
      if (shot) {
        const s = await send(ws, 'browsingContext.captureScreenshot', { context, origin: 'document' });
        fs.writeFileSync(shot, Buffer.from(s.data, 'base64'));
      }
    } catch (e) {
      console.log('ERROR', e.message); code = 1;
    }
    try { await send(ws, 'session.end', {}); } catch (e) {}
    ff.kill();
    clearTimeout(timeout);
    setTimeout(() => process.exit(code), 500);
  };
};
ff.stderr.on('data', onOutput);
ff.stdout.on('data', onOutput);
