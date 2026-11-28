// Checks that the plans in design/ and .agents/TODO.md follow the "Plans and TODO" rule in .claude/CLAUDE.md
// (no dependencies). Usage: node tools/check_plans.js → lists problems and exits with 1 if there are any.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const problems = [];
const report = (file, line, message) => problems.push(`${file}${line ? ':' + line : ''}  ${message}`);

// =========================================================================
// Plans: status line, name, folder
// =========================================================================

const OPEN = ['💬 **Discussion**', '🟡 **Proposed**', '🟢 **Decided**'];
const CLOSED = ['✅ **Implemented**', '⚪ **Superseded by**', '⚪ **Dropped**'];
const NAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9_-]+_(plan|note)\.md$/;
// An implemented plan records what was really built in a "## N. Built (date)" section (rule 3). Plans whose status
// line dates the implementation before the rule are exempt: their builds are in git and KILOPIXEL.md.
const BUILT_RULE_DATE = '2026-11-21';
const BUILT_HEADING = /^##+ .*\bBuilt\b/m;
const STATUS_MAX = 200; // characters after "**Status**: "
const TODO_ITEM_MAX = 800; // characters per TODO item, heading included

// design/: active plans (each with a TODO item); design/ideas/: parked ideas (open, no TODO item);
// design/done/: implemented plans; design/archive/: superseded and dropped plans (a plan moves once, when it closes)
const FOLDERS = ['design', 'design/ideas', 'design/done', 'design/archive'];
const planFiles = FOLDERS.flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.md')).map(f => `${dir}/${f}`));
const folderOf = (file) => path.dirname(file);

const planStatus = {}; // file → 'open' | 'closed'
for (const file of planFiles) {
  const archived = file.startsWith('design/archive/');
  const folder = folderOf(file);
  const header = read(file).split('\n').slice(0, 15);
  const lines = header.map((text, i) => ({ text, n: i + 1 })).filter(l => l.text.includes('**Status**'));

  if (lines.length !== 1) {
    report(file, null, `${lines.length} status lines in the first 15 lines (expected 1)`);
    continue;
  }
  const { text, n } = lines[0];
  const word = [...OPEN, ...CLOSED].find(w => text.includes(`**Status**: ${w}`));
  if (!word) {
    report(file, n, 'status is not one of the six words');
    continue;
  }
  planStatus[file] = OPEN.includes(word) ? 'open' : 'closed';
  // History goes into the plan's "## Log", not into the status line (archived plans are history and exempt)
  const statusText = text.replace(/^- \*\*Status\*\*: /, '');
  if (!archived && statusText.length > STATUS_MAX) {
    report(file, n, `status line has ${statusText.length} characters (at most ${STATUS_MAX}): move the history into "## Log"`);
  }

  if (word === '⚪ **Superseded by**') {
    const target = (text.match(/Superseded by\*\* `([^`]+)`/) || [])[1];
    if (!target || !exists(target)) report(file, n, `"Superseded by" needs an existing plan in backticks (found: ${target || 'none'})`);
  }
  if (word === '✅ **Implemented**' && !archived) {
    const date = (text.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
    if (date === undefined) report(file, n, 'implemented without a date in the status line');
    else if (date >= BUILT_RULE_DATE && !BUILT_HEADING.test(read(file))) {
      report(file, null, 'implemented, but no "## N. Built (date)" section that records what was built');
    }
  }
  if (word.startsWith('⚪') && !archived) report(file, n, 'superseded or dropped plans belong in design/archive/');
  if (word === '✅ **Implemented**' && (folder === 'design' || folder === 'design/ideas')) {
    report(file, n, 'implemented plans belong in design/done/');
  }
  if (OPEN.includes(word) && (archived || folder === 'design/done')) {
    report(file, n, 'open plans belong in design/ (or design/ideas/ when parked)');
  }
  if (!archived && !NAME.test(path.basename(file))) report(file, null, 'name should be YYYY-MM-DD_<topic>_plan.md (or _note.md)');
}

// =========================================================================
// TODO.md: items, statuses, numbers, open plans
// =========================================================================

const TODO = '.agents/TODO.md';
const todo = read(TODO);
const todoLines = todo.split('\n');
const items = {}; // number → text of the item
let current = null;
todoLines.forEach((text, i) => {
  const heading = text.match(/^## (\d+)\. /);
  if (heading) {
    current = heading[1];
    if (items[current] !== undefined) report(TODO, i + 1, `item §${current} exists twice`);
    items[current] = '';
  }
  if (current) items[current] += text + '\n';
});

for (const [num, text] of Object.entries(items)) {
  const status = text.match(/\*\*Status\*\*: (.*)/);
  if (!status) report(TODO, null, `§${num} has no status line`);
  else if (!OPEN.some(w => status[1].startsWith(w))) report(TODO, null, `§${num}: status must start with 💬, 🟡 or 🟢 (open work only)`);
  const length = text.trimEnd().length;
  if (length > TODO_ITEM_MAX) report(TODO, null, `§${num} has ${length} characters (at most ${TODO_ITEM_MAX}): the details belong in the plan`);
}

const numbers = Object.keys(items).map(Number);
const nextFree = Number((todo.match(/next: §(\d+)/) || [])[1]);
if (!nextFree) report(TODO, null, 'header has no "next: §N"');
else if (numbers.some(n => n >= nextFree)) report(TODO, null, `"next: §${nextFree}" is not above the highest item (§${Math.max(...numbers)})`);

// Active plans have a TODO item; parked ideas (design/ideas/) don't need one
for (const [file, state] of Object.entries(planStatus)) {
  if (state === 'open' && folderOf(file) === 'design' && !todo.includes(file)) report(file, null, 'open plan without a TODO item');
}

// A bare §N in TODO.md is another item, unless it is a section of a plan ("plan §6", "note §7",
// "`file.md` §5", "ideas in §7") or has a decimal point (§7.4).
todoLines.forEach((text, i) => {
  for (const m of text.matchAll(/§(\d+)(\.\d)?/g)) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (m[2] || /(plan|note|`|in|next:|TODO) $/.test(before)) continue;
    if (items[m[1]] === undefined) report(TODO, i + 1, `refers to §${m[1]}, which is not an item`);
  }
});

// =========================================================================
// Paths, links and TODO numbers in all documents
// =========================================================================

const documents = [TODO, '.agents/KILOPIXEL.md', '.agents/ENGINE.md', '.claude/CLAUDE.md', 'docs/DOCS_STANDARDS.md', ...planFiles];
// Live documents: plans, agent and Claude files, tools. Archived plans are history, so only their
// links to other plans are checked. js/ and docs/ paths aren't checked: plans name files that don't exist yet.
const LIVE_PATH = /(?:^|[\s`(\[])((?:design|\.agents|\.claude|tools)\/[A-Za-z0-9_.\/-]+)/g;
const PLAN_PATH = /(?:^|[\s`(\[])(design\/[A-Za-z0-9_.\/-]+\.md)/g;
// Folders that exist only on some laptops (not in git): documents may name them, but they needn't exist here
const PER_MACHINE = ['.claude/worktrees'];

for (const file of documents) {
  const archived = file.startsWith('design/archive/');
  let inFence = false;
  read(file).split('\n').forEach((text, i) => {
    for (const m of text.matchAll(archived ? PLAN_PATH : LIVE_PATH)) {
      const p = m[1].replace(/[.,;:]+$/, '').replace(/\/$/, '');
      if (!p.includes('*') && !PER_MACHINE.includes(p) && !exists(p)) report(file, i + 1, `missing: ${p}`);
    }

    // Relative Markdown links, outside code blocks and inline code
    if (text.trimStart().startsWith('```')) inFence = !inFence;
    if (!inFence) {
      for (const m of text.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^(https?:|file:|mailto:)/.test(m[1])) continue;
        const target = path.join(path.dirname(file), m[1]);
        if (!target.startsWith('scratch') && !exists(target)) report(file, i + 1, `broken link: ${m[1]}`);
      }
    }

    // scratch/ is git-ignored and differs per laptop: a scratch file may only be named as history
    if (/scratch\/[A-Za-z0-9_*]/.test(text) && !text.includes('(not kept)')) {
      report(file, i + 1, 'links a scratch/ file: move it to design/prototypes/<plan>/ or mark it "(not kept)"');
    }

    if (file !== TODO) {
      for (const m of text.matchAll(/TODO(?:\.md)?`? §(\d+)/g)) {
        if (items[m[1]] === undefined) report(file, i + 1, `refers to TODO §${m[1]}, which doesn't exist (link the plan instead)`);
      }
    }
  });
}

// =========================================================================
// KILOPIXEL.md and ENGINE.md describe the current engine: no dates, no names the code doesn't have
// =========================================================================

const REFERENCES = ['.agents/KILOPIXEL.md', '.agents/ENGINE.md'];
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
  const p = `${dir}/${e.name}`;
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
  return /\.(js|html)$/.test(e.name) ? [p] : [];
});
const code = ['js', 'tools', 'tests'].flatMap(walk).map(read).join('\n') + read('build.js');
const inCode = (name) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(code);

for (const REFERENCE of REFERENCES) read(REFERENCE).split('\n').forEach((text, i) => {
  // Dates belong in the plans; a date inside a file name (design/2026-…_plan.md) is fine
  const date = text.replace(/[\w\/.-]*\d{4}-\d{2}-\d{2}_[\w.\/-]*/g, '').match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (date) report(REFERENCE, i + 1, `date ${date[0]}: history and measurements belong in the plans`);

  // Engine names in backticks (pxl.name, _field, name()) must exist in the code
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (m[1].includes('/')) continue; // a file path
    for (const n of m[1].matchAll(/\bpxl\.(_?[A-Za-z]\w*)|(?<![\w.])(_[A-Za-z]\w*)|\b([A-Za-z]\w*)\(\)/g)) {
      const name = n[1] || n[2] || n[3];
      if (name.length > 3 && !inCode(name)) report(REFERENCE, i + 1, `\`${name}\` doesn't exist in js/, tools/ or tests/`);
    }
  }
});

// =========================================================================
// Prototypes: one folder per plan, named like the plan without _plan / _note
// =========================================================================

const PROTOTYPES = 'design/prototypes';
if (exists(PROTOTYPES)) {
  const planNames = new Set(planFiles.map(f => path.basename(f).replace(/_(plan|note)\.md$/, '')));
  for (const dir of fs.readdirSync(path.join(root, PROTOTYPES))) {
    if (!planNames.has(dir)) report(`${PROTOTYPES}/${dir}`, null, `no plan with this name in ${FOLDERS.join('/, ')}/`);
  }
}

// =========================================================================
// Result
// =========================================================================

const open = Object.values(planStatus).filter(s => s === 'open').length;
console.log(`${planFiles.length} plans (${open} open), ${numbers.length} TODO items, ${documents.length} documents checked.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log('No problems.');
