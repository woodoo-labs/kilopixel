# Text Hit Testing (`<pxl-text>` Pointer Events) Implementation Plan

**Date:** 2026-10-13  
**Status:** Implemented 2026-10-15 (tests in §8 passed; regression: docs pages + test24 load without errors)  
**Target Components:** `js/interaction.js` (`InteractionEngine.process`), `js/elements/shapes/text.js` (`Text`)  
**Related Components:** `js/elements/shape.js` (event registration), `.agents/KILOPIXEL.md`  
**Test File:** [`examples/test52.html`](../examples/test52.html)

---

## 1. Executive Summary & Problem Statement

Pointer interaction does not work on `<pxl-text>`:

- `isHovered` / `isPressed` never become `true` for text elements.
- `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove` never fire for text elements.
- The stage cursor never switches to `pointer` over text.

All other shapes (rect, circle, ellipse, line, polyline, grid) work correctly.

### 1.1 Verification

Reproduced with [`examples/test52.html`](../examples/test52.html) (a `<pxl-rect>` and a `<pxl-text>`, both switching `fill` on `isHovered`):

| Check | Rect | Text |
|---|---|---|
| Registered in `stage.interaction._interactiveElements` | ✅ | ✅ |
| `isHovered` becomes `true` under the pointer | ✅ | ❌ |
| Fill changes on hover | ✅ | ❌ |
| `onclick` fires | ✅ | ❌ |

Confirmed both by an automated headless run (`scratch/run_test52_hover.html`) and by manual testing in the browser.

---

## 2. Root Cause Analysis

Hit testing uses a **dummy-context interception** technique ([`interaction.js`](../js/interaction.js)):

```javascript
// js/interaction.js (L13-14)
pxl.dummyCtx.fill   = function() { if (this.isPointInPath(pxl._hitX, pxl._hitY))   pxl._hitResult = true; };
pxl.dummyCtx.stroke = function() { if (this.isPointInStroke(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
```

For each interactive element, `process()` applies the element's transform chain to the dummy context and calls the element's own `draw()` method (L138-140):

```javascript
pxl._hitResult = false;
ctx.beginPath();
el.draw(ctx, this.stage.unit, 0);
```

Path-based shapes build a path and call `applyStyle()` → `ctx.fill()` / `ctx.stroke()` → interceptors run → hit detected.

`Text.draw()` never builds a path and never calls `fill()` / `stroke()`. It paints glyphs directly via `ctx.fillText()` / `ctx.strokeText()`, which:
1. Are **not intercepted**, so `_hitResult` is never set.
2. Do **not contribute to the current path** (Canvas 2D has no text-to-path API), so even `isPointInPath` would have nothing to test.

Additionally, every hit test currently runs the full text `draw()` (font setup, cache checks, gradient resolution, `fillText` into a 1×1 canvas) — wasted work.

---

## 3. Proposed Design: Bounding-Box Hit Test via Optional `hitTest()` Hook

### 3.1 Concept

Shapes may optionally implement `hitTest(ctx, u)`. If present, the interaction engine calls it **instead of** `draw()`. `Text` implements it by adding its bounding box as a rect to the current path and calling the intercepted `ctx.fill()`.

- Shapes stay unaware of the dummy context (no `ctx === pxl.dummyCtx` checks inside shape code).
- All other shapes are untouched (they keep using `draw()`).
- The transform pipeline is reused: the engine already applies the full chain (`stage → layer → groups → element`, including the element's own `x`, `y`, `rotate`, `scale`, `skew`, `dx`, `dy`) before calling the hook, so the box is tested in the text's local coordinate space. Rotated/scaled/skewed text works automatically.

### 3.2 Change 1 — `js/interaction.js`

```javascript
// process(), inside the per-element loop
for (let j = stackLen - 1; j >= 0; j--) {
  // Spatial transforms only: alpha, blend, mask, filter and shadows don't affect isPointInPath (§3.6)
  pxl.applyTransformState(ctx, this.stage.unit, this._hitStack[j].attributeValues);
}

pxl._hitResult = false;
ctx.beginPath();
if (el.hitTest) el.hitTest(ctx, this.stage.unit);
else el.draw(ctx, this.stage.unit, 0);
```

### 3.3 Change 2 — `js/elements/shapes/text.js`

`draw()` records whether it actually painted anything in a flag (single source of truth, see §4.a):

```javascript
draw(ctx, u, t) {
  this._hasInk = false;
  // ... unchanged early returns (empty text, reveal fully hidden, no fill and no stroke) ...
  // ... directly before the render loop:
  this._hasInk = true;
  // render loop
}
```

`hitTest()` tests the bounding box, padded for strokes (§4.b):

```javascript
hitTest(ctx, u) {
  if (!this._hasInk) return; // nothing visible: empty text, reveal = 0, no fill and no stroke

  const b = this.boundingBox;
  const pad = this.isStroked() ? this.attributeValues.strokewidth / 2 : 0;
  ctx.rect((b.left - pad) * u, (b.top - pad) * u, (b.right - b.left + 2 * pad) * u, (b.bottom - b.top + 2 * pad) * u);
  ctx.fill(); // intercepted on pxl.dummyCtx → isPointInPath
}
```

`_hasInk` is initialized to `false` in the constructor (boolean field, stable hidden class).

### 3.4 Why the bounding box is valid at hit-test time

- `this.boundingBox` is computed in **Tier 3** of `Text.draw()` using `ctx.measureText()` (`actualBoundingBoxLeft/Right/Ascent/Descent`), in logical units relative to the text anchor (respects `align`, `baseline`, multi-line `lineheight`, word-wrap `width`, `letterspacing`, `direction`).
- `interaction.process()` runs at the **end of `stage.render()`**, i.e. after the text has been drawn in the same frame → the box and `_hasInk` are fresh.
- Hidden elements (`hidden` on the element or any ancestor) are already skipped by the engine before the hook is called.
- Known limitation (out of scope): web fonts loading after the first measurement keep the fallback font metrics until the text changes; tracked in `.agents/TODO.md`.

### 3.5 Performance & GC

`process()` runs **every rendered frame** while the pointer is over the stage and hit-tests every registered element, so in animated scenes it is a 60 fps loop.

| Aspect | Before | After |
|---|---|---|
| Work per hit test (text) | Full `draw()`: `ctx.font` assignment (font string parsing), cache checks, gradient resolution, `fillText` per line | 1 flag check, 1× `rect()`, 1× `isPointInPath` |
| State per element and ancestor (all shapes) | `applyContextState`: transforms **plus** `globalAlpha`, `globalCompositeOperation`, `filter` and `shadowColor` (strings parsed by the browser) | `applyTransformState`: transforms only (§3.6) |
| Cursor | DOM style write every frame | Write only on change (§3.6) |
| Allocations | None | None |
| Other shapes | — | One extra `el.hitTest` property check |

Net effect: faster than today for text **and** for every other interactive shape, zero GC.

### 3.6 Hit-Test Loop Optimizations (all shapes)

Pre-existing costs in the same loop, fixed alongside:

1. **Transforms only on the dummy context:** replace `pxl.applyContextState` with `pxl.applyTransformState` in the hit-test stack loop (§3.2). Compositing, filters and shadows have no effect on `isPointInPath` / `isPointInStroke`; `filter` and `shadowColor` assignments are parsed strings. `applyTransformState` already exists (layers use it).
2. **Cursor write only on change:**
   ```javascript
   const cursor = hitEl ? 'pointer' : 'default';   // cursor rule: see auto-registration plan §3.6
   if (cursor !== this._lastCursor) {
     this.stage.style.cursor = cursor;
     this._lastCursor = cursor;
   }
   ```

---

## 4. Edge-Case Hardening

### 4.a Nothing visible: empty text, fully hidden reveal, no fill and no stroke

**Problem:** Three situations draw nothing but would keep a hittable box:
- `text` becomes `''` / `null`: `draw()` returns before Tier 3, the previous box remains.
- `reveal` so small that no character is visible: the box is computed before the reveal check.
- `fill="none"` (or transparent) **and** no stroke: invisible text. Other shapes are consistent here: without fill and stroke, `applyStyle` calls neither `fill()` nor `stroke()`, so they are not hittable.

**Fix:** the `_hasInk` flag (§3.3), set by `draw()` only when it actually paints. `hitTest()` returns early when it is `false`.

- **One source of truth:** no duplicated conditions in `hitTest()`; future early returns in `draw()` are covered automatically.
- The box may stay stale while `_hasInk` is `false`, so no box zeroing and no cache reset (`_lastText = null`) are needed: when the text returns, Tier 2/3 behave exactly as today.
- Partially revealed text keeps the **full** box (simple, predictable; avoids per-character geometry).

### 4.b Stroke-only / outlined text

**Problem:** `measureText()` boxes describe the glyph shapes; a stroke extends `strokewidth / 2` beyond them. For `fill="none"` outline text, the outer half of the stroke would not be hittable.

**Fix:** pad the hit rect by `strokewidth / 2` when the text is stroked (`isStroked()`, §3.3).

With `linejoin="miter"`, glyph corners can extend slightly further than `strokewidth / 2`; negligible, not handled.

### 4.c (Optional, separate) `maxwidth` squeezing is not reflected in the box

**Problem:** `measureText()` ignores the `maxWidth` argument of `fillText()`. When a line is horizontally compressed by `maxwidth`, the computed box is wider than the drawn text. This affects hit testing **and** gradient placement (pre-existing).

**Possible fix (Tier 3):** per line, scale `actualBoundingBoxLeft/Right` by `min(1, maxwidth * u / metrics.width)` (canvas compresses horizontally around the anchor point).

**Recommendation:** track separately — it is a bounding-box accuracy issue, not a hit-testing issue.

---

## 5. Alternatives Considered

| Alternative | Verdict |
|---|---|
| Check `ctx === pxl.dummyCtx` inside `Text.draw()` | ❌ Couples shapes to the interaction engine; still runs the full draw setup. |
| Intercept `fillText`/`strokeText` on the dummy context | ❌ No geometry available — Canvas 2D cannot test points against text glyphs. |
| One box per line | ⏸️ More accurate for ragged wrapped/centered text, but more complex (per-line metrics cache). Revisit if needed. |
| Font-based line boxes (`fontBoundingBoxAscent/Descent`) | ⏸️ Friendlier, uniform hit height (e.g. for `"..."` or `"-"`), but differs from the gradient box. Revisit if small labels are hard to hit. |
| Pixel-perfect glyph hit testing (offscreen raster) | ❌ Expensive, GC-heavy, contradicts zero-GC goals. |

**Decision:** single tight bounding-box rect (simple, predictable, consistent with gradient bounds).

---

## 6. Side Finding: `isHovered` Alone Does Not Register an Element

**Documented behaviour** (`.agents/KILOPIXEL.md`, Interaction System → InteractionEngine Lifecycle):
> Elements with event handlers (`onclick`, `onenter`, etc.) **or that use `isHovered`/`isPressed` in expressions** are registered with `stage.interaction.registerElement(el)`.

**Actual behaviour:** registration happens only when an `on*` handler is compiled or present on connect ([`shape.js`](../js/elements/shape.js) L47, L59). An expression like `fill="ref.box.isHovered ? 'red' : 'blue'"` without any `on*` attribute does **nothing** — which is why all examples (and `test52.html`) add an `onclick`.

**Options (separate decision, not part of this plan's scope):**
1. Correct the documentation (state that an `on*` handler is required).
2. Implement auto-registration: when a compiled expression depends on `ref.<id>.isHovered` / `ref.<id>.isPressed`, register the referenced element.

**Decision (2026-10-15):** option 2 (auto-registration), so the documented behaviour becomes true. It applies to all shapes, not only text, and gets its own plan (to be written). This plan stays limited to text hit testing.

---

## 7. Implementation Steps

1. `js/interaction.js` — optional `hitTest` hook (§3.2); `applyTransformState` instead of `applyContextState` in the hit-test stack loop; cursor write only on change (§3.6).
2. `js/elements/shapes/text.js` — `_hasInk` flag in constructor and `draw()`, `hitTest()` with stroke padding (§3.3, §4.a, §4.b).
3. Run `node build.js`.
4. Update `.agents/KILOPIXEL.md`:
   - Interaction System → Hit Testing Algorithm: optional `hitTest(ctx, u)` hook; hit testing applies spatial transforms only.
   - Element Reference — Text: bounding-box hit testing (stroke padding, no hit when nothing is visible, partial reveal keeps the full box).
5. Verify (§8).

---

## 8. Test Plan

**Manual:** [`examples/test52.html`](../examples/test52.html) — hover/click rect and text; fill turns yellow, cursor becomes `pointer`, `onclick` logs to the console.

> [!NOTE]
> In `test52.html` the `onclick` handlers currently double as a workaround for §6 (they force registration). Keep them for this plan; once auto-registration (§6 decision) is implemented, remove them so test52 covers both fixes.

**Automated (headless Chrome):** `scratch/run_test52_hover.html` injects the example's stage markup, dispatches synthetic `pointerenter` / `pointermove` events and pumps frames manually via `stage.render()` (headless Chrome throttles `requestAnimationFrame`).

| # | Case | Expected |
|---|---|---|
| 1 | Pointer over rect | `box.isHovered = true`, `label.isHovered = false` |
| 2 | Pointer over a text glyph | `label.isHovered = true` |
| 3 | Pointer between letters (inside box, no ink) | `label.isHovered = true` (documented bbox behaviour) |
| 4 | Pointer outside both | both `false`, cursor `default` |
| 5 | Rotated text (`rotate="30"`), pointer on rotated glyphs | `true` |
| 6 | `text` set to `''` → pointer over former area | `false`; restoring the text makes it hittable again |
| 7 | `reveal="0"` | `false` |
| 8 | `fill="none"` + thick stroke, pointer on outer stroke edge | `true` |
| 9 | `fill="none"` and no stroke (invisible text) | `false` |
| 10 | Text in a group with `rotate` / `scale` and a layer with `filter` / `alpha` | hit area follows the transforms; filter/alpha don't matter |
| 11 | Static pointer over animated (moving) text | `isHovered` follows the text frame by frame |
| 12 | Cursor: pointer resting over a hit element | `stage.style.cursor` written once, not every frame |

**Regression:** load all `docs/*.html` pages headless and assert zero console errors (same procedure as for the D1/D2 fixes).
