# Draw Errors: One Bad Value Must Not Break the Layer

- **Status**: 🟡 **Proposed** (2026-11-05, no code changes yet)
- **Date**: 2026-11-05
- **Supersedes**: `design/archive/2026-08-25_gradient_optimization_plan.md` (stop clamping, never built; its allocation part is dropped, §7)
- **Related**: `design/2026-10-17_always_save_restore_plan.md` (TODO §19, same lines in `Shape.render()`), `design/2026-10-18_polyline_optimization_plan.md` (small fix "non-finite points + gradient")
- **Target Implementation**: `js/elements/shape.js` (`createGradient`, `render`), `js/elements/shapes/rect.js`, `js/elements/node.js` (`reportError`), `js/elements/group.js`, `js/elements/layer.js`, `js/elements/variable.js`, `js/interaction.js` (`process`), `tests/index.html`, `.agents/KILOPIXEL.md`
- **Prototypes** (local, scratch is git-ignored): `scratch/gradient_stops/overshoot.html` (stop offset leaves 0–1), `scratch/gradient_stops/try_finally_bench.html` (cost of `try` per shape)

---

## 1. Problem

Some canvas calls throw on invalid values. Nothing in the render path catches the error, so it aborts the whole frame and leaves canvas state behind. Tested on 2026-11-05 with `fill="linear(0, [t * 0.25 - 0.25, 'orange', 1, 'blue'])"` (`overshoot.html`):

- **The frame stops at the shape.** `addColorStop(-0.125, …)` throws an `IndexSizeError`. The rest of the layer, every later layer (a spinner in a second layer stayed at 270°) and `interaction.process()` (hover, click) are skipped. The console gets one error per frame.
- **The layer stays shifted.** `Shape.render()` calls `ctx.save()` and translates to the shape's `x` / `y` before `draw()`. The error skips `ctx.restore()`, so the translation stays on the layer's context: (300, 300) after one error, (900, 900) after three. When the offset is valid again, the shift remains, and everything in that layer is drawn in the wrong place until the page is reloaded.
- **The animation keeps running**, because the shape requests the next frame while it evaluates its values, before drawing. The old plan's "halts the engine permanently" is not what happens; the broken layer is.

The same happens for every throwing call in the render path. Checked in Chrome on 2026-11-05:

| Input a user can write | Call | Result |
|---|---|---|
| Stop offset outside 0–1 (animated overshoot) | `addColorStop` | `IndexSizeError` |
| Stop offset `NaN` (e.g. `ref.v.value` before `v` connects) | `addColorStop` | `TypeError` |
| Typo in a stop color: `['red', 'blu']` | `addColorStop` | `SyntaxError` |
| Gradient on a shape whose bounding box is `NaN` (misspelled `anchor`, missing polyline points) | `createLinearGradient` / `createRadialGradient` / `createConicGradient` | `TypeError` |
| `linear([ref.a.value, …])` with a value still `undefined` | same | `TypeError` |
| One negative corner radius next to positive ones: `r="wave(2) * 20 - 5" r2="10"` | `roundRect` | `RangeError` |
| An expression that fails while it runs: `x="t * missingFunction()"` | `evaluateAnimations` | `ReferenceError` |
| A custom shape (`class Star extends pxl.Shape`, §20) with a bug in `draw()` | anything | any error |

Not affected (the canvas ignores the value silently): `NaN` radii in `arc` / `ellipse` / `roundRect`, negative or `NaN` dash values, an invalid `fillStyle` / `strokeStyle` string, `NaN` line widths and path coordinates. Negative circle and ellipse radii are already clamped (`Math.max(0, r)`), radial gradient radii use `Math.abs` and a minimum of `0.001` for the CSS keywords.

**Inconsistency:** `fill="blu"` is ignored by the canvas, but `fill="linear(0, ['red', 'blu'])"` breaks the layer.

---

## 2. Where the State Is Left Behind

Three places call `ctx.save()` before code that can throw:

| Place | `save()` before | Can throw |
|---|---|---|
| `Shape.render()` (`shape.js`) | `applyContextState` + `draw()` | `draw()` (gradients, `roundRect`, custom shapes) |
| `Group.render()`, `Layer.render()` (with transforms) | children loop | any child: its `evaluateAnimations` or `draw()` |
| `InteractionEngine.process()` (`interaction.js:166–179`) | `el.draw()` / `el.hitTest()` on `pxl.dummyCtx` | `draw()`: `applyStyle()` builds gradients on the hit-test context too |

The last one breaks hit testing for good: `pxl.dummyCtx` keeps the extra transform, and every later hit test on that stage is offset.

---

## 3. Fix

Two parts. Part 1 makes values that animations legitimately produce draw sensibly, without a warning. Part 2 contains everything else (typos, custom shapes, unknown cases): the element is skipped for that frame, one warning names it, and the canvas state is always restored.

### 3.1 Part 1: Clamp Values That Animations Produce

**Stop offsets** (`Shape.createGradient`, `shape.js:190–193`): clamp to 0–1. An overshooting animated stop parks at the end, which is how the gradient looks at the limit anyway. `NaN` fails both comparisons and becomes `0`.

```js
    // Offsets outside 0–1 throw in addColorStop; an animated stop may overshoot, so it parks at the end.
    // NaN (a ref that isn't connected yet) fails both comparisons and becomes 0.
    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
      const offset = stops[i].offset;
      grad.addColorStop(offset > 0 ? (offset < 1 ? offset : 1) : 0, stops[i].color);
    }
```

**Rect corner radii** (`rect.js`): negative radii become `0`, like circle and ellipse. `NaN` stays `NaN` (`roundRect` ignores it silently).

```js
    // roundRect throws on a negative radius (an animated radius can dip below 0); like circle and ellipse, it becomes 0
    const rad1 = Math.max(0, r1 ?? baseR);
    // … rad2–rad4 the same
```

Cost: one or two comparisons per stop / corner. Measured: clamping 3 offsets 0.03 µs; creating the gradient itself 0.9 µs (`overshoot.html` session, 2026-11-05).

### 3.2 Part 2: Skip the Element, Warn Once, Always Restore

A new `PxlNode` method reports an error once per distinct message, so an error that repeats every frame doesn't flood the console:

```js
  // An error while evaluating or drawing skips this element for the frame instead of the whole frame.
  // Warns once per distinct message: an error that repeats every frame doesn't flood the console.
  reportError(error) {
    const message = `${error.name}: ${error.message}`;
    if (message === this._lastErrorMessage) return;
    this._lastErrorMessage = message;
    console.warn(`[pxl] <${this.localName}${this.id ? ` id="${this.id}"` : ''}> skipped: ${message}`);
  }
```

`this._lastErrorMessage = null` in the `PxlNode` constructor (only `node.js` reads and writes it).

**`Shape.render()`**, written together with always save / restore (§19):

```js
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

**`Group.render()`, `Layer.render()`, `Variable.render()`**: their own `evaluateAnimations(t)` gets `try { … } catch (error) { this.reportError(error); return; }`. It runs before their `ctx.save()`, so there is nothing to restore. A failing group or layer is skipped with its children for that frame; a layer keeps its previous pixels (its `clearRect` comes after the evaluation). Their children loops need no `try`: every child catches its own errors.

**`InteractionEngine.process()`**: the hit-test draw gets the same `try / catch / finally`, so `pxl.dummyCtx` is always restored. The error is usually the same as in `render()`, so `reportError` doesn't warn a second time.

```js
        try {
          if (el.hitTest) el.hitTest(ctx, this.stage.unit);
          else el.draw(ctx, this.stage.unit, 0);
        } catch (error) {
          el.reportError(error);
        } finally {
          ctx.restore();
        }
```

**What the user sees:** a typo such as `['red', 'blu']` draws nothing for that shape, the rest of the layer and the stage keep working, and the console shows `[pxl] <pxl-rect id="box"> skipped: SyntaxError: Failed to execute 'addColorStop' …` once.

**Fits the code rules:** CLAUDE.md "Invalid user values: guard only where an invalid value would throw or freeze". This is exactly that case, at the few places where it happens, not a fallback per attribute.

---

## 4. Performance

Measured on 2026-11-05 (`try_finally_bench.html`, Chrome, Browser pane hidden, so `stage.render()` was called directly; variants interleaved, median of 7 rounds, two runs):

| Per frame, 2,000 animated lines + 300 rects with an animated gradient | Run 1 | Run 2 |
|---|---|---|
| A: today's `Shape.render()` | 6.45 ms | 6.67 ms |
| B: always `save()` / `restore()` (§19) | 6.95 ms | 6.96 ms |
| C: B plus `try / finally` | 6.54 ms | 6.82 ms |

- C against B is within noise (C was faster in both runs).
- In isolation (pure JavaScript, 20 million calls), `try / finally` adds about 6.5 ns per call: about 15 µs per frame for 2,300 shapes, 0.1 % of the 16.7 ms budget.
- B against A matches the always save / restore plan (accepted there).

To confirm with the pane visible (real animation frames) before implementing.

---

## 5. Tests (`tests/index.html`)

| Test | Setup | Expected |
|---|---|---|
| Overshooting offset | `linear(0, [t * 0.25 - 0.25, 'orange', 1, 'blue'])`, frames at t = 0.5, 3, 6 | no exception; a shape in a later layer updates in every frame |
| `NaN` offset | offset from an unconnected `ref` | no exception, stop at 0 |
| Negative corner radius | `r="-5" r2="10"` | no exception, rect drawn (corner 1 square) |
| Color typo | `fill="linear(0, ['red', 'blu'])"`, then a second shape in the same layer | one warning naming the shape; the second shape is drawn; the layer's transform is the same before and after the frame |
| Warning once | the typo shape over 10 frames | exactly one `console.warn` |
| Runtime expression error | `x="t * missingFunction()"` on a shape inside a transformed group | the group's and the layer's transforms are unchanged after the frame; the other children are drawn |
| Custom shape | a test class whose `draw()` throws | same as above |
| Hit testing | the typo shape with `onclick`, pointer over it, then over a working shape | `pxl.dummyCtx` transform unchanged; the working shape gets `isHovered` |

Then all tests pass, and the docs pages and `examples/` show no new console warnings.

---

## 6. Docs and Reference

- `.agents/KILOPIXEL.md`:
  - Color & Gradient System → Color Stop Formats: offsets are clamped to 0–1 (`NaN` → 0).
  - Rect → Attribute Details: negative corner radii count as 0.
  - Per-Frame Render Pipeline: new short section "Errors while rendering" (element skipped for the frame, one warning per distinct message, canvas state restored; hit testing the same).
  - Hit Testing Algorithm: the `try / finally` around the hit-test draw.
- `docs/linear.html` (line 78, "numeric offsets (0 to 1)"): optionally add "values outside are clamped". Same check for `radial.html` and `conic.html`.
- Build: `node build.js`, then update the `~NNKB` sizes (`docs/installation.html`, KILOPIXEL.md header).

---

## 7. Out of Scope

- **The old plan's allocation part** (drop `pxl.parseStops`, parse stops in `createGradient`): measured 0.1 µs per animated gradient per frame, against 0.9 µs for the canvas gradient that has to be created anyway, and the gradient descriptor is still allocated per evaluation. A micro-optimization; dropped.
- **Errors in reactive re-evaluation outside a frame**: a `setAttribute()` whose broadcast makes another element's expression throw. The error reaches the caller's script, which is the normal JavaScript behavior. During a frame, such an error is caught by the broadcasting element's `try` and reported under its name; the other subscribers of that broadcast are skipped for that change. Rare; revisit if it shows up.
- **Invalid colors outside gradients** (`fill="blu"`): the canvas ignores them already. A warning for them would need a color parser; not planned.
- **Compile-time errors**: already caught by `pxl.compileExpression` (warning, raw string returned).

---

## 8. Open Decisions

1. **Order:** Part 2 together with always save / restore (§19), since both rewrite `Shape.render()` (recommended), or Part 2 first with today's conditional `save()`? Part 1 is independent and can go first.
2. **Warning frequency:** once per distinct message per element (recommended), or once per element for the page's lifetime?
3. **Invalid stop color:** skip the whole shape and warn (recommended: a typo should be visible), or skip only that stop (needs a `try` per `addColorStop`)?
4. **Docs:** mention the clamping on the gradient pages, or only in KILOPIXEL.md?

---

## 9. Steps

1. Part 1: clamp in `createGradient` and `rect.js`; tests "overshooting offset", "`NaN` offset", "negative corner radius". `node build.js`, `tests/index.html`.
2. Part 2 (with §19 if decided so): `reportError`, `Shape.render`, `Group` / `Layer` / `Variable` evaluation, `InteractionEngine.process`; the remaining tests.
3. Confirm the benchmark with the pane visible (§4).
4. KILOPIXEL.md and docs (§6), sizes after the build.
5. Plan status → ✅, TODO item removed; remove the "non-finite points + gradient" small fix from `design/2026-10-18_polyline_optimization_plan.md` and TODO §22.
