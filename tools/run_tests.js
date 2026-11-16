// Runs the test pages in tests/ and sweeps every docs and example page for console messages, in headless Chrome
// or Edge, without npm packages (design/2026-11-15_testing_plan.md §5).
//
// Usage: node tools/run_tests.js [--tests] [--sweep] [--page <path>] [--grep <text>] [--repeat <n>] [--verbose]
//   --tests          only the test pages             --sweep     only the page sweep
//   --page <path>    sweep one page, e.g. docs/circle.html (can be repeated)
//   --grep <text>    only tests whose name or section contains the text (passed to the pages as ?grep=)
//   --repeat <n>     run the test pages n times (finds flaky tests)
//   --verbose        list every test, and the console messages of the test pages
// Exit code: 0 all passed, 1 failures, 2 setup problem (no browser, server didn't start).
//
// Test pages run in their own headless browser process with --virtual-time-budget: timers and frames run as fast
// as the page allows, so the result doesn't depend on a visible window, and waits in tests cost no real time.
// The sweep runs in one browser with several tabs over the DevTools protocol, in real time: browser processes
// start one after another (measured on Windows: 6 at once take as long as 6 in a row), tabs load in parallel.
// Without WebSocket (Node < 22) the sweep falls back to one process per page. Starts the dev server
// (tools/serve.js) if it isn't running.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:8124/';
const TEST_BUDGET = 120000;  // virtual ms for a test page
const SWEEP_BUDGET = 4000;   // virtual ms for a docs or example page (fallback): load, fonts, some animation
const SWEEP_SETTLE = 1500;   // real ms a sweep tab keeps running after its load event
const REAL_TIMEOUT = 120000; // real ms before a browser process counts as hanging
const PAGE_TIMEOUT = 30000;  // real ms before a sweep tab counts as hanging
const TABS = 6;

// =========================================================================
// Options
// =========================================================================

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const values = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const pagesToSweep = values('--page');
const onlyTests = flag('--tests'), onlySweep = flag('--sweep') || pagesToSweep.length > 0;
const options = {
  tests: onlyTests || !onlySweep,
  sweep: onlySweep || !onlyTests,
  grep: value('--grep'),
  repeat: Math.max(1, Number(value('--repeat')) || 1),
  verbose: flag('--verbose')
};

// =========================================================================
// Browser and dev server
// =========================================================================

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

function findBrowser() {
  if (process.env.PXL_BROWSER) return process.env.PXL_BROWSER;
  return BROWSERS.find((p) => fs.existsSync(p)) || null;
}

function isServerUp() {
  return new Promise((resolve) => {
    require('http').get(BASE + 'tests/runner.js', (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// Returns the server process if this run started it (stopped at the end), or null if one was already running
async function ensureServer() {
  if (await isServerUp()) return null;
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await isServerUp()) return server;
  }
  server.kill();
  throw new Error(`the dev server didn't start on ${BASE} (is port 8124 used by another program?)`);
}

// GitHub's Ubuntu machines don't allow Chrome's sandbox (no unprivileged user namespaces); CI sets CI=true.
// Only there: locally the pages come from our own dev server, but the sandbox stays on anyway.
const BROWSER_FLAGS = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--window-size=1280,2000', ...(process.env.CI ? ['--no-sandbox'] : [])];

// =========================================================================
// One page in its own browser process
// =========================================================================

let browserPath = null;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-tests-')); // profiles live here, never the user's
let profileCount = 0;

// Loads url and resolves to { dom, messages }: the page's DOM after the virtual time budget, and its console
// messages (console calls and uncaught errors, as the browser logs them to stderr)
function load(url, budget) {
  const profile = path.join(tempRoot, `p${profileCount++}`);
  return new Promise((resolve) => {
    const child = spawn(browserPath, [
      ...BROWSER_FLAGS, `--user-data-dir=${profile}`, '--enable-logging=stderr', '--v=0',
      `--virtual-time-budget=${budget}`, '--dump-dom', url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let dom = '', log = '';
    child.stdout.on('data', (chunk) => { dom += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    const timer = setTimeout(() => child.kill(), REAL_TIMEOUT);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const messages = log.split('\n').filter((line) => line.includes(':CONSOLE'))
        .map((line) => line.replace(/^.*?:CONSOLE:\d+\]\s*/, '').trim());
      if (signal) messages.push(`the page didn't finish within ${REAL_TIMEOUT / 1000} s`);
      resolve({ dom, messages });
    });
  });
}

// Runs fn(item, worker) over items with the given workers, one item per worker at a time; results in item order
async function parallel(items, workers, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(workers.map(async (worker) => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], worker);
    }
  }));
  return results;
}

// =========================================================================
// Sweep: one browser, several tabs, over the DevTools protocol
// =========================================================================

class Browser {
  static async start() {
    const profile = path.join(tempRoot, 'sweep');
    const child = spawn(browserPath, [...BROWSER_FLAGS, '--remote-debugging-port=0', `--user-data-dir=${profile}`,
      'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('the browser printed no DevTools address')), 20000);
      child.stderr.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.on('exit', () => reject(new Error('the browser exited at start')));
    });
    const browser = new Browser(child, new WebSocket(endpoint));
    await new Promise((resolve, reject) => {
      browser.socket.addEventListener('open', resolve, { once: true });
      browser.socket.addEventListener('error', () => reject(new Error('no DevTools connection')), { once: true });
    });
    return browser;
  }

  constructor(child, socket) {
    this.child = child;
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  // A tab of its own (a new window, so it is never a throttled background tab)
  async openTab() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Runtime.enable', {}, sessionId);
    await this.send('Log.enable', {}, sessionId);
    await this.send('Page.enable', {}, sessionId);
    return sessionId;
  }

  // Loads url in the tab and resolves to { messages, external }: console calls, uncaught errors and browser log
  // errors / warnings (failed requests) until SWEEP_SETTLE ms after the load event. Network errors for files on
  // other servers (CDNs, web fonts) go to `external`: without internet every docs page has them, and they say
  // nothing about the page. HTTP errors (404) from any server stay messages.
  async load(sessionId, url) {
    const messages = [];
    const external = [];
    let loaded;
    const loadEvent = new Promise((resolve) => { loaded = resolve; });
    const listener = (message) => {
      if (message.sessionId !== sessionId) return;
      const p = message.params;
      if (message.method === 'Runtime.consoleAPICalled' && p.type !== 'debug') {
        const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
        messages.push(`console.${p.type}: ${text}`);
      } else if (message.method === 'Runtime.exceptionThrown') {
        // First line of the message, plus where it was thrown (the stack would take several lines)
        const d = p.exceptionDetails;
        const text = ((d.exception && d.exception.description) || d.text).split('\n')[0];
        messages.push(`uncaught: ${text}${d.url ? ` (${d.url}:${d.lineNumber + 1})` : ''}`);
      } else if (message.method === 'Log.entryAdded' && (p.entry.level === 'error' || p.entry.level === 'warning')) {
        // The browser asks for /favicon.ico on its own; the pages don't declare one
        if (p.entry.url && p.entry.url.endsWith('/favicon.ico')) return;
        if (p.entry.url && !p.entry.url.startsWith(BASE) && p.entry.text.includes('net::ERR_')) {
          external.push(p.entry.url);
          return;
        }
        messages.push(`${p.entry.level}: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ''}`);
      } else if (message.method === 'Page.loadEventFired') {
        loaded();
      }
    };
    this.listeners.add(listener);
    try {
      await this.send('Page.navigate', { url }, sessionId);
      const hung = new Promise((resolve) => setTimeout(() => resolve('hung'), PAGE_TIMEOUT));
      if (await Promise.race([loadEvent, hung]) === 'hung') {
        messages.push(`no load event within ${PAGE_TIMEOUT / 1000} s`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, SWEEP_SETTLE));
      }
      return { messages, external };
    } finally {
      this.listeners.delete(listener);
    }
  }

  async close() {
    try {
      await Promise.race([this.send('Browser.close'), new Promise((resolve) => setTimeout(resolve, 2000))]);
    } catch (e) {
      // already closed
    }
    this.socket.close();
    // Wait for the exit: the browser holds its profile folder until then
    const exited = new Promise((resolve) => this.child.once('exit', resolve));
    if (this.child.exitCode === null) this.child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    // Helper processes of the browser may keep its stderr open: don't let them keep Node running
    this.child.stderr.destroy();
    this.child.unref();
  }
}

// =========================================================================
// Runs
// =========================================================================

const htmlFiles = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).sort()
  .map((f) => `${dir}/${f}`);
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const pad = (text, width) => text + ' '.repeat(Math.max(1, width - text.length));
const MARKS = { passed: '✓', failed: '✗', known: '○', fixed: '!' };

// tests/runner.js writes the report as JSON into <script id="test-results"> at the end of the page
function readReport(dom) {
  const match = dom.match(/<script type="application\/json" id="test-results">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

async function runTestPages() {
  let failures = 0;
  const query = options.grep ? `?grep=${encodeURIComponent(options.grep)}` : '';
  const pages = htmlFiles('tests');
  for (let round = 1; round <= options.repeat; round++) {
    if (options.repeat > 1) console.log(`Round ${round} of ${options.repeat}`);
    for (const page of pages) {
      const start = Date.now();
      const { dom, messages } = await load(BASE + page + query, TEST_BUDGET);
      const report = readReport(dom);
      if (!report) {
        failures++;
        console.log(`  ${pad(page, 30)}no result (the page didn't call runTests() or didn't finish)`);
        for (const m of messages) console.log(`      ${m.slice(0, 300)}`);
        continue;
      }
      const summary = `${report.passed}/${report.total} passed` + (report.known ? `, ${report.known} known` : '');
      console.log(`  ${pad(page, 30)}${pad(summary, 30)}${seconds(Date.now() - start)}`);
      let lastSection = null;
      for (const r of report.results) {
        if (r.status === 'failed' || r.status === 'fixed') failures++;
        if (!options.verbose && (r.status === 'passed' || r.status === 'known')) continue;
        if (r.section !== lastSection) console.log(`    ${(lastSection = r.section) || 'Tests'}`);
        console.log(`      ${MARKS[r.status]} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
      }
      if (options.verbose) for (const m of messages) console.log(`      console: ${m.slice(0, 300)}`);
    }
  }
  return failures;
}

async function runSweep() {
  const pages = pagesToSweep.length > 0 ? pagesToSweep : [...htmlFiles('docs'), ...htmlFiles('examples')];
  const start = Date.now();
  let loaded, how;
  if (typeof WebSocket === 'undefined') {
    how = 'one process per page, Node < 22: failed requests not seen';
    loaded = await parallel(pages, [null], (page) => load(BASE + page, SWEEP_BUDGET));
  } else {
    how = `${TABS} tabs`;
    const browser = await Browser.start();
    try {
      const tabs = [];
      for (let i = 0; i < Math.min(TABS, pages.length); i++) tabs.push(await browser.openTab());
      loaded = await parallel(pages, tabs, (page, tab) => browser.load(tab, BASE + page));
    } finally {
      await browser.close();
    }
  }
  const noisy = pages.filter((page, i) => loaded[i].messages.length > 0);
  const label = pages.length === 1 ? `Page ${pages[0]}` : `Page sweep: ${pages.length} pages`;
  console.log(`  ${pad(label, 30)}${pad(`${noisy.length} with console messages`, 30)}` +
    `${seconds(Date.now() - start)} (${how})`);
  pages.forEach((page, i) => {
    if (loaded[i].messages.length === 0) return;
    console.log(`    ${page}`);
    for (const m of [...new Set(loaded[i].messages)]) console.log(`      ${m.slice(0, 300)}`);
  });

  // A note, not a failure: usually no internet (the fallback without WebSocket doesn't see requests at all)
  const offline = pages.filter((page, i) => loaded[i].external && loaded[i].external.length > 0);
  if (offline.length > 0) {
    const hosts = new Set(offline.flatMap((page) => loaded[pages.indexOf(page)].external.map((u) => new URL(u).host)));
    console.log(`  Note: ${offline.length} page(s) couldn't load files from ${[...hosts].join(', ')} ` +
      '(no internet?). Not counted as failures; run again online to check those files.');
  }
  return noisy.length;
}

async function main() {
  browserPath = findBrowser();
  if (!browserPath) {
    console.error('No Chrome or Edge found. Install one, or set PXL_BROWSER to the browser executable.');
    process.exitCode = 2;
    return;
  }

  let server = null;
  let failures = 0;
  try {
    server = await ensureServer();
    console.log(`Kilopixel tests: ${path.basename(browserPath)}` + (server ? ', dev server started for this run' : ''));
    if (options.tests) failures += await runTestPages();
    if (options.sweep) failures += await runSweep();
    console.log(failures === 0 ? 'All passed.' : `FAILED: ${failures} problem(s).`);
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (error) {
    console.error(`Setup problem: ${error.message}`);
    process.exitCode = 2;
  } finally {
    if (server) server.kill();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (e) {
      // A profile that a browser helper still holds: one try only (retries cost seconds); it is in the
      // system's temp folder, which is cleaned up later
    }
  }
}

// Exit as soon as the run and its cleanup are done: a closing WebSocket or a browser helper process would otherwise
// keep Node waiting for up to half a minute
main().then(() => process.exit(process.exitCode));
