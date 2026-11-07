# Safe Shape Render: Always `save()` / `restore()` and Draw Errors

- **Status**: ✅ **Implemented** (2026-11-07; 12 engine tests, 54/54 pass; 79 docs and example pages pixel-identical with the previous engine, except 3 layers that also differ between two runs of the same engine; results in §4.6)
- **Date**: 2026-11-07
- **Supersedes**: `design/archive/2026-10-17_always_save_restore_plan.md` (decided, not built) and Part 2 of `design/archive/2026-11-05_draw_errors_plan.md` (its Part 1, the clamping of stop offsets and corner radii, was built on 2026-11-05 and stays)
- **Related**: `design/2026-11-01_isolated_shape_compositing_plan.md` (builds on this one: same `Shape.render()`, order in its §9), `design/2026-10-17_shape_authoring_plan.md` (custom shapes need this before a docs page), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, implemented), `design/2026-10-18_polyline_optimization_plan.md` (small fix "non-finite points + gradient", covered here)
- **Target Implementation**: `js/elements/shape.js` (`render`, `createGradient`, `drawArrows`), `js/elements/shapes/grid.js`, `js/elements/node.js` (`reportError`), `js/elements/group.js`, `js/elements/layer.js`, `js/elements/variable.js`, `js/interaction.js` (`process`), `tests/index.html`, `.agents/KILOPIXEL.md`
- **Measurement tools** (local only, scratch is git-ignored): `scratch/gradient_stops/try_finally_bench.html` (all variants, §4), `scratch/save_restore/measure.html` and `lines.html` (real pages, worst case), `scratch/custom_shape/test.html` (leak test), `scratch/gradient_stops/overshoot.html` (frame aborted by an error), `scratch/safe_render/bench.html` (repeated errors, text, hidden shapes, §4.4), `scratch/safe_render/hidden_refs.html` (what `hidden` does to evaluation, §5.1), `scratch/safe_render/edge_cases.html` (errors in readers, at connect and in `setAttribute()`, messages with values, §4.5)

---

## 1. Why One Plan

Both plans rewrite the same seven lines, `Shape.render()`, and solve two sides of one problem: **a shape must not be able to harm the shapes drawn after it.**

| | Problem | Fix |
|---|---|---|
| **A. State leaks** (always save) | A shape that changes canvas state and doesn't reset it affects every later shape, and through the next frame also the earlier ones | Every shape draws inside `save()` / `restore()` |
| **B. Errors** (draw errors) | A canvas call that throws aborts the whole frame and leaves the layer shifted | Every element catches its own error, skips itself for that frame, warns once |

Built separately, the second would rewrite the first a few days later. Together they need one `try / catch / finally` and one test round.

---

## 2. Problems

### 2.1 State Leaks (Details: `design/archive/2026-10-17_always_save_restore_plan.md` §1, §5.2)

All shapes in a layer share one canvas context. Today a shape saves and restores only when it has transforms or compositing (`hasStateChanges`, a 15-term check in `Shape.render()`). The built-in shapes are safe, because they always set the state they use (Rule 1, made reliable by Rule A). Code that changes state without resetting it is not:

- **Custom shapes** (`design/2026-10-17_shape_authoring_plan.md`): a `draw()` that sets `ctx.globalAlpha = 0.2` and forgets to reset it faded **every** shape in the layer to alpha 51 instead of 255, including shapes drawn before it (the state carries over into the next frame) and shapes that save (`save()` copies the leaked state). Measured in `scratch/custom_shape/test.html`, 2026-10-17.
- **Engine code:** `hasStateChanges` must mirror `applyContextState()` exactly; if the two lists drift apart, a shape leaks silently. `drawArrows` and `Grid.draw` reset values by hand.

### 2.2 Errors While Drawing (Details: `design/archive/2026-11-05_draw_errors_plan.md` §1, §2)

Some canvas calls throw on invalid values, and nothing in the render path catches them (tested 2026-11-05):

- **The frame stops at the shape:** the rest of the layer, every later layer and hit testing are skipped. One console error per frame.
- **The layer stays shifted:** the error skips `ctx.restore()`, so the shape's translation stays on the layer's context and adds up frame by frame. Everything in that layer is drawn in the wrong place until the page reloads, even after the value is valid again.
- **Hit testing breaks the same way:** `pxl.dummyCtx` keeps the extra transform, so later hit tests on that stage are offset.

Inputs that still throw after Part 1 (clamping stop offsets and corner radii, built 2026-11-05):

| Input | Call | Error |
|---|---|---|
| Typo in a stop color: `['red', 'blu']` | `addColorStop` | `SyntaxError` |
| Gradient on a shape whose box is `NaN` (misspelled `anchor`, all polyline X values non-finite) | `create*Gradient` | `TypeError` |
| `linear([ref.a.value, …])` while the value is still `undefined` | `createLinearGradient` | `TypeError` |
| An expression that fails while it runs: `x="t * missingFunction()"` | `evaluateAnimations` | `ReferenceError` |
| A custom shape with a bug in `draw()` | anything | any error |

**Inconsistency:** `fill="blu"` is ignored by the canvas, but `fill="linear(0, ['red', 'blu'])"` breaks the layer.

### 2.3 Found While Writing This Plan

**An animated element that throws stops asking for frames.** `evaluateAnimations()` invalidates the layer at its very end (`node.js:123`). An error in one of its expressions skips that line. If that element is the layer's only animation, the layer stops redrawing, and an error that only happens for some values of `t` (`t < 2 ? missing() : 0`) never recovers. The old plan's `return` in the catch of `Layer.render()` would also have skipped the layer's own heartbeat. §3.2 keeps animated elements running.

**A reader's error is blamed on the element it reads** (edge-case review, 2026-11-07). `pxl.broadcast()` evaluates every reader's expressions *inside* the evaluation of the element that changed. Tested: a reader `x="ref.clock.value > 0.5 ? missingFunction() : 100"` threw from `Variable.evaluateAnimations` of `clock`. With only §3.1–§3.3, `clock` would be warned about and skipped, and the readers after the failing one in that broadcast wouldn't update. `toLocal` readers are evaluated the same way when an ancestor moves (`broadcastGlobalMatrixChange()`). §3.8 lets readers report their own errors.

**Messages can contain the bad value.** `arc`, `ellipse` and `roundRect` write it into the message (`The radius provided (-5) is negative.`), so an animated value makes a new message every frame, and "once per distinct message" would warn 60 times per second. The built-in shapes clamp their radii (`circle.js`, `ellipse.js`, `rect.js`), so only custom shapes can hit this. §3.2 caps the warnings per element.

---

## 3. Design

### 3.1 `Shape.render()`

```javascript
  // Every shape draws in its own canvas state: whatever it changes or throws, the next shape starts clean.
  // A hidden shape still evaluates, so ref.* to it stays current; it only skips the save and the drawing.
  render(ctx, u, t) {
    try {
      this.evaluateAnimations(t);
      if (this.attributeValues.hidden) return;
      ctx.save();
      try {
        pxl.applyContextState(ctx, u, this.attributeValues, this);
        this.draw(ctx, u, t);
      } finally {
        ctx.restore();
      }
    } catch (error) {
      this.reportError(error);
    }
  }
```

- The `hasStateChanges` check and its comment disappear. `applyContextState()` already skips neutral values, so a shape without transforms or compositing costs one `save()` / `restore()` pair (§4).
- **Hidden first:** the evaluation runs before `save()`, so a hidden shape skips the pair. This order was also 0.3 to 0.4 ms faster on 2,000 bare lines with nothing hidden (§4.4); the cause is unknown, so the build checks it again. The inner `finally` restores the canvas before the outer `catch` reports, so the state is clean whichever part throws.
- **Unchanged behavior:** a hidden shape evaluates exactly as today (§5.1).

### 3.2 `reportError()` (`node.js`)

```javascript
  // An element that throws while evaluating or drawing is skipped for this frame instead of breaking the frame.
  // Warns once per distinct message and at most 3 times per element: a message that contains a changing value
  // (an animated negative radius in a custom shape's arc()) would otherwise warn in every frame.
  // An animated element keeps asking for frames: evaluateAnimations() does that at its end, which the error may
  // have skipped, and an error that depends on t can then recover.
  reportError(error) {
    if (this.isAnimated) this.parentLayer?.invalidate();
    // The same error object again (a gradient that failed before, §3.5): nothing new to report or allocate
    if (error === this._lastError) return;
    this._lastError = error;
    const message = String(error);
    if (message === this._lastErrorMessage || this._errorCount === 3) return;
    this._lastErrorMessage = message;
    this._errorCount++;
    const more = this._errorCount === 3 ? ' (further errors of this element are not shown)' : '';
    console.warn(`[pxl] <${this.localName}${this.id ? ` id="${this.id}"` : ''}> skipped: ${message}${more}`);
  }
```

- `this._lastError = null`, `this._lastErrorMessage = null` and `this._errorCount = 0` in the `PxlNode` constructor. Only `node.js` reads and writes them.
- **The cap** counts per element for the page's lifetime. Built-in shapes repeat the same message, so it only matters for custom shapes; the third warning says that more are hidden.
- `String(error)` gives `"SyntaxError: …"` for errors and still works when a custom shape throws a plain string (`error.name` would be `undefined`).
- A layer's `parentLayer` is the layer itself (`closest('pxl-layer')`, `node.js:55`), so the same line keeps an animated layer running.
- The error is reported, not rethrown, so no later code depends on it. The warning names the element, which the browser's own error didn't.

### 3.3 Groups, Layers, Variables

Their own `evaluateAnimations(t)` runs before their `save()`, so a failing evaluation leaves nothing to restore:

```javascript
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this.reportError(error);
      return;
    }
```

- **Group:** skipped with its children for that frame.
- **Layer:** skipped with its children; it keeps its previous pixels, because `clearRect` comes after the evaluation. `reportError()` keeps it requesting frames if it is animated.
- **Variable:** keeps its previous value.
- **Their children loops need no `try`:** every child catches its own errors (§3.1).
- **Layers and groups keep their conditional `save()`:** one per container per frame, and no foreign code runs between it and its `restore()` except children that restore themselves.

### 3.4 Hit Testing (`interaction.js`, `process()`)

```javascript
        try {
          if (el.hitTest) el.hitTest(ctx, this.stage.unit);
          else el.draw(ctx, this.stage.unit, 0);
        } catch (error) {
          el.reportError(error);
        } finally {
          ctx.restore();
        }
```

`pxl.dummyCtx` is always restored. The error is usually the one `render()` already reported, so no second warning.

### 3.5 Repeated Errors: Keep a Failed Gradient (`shape.js`, `createGradient()`)

A static shape with a typo in a stop color, in an animated layer, throws again in every frame. The browser builds a new exception each time: about 16 µs per failing shape per frame in the engine, plus garbage (§4.4). The gradient cache already knows when nothing has changed, so it can keep the error as well and throw the same object again (about 0.9 µs instead of 6 µs in isolation, §4.4).

Cache record, one more field (both slots):

```javascript
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null, error: null },
```

On a cache hit:

```javascript
    // Reuse while the descriptor, the unit, the bounding box and the stroke width are unchanged
    if (c.config === styleValue && c.u === u &&
        c.bl === box.left && c.bt === box.top &&
        c.br === box.right && c.bb === box.bottom && c.sw === sw) {
      // A gradient that failed with these values fails again: throw the kept error instead of building a new one
      if (c.error) throw c.error;
      return c.grad;
    }
```

On a miss, the cache keys are written first, and the building runs inside `try`:

```javascript
    c.config = styleValue;
    c.u = u;
    c.bl = box.left;
    c.bt = box.top;
    c.br = box.right;
    c.bb = box.bottom;
    c.sw = sw;
    c.grad = null;
    c.error = null;

    try {
      // … create the gradient and add the stops, as today …
      c.grad = grad;
      return grad;
    } catch (error) {
      c.error = error;
      throw error;
    }
```

- **Covers** the realistic case: a typo in static markup, possibly copied many times. The descriptor object stays the same, so every later frame hits the cache.
- **Doesn't cover** an animated gradient with a typo (a new descriptor every frame) or an expression that fails every frame. Both still cost the full amount; both are rare.
- **Box-dependent errors recover:** a gradient on a `NaN` box is keyed by the box too. When the box becomes valid, the cache misses and the gradient is built again.
- **Cost on the normal path:** one extra field read per cache hit, only for shapes with a gradient, and a `try` around the building, which runs only on a miss.
- **`reportError()`** sees the same object again and returns before `String(error)` (§3.2), so a repeated error allocates nothing.

### 3.6 What Becomes Simpler

Checked against today's code: every shape draws its arrowheads last (`circle.js:89`, `ellipse.js:92`, `line.js:48`, `polyline.js:122`), and after its major lines the grid only draws labels with `fillText()`.

**Contract:** `drawArrows()` is the last call of a shape's `draw()`. It changes `fillStyle`, the dash and the miter limit without resetting them, which `render()` then restores. Written into the comment of `drawArrows()` and into KILOPIXEL.md, so a future custom shape that draws arrowheads follows it.

- **`drawArrows()`** (`shape.js`): drop the `fillStyle` save and reset, and the dash re-apply after the chevron stroke. The `miterLimit` comment changes from "Not restored: stroke state is always set before stroking" to "Arrowheads are drawn last, and `render()` restores the state".

```javascript
    if (isLine) {
      // A 60° miter needs a limit of 2 (1 / sin 30°); a lower path miterlimit must not blunt the tip.
      // 4 leaves headroom for float rounding. Arrowheads are drawn last, and render() restores the state.
      if (ctx.miterLimit < 4) ctx.miterLimit = 4;
      // Chevrons are always solid
      if (pxl.hasLineDash(this.attributeValues.linedash)) ctx.setLineDash(pxl._emptyDash);
      ctx.stroke();
    } else {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
```

- **`Grid.draw()`**: drop `originalLineWidth` and its reset after the major lines.

### 3.7 What Stays

- **Rule 1** (set stroke and text state before use) still applies *inside* a shape: fill, then stroke, then arrowheads in one `draw()`.
- **Part 1 clamps** (stop offsets 0–1, rect corner radii ≥ 0): values that animations legitimately produce still draw sensibly, without a warning.
- **Compile-time errors** are already caught by `pxl.compileExpression` (warning, raw string kept).

### 3.8 Readers Report Their Own Errors (`node.js`)

Readers are evaluated during another element's evaluation (§2.3). Each place that evaluates a reader catches its error and reports it under the reader:

```javascript
  variableChangedCallback(varName) {
    let result;
    try {
      result = pxl.evaluateAttributesForVariable(this, varName);
    } catch (error) {
      // The reader's own error, reported here: the element whose broadcast called this isn't blamed or skipped,
      // and the other readers of that broadcast still update
      this.reportError(error);
      return;
    }

    // … unchanged: unsubscribe when unused, broadcast and invalidate on change …
  }
```

In `broadcastGlobalMatrixChange()`:

```javascript
        if (child.toLocalAttributeKeys.length > 0) {
          try {
            walked = (pxl.evaluateToLocalAttributes(child) & 2) !== 0;
          } catch (error) {
            child.reportError(error);
          }
        }
```

- **The failing reader** keeps its previous values for that change and stays subscribed, so the next broadcast tries again. It still draws, with the previous values.
- **The walk continues:** `walked` stays `false`, so the deeper elements are still walked.
- **Also outside frames:** a `setAttribute()`, a pointer event or the performance monitor broadcasts too; their readers' errors are now reported the same way instead of reaching the caller.
- **Not needed** at connect time: tested, the element registers and resolves once its ref arrives (§5.2).
- **Cost:** one `try` per reader update and per `toLocal` reader when an ancestor moves (§4.5).

---

## 4. Performance and GC

### 4.1 Measured 2026-11-07

`scratch/gradient_stops/try_finally_bench.html`, page visible (80 timer firings per second), stage rendered directly with `stage.render(t)`, 60 frames per variant, 7 interleaved rounds, median, two runs. Variant D was added to the page at runtime and is the exact code of §3.1 (with `console.warn` in place of `reportError`).

| Per frame | A: today | B: always save | C: B + `try / finally` | D: this plan |
|---|---|---|---|---|
| 2,000 lines + 300 gradient rects, all with `rotate` (today they already save) | 7.49 / 7.35 ms | 7.31 / 7.55 ms | 7.39 / 7.34 ms | 7.47 / 7.51 ms |
| **Worst case:** 2,000 bare animated lines, no transform (today they don't save) | 3.48 / 3.46 ms | 5.22 / 5.30 ms | 5.13 / 5.22 ms | 5.07 / 5.08 ms |
| `try / finally` alone, pure JavaScript, 20 million calls | | | about +6 to +7 ns per call | |

- **Mixed page:** all four within noise.
- **Worst case:** D costs +1.6 ms per frame (+46 %), B +1.8 ms (+52 %): all of it from `save()` / `restore()`, and D is no slower than B. That is about 0.8 to 0.9 µs per bare shape, a little more than the 0.65 µs measured on 2026-10-17 (+1.3 ms then, `scratch/save_restore/lines.html`). 5.1 ms is still far within the 16.7 ms budget.
- **`try / catch / finally`:** not measurable in the engine. In pure JavaScript about 7 ns per call, which is about 15 µs per frame for 2,300 shapes.

### 4.2 Earlier Measurements, Still Valid

- **Real pages within noise** (2026-10-17, `scratch/save_restore/measure.html`): `docs/dashes.html`, `docs/walkthrough.html` and five benchmark presets; differences went both ways and were smaller than the spread between rounds. Most shapes on real pages save already, because they have `x` / `y`.
- **Who pays:** only animated layers with thousands of shapes that have no transform: lines and polylines with absolute coordinates, shapes at `0, 0` inside a positioned group. One polyline with 2,000 points is one shape with one save. Table of use cases: `design/archive/2026-10-17_always_save_restore_plan.md` §5.3.

### 4.3 Allocation

No new per-frame allocation on the normal path: `save()` / `restore()` and `try` allocate nothing in JavaScript. A repeated gradient error allocates nothing either, because the kept error is thrown again and `reportError()` returns on the identity check (§3.5, measured in §4.4). Errors that can't be kept (an animated gradient with a typo, an expression that fails every frame) allocate a new exception per frame; the warning is still printed only once per distinct message. That is an accepted exception to "zero allocations per frame".

### 4.4 Second Check (2026-11-07): Repeated Errors, Text, Hidden Shapes

`scratch/safe_render/bench.html`, page visible, same method as §4.1 (stage rendered directly, interleaved rounds, median). D is §4.1's variant (save before the evaluation), E evaluates first and saves only for a visible shape (§3.1 now), F is D plus the error cache of §3.5 (added at runtime).

**Engine state:** no cache in the engine relies on canvas state surviving between shapes. The only code that reads canvas state is the reset in `drawArrows()` and `Grid.draw()`, which §3.6 removes. The layer's `_lastAppliedFilter` is a CSS filter on the canvas element, not context state.

**Repeated errors** (rects with a typo in a stop color, plus 2,000 bare animated lines):

| Failing shapes | 0 | 1 | 10 | 100 | 1,000 |
|---|---|---|---|---|---|
| D, a new exception per frame | 4.78 / 5.10 ms | 5.03 ms | 5.30 ms | 7.15 / 6.55 ms | **20.91 / 20.09 ms** |
| F, the kept error thrown again | 5.22 ms | | | 5.30 ms | **9.21 ms** |
| Warnings printed | 0 | 1 | 10 | 100 | 1,000 |

- D: about 16 µs per failing shape per frame. F: about 4 µs, the rest of the shape's work (evaluation, path, save / restore).
- Heap growth per 100 frames with 100 failing shapes, rounds without a GC: D about 2.1 to 5.3 MB, F about 0.1 MB (no failing shapes: about 0.1 to 2.4 MB, noisy).
- In isolation (one gradient, 20,000 calls): a new exception from `addColorStop` 6.15 µs, throwing the same object again 0.94 µs, a valid gradient 0.70 µs.

**Normal path**, two runs:

| Per frame | A: today | D: save first | E: hidden first |
|---|---|---|---|
| 2,000 bare animated lines | 2.63 / 3.06 ms | 4.52 / 4.90 ms | 4.12 / 4.59 ms |
| 2,000 bare lines, a quarter hidden | 2.37 / 2.99 ms | 3.95 / 4.58 ms | 3.53 / 4.16 ms |
| 1,000 texts without their own transform | 6.23 / 6.62 ms | 7.23 / 7.81 ms | 7.32 / 7.74 ms |
| 1,000 texts with their own `dy` (they save today already) | 8.38 / 8.60 ms | 8.00 / 8.37 ms | 8.06 / 8.37 ms |

- **Hidden first** was 0.3 to 0.4 ms faster in both runs, also with nothing hidden. Cause unknown; checked again after the build (§6).
- **Text:** about 1 µs more per text without its own transform, about the same as a bare line. Setting the font again after `restore()` adds almost nothing.
- **Shapes without errors** don't call `reportError()` at all; their only extra cost is the `save()` / `restore()` pair.

### 4.5 Edge-Case Review (2026-11-07): Readers

Reader updates per animation frame on real pages, counted with a wrapper around `variableChangedCallback()` and `pxl.evaluateToLocalAttributes()`, every stage forced to render:

| Page | Reader updates per frame | `toLocal` walks per frame |
|---|---|---|
| `docs/walkthrough.html` | 19 | 0 |
| `docs/mapping.html` | 2 | 0 |
| `docs/radial.html` | 0 | 0 |

- At about 6 to 7 ns per `try` (pure JavaScript, §4.1), `walkthrough.html` pays about 0.13 µs per frame for §3.8. An extreme page with 1,000 readers of one animated variable would pay about 7 µs, 0.04 % of the frame budget. No allocation.
- The cap of §3.2 runs only inside `reportError()`, so it costs nothing without errors.
- Size, estimated: about +15 engine lines and +35 test lines for §3.2's cap and §3.8.

### 4.6 After the Build (2026-11-07)

`scratch/safe_render/engine_bench.html`: the engine of the previous commit against the new build, each in its own iframe, page visible, 60 frames per variant, 7 interleaved rounds, median, three runs. A first run with the page hidden (throttled) gave about twice the cost on bare lines and is not counted.

| Per frame | Previous engine | New engine | Difference (median) |
|---|---|---|---|
| 2,300 rotated lines and gradient rects | 6.94 to 7.02 ms | 6.96 to 7.24 ms | within noise |
| 2,000 bare animated lines (worst case) | 2.28 to 3.21 ms | 3.81 to 5.59 ms | +1.6 ms, as in §4.1 |
| 2,000 bare lines, a quarter hidden | 2.03 to 2.32 ms | 3.11 to 3.54 ms | +1.2 ms: hidden shapes skip the save |
| 1,000 texts without their own transform | 4.23 to 4.33 ms | 6.29 to 6.48 ms | +2.0 ms |
| 2,000 bare lines + 100 static typo rects | (breaks the frame) | 4.45 to 4.66 ms | close to bare lines alone: the kept error works |

- **Texts** cost about 2 µs each in the build, about twice the 1 µs of the prototype (§4.4). Only texts without their own `x` / `y` pay it (texts with a transform saved before already), and 1,000 of them still take 6.3 ms. Accepted.
- **Regression** (`scratch/safe_render/regress.html`): 79 pages (23 docs, 56 examples), 306 layers, 303 pixel-identical; no new warnings, errors or exceptions. The other 3 also differ between two runs of the same engine: `docs/mapping.html` sec7 (a `toLocal` ring on an animated planet), `docs/text.html` sec9 (scrolling text with `loop()`), `examples/test50.html` (a live FPS readout).
- **Tests on the previous engine:** 11 of the 12 new tests fail there; the hidden-shape test passes (the previous engine didn't save for hidden shapes either) and guards the behavior.
- **Size:** minified 54.29 KB (was 53.74 KB), gzipped 16.16 KB (was 15.97 KB); the rounded sizes in the docs stay ~54KB and ~16KB.
- **Implementation detail:** the gradient building moved into its own method, `buildGradient()`, so `createGradient()` only handles the cache and the kept error and the build code didn't need a new indentation level.

---

## 5. Behavior and Edge Cases

### 5.1 Hidden Elements (Unchanged, Measured 2026-11-07)

`scratch/safe_render/hidden_refs.html`, values sampled twice, 1.5 s apart:

| The value… | follows `t` | follows another `ref.*` |
|---|---|---|
| of a hidden shape | updates | updates |
| inside a hidden group | **frozen** | updates |
| inside a hidden layer | **frozen** | updates |
| of a `<pxl-var>` inside a hidden group | **frozen** | — |

A hidden shape evaluates before it checks `hidden`; a hidden group or layer skips its children, so their `t` expressions don't run. Values that follow another `ref.*` update through broadcasts, which don't go through drawing. When the group or layer is shown again, its values are correct in the next frame, because expressions depend only on `t`. This plan keeps the behavior; whether a two-phase frame should evaluate hidden subtrees is an open question in TODO §29.

### 5.2 Other Cases

| Case | Result |
|---|---|
| Typo in a stop color | The shape draws nothing; the rest of the layer, later layers and hit testing keep working; one warning naming the shape |
| Error only for some values of `t` | Warned once; the element keeps animating and draws again when the value is valid |
| Error fixed by the user (`setAttribute` with a valid value) | Draws again with the next frame, at the right position (the canvas was never left shifted) |
| Same error again after a fix | No second warning: same message. Accepted, see decision 3 |
| Custom shape changes any canvas setting | Only affects itself |
| Custom shape throws | Skipped, warned, nothing leaks |
| A reader's expression throws during a broadcast or a `toLocal` walk, in a frame or outside one | Reported under the reader, which keeps its previous values; the element that broadcast and the other readers are unaffected (§3.8) |
| An expression fails while its element connects because its ref arrives later (`ref.later.value.toFixed(1)` before `later`) | Already safe today (tested): the element registers its `id` and shows the value once `later` connects |
| `setAttribute()` with an expression that fails immediately | Tested today: `setAttribute()` doesn't throw; the browser reports the error as uncaught (custom element reaction). The element keeps its old value and stays subscribed, so later broadcasts are caught by §3.8. Unchanged |
| One attribute fails partway through an element's evaluation | The attributes evaluated before it keep their new values; that frame's matrix update and broadcast are skipped. Fixed in the next frame where a value changes; the element is failing anyway. Accepted |
| A message with a changing value (a custom shape's `arc()` with an animated negative radius) | At most 3 warnings for that element, the third says more are hidden (§3.2) |
| An `on*` handler throws (`onenter`, `onclick`) | Reported by the browser like a DOM event handler error; the rest of that frame's pointer processing is skipped, the next frame is normal. User code, unchanged |
| A custom shape calls `drawArrows()` and then draws more | Breaks the contract of §3.6: its later drawing uses the arrowhead's `fillStyle` and dash. Documented, not guarded |
| A custom shape throws an object that can't become a string (`Object.create(null)`) | `String(error)` throws inside `reportError()`. Not realistic; not guarded |
| Invalid colors outside gradients (`fill="blu"`) | Unchanged: the canvas ignores them silently. A warning would need a color parser; not planned |

---

## 6. Steps

1. `js/elements/node.js`: `_lastError`, `_lastErrorMessage` and `_errorCount` in the constructor, `reportError()` (§3.2), the `try` in `variableChangedCallback()` and `broadcastGlobalMatrixChange()` (§3.8).
2. `js/elements/shape.js`: `render()` (§3.1), `createGradient()` and its cache record (§3.5), `drawArrows()` (§3.6).
3. `js/elements/shapes/grid.js`: drop the `lineWidth` reset (§3.6).
4. `js/elements/group.js`, `layer.js`, `variable.js`: `try` around their evaluation (§3.3).
5. `js/interaction.js`: `try / catch / finally` around the hit-test draw (§3.4).
6. `tests/index.html`: tests from §8. `node build.js`, update the `~NNKB` sizes, all tests pass.
7. Regression: all `docs/*.html` and `examples/*.html` without new console warnings, pixels compared with the old engine (`scratch/text_box/regress.html` adapted), `scratch/custom_shape/test.html` with the built engine, `scratch/save_restore/measure.html` with the built engine as A (A and B must be equal, B's patch is then a no-op), `scratch/safe_render/bench.html` against the old engine (hidden first faster or equal; repeated errors as in §4.4).
8. `.agents/KILOPIXEL.md` and docs (§9).
9. Plan status → ✅, TODO item removed; remove the small fix "non-finite points + gradient" from `design/2026-10-18_polyline_optimization_plan.md` and from the polyline item in the TODO.

---

## 7. Decisions

1. ✅ **Always save / restore:** adopted 2026-10-17 (reasoning in `design/archive/2026-10-17_always_save_restore_plan.md` §5.4).
2. ✅ **Build both together:** 2026-11-07, this plan.
3. ✅ **Warning frequency: once per distinct message per element** (2026-11-07). A second, different mistake in the same element warns again; a fix followed by the same mistake doesn't. The alternative, once per element for the page's lifetime, would hide a second, different mistake.
4. ✅ **Invalid stop color: skip the whole shape and warn** (2026-11-07). A typo should be visible, and no extra code is needed. Skipping only the bad stop would hide it and need a `try` per `addColorStop`.
5. ✅ **Docs for the Part 1 clamping: add it to `docs/linear.html`** (2026-11-07). Line 78 says "numeric offsets (0 to 1)"; a short note adds that values outside are clamped. `radial.html` and `conic.html` don't mention offsets, so they stay. KILOPIXEL.md already describes both clamps (Color Stop Formats, line 510; Rect `r1`–`r4`, line 1084).
6. ✅ **Animated elements keep running after an error, and the error is reported** (2026-11-07, §2.3). Both happen in `reportError()`: one warning per distinct message, and the element keeps asking for frames, so an error that depends on `t` recovers on its own. The alternative, the old plan's behavior, let a failing element stop its layer's animation.
7. ✅ **Second performance check** (2026-11-07, §4.4): evaluate first and save only for visible shapes (§3.1), and keep a failed gradient's error so a repeated error is cheap and allocates nothing (§3.5). Hidden elements keep today's behavior (§5.1).
8. ✅ **Edge-case review** (2026-11-07, §2.3, §4.5): readers report their own errors (§3.8); at most 3 warnings per element (§3.2); `drawArrows()` is the last call of a shape's `draw()` (§3.6). The other cases in §5.2 are accepted as they are.

---

## 8. Tests (`tests/index.html`)

Each with a short comment linking this plan. Pixel checks read the layer canvas, as the existing gradient tests do.

Built as 12 tests ("safe render: …"): #1 leak; #2–#4 in one probe test (a test shape records the canvas state it starts with after arrowheads, a dashed chevron and a grid); #5, #6 and #13 in one typo test; #7 and #8 in one group test; #9, #10, #11, #14, #15, #16, #17 and #18 each on their own; #12 is the regression run of §4.6.

| # | Case | Expected |
|---|---|---|
| 1 | A test custom shape (`class extends pxl.Shape`) whose `draw()` sets `globalAlpha = 0.2`, then a filled rect in the same layer, also one before it | both rects at full alpha (255) |
| 2 | Filled arrowhead on a line, followed by a filled circle | the circle has its own fill color |
| 3 | `arrowstyle="line"` with `miterlimit="1"`, followed by a polyline with default `miterlimit` | the chevron tip is sharp; the polyline's `ctx.miterLimit` is its own |
| 4 | Grid with `major`, followed by a line | the line has its own `strokewidth` |
| 5 | `fill="linear(0, ['red', 'blu'])"` on a rect, a second shape in the same layer, a shape in a later layer | one warning naming the rect; both other shapes drawn; the layer's transform is the same before and after the frame |
| 6 | The typo shape over 10 frames | exactly one `console.warn` |
| 7 | `x="t * missingFunction()"` on a shape inside a transformed group | the group's and the layer's transforms unchanged after the frame; the other children drawn |
| 8 | A test custom shape whose `draw()` throws | as 7 |
| 9 | `x="t < 2 ? missingFunction() : 300"` as the layer's only animation, frames at t = 1 and t = 3 | after t = 1 the layer is still invalidated (asks for the next frame); at t = 3 the shape is drawn at x = 300 |
| 10 | A layer whose own `rotate` expression throws | warned once; the previous pixels stay; other layers drawn |
| 11 | The typo shape with `onclick`, pointer over it, then over a working shape | `pxl.dummyCtx` transform unchanged; the working shape gets `isHovered` |
| 12 | Moving shapes without errors over 10 frames | no `console.warn`, no change in drawn pixels against the old engine (regression, step 7) |
| 13 | The static typo shape over 3 frames in an animated layer | the same error object is thrown in frames 2 and 3 (kept in `_gradCache`); one warning |
| 14 | A gradient on a box that becomes valid (a `ref` that connects later) | the shape draws once the box is valid; the kept error doesn't stick |
| 15 | A hidden shape with an animated `x`, read by a visible text through `ref.*`, over 3 frames | `ctx.save()` is not called for it (counted with a wrapper); the text shows the current value |
| 16 | An animated `<pxl-var>` with two readers; the first reader's expression throws once the value passes 0.5 | one warning naming the failing reader, not the variable; the variable keeps updating; the second reader follows it |
| 17 | A `toLocal` reader that throws inside a group that moves | one warning naming the reader; the group and its other children are drawn |
| 18 | A test custom shape that throws a new message every frame (the value in it) | exactly 3 warnings, the third mentions that more are hidden |

---

## 9. Docs and Reference

- `.agents/KILOPIXEL.md`:
  - Per-Frame Render Pipeline and Shape key methods: every shape draws inside `save()` / `restore()`; Rule 1 still applies inside a shape.
  - New short section "Errors while rendering": element skipped for that frame, one warning per distinct message and at most 3 per element, canvas state restored, animated elements keep asking for frames; readers report their own errors and keep their previous values; hit testing the same.
  - Arrowhead System: `drawArrows()` is the last call of a shape's `draw()` (§3.6).
  - Hit Testing Algorithm: the `try / finally` around the hit-test draw.
  - `createGradient`: the kept error for a failed gradient (§3.5).
- `docs/linear.html` line 78: after "numeric offsets (0 to 1)", note that values outside are clamped (decision 5). A future "Custom Shapes" page (`design/2026-10-17_shape_authoring_plan.md`) can then promise: "change any canvas setting you like, it only affects your shape".
- Build: `node build.js`, then the `~NNKB` sizes (`docs/installation.html`, KILOPIXEL.md header).

---

## 10. Out of Scope

- **Undoing translations instead of save / restore** for shapes whose only state is `x` / `y`: about 0.6 µs faster per shape, but with float drift and two code paths again. Not pursued (old always-save plan §4.4).
- **Parsing gradient stops in `createGradient`** (the allocation part of the old gradient plan): about 0.1 µs per animated gradient against 0.9 µs for the canvas gradient itself. Dropped (old draw-errors plan §7).
- **Isolated compositing** (fill and stroke composite as one): `design/2026-11-01_isolated_shape_compositing_plan.md`, built on top of this plan.
