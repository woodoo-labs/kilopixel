// Prototype for design/2026-11-15_testing_plan.md: runs the engine tests and sweeps all docs and example pages
// in headless Chrome, without npm packages. Needs the dev server (node tools/serve.js) and a local Chrome or Edge.
// Usage: node design/prototypes/2026-11-15_testing/headless_probe.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = path.resolve(__dirname, '../../..');
const BASE = 'http://localhost:8124/';
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
];
const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) { console.error('No Chrome or Edge found'); process.exit(2); }

// A separate profile, so the user's browser profile is never touched
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-headless-'));

// Loads a page with virtual time (timers and frames run as fast as possible), returns its DOM and console lines
function load(url, budgetMs) {
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--window-size=1280,2000',
    '--enable-logging=stderr', '--v=0', `--virtual-time-budget=${budgetMs}`, '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const consoleLines = (result.stderr || '').split('\n')
    .filter((line) => line.includes(':CONSOLE'))
    .map((line) => line.replace(/^.*?:CONSOLE:\d+\]\s*/, ''));
  return { dom: result.stdout || '', consoleLines };
}

let failed = false;

// 1. Engine tests: the summary line is in the DOM (tests/index.html writes it into #summary and the title)
const t0 = Date.now();
const tests = load(BASE + 'tests/', 60000);
const summary = (tests.dom.match(/Tests: \d+\/\d+ passed/) || ['no summary found'])[0];
const [passed, total] = (summary.match(/(\d+)\/(\d+)/) || [0, 0, 1]).slice(1).map(Number);
console.log(`Engine tests: ${summary} (${Date.now() - t0} ms)`);
if (passed !== total) failed = true;

// 2. Page sweep: every docs and example page must load without console messages
const pages = [
  ...fs.readdirSync(path.join(repo, 'docs')).filter((f) => f.endsWith('.html')).map((f) => `docs/${f}`),
  ...fs.readdirSync(path.join(repo, 'examples')).filter((f) => f.endsWith('.html')).map((f) => `examples/${f}`)
];
const t1 = Date.now();
let noisy = 0;
for (const page of pages) {
  const { consoleLines } = load(BASE + page, 4000);
  if (consoleLines.length > 0) {
    noisy++;
    console.log(`  ${page}:`);
    for (const line of [...new Set(consoleLines)]) console.log(`    ${line.slice(0, 200)}`);
  }
}
console.log(`Page sweep: ${pages.length} pages, ${noisy} with console messages (${Date.now() - t1} ms)`);
if (noisy > 0) failed = true;

fs.rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
