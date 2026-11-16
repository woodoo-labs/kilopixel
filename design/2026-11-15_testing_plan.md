# Testing: Levels, a Headless Runner and the Missing Cases

- **Status**: 🟢 **Decided** (2026-11-16, D1–D6 decided, D2 changed after measuring; steps 1–2 built, §12; steps 3–6 not built)
- **Date**: 2026-11-15
- **Related**: `design/2026-10-30_framework_compatibility_plan.md` (§11 conformance tests, §19.4 order: its quick fixes get their tests from this plan), `.claude/CLAUDE.md` (Workflow: "Tests", "Verify in the browser")
- **Target Implementation**: `tools/run_tests.js` (built), `tests/runner.js` (built), `tests/index.html` (moved onto the runner), `tests/unit.html` and `tests/render.html` (new), `tests/frameworks.html` (from the framework plan), `.claude/CLAUDE.md` (Workflow, built), `.github/workflows/tests.yml` (built)
- **Prototype**: `design/prototypes/2026-11-15_testing/headless_probe.js` (engine tests and page sweep in headless Chrome, no npm packages, §5.1; the first version of `tools/run_tests.js`)

---

## 1. Today

- **`tests/index.html`: 90 tests, all passing.** Almost every test was written for a fix or a plan (toLocal, safe render, two-phase frame, stage sizing, text box, ref cycles). Areas that never needed a fix have no tests. Per topic (2026-11-15): safe render 12, toLocal 11 (+5 decomposition / zoom / clone), text box 7, stage sizing 7, ref cycles 6, two-phase frame 5, stroke gradient 4, stage variables 4, layer fast path 4, others 1–3.
- **Not tested at all, or almost** (counted in the test file):

  | Area | Mentions |
  |---|---|
  | Compiler: how a string is classified (number, word, expression, animated, reactive) | 4 |
  | Empty / removed attributes (Rule A) | 2 (`removeAttribute`) |
  | `isPressed`, click / down / up handlers, cursor | 0 |
  | Time drivers, `time()` | 0 |
  | `conic()`, `radial()` keywords | 0 / 1 |
  | `anchor`, `reveal`, `blend`, `mask` | 0 each |
  | Arrowheads, `linedash` | 2 each |

- **Runner:** a loop over `tests`, results in a table, the title (`Tests: 90/90 passed`) and `window.kilopixelTests`. No timeout per test (a hanging async test stops the whole run), all tests share one page and its stages, and several wait for real frames (`wait()`, `sampled()`), so they fail when the browser pane is hidden (seen in the framework prototypes, `design/2026-10-30_framework_compatibility_plan.md` §3).
- **Manual pages:** `examples/test*.html` (57 pages in `examples/`) and the docs are checked by hand in the browser; nothing checks them automatically.

## 2. Goals

1. **One command** runs everything and says pass or fail, on both laptops, for the user and for Claude, without the browser pane.
2. **Every public attribute** has tests for its default, an empty value, a removed value and its main effect.
3. **Deterministic:** time is driven by the test (`stage.render(t)`), not by real frames; no test depends on timing or on the pane being visible.
4. **Fast:** the engine tests in seconds; the page sweep in under a minute.
5. **No npm packages** in the repository (CLAUDE.md): only Node and a local Chrome or Edge.
6. **Known bugs are visible** as tests before they are fixed.

## 3. Test Levels

| Level | Tests | Page | Examples |
|---|---|---|---|
| 1. Unit | pure functions, as tables of inputs and expected results | `tests/unit.html` (new) | `pxl.parseAttributeValue`, `pxl.compileExpression` flags, `pxl.resolveRadius`, `pxl.parsePointsIntoArray`, `pxl.parseStops`, `pxl.Matrix`, `pxl.toLocal` on fixed matrices, `pxl.scaleResponsiveFilter`, drivers, `pxl.hasLineDash`, `pxl.arcEndRadians` |
| 2. Engine | lifecycle, reactivity, frame pipeline, interaction with synthetic pointer events | `tests/index.html` (exists) | press / click / leave sequences, handler registration, move between layers, reconnecting a stage, Rule A for every attribute |
| 3. Rendering | pixel probes at chosen points of a fixed-size stage | `tests/render.html` (new) | pie vs. ring vs. chord, rect anchors and corner radii, arrowhead tips, gradient colors near the edges, `reveal`, `mask`, `linedash` gaps |
| 4. Frameworks | the DOM contract | `tests/frameworks.html` (framework plan §11) | late `id`, insert / move / remove, events, properties |
| 5. Page sweep | every docs and example page loads without console messages | `tools/run_tests.js` | measured clean on 2026-11-15 (§5.1) |
| 6. Scaling | cost ratios, not absolute times | the runner or a level-2 page | removing 2,000 elements takes at most ~3× as long as 1,000 (today 7×, framework plan §19.1) |

Unit tests run in the browser too: the bundle needs `HTMLElement` and `customElements` when it loads, so a Node-only run would need a DOM shim (a dependency).

## 4. Runner Page Improvements

Shared by all test pages (a small `tests/runner.js`, loaded by each page):

- **Timeout per test** (default 5 s): a hanging test fails with "timeout" and the run goes on.
- **Fresh state per test:** `withStage(html, fn)` exists (stage sizing tests); every new test uses it, so a test leaves nothing behind, also when it fails (`finally`).
- **Time from the test:** `stage.render(t)` with a fixed `t` instead of `wait()` for frames. Existing tests that wait are moved over when touched; tests that really need the browser's frames (resize, IntersectionObserver) stay, and the headless run gives them virtual time (§5).
- **`test.known(name, fn)`** for a documented open bug: shown as "known" (not counted as a failure); when it starts passing, it is shown as "fixed, switch to `test()`", so the fix can't go unnoticed.
- **`?grep=toLocal`** runs the tests whose names contain the text; the title says how many ran.
- **Sections** (`section('Interaction')`) with their own counts in the results table.
- **Results as JSON** in `window.kilopixelTests` (exists) and in a `<script type="application/json" id="test-results">` element at the end, which the headless runner reads from the DOM.
- **Generated tests:** for each element class, loop over `observedAttributes` and `static defaults` (Rule A: bare, removed, invalid type), so a new attribute is tested without writing a test for it.

## 5. Headless Runner (`tools/run_tests.js`)

### 5.1 Measured with the Prototype (2026-11-15)

`design/prototypes/2026-11-15_testing/headless_probe.js` starts Chrome with `--headless=new --virtual-time-budget=… --dump-dom` for each page and reads console messages from `--enable-logging=stderr`:

| Run | Result | Time |
|---|---|---|
| `tests/index.html` | 90/90 passed | 0.7 s (virtual time: the waits of 300 ms to 2.2 s pass instantly) |
| Page sweep, 79 pages (`docs/`, `examples/`) | 0 pages with console messages | 81 s (one Chrome start per page, about 1 s each) |
| A probe page with a warning and an uncaught error | both reported | — |

### 5.2 Design (as built, §12)

- **Finds the browser** (Chrome, then Edge; paths for Windows, macOS, Linux; `PXL_BROWSER` overrides) and uses temporary profiles (never the user's).
- **Starts the dev server** if `http://localhost:8124` doesn't answer, and stops it at the end.
- **Test pages** (every `tests/*.html`): one browser process per page with `--virtual-time-budget` and `--dump-dom`, as in the prototype. The page's report comes from `<script id="test-results">` in the dumped DOM. Timers and frames run on virtual time: the waits in the tests cost no real time, and the result doesn't depend on a visible window.
- **Page sweep** (every `docs/*.html` and `examples/*.html`): one browser with 6 tabs over the Chrome DevTools Protocol (Node's built-in `WebSocket`, Node 22 and later), in real time: each tab loads a page, runs 1.5 s after the load event, and reports console calls, uncaught errors and failed requests. Network errors (`net::ERR_…`) for files on other servers (cdnjs, jsDelivr, Google Fonts) are a note, not a failure: without internet every docs page has them. HTTP errors such as a 404, and every failed request to the dev server, stay failures. Without `WebSocket` (older Node) the sweep falls back to one process per page, which sees console messages and uncaught errors but not failed requests.
- **Options:** `--tests`, `--sweep`, `--page <path>` (sweep one or more pages), `--grep <text>`, `--repeat <n>` (finds flaky tests), `--verbose`. Exit code 0 (all passed), 1 (failures), 2 (setup problem).
- **Changed from D2 as first decided** (one browser for everything, virtual time over the protocol), after measuring on 2026-11-16 (§12): with a virtual-time policy set over the protocol (`Emulation.setVirtualTimePolicy`, with or without `waitForNavigation`), the page never loaded; the command-line flag works. And browser processes start one after another on Windows: 6 at once took as long as 6 in a row (empty pages: 4.1 s), so the sweep over processes stayed at 81–91 s even in parallel. Tabs in one browser load in parallel: 25 s.

### 5.3 In the Workflow

- CLAUDE.md "Tests": after every engine change and build, `node tools/run_tests.js --tests`; before a commit, `node tools/run_tests.js`; the browser stays the tool for looking at pages.
- "Working on Another Machine", step 3: `node tools/run_tests.js`.
- GitHub Actions (D4): `.github/workflows/tests.yml` runs `node tools/run_tests.js` on every push and pull request (Chrome is preinstalled on GitHub's Ubuntu machines; the runner adds `--no-sandbox` only when `CI` is set, because those machines don't allow Chrome's sandbox).
- **Both laptops:** nothing to sync beyond git. Each needs Chrome or Edge (Edge comes with Windows) and Node; Node 22 or later for the fast sweep (this laptop: Node 24; the other laptop: check with `node --version`).

## 6. Missing Cases, by Area

| Area | Level | Cases |
|---|---|---|
| Compiler | 1 | words, numbers (`.5`, `-0`, `1e3`), hex colors, static `rgb()`, quoted strings, template literals, `t` alone, drivers, `ref.*`, `toLocal(`, `return` code blocks, CSS `%` inside functions; the flags `isTimeDependent`, `variableDependencies`, `usesToLocal`; the known string-literal problems of TODO §34 as `test.known` |
| Rule A | 2 | every observed attribute of every element: bare, removed, `hidden="false"`, boolean presence rule, `<pxl-var value="">` |
| Interaction | 2 | enter / leave / down / up / click order, `isPressed` while pressed and after release outside, auto-registration by a reader added before and after the shape, lazy unregister, sticky ids, cursor for clickable vs. hover-only, hidden shapes not hit, handler errors (exists) |
| Lifecycle | 2 | move a shape between layers and groups, remove and re-insert a stage (resize, animation resumes), elements added in a handler, `cloneNode()`, late `id` and renamed `id` (`test.known` until the framework plan's step 1) |
| Time | 1, 2 | each driver at chosen `t` (`loop`, `yoyo`, `wave`, `bounce`, `strobe`, `glide`, `pulse`, `glitch`), `time()` units against a fixed `Date` |
| Shapes | 3 | circle: full, arc, pie, ring, ring wedge, chord, `anticlockwise`; ellipse the same with `irx` / `iry`; rect: 9 anchors, `r` and `r1`–`r4`, negative radii; line / polyline: arrowheads (both styles, caps), `smooth`, `relative`, `closed`; text: `align`, `baseline`, wrap, `reveal`, `maxwidth`; grid: `step`, `major`, `labels` |
| Paint | 3 | `linear()` angle and vector, `radial()` 1 / 3 / 6 values and every keyword, `conic()`, stops clamped, stroke gradient on a line; `linedash` forms (array, number, `none`, removed), `dashoffset`; `blend`, `mask`, `alpha`, shadows, `filter` scaling |
| Layers | 2, 3 | CSS compositing (`opacity`, `mix-blend-mode`, `lighter` → `plus-lighter`, `filter`), `hidden`, fast path (exists), DPR changes |
| Stage | 2 | `ratio` (expression, bare, removed), `height`, `alwaysrender`, IntersectionObserver pause and resume, fallback width (exists) |
| Monitor | 2 | `fps` 0 when idle (exists), published once per second |
| Scaling | 6 | removal of elements with readers, `setAttribute` with readers, hit testing with many interactive shapes, compile cache size |
| Build | Node | `build.js` refuses a top-level declaration, trailing whitespace and an underscore-rule violation (fixture files in `tests/build/`) |

## 7. Rendering: Probes, Not Golden Images

- **Probes:** a stage with a fixed size (e.g. 500 × 300 px), `devicePixelRatio` set to 1 for the test, frames driven with `stage.render(t)`; the test reads `getImageData()` at chosen points (inside, outside, on the edge with a margin) and compares alpha and color with a tolerance. `alphaAt()` exists in `tests/index.html` (layer canvas tests).
- **Why not golden images first:** anti-aliasing differs between GPUs, Chrome versions and operating systems, so whole-image comparisons need tolerances and new reference images after browser updates. Probes test the geometry that matters and are stable.
- **Golden images later, if needed** (D3): a few complex scenes, compared with a per-pixel tolerance in the browser (reference PNG drawn into a canvas, no Node packages).

## 8. Scaling Checks

Absolute times differ between the two laptops and between runs (±30 %, per-frame plan §5). The checks compare the cost at n and 2n in the same run: linear code stays below ~3×, quadratic code reaches ~4× or more (removal today: 54 ms for 1,000, 374–389 ms for 2,000, framework plan §19.1). Each check runs a few times and uses the median.

## 9. Rules for CLAUDE.md (D5)

- Existing: "Every engine fix gets a test."
- New: "A new attribute gets tests for its default, an empty and a removed value, and its main effect (level 2 or 3)."
- New: "A bug found but not fixed gets a `test.known()`."
- Changed: "Engine tests" (now "Tests") and the sync check use the runner.

All four are in CLAUDE.md since step 2 (§12).

## 10. Steps

| # | Step | Size | State |
|---|---|---|---|
| 1 | `tests/runner.js` (timeout, sections, `test.known`, `?grep`, JSON results); `tests/index.html` moved onto it unchanged | 1 session | built 2026-11-16 |
| 2 | `tools/run_tests.js` (test pages, sweep, exit code); CLAUDE.md workflow; GitHub Actions (D4) | 1 session | built 2026-11-16 |
| 3 | `tests/unit.html`: compiler tables, drivers, radii, points, matrices, filters; the generated Rule A sweep | 1 session | |
| 4 | Interaction and lifecycle tests, the known bugs of the framework review as `test.known` | 1 session | |
| 5 | `tests/render.html`: probes per shape and paint feature | 1–2 sessions | |
| 6 | Scaling checks; build checks | 1 session | |

Step 4 overlaps with the framework plan's quick fixes (§19.4 step 1): its `test.known` tests become their acceptance tests. Steps 1–2 come first, because everything after them runs through them.

## 11. Decisions

Decided 2026-11-16, as recommended; D2 changed after measuring (§5.2).

| | Question | Decided |
|---|---|---|
| D1 | One test page per level, or everything in `tests/index.html`? | One page per level with a shared `tests/runner.js`: smaller files, and a failing page doesn't hide the others |
| D2 | Headless: one Chrome per page, or one Chrome over the DevTools protocol? | Decided first: the protocol for everything. Built: test pages one process per page on virtual time (the protocol's virtual time didn't load pages), the sweep in 6 tabs of one browser over the protocol (processes don't start in parallel); §5.2 |
| D3 | Golden images? | Not now; probes first (§7) |
| D4 | GitHub Actions on every push? | Yes, built with step 2 |
| D5 | The CLAUDE.md rules of §9? | Yes, built with step 2 |
| D6 | Run the page sweep on every engine change, or only before a commit? | Before a commit and in CI; the test pages after every build |

## 12. Steps 1–2 Built 2026-11-16

- **`tests/runner.js`:** `test()`, `test.known()`, `section()`, `wait()`, `runTests()`; a timeout per test (5 s, `test(name, fn, { timeout })`); `?grep=` on names and sections; results in the table (with section rows), the title (`Tests: N/N passed`, plus `, K known`), `window.kilopixelTests` (`passed`, `total`, `known`, `ok`, `results` with `status` and `ms`) and `<script type="application/json" id="test-results">`. A known test that passes counts as a failure ("passes now: change test.known() to test()").
- **`tests/index.html`:** the same 90 tests on the shared runner, in 13 sections.
- **`tools/run_tests.js`:** as in §5.2. Measured on this laptop: test pages 1.4–1.7 s, sweep of 79 pages 25 s, the whole run 27 s. Checked with probe pages (not kept): a failing test, a known test that passes and a test that never settles (timeout after 1 s) are reported and fail the run; a sweep page with `console.warn`, an uncaught error and a missing image reports all three; the fallback without `WebSocket` (`node --no-experimental-websocket`) reports the warning and the error. `--repeat 5`: 5 × 90/90.
- **Flaky test seen once:** "toLocal: nothing redraws while nothing moves" failed once with "static stage renders at 1 FPS" in the in-app browser pane, on the first load right after the dev server started (real time; probably a late web font that redraws every stage once). Not seen again on reload or in the headless runs (virtual time); watch it.
- **CLAUDE.md:** "Tests" bullet (the commands and the three rules of §9), "Where Things Are" (`tests/`, `tools/run_tests.js`), "Working on Another Machine" step 3.
- **`.github/workflows/tests.yml`:** Node 24, `node tools/run_tests.js`; first run with the push of 2026-11-16, result not checked here.
- **Refined 2026-11-16:** the sweep tabs really animate (a probe page counted 65 frames in 1.2 s with 7 tabs at once, about 54 frames per second). A file from an unreachable server was reported as `net::ERR_NAME_NOT_RESOLVED` and failed the sweep, so a laptop without internet would fail every docs page (they load Prism, a stylesheet and fonts from CDNs, and call none of them from their own code). Such errors are now one note at the end; a 404 from the dev server still fails (checked with probe pages, not kept).
