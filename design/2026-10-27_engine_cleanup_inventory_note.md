# Engine Cleanup: Inventory

- **Status**: ⚪ **Inventory, nothing changed yet** (2026-10-27). Decisions in §2 come first; the cleanup plan follows from them.
- **Scope**: the 19 engine files in `js/` (≈3,060 lines, build order in `build.js`). Not covered: `docs/js/*`, docs pages, `examples/`.
- **Method**: every file read in full, plus pattern scans over `js/` (fallbacks, `typeof` checks, duplicated helpers, comment tone, whitespace, line length).
- **Goal**: one consistent style, no dead or defensive code, no duplicated logic; behavior unchanged.

---

## 1. Summary

| Group | Findings | Risk of the fix |
|---|---|---|
| A. Real problems | 6 | low, each needs a test |
| B. Duplicated logic | 8 places | low to medium (circle / ellipse is the largest) |
| C. Defensive code against the CLAUDE.md rule | ≈25 lines in 12 files | low, but needs a rule for invalid **user** values (§2, Q5) |
| D. State ownership (fields set outside constructors) | 6 classes + 2 helpers | low |
| E. Naming and API style | 6 patterns | low |
| F. Comments | ≈30 lines | none |
| G. Formatting | 97 trailing-whitespace lines, 15 lines over 140 chars | none |

The engine is in reasonable shape: the newer code (`line.js`, `polyline.js`, the arrowhead methods in `shape.js`, `matrix.js`) is consistent and can serve as the reference style. Most findings sit in the older core (`node.js`, `engine.js`, `stage.js`, `graphics.js`, `text.js`, `grid.js`).

---

## 2. Decisions Needed First (Style Guide)

Each answer becomes one rule in the style guide (CLAUDE.md "Engine Code Rules" or `js/STYLE.md`).

| # | Question | Today | Recommendation |
|---|---|---|---|
| Q1 | Inside `pxl.*` functions: `pxl.x` or `this.x`? | `engine.js` 22× `this.` / 17× `pxl.`, `compiler.js` 16× / 35×; all other files only `pxl.` | Always `pxl.` (works when a function is passed around detached, reads the same everywhere) |
| Q2 | What does a leading `_` mean? | Mixed: `_isLocalMatrixDirty` vs `isOrderDirty`, `_interactiveElements` vs `isInteractiveOrderDirty`, Polyline `flatCache` / `pointKeys` public, `_segment` private | `_x` = used only inside its own class (or file); no `_` = read by other classes or users |
| Q3 | Section headers | 4 styles: `// ===` banners (core files), `// --- X ---` (node, shape), `// --- ARROWHEADS ---`, `// ====` banners inside a method (text) | One style: `// --- Section ---` inside classes, `// ===` banners only between top-level parts of a file |
| Q4 | Comment tone | "ZERO-GC FIX:", "Highly optimized", "flawless", "zero-cost", CAPS labels, numbered steps, history notes | Comments explain *why*, in plain sentences; mention allocation only where the choice isn't obvious; no history (git has it) |
| Q5 | Guards against **invalid user values** (not defaults): unknown `anchor`, a `dashoffset` expression returning a string, `step <= 0` | Some guarded (`?? 0.5`, `Number.isFinite`), most not (KILOPIXEL.md: invalid values "not handled") | Keep a guard only where an invalid value would throw or freeze; remove the rest. Each kept guard gets a short comment |
| Q6 | Long static lists (`observedAttributes`, `defaults`) | One line up to 408 chars (Shape) vs multi-line (Text) | Multi-line above ~120 chars, grouped like the KILOPIXEL.md tables (transform / style / render / events) |
| Q7 | Formatter | none | No Prettier (it would undo deliberate alignment such as `if (prop === 'x')      return …`); add `.editorconfig` (indent 2, LF, trim trailing whitespace) |

---

## 3. Findings

### A. Real Problems

| # | Where | Finding | Fix |
|---|---|---|---|
| A1 | `elements/shapes/grid.js:23` | `addPoint` is an arrow function created inside `draw()`: one closure allocation per frame (breaks the zero-allocation rule for per-frame paths) | Inline the 4 corner transforms or make it a method writing into fields |
| A2 | `elements/node.js:28` | `_parentMatrixVersion = -1` is never read; `getGlobalMatrix()` uses `_lastParentMatrixVersion`, which (like `_localMatrixVersion`, `_lastLocalMatrixVersion`) is created on first use and guarded with `|| 0` (`:174`, `:202`, `:207`) and `!this._localMatrixVersion` (`:167`) | Initialize all four version fields in the constructor, remove the dead one and the `|| 0` guards |
| A3 | `interaction.js:42` | `pxl.InteractionEngine = class {` is anonymous: `pxl.InteractionEngine.name === ''` (KILOPIXEL.md says class expressions keep readable names) | `class InteractionEngine` |
| A4 | `elements/shape.js:39` | `on*` handlers get the `ref.x?.` injection but not the `toLocal(` rewrite: `toLocal()` in a handler throws a ReferenceError | Shared sanitizer (see B2); **behavior change**, own commit and test |
| A5 | `elements/shapes/polyline.js:27` | `removeAttribute('points')` passes `null` to the parser, which parses the string `"null;"` and happens to find no point | Resolve `null` / `''` to no points explicitly |
| A6 | `elements/stage.js:60` | Stage `attributeValues` start as `renderAvg: 0, renderMax: 0` (numbers) and become strings after the first publish (`toFixed`) | One type (numbers, format in the reader; or strings from the start). Check docs that print them |

### B. Duplicated Logic

| # | Copies | Where | Fix |
|---|---|---|---|
| B1 | DOM-order sort | `pxl.sortByDOMPosition` (`engine.js:16`) + inline copies in `stage.js:164`, `layer.js:76`, `group.js:25`, plus a fallback copy in `interaction.js:134` | Use `pxl.sortByDOMPosition` everywhere |
| B2 | `ref.x.` → `ref.x?.` injection | `compiler.js:221`, `shape.js:39` | One `pxl.sanitizeExpression()` (also fixes A4) |
| B3 | "fill is visible" / "stroke is visible" | `shape.js:217`, `shape.js:223`, `text.js:164–165`, `grid.js:95` (5 copies of `x && x !== 'none' && x !== 'transparent'`) | `hasFill()` next to the existing `isStroked()` |
| B4 | "line dash is active" | `graphics.js:145`, `shape.js:303` | `pxl.hasLineDash(linedash)` |
| B5 | Arc angles, `isFull`, arrow trimming, path closing | `circle.js:24–90` vs `ellipse.js:27–93` (≈55 near-identical lines) | Shared helper for angle resolution and closing; keep the per-shape arrow math (circle has a closed form, ellipse bisects) |
| B6 | IntersectionObserver setup | `stage.js:48` and `stage.js:93` | One method |
| B7 | Six pointer listeners added / removed | `stage.js:81–86` and `stage.js:111–116` | One constant list, looped |
| B8 | "Evaluate keys, store changed values, mark matrix dirty" | `node.js:50` (connect), `node.js:96` (`evaluateAnimations`), `engine.js:168` (`evaluateAttributesForVariable`), `engine.js:148` (`evaluateToLocalAttributes`) | **Consider only**: per-frame path, measure before merging. At least the connect loop can reuse an existing function |

### C. Defensive Code (CLAUDE.md: "No defensive fallbacks")

Defaults guarantee these values, or the object always exists:

| Where | Code |
|---|---|
| `node.js:155` | `typeof child.broadcastGlobalMatrixChange === 'function'` (every child is a PxlNode) |
| `node.js:50` | `if (keys)` on `reactiveAttributeKeys`, which always exists |
| `node.js:167, 174, 202, 207` | `|| 0` / `!version` on version fields (A2) |
| `engine.js:199, 204` | `if (!element.reactiveAttributeKeys)`, `fn?.variableDependencies` |
| `interaction.js:134` | `pxl.sortByDOMPosition || (fallback)` |
| `stage.js:88, 118, 183` | `pxl.perf?.` / `pxl.perf &&` (`monitor.js` is always in the bundle) |
| `stage.js:144` | `window.devicePixelRatio || 1` |
| `stage.js:33` | `if (this.attributeValues)`: needed only because `attributeValues` is created in `connectedCallback` (see D1) |
| `monitor.js:22` | `if (stage.attributeValues)` |
| `layer.js:96` | `filter !== null && filter !== undefined` (default `'none'`, and `resolveFilter` checks again) |
| `graphics.js:101, 107` | `mask && …`, `filter && …` (defaults `'none'`) |
| `graphics.js:169` | `node._scaledDash && …` |
| `rect.js:37–41` | `if (ctx.roundRect) … else ctx.rect()`: the engine already requires `createConicGradient` (`shape.js:177`), which arrived in the same browser generation as `roundRect`; the comment about polyfills is outdated |
| `rect.js:24` | `r || 0` (`r` is `null` on purpose; `?? 0` states the intent) |
| `grid.js:10, 17–18` | `!step ||`, `this.stage ? … : 1000` |
| `text.js:41` | `text === null || text === undefined || …` |
| `shape.js:180, 197` | `if (grad)` / `return styleValue` for an unknown gradient type |

**Q5 cases** (guards against invalid user values, decide per rule): `rect.js:15, 50` (`?? 0.5` for an unknown `anchor`), `graphics.js:164, 171–172` (`Number.isFinite`, `parseFloat(dashoffset)`), `grid.js:10` (`step <= 0` would loop forever: keep), `circle.js:15` / `ellipse.js:15` (`Math.max(0, r)`: documented behavior, keep).

### D. State Ownership

| # | Where | Finding |
|---|---|---|
| D1 | `stage.js` | `attributeValues`, `isVisible`, `intersectionObserver`, `_refKey`, `_parsedRatio` first set outside the constructor; `attributeValues` is rebuilt on every connect (mouse position and fps reset on reconnect) |
| D2 | `node.js` | Version fields (A2); `parentLayer`, `parentContainer`, `_refKey` set in `connectedCallback` only |
| D3 | `layer.js:84–98` | `_lastAlpha`, `_lastBlend`, `_lastAppliedFilter` created on first render |
| D4 | `text.js:143` | `_startY` not in the constructor (all other `_last*` fields are) |
| D5 | `shape.js:63` | `stage` set in `connectedCallback`; Group has no `stage` |
| D6 | `graphics.js:84–90, 151–169` | Helpers write cache fields onto the node (`_lastFilterRaw`, `_lastFilterU`, `_cachedFilterScaled`, `_lastDash`, `_lastDashU`, `_scaledDash`); the classes don't declare them, so V8 changes the hidden class on first use and the owner isn't visible in the class |

Fix: declare every field in the constructor (stable hidden classes, one place to see an object's state). For D6, either declare the fields in `Shape` / `Layer` or move the two helpers into methods.

### E. Naming and API Style

- **`this.` vs `pxl.`** in namespace functions: Q1.
- **Underscore convention**: Q2.
- **`grid.js:104–107`**: `startX_major` (snake case; everything else is camelCase).
- **`compiler.js:157, 207`**: `function (value)` vs `function(value)` everywhere else.
- **`graphics.js:25`**: `pxl.resolveRadius` is an arrow function; all other `pxl.*` engine functions are `function` (scope helpers for users are arrows on purpose).
- **`compiler.js:151`**: `pxl.animationCache` also holds reactive (non-animated) functions; `expressionCache` would match its content.
- **Degree conversions**: 20 × `Math.PI / 180` / `180 / Math.PI`. A `pxl.DEG` constant is cosmetic only (label: micro).

### F. Comments

- **Tone** (Q4), 14 places: `node.js:23, 48, 154`, `shape.js:11, 14, 238`, `polyline.js:11, 18`, `text.js:105`, `engine.js:33, 39, 59`, `graphics.js:133`, `matrix.js:2`.
- **CAPS labels**: `compiler.js:162–199` ("FAST PATH", "SLOW PATH"), `compiler.js:224, 242`, `node.js:48`, `text.js:43, 74, 112, 151`.
- **History / stale**:
  - `engine.js:46` "Proxies and global system variables have been removed …"
  - `polyline.js:66` "variableChangedCallback — INHERITED from Shape" (it's from `PxlNode`; the line can go)
  - `rect.js:36` roundRect polyfill note
  - `shape.js:1–2` stray `// TODO // Cache Paths?`
  - `text.js:214` "Define the custom element tag name"
- **Numbered steps** with gaps: `graphics.js:98` ("2." without "1."); `grid.js` "1."–"6." (fine if Q4 keeps numbered steps).

### G. Formatting

- **Trailing whitespace**: 97 lines in 15 files (most in `graphics.js` 17, `node.js` 12, `shape.js` 12).
- **Lines over 140 chars**: 15, mostly `observedAttributes` / `defaults` one-liners (Q6); also `shape.js:73`, `text.js:36, 115`, `matrix.js:108`.
- **Blank-line runs**: `layer.js:50–55`.
- **Quotes**: 3 double-quoted literals in `graphics.js:185, 202` (everything else single quotes).
- **`customElements.define` placement**: directly after the class in most files, after a blank line in `grid.js`, after a comment in `text.js`.

---

## 4. Outside This Cleanup (Noted, Not Style)

- **Animated gradients** allocate a descriptor and stops array per evaluation and miss the gradient cache (keyed by reference), so `fill="linear(t * 30, …)"` creates a `CanvasGradient` every frame. Compare with `design/2026-08-25_gradient_optimization_plan.md` before touching.
- **`ref.<id>.tx` / `ty`** read the local matrix as Float32 (fixed 2026-10-27, precision note in KILOPIXEL.md).
- **`docs/js/*`** (docs, layout, api-tabs) have their own style; a later, separate pass.

---

## 5. Suggested Order

1. **Decisions** (§2, Q1–Q7) → style guide section.
2. **Safety net**: one smoke test per element in `tests/index.html` (renders, key attributes, no console errors) and a pixel comparison of docs / example pages before and after (like `scratch/css_snapshot.js`, but on canvas pixels). Today's 12 tests cover only `toLocal` and `tx`.
3. **Real problems** (A1–A6), one commit each with a test; A4 is a behavior change.
4. **Duplication** (B1–B7), then defensive code (C) and state ownership (D).
5. **Naming, comments, formatting** (E–G): mechanical, file by file.
6. **Keep it clean**:
   - the style guide in CLAUDE.md;
   - `.editorconfig`;
   - new `build.js` checks next to the namespace check (trailing whitespace, `|| 0` on own fields, `typeof … === 'function'`);
   - a reviewer that checks diffs against the style guide becomes worthwhile once the guide exists.

Estimated effort: steps 2–3 one session, step 4 one session, steps 5–6 one session.
