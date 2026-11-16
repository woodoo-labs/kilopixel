// Build checks (design/2026-11-15_testing_plan.md, step 6), no dependencies:
// - the checks build.js runs before building (top-level declarations, trailing whitespace, the underscore rule)
//   refuse what they should, tested with small examples kept in memory;
// - the committed build output matches the sources (catches a forgotten `node build.js`, e.g. on the other laptop);
// - the sizes written in the docs match the build (CLAUDE.md "File size after a build").
// Usage: node tools/check_build.js → one line per check; exit code 1 if one fails. Also run by tools/run_tests.js.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const { VERSION, readSources, checkSources, bundleSource } = require(path.join(ROOT, 'build.js'));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

// checkSources() on in-memory files: expect problems containing each of `expected` (none: no problems)
function expectProblems(files, expected) {
  const problems = checkSources(files, Object.keys(files));
  if (expected.length === 0) {
    if (problems.length > 0) throw new Error(`unexpected: ${problems.join('; ')}`);
    return;
  }
  for (const text of expected) {
    if (!problems.some((p) => p.includes(text))) throw new Error(`no problem mentioning "${text}" (got: ${problems.join('; ') || 'none'})`);
  }
}

// --- The checks of build.js ---

check('refuses top-level declarations (class, const, let, var, function, async function, function*)', () => {
  for (const line of ['class leak {}', 'const leak = 1;', 'let leak;', 'var leak;', 'function leak() {}',
    'async function leak() {}', 'function* leak() {}']) {
    expectProblems({ 'a.js': `pxl.ok = 1;\n${line}\n` }, ['"leak"']);
  }
});

check('accepts declarations on pxl and indented ones', () =>
  expectProblems({ 'a.js': 'pxl.Thing = class Thing {};\npxl.fn = function() {\n  const inner = 1;\n};\n' }, []));

check('refuses trailing whitespace, with the line number', () =>
  expectProblems({ 'a.js': 'pxl.a = 1;\npxl.b = 2;  \n' }, ['trailing whitespace in a.js:2']));

check('refuses a _field used in another file', () =>
  expectProblems({
    'a.js': 'pxl.A = class A { constructor() { this._count = 0; } };\n',
    'b.js': 'pxl.read = function(a) { return a._count; };\n'
  }, ['_count']));

check('refuses a field without _ used only in its own file', () =>
  expectProblems({ 'a.js': 'pxl.A = class A { constructor() { this.count = 0; } get() { return this.count; } };\n' }, ['rename it to _count']));

check('accepts _fields kept in their file and shared fields used elsewhere', () =>
  expectProblems({
    'a.js': 'pxl.A = class A { constructor() { this._own = 0; this.shared = 1; } };\n',
    'b.js': 'pxl.read = function(a) { return a.shared; };\n'
  }, []));

check('the engine sources pass the checks', () => {
  const problems = checkSources(readSources());
  if (problems.length > 0) throw new Error(problems.join('; '));
});

// --- Build output up to date ---

check('dist/pxl.js matches the sources in js/ (run node build.js after changing js/)', () => {
  const expected = bundleSource(readSources());
  for (const file of ['dist/pxl.js', `dist/kilopixel-v${VERSION}.js`]) {
    if (read(file) !== expected) throw new Error(`${file} is not the current build of js/`);
  }
});

// An import during server-side rendering runs the bundle in Node, without window (framework plan §19.2, W8)
check('the bundle loads without a browser (server-side rendering) and defines nothing', () => {
  for (const file of ['dist/pxl.js', 'dist/pxl.min.js']) {
    const sandbox = { console };
    require('vm').runInNewContext(read(file), sandbox, { filename: file });
    if ('pxl' in sandbox) throw new Error(`${file} defined pxl without a window`);
  }
});

check('the minified copies in dist/ and docs/ are identical', () => {
  const minified = read(`dist/kilopixel-v${VERSION}.min.js`);
  for (const file of ['dist/pxl.min.js', 'docs/js/pxl.min.js', 'docs/download/pxl.min.js']) {
    if (read(file) !== minified) throw new Error(`${file} differs from dist/kilopixel-v${VERSION}.min.js`);
  }
});

// The files in a zip archive as { name: Buffer }, without packages: the central directory at the end lists every
// entry with its real sizes (zip tools may write them only after the data) and where its local header starts.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); // end of central directory
  if (end === -1) throw new Error('not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let p = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28), extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32), local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    if (method === 8) files[name] = zlib.inflateRawSync(data);
    else if (method === 0) files[name] = data;
    else throw new Error(`${name}: compression method ${method}`);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// build.js writes the starter kit from docs/download/index.html and the minified bundle; a build without engine
// changes only changes the zip's file times, so restoring it from git is tempting, and wrong after an engine change
check('the starter kit zip contains the current pxl.min.js and index.html', () => {
  const files = readZip(fs.readFileSync(path.join(ROOT, 'docs/download/kilopixel-boilerplate.zip')));
  const expectedHtml = read('docs/download/index.html').replace('src="pxl.min.js"', 'src="js/pxl.min.js"');
  const wrong = [];
  if (!files['js/pxl.min.js']) wrong.push('js/pxl.min.js missing');
  else if (!files['js/pxl.min.js'].equals(fs.readFileSync(path.join(ROOT, 'dist/pxl.min.js')))) wrong.push('js/pxl.min.js is not dist/pxl.min.js');
  if (!files['index.html']) wrong.push('index.html missing');
  else if (files['index.html'].toString('utf8') !== expectedHtml) wrong.push('index.html is not docs/download/index.html');
  if (wrong.length > 0) throw new Error(`${wrong.join('; ')} (run node build.js and commit the zip)`);
});

// --- Sizes in the docs (CLAUDE.md "File size after a build") ---

check('the sizes of pxl.min.js in installation.html and KILOPIXEL.md match the build', () => {
  const minified = fs.readFileSync(path.join(ROOT, 'dist/pxl.min.js'));
  const kb = Math.round(minified.length / 1024);
  const gzipKb = Math.round(zlib.gzipSync(minified, { level: 9 }).length / 1024);
  const wrong = [];
  const installation = read('docs/installation.html');
  if (!installation.includes(`(<code>pxl.min.js</code>, ~${kb}KB, ~${gzipKb}KB gzipped)`)) wrong.push(`installation.html section 1 text: ~${kb}KB, ~${gzipKb}KB gzipped`);
  if (!installation.includes(`Download pxl.min.js (~${kb}KB)`)) wrong.push(`installation.html download button: ~${kb}KB`);
  if (!read('.agents/KILOPIXEL.md').includes(`**Total Source**: ~${kb}KB minified`)) wrong.push(`KILOPIXEL.md header: ~${kb}KB minified`);
  if (wrong.length > 0) throw new Error(`expected ${wrong.join('; ')}`);
});

// Runs every check; returns { passed, total, failures: [{ name, error }] }
function runChecks() {
  const failures = [];
  for (const { name, fn } of checks) {
    try {
      fn();
    } catch (error) {
      failures.push({ name, error: error.message });
    }
  }
  return { passed: checks.length - failures.length, total: checks.length, failures };
}

module.exports = { runChecks };

if (require.main === module) {
  const { passed, total, failures } = runChecks();
  for (const { name } of checks) {
    const failure = failures.find((f) => f.name === name);
    console.log(`${failure ? '✗' : '✓'} ${name}${failure ? ` — ${failure.error}` : ''}`);
  }
  console.log(`Build checks: ${passed}/${total} passed`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}
