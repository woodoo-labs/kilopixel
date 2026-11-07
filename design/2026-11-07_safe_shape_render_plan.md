# Safe Shape Render: Always `save()` / `restore()` and Draw Errors

- **Status**: 🟢 **Decided** (2026-11-07, all decisions in §7; not built yet. Merges two plans; the always save / restore part was decided on 2026-10-17)
- **Date**: 2026-11-07
- **Supersedes**: `design/archive/2026-10-17_always_save_restore_plan.md` (decided, not built) and Part 2 of `design/archive/2026-11-05_draw_errors_plan.md` (its Part 1, the clamping of stop offsets and corner radii, was built on 2026-11-05 and stays)
- **Related**: `design/2026-11-01_isolated_shape_compositing_plan.md` (builds on this one: same `Shape.render()`, order in its §9), `design/2026-10-17_shape_authoring_plan.md` (custom shapes need this before a docs page), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, implemented), `design/2026-10-18_polyline_optimization_plan.md` (small fix "non-finite points + gradient", covered here)
- **Target Implementation**: `js/elements/shape.js` (`render`, `drawArrows`), `js/elements/shapes/grid.js`, `js/elements/node.js` (`reportError`), `js/elements/group.js`, `js/elements/layer.js`, `js/elements/variable.js`, `js/interaction.js` (`process`), `tests/index.html`, `.agents/KILOPIXEL.md`
- **Measurement tools** (local only, scratch is git-ignored): `scratch/gradient_stops/try_finally_bench.html` (all variants, §4), `scratch/save_restore/measure.html` and `lines.html` (real pages, worst case), `scratch/custom_shape/test.html` (leak test), `scratch/gradient_stops/overshoot.html` (frame aborted by an error)

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

---

## 3. Design

### 3.1 `Shape.render()`

```javascript
  // Every shape draws in its own canvas state: whatever it changes or throws, the next shape starts clean
  render(ctx, u, t) {
    ctx.save();
    try {
      this.evaluateAnimations(t);
      if (!this.attributeValues.hidden) {
        pxl.applyContextState(ctx, u, this.attributeValues, this);
        this.draw(ctx, u, t);
      }
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  }
```

- The `hasStateChanges` check and its comment disappear. `applyContextState()` already skips neutral values, so a shape without transforms or compositing costs one `save()` / `restore()` pair (§4).
- `save()` comes before the evaluation, so one `try` covers both. A hidden shape therefore pays one pair too; hidden shapes are rare and the pair is cheap.

### 3.2 `reportError()` (`node.js`)

```javascript
  // An element that throws while evaluating or drawing is skipped for this frame instead of breaking the frame.
  // Warns once per distinct message, so an error that repeats every frame doesn't flood the console.
  // An animated element keeps asking for frames: evaluateAnimations() does that at its end, which the error may
  // have skipped, and an error that depends on t can then recover.
  reportError(error) {
    if (this.isAnimated) this.parentLayer?.invalidate();
    const message = String(error);
    if (message === this._lastErrorMessage) return;
    this._lastErrorMessage = message;
    console.warn(`[pxl] <${this.localName}${this.id ? ` id="${this.id}"` : ''}> skipped: ${message}`);
  }
```

- `this._lastErrorMessage = null` in the `PxlNode` constructor. Only `node.js` reads and writes it.
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

### 3.5 What Becomes Simpler

Checked against today's code: every shape draws its arrowheads last (`circle.js:89`, `ellipse.js:92`, `line.js:48`, `polyline.js:122`), and after its major lines the grid only draws labels with `fillText()`.

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

### 3.6 What Stays

- **Rule 1** (set stroke and text state before use) still applies *inside* a shape: fill, then stroke, then arrowheads in one `draw()`.
- **Part 1 clamps** (stop offsets 0–1, rect corner radii ≥ 0): values that animations legitimately produce still draw sensibly, without a warning.
- **Compile-time errors** are already caught by `pxl.compileExpression` (warning, raw string kept).

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

No new per-frame allocation on the normal path: `save()` / `restore()` and `try` allocate nothing in JavaScript. On an error, `String(error)` and the warning allocate, once per frame while the error lasts; the warning is printed only once per distinct message. A failing element is an exception to "zero allocations per frame", and an accepted one.

---

## 5. Behavior and Edge Cases

| Case | Result |
|---|---|
| Typo in a stop color | The shape draws nothing; the rest of the layer, later layers and hit testing keep working; one warning naming the shape |
| Error only for some values of `t` | Warned once; the element keeps animating and draws again when the value is valid |
| Error fixed by the user (`setAttribute` with a valid value) | Draws again with the next frame, at the right position (the canvas was never left shifted) |
| Same error again after a fix | No second warning: same message. Accepted, see decision 2 |
| Custom shape changes any canvas setting | Only affects itself |
| Custom shape throws | Skipped, warned, nothing leaks |
| Error in reactive re-evaluation outside a frame (`setAttribute()` whose broadcast makes another element's expression throw) | Reaches the caller's script, as in plain JavaScript. During a frame, it is caught by the broadcasting element's `try` and reported under that element's name; the other subscribers of that broadcast are skipped for that change. Rare; revisit if it shows up |
| Invalid colors outside gradients (`fill="blu"`) | Unchanged: the canvas ignores them silently. A warning would need a color parser; not planned |

---

## 6. Steps

1. `js/elements/node.js`: `_lastErrorMessage` in the constructor, `reportError()` (§3.2).
2. `js/elements/shape.js`: `render()` (§3.1), `drawArrows()` (§3.5).
3. `js/elements/shapes/grid.js`: drop the `lineWidth` reset (§3.5).
4. `js/elements/group.js`, `layer.js`, `variable.js`: `try` around their evaluation (§3.3).
5. `js/interaction.js`: `try / catch / finally` around the hit-test draw (§3.4).
6. `tests/index.html`: tests from §8. `node build.js`, update the `~NNKB` sizes, all tests pass.
7. Regression: all `docs/*.html` and `examples/*.html` without new console warnings, pixels compared with the old engine (`scratch/text_box/regress.html` adapted), `scratch/custom_shape/test.html` with the built engine, `scratch/save_restore/measure.html` with the built engine as A (A and B must be equal, B's patch is then a no-op).
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

---

## 8. Tests (`tests/index.html`)

Each with a short comment linking this plan. Pixel checks read the layer canvas, as the existing gradient tests do.

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

---

## 9. Docs and Reference

- `.agents/KILOPIXEL.md`:
  - Per-Frame Render Pipeline and Shape key methods: every shape draws inside `save()` / `restore()`; Rule 1 still applies inside a shape.
  - New short section "Errors while rendering": element skipped for that frame, one warning per distinct message, canvas state restored, animated elements keep asking for frames; hit testing the same.
  - Hit Testing Algorithm: the `try / finally` around the hit-test draw.
- `docs/linear.html` line 78: after "numeric offsets (0 to 1)", note that values outside are clamped (decision 5). A future "Custom Shapes" page (`design/2026-10-17_shape_authoring_plan.md`) can then promise: "change any canvas setting you like, it only affects your shape".
- Build: `node build.js`, then the `~NNKB` sizes (`docs/installation.html`, KILOPIXEL.md header).

---

## 10. Out of Scope

- **Undoing translations instead of save / restore** for shapes whose only state is `x` / `y`: about 0.6 µs faster per shape, but with float drift and two code paths again. Not pursued (old always-save plan §4.4).
- **Parsing gradient stops in `createGradient`** (the allocation part of the old gradient plan): about 0.1 µs per animated gradient against 0.9 µs for the canvas gradient itself. Dropped (old draw-errors plan §7).
- **Isolated compositing** (fill and stroke composite as one): `design/2026-11-01_isolated_shape_compositing_plan.md`, built on top of this plan.
