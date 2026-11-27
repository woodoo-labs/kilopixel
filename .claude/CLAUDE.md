# Kilopixel

Declarative, reactive HTML5 Canvas engine built on Web Components (`<pxl-stage>`, `<pxl-layer>`, `<pxl-circle>`, …). Zero dependencies, one classic `<script>`, no build step for users.

**Pre-release:** nothing is published yet. Backwards compatibility is not required: prefer the cleanest API and implementation, and update affected docs pages and examples in the same change instead of keeping legacy code paths.

## Where Things Are

| Path | What |
|---|---|
| `.agents/KILOPIXEL.md` | Language reference: every element and attribute, expressions, interaction, as authors write them. Read it before docs or example work |
| `.agents/ENGINE.md` | Engine internals: source files, compiler, reactivity, the frame, drawing, hit testing, build, and the checklist for adding an attribute. Read the relevant sections before engine work |
| `.agents/TODO.md` | Roadmap: planned work only, one short item each |
| `js/` | Engine source. Build order is the `files` list in `build.js` |
| `docs/` | Public documentation site, published by GitHub Pages from `main` on every push (work in progress on `main` is public). Rules: `docs/DOCS_STANDARDS.md` |
| `design/` | Plans and notes, named `YYYY-MM-DD_<topic>_plan.md` (or `_note.md`): active plans in `design/`, parked ideas in `design/ideas/`, implemented plans in `design/done/`, superseded, dropped and replaced plans in `design/archive/` ("Plans and TODO" below). `design/prototypes/<plan>/`: prototypes and measurement scripts a plan relies on (committed; folder named like the plan without `_plan` / `_note`) |
| `tests/` | Automated tests (`design/done/2026-11-15_testing_plan.md`), all on the shared `runner.js`: `unit.html` (pure functions, Rule A for every attribute), `index.html` (engine, interaction, lifecycle), `render.html` (pixel probes), `frameworks.html` (the DOM contract frameworks use, framework plan §11; `test.known()` for events and properties until they are built), `scaling.html` (cost ratios n vs. 2n, or n vs. 4n for work that must not depend on the scene's size; slow); `smoke/`: framework smoke pages (React, Vue, Tailwind from CDNs, `tests/smoke/README.md`), only with `--smoke`; `types/`: the TypeScript definitions against the real framework types (npm, `tests/types/README.md`), only with `--types`. In the browser via the dev server (`http://localhost:8124/tests/`, `?grep=text` for a subset); result in the tab title and `window.kilopixelTests` |
| `tools/run_tests.js` | Runs the build checks (`tools/check_build.js`: the checks of `build.js`, build output and starter-kit zip up to date, sizes in the docs), all test pages headless, and the sweep of every docs and example page for console messages (needs Chrome or Edge; Node 22+ for the fast sweep). `--smoke` runs the framework smoke pages instead (needs internet; never in the normal run or CI); `--types` the TypeScript checks (`npm ci` in `tests/types/` first) |
| `examples/test*.html` | Manual demo and test pages |
| `scratch/` | Temporary files, gitignored, different on each laptop; may be emptied at any time |
| `dist/` (also `dist/types/`), `docs/js/pxl.min.js`, `docs/download/*` (also `docs/download/types/`) | **Build output.** Never edit by hand; they are committed. Exception: `docs/download/index.html` is the starter kit source, from which `node build.js` makes the zip |

## Workflow

- **Approval before edits:** before changing any project file outside `scratch/`, describe what you will change and wait for an explicit OK. A code preview is not required. Reading, searching, running the dev server and writing to `scratch/` need no approval.
- **Build:** run `node build.js` after changing anything in `js/` (not after `.html` / `.md`-only changes). It runs Terser through `npx`; never install packages locally or create `node_modules` (use `npx` or a global install). The one exception: the test projects `tests/types/` and `tests/smoke/<app>/` have their own `package.json` and committed `package-lock.json`; their `node_modules` (ignored by git) is installed there with `npm ci`, never elsewhere. Add or update a package there only with the user's OK, and commit the lock file. A build rewrites `dist/`, the `docs/` copies of `pxl.min.js` and the starter-kit zip: commit them together, and after a build that changed `js/` don't restore any of them from git (the zip contains `pxl.min.js`; `tools/check_build.js` checks all of them).
- **File size after a build:** update the `~NNKB` size of `pxl.min.js` (the build's "Minified size", rounded to whole KB) in `docs/installation.html` (section 1 text and download button) and in the header line of `.agents/KILOPIXEL.md`, and the `~NNKB gzipped` size (the build's "Gzipped size") in the section 1 text of `docs/installation.html`. `tools/check_build.js` fails until they match.
- **Keep the reference in sync:** when engine behavior or an attribute changes, update `.agents/KILOPIXEL.md` (what authors see) and `.agents/ENGINE.md` (how the engine does it) in the same change, plus the affected docs pages and examples. Each fact is stated once, in one of the two.
- **Plan bigger changes first:** for non-trivial engine work, write a plan in `design/` and agree on it before implementing.
- **Plans and TODO:** a plan's status line comes right after its title: `- **Status**: 🟡 **Proposed** (date of the last change, one short clause)`, at most 200 characters. Its history goes into a `## Log` section at the end of the plan (newest first, one line per change), not into the status line. Six words only:
  - 💬 **Discussion**: ideas, nothing decided
  - 🟡 **Proposed**: complete plan, waiting for a decision
  - 🟢 **Decided**: agreed, not built yet
  - ✅ **Implemented**
  - ⚪ **Superseded by** `<file>`
  - ⚪ **Dropped**: decided not to do it. Never use it for "not built yet" (that is 🟡 or 🟢).

  The folder follows the state: `design/` holds active plans (💬 🟡 🟢), each with a TODO item; `design/ideas/` parked ideas (💬 🟡) without a TODO item (picking one up moves it to `design/` and adds the item); `design/done/` implemented plans (✅) whose design still describes the engine; `design/archive/` superseded and dropped plans (⚪) and implemented plans whose design later work replaced.

  `.agents/TODO.md` lists planned work only, one short item each (title, status, plan, one or two lines on what is next or open; at most 800 characters): the details belong in the plan. A plan and its TODO item change together:
  1. **New plan** (`YYYY-MM-DD_<topic>_plan.md` or `_note.md`): 🟡 or 💬 in `design/`, plus a TODO item with the next free number; or in `design/ideas/` without one.
  2. **Decided:** 🟢 in both.
  3. **Implemented:** ✅ in the plan, which moves to `design/done/` (fix the links to it, also in `js/` and `tests/` comments); remove the TODO item, or keep it with only what is left (e.g. docs). The plan gets a section `## N. Built (YYYY-MM-DD)` (a step of a larger plan: `## N. Step 2 Built (…)`), and the status line points to it. It records what was really built: files, functions and attributes; every deviation from the plan, with the reason; decisions made during the build; tests and measurements; what is left. The plan keeps why and how it was decided; `.agents/KILOPIXEL.md` describes the current engine. `tools/check_plans.js` checks for the heading (plans implemented before 2026-11-21 are exempt).
  4. **Replaced or dropped:** ⚪ in the plan, move it to `design/archive/` and fix the links to it, remove the TODO item. An implemented plan moves there too once later work replaced its design (renamed attributes alone don't count).
  5. **Removing or merging a TODO item:** its number stays free; remove every reference to it (link the plan instead); move ideas that are still open into another item or plan.
  6. **Housekeeping, with every built step and every status change:** nothing that describes the current state may contradict it. Search for the names, attributes and decisions the change removed, renamed or settled (`git grep` over `.agents/`, `design/`, `tests/`, `docs/`, `examples/`; not `design/done/`, `design/archive/` or `design/prototypes/`, which are history) and fix, in the same change:
     - the plan's own older sections that the build contradicts (decisions table, phases, estimates, risks, performance): a dated note pointing to the new section; the old text stays as history;
     - open decisions the build settled: decided or built, in the plan and in its TODO item;
     - `.agents/KILOPIXEL.md` and `.agents/ENGINE.md` ("Keep the reference in sync"), TODO items, test page introductions and section comments, docs and examples that describe the old behavior;
     - other open plans (also in `design/ideas/`) that describe the old code or design: one line in their `## Log` (create the section at the end if it is missing), e.g. `- 2026-11-20: X built; §3.5 describes the old code`. Don't rewrite their bodies: a plan is brought up to date when it is picked up;
     - implemented plans whose design the change replaced: archive them (rule 4) and fix the links to them.

  **KILOPIXEL.md and ENGINE.md describe the current engine only:** no dates, no "before / now" history, no series of measurements. Why and how something was decided, and the measurements, stay in the plans, linked as "Design: `design/…`"; a cost that guides usage may stay as one number.

  Then run `node tools/check_plans.js`; it must report no problems. It also checks the status line length, the TODO item length, and that KILOPIXEL.md and ENGINE.md have no dates and name only engine functions and fields that exist in `js/`.
- **Verify in the browser:** the dev server is `node tools/serve.js` (launch config `kilopixel`, http://localhost:8124, `/` redirects to `/docs/`). Check docs pages and `examples/` there, including the console. A hidden browser pane pauses animation frames and may not take screenshots: run tests with `node tools/run_tests.js`, check one page's console headless with `node tools/run_tests.js --page docs/x.html`, and use the pane for looking at pages.
- **Processes:** never stop processes by name (`taskkill /IM`, `pkill`): the user's own browser and tools run on the same machine. Stop only processes you started, by their id or through the tool that started them.
- **Tests:** after every engine change and build, run `node tools/run_tests.js --tests` (build checks and the quick test pages, headless, a few seconds); all tests must pass. Before a commit, run `node tools/run_tests.js` (also the scaling page and the sweep of all docs and example pages: no console messages). GitHub Actions runs the full run on every push.
  - Every engine fix gets a test (committed, unlike `scratch/`).
  - A new attribute gets tests for its default, an empty value, a removed value and its main effect.
  - A bug found but not fixed gets a `test.known()`: it shows as "known" until the fix makes it pass, then it fails the run until it is changed to `test()`.
  - After changes to interaction (events, hit testing, cursor) or to properties, also run `node tools/run_tests.js --smoke` (the framework pages in `tests/smoke/`; needs internet) and try one smoke page with the real mouse in the visible browser pane: frameworks have rules of their own that the scripted checks can miss (React's `onPointerEnter`, found that way).
- **Line endings:** LF everywhere, set by `.gitattributes`. Don't change it per file.
- **Temporary files** (helper scripts, dumps, screenshots, visual prototypes) go in `scratch/`, not the project root. Don't delete them afterwards; the user cleans up. Nothing in `scratch/` must be needed later: it is git-ignored and differs between the two laptops.
- **Prototypes worth keeping:** when a prototype or measurement script supports a plan, copy it to `design/prototypes/<plan>/` in the same change (paths inside it: absolute dev-server paths like `/dist/pxl.js`; Node scripts reach the repo with `../../../`). Plans, TODO and KILOPIXEL.md link only committed files; a `scratch/` file may only be named as history, marked "(not kept)" (`tools/check_plans.js` checks both). Old engine builds aren't copied: name the commit (`git show <commit>:dist/pxl.js`). Also use `design/prototypes/` for work in progress the user needs on the other laptop.
- **Commits:** only when asked. Conventional style `type(scope): summary`, e.g. `feat(polyline): …`, `fix(arrows): …`, `docs(circle, ellipse): …`, `docs(design): …`, `refactor(engine): …`.
- **Branches:** work happens on `main` (the user checks the docs site on other devices, and GitHub Pages publishes only `main`). Before a risky experiment, save the state as a pushed branch `snapshot/YYYY-MM-DD` (exists: `snapshot/2026-11-15`); a large experiment can also live on its own pushed branch, viewed through the dev server.

## Working on Another Machine

The user works on two Windows laptops. When a session starts on a machine that hasn't pulled for a while, or when the user asks to sync:
1. `git fetch --prune` and `git status`; show what's new and pull only after the user's OK. Then `git branch -vv`: local branches marked `gone` were deleted on GitHub (from the other laptop); delete them (`git branch -D`) only after the user's OK.
2. **Line endings, once per machine:** if `git ls-files --eol` shows working files as `w/crlf`, the copy predates `.gitattributes`. With no uncommitted work, rewrite them once: `git rm -r --cached -q . && git reset -q --hard HEAD`.
3. If a `package-lock.json` in `tests/types/` or `tests/smoke/<app>/` changed in the pull (or `node_modules` is missing there), run `npm ci` in that folder.
4. Run `node tools/run_tests.js`; it must end with "All passed." (It starts the dev server itself if needed. The machine needs Chrome or Edge, and Node 22 or later for the fast page sweep; older Node works, the sweep is just slower.)

Only git syncs. `scratch/`, `.claude/worktrees/` and Claude's memory are per machine: rules that must hold on both laptops go in this file, not in memory.

## Working Style

- **Pragmatic over engineered:** measure before optimizing (e.g. a micro-benchmark against the 16.7 ms frame budget) and judge edge cases by whether real users would hit them. Lead with real bugs and cheap, high-impact fixes; label micro-optimizations as such; give a concrete use case when proposing an API change.
- **Show, don't only tell:** for geometry and visual questions, build a small prototype page in `scratch/` and show it in the browser. The user understands faster from pictures.

## Engine Code Rules

- **Only `pxl` is global.** Classes are expressions on the namespace (`pxl.Line = class Line extends pxl.Shape`); internals go on `pxl._*`. `build.js` refuses top-level `class` / `const` / `let` / `var` / `function`.
- **Zero allocations in per-frame paths:** pre-allocated records and typed arrays, as in the existing shapes.
- **No defensive fallbacks** for attribute values (`alpha !== undefined`, `shadowblur || 0`): every attribute is initialized from `static defaults`.
- **Used through HTML and the DOM:** authors use Kilopixel through HTML and the standard DOM (attributes, properties, events: `setAttribute()`, `el.r = 50`, `addEventListener()`); a feature for using a scene adds no Kilopixel-specific JavaScript calls (handlers assign: `ref.box.r += 10` does what `el.r += 10` does). The only JavaScript API is for extending Kilopixel: custom shapes (`pxl.Shape`, `pxl.defineShape()` and the members listed in `.agents/KILOPIXEL.md` §12). The expression language (`wave()`, `toLocal()`, `ref.*`) is the language inside attributes, not a JavaScript API.
- **Public vs. internal:** some behavior in the references is internal on purpose (e.g. `ref.<id>.pN`). Don't document it in `docs/` unless the user decides to.

## Engine Code Style

Decided 2026-10-27 (`design/done/2026-10-27_engine_cleanup_inventory_note.md` §2). The newest code (`line.js`, `polyline.js`, `matrix.js`) is the reference.

- **`pxl.` inside namespace functions:** `pxl.*` functions refer to other parts as `pxl.x`, never `this.x` (works when a function is passed around). Class and object methods use `this` as usual.
- **Fields in the constructor:** every field an object will ever have is set in its constructor (stable hidden classes, one place to see the state). State that a class caches belongs to that class: code in other files doesn't write it (e.g. `applyLineDash()` and `resolveFilter()` are methods, not `pxl.*` helpers).
- **Leading `_` = ownership** (decided 2026-10-28): a field with `_` is read and written only in the file that declares it; a field without `_` is also used by another engine file. `_` isn't about users (what custom shapes may use is the list in `.agents/KILOPIXEL.md` §12, not every field without `_`): it tells the reader of the engine whether changing a field affects other files. `build.js` checks both directions by name (equal names in different classes count together) and names each field that breaks the rule. In the `pxl` namespace, `pxl._x` is mutable internal data (registries, scratch matrices, hit state); functions, classes and constants have no `_`.
- **Invalid user values:** guard only where an invalid value would throw or freeze (e.g. `step <= 0` in the grid), with a short comment. Otherwise no guard (an invalid value may simply draw nothing).
- **Reuse helpers instead of repeating checks:** `pxl.sortByDOMPosition`, `pxl.rewriteExpression`, `pxl.hasLineDash`, `hasFill()` / `isStroked()`, `pxl.arcEndRadians`.
- **Comments explain why**, in plain sentences. No history (git has it), no CAPS labels, no "zero-GC" / "highly optimized" tags; mention allocation only where the choice isn't obvious. Sections: `// ===` banners between top-level parts of a file, `// --- Section ---` inside classes and long methods.
- **Formatting:** 2 spaces, single quotes, `function(` without space, camelCase. `observedAttributes` / `defaults` longer than ~120 characters are split over lines, grouped like the KILOPIXEL.md tables. Deliberate alignment (`if (prop === 'x')      return …`) is fine; there is no auto-formatter. `.editorconfig` sets indentation, LF and trimming; `build.js` refuses trailing whitespace and fields that break the underscore rule.

## Documentation Pages

- Read `docs/DOCS_STANDARDS.md` before creating or changing a docs page, and follow it (layout, colors, IDs, snippet formatting, no inline styles, neutral tone).
- The newest pages are the reference implementations: `polyline.html`, `circle.html`, `ellipse.html`, `line.html`.
- Ask before adding new CSS rules to `docs/css/docs.css`.

## English & Language Coach

Always answer in English, also when a message arrives in another language (e.g. the app's Commit button sends a German prompt). Code, comments, commit messages and project files are in English anyway.

The user is improving their English. Unless paused, start each response with a short **English & Phrasing Notes** section: noticeable typos, grammar fixes and more natural phrasing from the user's last message. Skip it when there is nothing worth noting. If the user asks to pause it, leave it out until they ask to resume.
