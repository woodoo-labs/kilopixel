// Checks Kilopixel's TypeScript definitions (dist/types/) against the real framework types
// (design/done/2026-10-30_framework_compatibility_plan.md §27). Run by node tools/run_tests.js --types, or directly:
// node tests/types/check.js. Needs the packages of this folder: npm ci in tests/types (once per laptop).
//
// The definitions are copied into kilopixel/ here first (ignored by git): TypeScript resolves 'react', 'vue', … from
// the folder of the file that imports them, so they must sit inside the project, as they do in a user's project.
// Each fixture must compile; a @ts-expect-error (or @vue-expect-error) that finds no error is itself an error.
// svelte-check has no such comments in markup, so fixtures/svelte/Wrong.svelte must give exactly the expected errors.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.resolve(DIR, '..', '..');

// [line, start of the message] of every error Wrong.svelte must give, and no other
const SVELTE_EXPECTED = [[5, "Type '{ radius: number; }' is not assignable"], [6, "Type 'number' is not assignable"]];

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: DIR, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}

const tsc = (config) => () => run([path.join(DIR, 'node_modules/typescript/bin/tsc'), '-p', config]);

function svelte() {
  const result = run([path.join(DIR, 'node_modules/svelte-check/bin/svelte-check'), '--workspace', '.',
    '--tsconfig', './tsconfig.svelte.json', '--output', 'machine']);
  const errors = result.output.split('\n').filter((line) => / ERROR /.test(line));
  const wrong = [];
  for (const line of errors) {
    const match = line.match(/ERROR "([^"]+)" (\d+):\d+ "(.*)"$/);
    const file = match ? match[1].replace(/\\\\/g, '/') : line;
    const expected = match && file.endsWith('Wrong.svelte') &&
      SVELTE_EXPECTED.some(([row, text]) => Number(match[2]) === row && match[3].startsWith(text));
    if (!expected) wrong.push(`unexpected: ${line}`);
  }
  for (const [row, text] of SVELTE_EXPECTED) {
    if (!errors.some((line) => line.includes('Wrong.svelte') && line.includes(` ${row}:`) && line.includes(text))) {
      wrong.push(`missing: Wrong.svelte line ${row}, "${text}…"`);
    }
  }
  return { ok: wrong.length === 0, output: wrong.join('\n') };
}

const CHECKS = [
  ['kilopixel.d.ts without a framework (also Angular)', tsc('tsconfig.core.json')],
  ['kilopixel-react.d.ts, React 19 JSX', tsc('tsconfig.react.json')],
  ['kilopixel-preact.d.ts, Preact 11 JSX', tsc('tsconfig.preact.json')],
  ['kilopixel-solid.d.ts, Solid 2 JSX', tsc('tsconfig.solid.json')],
  ['kilopixel-vue.d.ts, Vue 3 templates (vue-tsc)', () => run([path.join(DIR, 'node_modules/vue-tsc/bin/vue-tsc.js'), '--noEmit', '-p', 'tsconfig.vue.json'])],
  ['kilopixel-svelte.d.ts, Svelte 5 (svelte-check)', svelte]
];

// Returns [{ name, ok, output }], or throws when the packages aren't installed
function runTypeChecks() {
  if (!fs.existsSync(path.join(DIR, 'node_modules', 'typescript'))) {
    throw new Error('the packages of tests/types/ are missing: run npm ci in tests/types');
  }
  const copy = path.join(DIR, 'kilopixel');
  fs.mkdirSync(copy, { recursive: true });
  for (const file of fs.readdirSync(path.join(ROOT, 'dist', 'types'))) {
    fs.copyFileSync(path.join(ROOT, 'dist', 'types', file), path.join(copy, file));
  }
  return CHECKS.map(([name, check]) => ({ name, ...check() }));
}

module.exports = { runTypeChecks };

if (require.main === module) {
  try {
    const results = runTypeChecks();
    for (const r of results) {
      console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
      if (!r.ok) console.log(r.output.split('\n').map((line) => `    ${line}`).join('\n'));
    }
    process.exitCode = results.every((r) => r.ok) ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
