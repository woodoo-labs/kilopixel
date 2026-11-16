# Testing: Levels, a Headless Runner and the Missing Cases

- **Status**: ✅ **Implemented** (2026-11-16, steps 1–6 built, §12–§16; level 4 `tests/frameworks.html` comes with `design/2026-10-30_framework_compatibility_plan.md`, the negative-sweep tests with `design/2026-11-16_negative_sweep_arrowheads_plan.md`)
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
| 3 | `tests/unit.html`: compiler tables, drivers, radii, points, matrices, filters; the generated Rule A sweep | 1 session | built 2026-11-16 |
| 4 | Interaction and lifecycle tests, the known bugs of the framework review as `test.known` | 1 session | built 2026-11-16 |
| 5 | `tests/render.html`: probes per shape and paint feature | 1–2 sessions | built 2026-11-16 |
| 6 | Scaling checks; build checks | 1 session | built 2026-11-16 |

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
- **`.github/workflows/tests.yml`:** Node 24, `node tools/run_tests.js`; the first two runs on GitHub (pushes of 2026-11-16) passed in about 50 s each.
- **Refined 2026-11-16:** the sweep tabs really animate (a probe page counted 65 frames in 1.2 s with 7 tabs at once, about 54 frames per second). A file from an unreachable server was reported as `net::ERR_NAME_NOT_RESOLVED` and failed the sweep, so a laptop without internet would fail every docs page (they load Prism, a stylesheet and fonts from CDNs, and call none of them from their own code). Such errors are now one note at the end; a 404 from the dev server still fails (checked with probe pages, not kept).

## 13. Step 3 Built 2026-11-16: `tests/unit.html`

66 tests (61 counted, 5 known), about 1.5 s headless. One test per table: every row is checked and all mismatches are listed in one message. Sections:

- **Compiler: classification** – `pxl.parseAttributeValue()` for plain values (hex, numbers including `.5` and `1e3`, words, `true` / `false`, `Math` constants, static `rgb()`, quoted strings), static expressions (arithmetic, arrays, `hsl()` with CSS percentages, template literals, filter helpers), and the flags of compiled functions (`isTimeDependent`, `variableDependencies`, `usesToLocal`); a `t` after a dot or inside a word; the shared cache; `random()` without `t` evaluated once; compiled functions evaluated with refs; a compile error (warns once, plain string); an unknown `toLocal()` property (warns at compile time).
- **Compiler: string literals** – the five problems of TODO §34 as `test.known()`: a quoted `return`, `ref.x.y` in template text, a lone `t` in quoted text, a CSS percentage inside a quoted color, an escaped quote. All five fail as described there, so they are confirmed.
- **Time drivers** – each driver at chosen times; `glitch()` holds its value; `time()` for every unit against a fixed local date.
- **Scope helpers** – color functions, filter helpers and their units, `clamp` / `lerp` / `map`, `pxl.scaleResponsiveFilter`, `pxl.hasLineDash`, `pxl.arcEndRadians`, `pxl.isFullTurn`.
- **Gradients** – `pxl.parseStops`, the descriptors of `linear()` / `radial()` (1, 3, 6 values) / `conic()`, `pxl.resolveRadius` for numbers, sides, points on the box (also `center-top`), the CSS keywords, the minimum for a center on the edge.
- **Points parser** – `pxl.parsePointsIntoArray` with spaces, nested parentheses, `;` inside parentheses, a trailing `;`, an incomplete last point, an empty string.
- **Matrices and toLocal** – `pxl.Matrix.updateLocal` per step (also 333.3 exact), `multiply` / `invert`, a singular matrix; `pxl.toLocal` with mock reader and target objects: offset targets, rotate and zoom, a rotated reader parent, a mirror, `skewx`, a moved and scaled reader parent, and the cases that return 0.
- **Rule A** – generated from `observedAttributes` and `static defaults` for `pxl-circle`, `pxl-ellipse`, `pxl-rect`, `pxl-line`, `pxl-polyline`, `pxl-text`, `pxl-grid`, `pxl-group`, `pxl-layer`, `pxl-var`: every attribute has a default; a bare attribute gives `true` (booleans), `''` (`<pxl-var>` value) or the default; a removed attribute gives the default, also after an animated value, and leaves nothing animated. Plus polyline `points`, shape handlers and the stage's `ratio` / `alwaysrender`.

Found: nothing new. Apart from the five known problems of TODO §34, every function behaves as `.agents/KILOPIXEL.md` describes. A new attribute without a default, or one that doesn't fall back on removal, now fails a test without anyone writing one for it.

## 14. Step 4 Built 2026-11-16: Interaction, Lifecycle, Known Bugs

In `tests/index.html` (level 2), three new sections; the page has 108 tests now (104 counted, 4 known), about 1.8 s headless.

- **Interaction** (9 tests): pointer events are dispatched on the layer canvas, as the browser sends them, and `stage.render()` runs the hit test. Covered: enter / leave with `isHovered` and the handlers called once each; down / up / click with `isPressed` and their order; a press released outside the shape (`isPressed` cleared, no `onup`); the topmost shape wins, hidden shapes and shapes in hidden groups are not hit; a stroke counts with its width, text with its box, a group's rotation applies; handlers that read and set refs and remove themselves while running; auto-registration with the reader before or after the shape; lazy unregistering without readers, sticky registration with a reader that uses `t`; the hand cursor for `onclick` and a read `isPressed`, not for hover-only shapes.
- **Lifecycle** (5 tests): a shape moved to another layer (listed once, in the new layer), into a group (takes its transform), with its click handler to another stage (registered there, not in the old one); a stage removed and inserted again (draws, one monitor entry); a reader written before its source, and after the source is removed and inserted again.
- **Known bugs (framework review)** (4 `test.known()`): an `id` set after insertion, a renamed `id`, a second copy of the script, text children of a shape (`design/2026-10-30_framework_compatibility_plan.md` §19.1). All four fail as measured there; they are the acceptance tests for that plan's quick fixes (§19.4 step 1). Fixed 2026-11-16 (framework plan §20): ordinary tests now, in a section renamed "Framework review fixes". The removal cost of that review belongs to the scaling checks (step 6).
- **Checked that the tests can fail:** in a temporary copy of the page with `InteractionEngine.process()` replaced by an empty function and `Layer.registerChild()` disabled, all 9 interaction tests failed and the 2 lifecycle tests that depend on layer registration failed, each with a message naming what went wrong.

Found: no new bugs; interaction and lifecycle behave as `.agents/KILOPIXEL.md` describes.

## 15. Step 5 Built 2026-11-16: `tests/render.html`

40 tests, about 1.5 s headless. Each test draws on a stage of 1000 × 600 px (unit 1; the probes multiply by `devicePixelRatio`, so the page also works on screens with another pixel ratio) and reads single pixels at chosen points, at least 3 px from an edge. Helpers: `expectInk()` (painted: alpha > 200, empty: alpha < 30), `expectColor()` (per channel, with a tolerance), `inkIn()` (painted pixels in a box, for text).

- **Circle** (7): disc, ring, pie quarter, `start` / `end` and `sweep` winning over `end`, chord of a filled arc, ring wedge, negative radius.
- **Ellipse** (2): `rx` / `ry`, elliptical ring.
- **Rect** (10): all nine anchors (each also checked at a point inside the centered rect but outside the anchored one, so a wrong anchor fails), corner radii `r`, `r1` and a negative radius.
- **Line and polyline** (7): thickness and the three caps, a filled arrowhead (tip and base width), no stroke means no line and no arrowheads, open and closed polylines, relative mode, `smooth` through its points, a coordinate that is not a number.
- **Text** (4): position on the alphabetic baseline, `align` center and end, `reveal`, wrapping with `width`.
- **Grid** (1), **Paint** (7): fill color, stroke without fill, `alpha`; `linear()` at 0 and 90; `radial()` and `conic()` (0 points right, clockwise); `linedash` in logical units; `mask="destination-out"` and `blend="multiply"`; a shadow at its offset; a hidden shape.
- **Layers** (2): `alpha`, `blend` (`lighter` → `plus-lighter`) and `filter` as CSS on the canvas; a layer's `x`, `y`, `rotate`.
- **Checked that the probes can fail:** in a temporary copy with a wrong `top-left` anchor, text that draws nothing, a dash that is never set and radius keywords that return 1, 7 tests failed, each naming the point and the value it found.
- **One wrong expectation, fixed in the test:** a wrapped text with the default `alphabetic` baseline grows upward, its last line on `y` (`startY = -totalBlockHeight` in `text.js`); the test first expected the lines below `y`.

**Negative sweep (not tested yet; planned in `design/2026-11-16_negative_sweep_arrowheads_plan.md`, TODO §42):** a negative or anticlockwise sweep draws the long way round. Measured 2026-11-16: `pie="true" start="0" sweep="90" anticlockwise="true"` fills three quarters (all but the lower right), and `sweep="-90"` without `anticlockwise` fills three quarters as well (all but the upper right). `ctx.arc()` goes from start to end in the given direction, so an end "behind" the start means the long way. A reader of `sweep="-90"` probably expects one quarter going up. Decided 2026-11-16 with a prototype: the sign of `sweep` is the direction, and arrowheads shrink on short paths; the tests come with that plan.

Found: no bugs in the documented behavior.

## 16. Step 6 Built 2026-11-16: Scaling and Build Checks

**`tests/scaling.html`** (level 6), 8 tests (6 counted, 2 known), 20–35 s headless:

- `expectLinear(measure, n)` times an operation at n and 2n (median of 5) and fails above ratio 3.5. n doubles until the smaller time is at least 5 ms: with `n` too small the first run measured 1.7 ms against 10.4 ms (ratio 6.1) for a linear removal, which larger sizes showed to be noise (8.2 / 12.0 / 21.5 ms for 2,000 / 4,000 / 8,000 shapes). Warm-up rounds before timing keep the browser's optimizing compiler out of the ratio. Over the limit, both sizes are measured once more and the lower ratio counts: quadratic work fails both times, a one-off pause doesn't. "One variable read by n shapes" uses one shared expression: with one expression per reader, 4,000 compiled functions made memory effects grow faster than linear (ratio up to 4.5) although the broadcast itself is linear.
- Covered: inserting shapes with readers, removing shapes without readers, `setAttribute()` on shapes with readers, one variable read by n shapes, a frame with n animated shapes, hit testing n clickable shapes.
- **Known** (acceptance tests of `design/2026-10-30_framework_compatibility_plan.md` §19.4 step 1; both fixed 2026-11-16, framework plan §20, ordinary tests now): removing shapes with readers is quadratic (measured ratio 5.2–9.2: 1,000 shapes 111–129 ms, 2,000 shapes 676–1,189 ms); the expression caches grow by one entry per distinct string (3,000 for 3,000), W4.
- Clocks advance with computation on virtual time (`performance.now()` and `Date.now()` both measured 139 ms for a 139 ms loop), so the page runs in the headless runner like the others.
- **Observation, not a test:** inserting has a small quadratic part, `registerChild()` checks `childList.includes(child)` for every new shape (2,000 shapes with readers: 41 ms, 4,000: 123 ms; ratio about 3). Small next to the removal bug; a candidate for the same quick-fix session. Fixed 2026-11-16 (`registerChild()` without the scan, framework plan §20).
- Slow, so `node tools/run_tests.js --tests` leaves it out (`--slow` adds it); the full run and CI include it.

**`tools/check_build.js`** (10 checks, 0.1 s, run by `tools/run_tests.js` before the test pages, also on its own):

- `build.js` refactored without changing its output (checked: the build wrote identical files): `checkSources()` returns the problems the build refuses, `bundleSource()` the unminified bundle, `readSources()` the sources; `node build.js` builds as before, `require('build.js')` builds nothing. The examples are kept in memory, not in fixture files as first planned.
- Checks: every kind of top-level declaration is refused, declarations on `pxl` and indented ones are not; trailing whitespace with its line; a `_field` used in another file; a field without `_` used only in its own file; correct fields pass; the engine sources pass.
- Build output: `dist/pxl.js` and `dist/kilopixel-v0.1.0.js` are the current bundle of `js/` (a forgotten `node build.js`, e.g. after a pull on the other laptop); the minified copies in `dist/` and `docs/` are identical.
- Sizes: the `~NNKB` and `~NNKB gzipped` of `pxl.min.js` in `docs/installation.html` and the KILOPIXEL.md header match the build (CLAUDE.md "File size after a build").
- **Checked that they can fail:** with a line appended to `dist/pxl.js` and a wrong size in KILOPIXEL.md, both checks failed with their message; the files were restored.

**Added later on 2026-11-16 (12 checks now):** the bundle loads in Node without a window and defines nothing (server-side rendering, `design/2026-10-30_framework_compatibility_plan.md` §20); the starter-kit zip (`docs/download/kilopixel-boilerplate.zip`) contains the current `pxl.min.js` and `index.html`, read with a small zip reader on `zlib` (after a build the zip was once restored from git and would have shipped the old engine; checked: the zip of `a4cdbf5` fails).

**CLAUDE.md:** the "Tests" bullet names the quick run (`--tests`, with build checks) and the full run (with scaling and the sweep); "Where Things Are" lists the test pages and `tools/check_build.js`.

With step 6 every step of §10 is built; the plan is ✅ and its TODO item is removed. Still to come, in other plans: level 4 (`tests/frameworks.html`, framework plan §11) and the negative-sweep render tests (`design/2026-11-16_negative_sweep_arrowheads_plan.md` §5).

