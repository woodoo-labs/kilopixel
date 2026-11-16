# Testing: Levels, a Headless Runner and the Missing Cases

- **Status**: 🟡 **Proposed** (2026-11-15, inventory, runner prototype measured, nothing built)
- **Date**: 2026-11-15
- **Related**: `design/2026-10-30_framework_compatibility_plan.md` (§11 conformance tests, §19.4 order: its quick fixes get their tests from this plan), `.claude/CLAUDE.md` (Workflow: "Engine tests", "Verify in the browser")
- **Target Implementation**: `run_tests.js` in `tools/` (new; named without the folder in this plan until it exists), `tests/index.html` (runner), `tests/unit.html` and `tests/render.html` (new), `tests/frameworks.html` (from the framework plan), `.claude/CLAUDE.md` (Workflow), optional `.github/workflows/tests.yml`
- **Prototype**: `design/prototypes/2026-11-15_testing/headless_probe.js` (engine tests and page sweep in headless Chrome, no npm packages, §5.1)

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
| 5. Page sweep | every docs and example page loads without console messages | the runner (`run_tests.js`) | measured clean on 2026-11-15 (§5.1) |
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

## 5. Headless Runner (`run_tests.js` in `tools/`)

### 5.1 Measured with the Prototype (2026-11-15)

`design/prototypes/2026-11-15_testing/headless_probe.js` starts Chrome with `--headless=new --virtual-time-budget=… --dump-dom` for each page and reads console messages from `--enable-logging=stderr`:

| Run | Result | Time |
|---|---|---|
| `tests/index.html` | 90/90 passed | 0.7 s (virtual time: the waits of 300 ms to 2.2 s pass instantly) |
| Page sweep, 79 pages (`docs/`, `examples/`) | 0 pages with console messages | 81 s (one Chrome start per page, about 1 s each) |
| A probe page with a warning and an uncaught error | both reported | — |

### 5.2 Design

- **Finds the browser** (Chrome, then Edge; paths for Windows, macOS, Linux) and uses a temporary profile (never the user's).
- **Starts the dev server** if `http://localhost:8124` doesn't answer, and stops it at the end.
- **Runs** the test pages (levels 1–4), the page sweep (5) and the scaling checks (6); prints one line per page, the failures with their messages, and a summary; exits with 1 on any failure.
- **Options:** `--tests` (only the test pages), `--sweep` (only the sweep), `--grep <text>`.
- **One browser for all pages** (D2): Chrome with `--remote-debugging-port` and the Chrome DevTools Protocol over Node's built-in `WebSocket` (Node 22 and later; both laptops run Node 24): one start instead of 79, console messages and exceptions as events, `window.kilopixelTests` read directly. Expected to bring the sweep from 81 s to a few seconds; to measure. The prototype's one-process-per-page approach stays as the fallback.
- **Virtual time** (`--virtual-time-budget`, or `Emulation.setVirtualTimePolicy` over the protocol) makes timer-based tests fast and independent of the pane. Tests that must see real time are rare; they can opt out with a flag in their name or section.

### 5.3 In the Workflow

- CLAUDE.md "Engine tests": after every engine change and build, run the runner (`run_tests.js`) instead of opening `tests/index.html` by hand; the browser stays the tool for looking at pages.
- "Working on Another Machine", step 3: the same command.
- Optional (D4): a GitHub Actions workflow runs it on every push (Chrome is preinstalled on GitHub's Ubuntu runners). It is a file in the repository, no packages.

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
- Changed: "Engine tests" and the sync check use the runner.

## 10. Steps

| # | Step | Size |
|---|---|---|
| 1 | `tests/runner.js` (timeout, sections, `test.known`, `?grep`, JSON results); `tests/index.html` moved onto it unchanged | 1 session |
| 2 | The runner `run_tests.js` with the DevTools protocol (D2), sweep, exit code; CLAUDE.md workflow | 1 session |
| 3 | `tests/unit.html`: compiler tables, drivers, radii, points, matrices, filters; the generated Rule A sweep | 1 session |
| 4 | Interaction and lifecycle tests, the known bugs of the framework review as `test.known` | 1 session |
| 5 | `tests/render.html`: probes per shape and paint feature | 1–2 sessions |
| 6 | Scaling checks; build checks; optional CI (D4) | 1 session |

Step 4 overlaps with the framework plan's quick fixes (§19.4 step 1): its `test.known` tests become their acceptance tests. Steps 1–2 come first, because everything after them runs through them.

## 11. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | One test page per level, or everything in `tests/index.html`? | One page per level with a shared `tests/runner.js`: smaller files, and a failing page doesn't hide the others |
| D2 | Headless: one Chrome per page, or one Chrome over the DevTools protocol? | The protocol (one start, real console events); one per page as the fallback |
| D3 | Golden images? | Not now; probes first (§7) |
| D4 | GitHub Actions on every push? | Yes, after step 2; it costs nothing and catches what was forgotten on one laptop |
| D5 | The CLAUDE.md rules of §9? | Yes, with step 2 |
| D6 | Run the page sweep on every engine change, or only before a commit? | Before a commit and in CI; the test pages after every build |
