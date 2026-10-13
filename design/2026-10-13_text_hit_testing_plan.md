# Text Hit Testing (`<pxl-text>` Pointer Events) Implementation Plan

**Date:** 2026-10-13  
**Status:** Draft — awaiting approval  
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
// process(), replacing L138-140
pxl._hitResult = false;
ctx.beginPath();
if (el.hitTest) el.hitTest(ctx, this.stage.unit);
else el.draw(ctx, this.stage.unit, 0);
```

### 3.3 Change 2 — `js/elements/shapes/text.js`

```javascript
hitTest(ctx, u) {
  const b = this.boundingBox;
  ctx.rect(b.left * u, b.top * u, (b.right - b.left) * u, (b.bottom - b.top) * u);
  ctx.fill(); // intercepted on pxl.dummyCtx → isPointInPath
}
```

### 3.4 Why the bounding box is valid at hit-test time

- `this.boundingBox` is computed in **Tier 3** of `Text.draw()` using `ctx.measureText()` (`actualBoundingBoxLeft/Right/Ascent/Descent`), in logical units relative to the text anchor (respects `align`, `baseline`, multi-line `lineheight`, word-wrap `width`).
- `interaction.process()` runs at the **end of `stage.render()`**, i.e. after the text has been drawn in the same frame → the box is fresh.
- Hidden elements (`hidden` on the element or any ancestor) are already skipped by the engine before the hook is called.

### 3.5 Performance & GC

| Aspect | Before | After |
|---|---|---|
| Work per hit test (text) | Full `draw()`: font/cache checks, gradient resolution, `fillText` per line | 1× `rect()` + 1× `isPointInPath` |
| Allocations | None | None |
| Other shapes | — | Unchanged (one extra `el.hitTest` property check) |

Net effect: faster than today, zero GC.

---

## 4. Edge-Case Hardening (Recommended Extras)

### 4.a Empty text keeps a stale box

**Problem:** When `text` becomes `''`/`null`, `draw()` returns early (L39) before Tier 3, so the previous box remains → an invisible, clickable area.

**Fix:** zero the box on early return **and invalidate the layout cache**:

```javascript
if (text === null || text === undefined || text === '') {
  const b = this.boundingBox;
  b.left = b.right = b.top = b.bottom = 0;
  this._lastText = null; // force Tier 2 + Tier 3 recompute when text returns
  return;
}
```

> [!IMPORTANT]
> Resetting `_lastText` is required. Otherwise, if the text returns to its previous value, Tier 2 is not dirty, Tier 3 is skipped, and the box would stay zeroed (text visible but not clickable).

### 4.b Stroke-only / outlined text

**Problem:** `measureText()` boxes describe the glyph shapes; a stroke extends `strokewidth / 2` beyond them. For `fill="none"` outline text, the outer half of the stroke would not be hittable.

**Fix:** pad the hit rect by `strokewidth / 2` when a stroke is drawn:

```javascript
const { stroke, strokewidth } = this.attributeValues;
const pad = (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) ? strokewidth / 2 : 0;
ctx.rect((b.left - pad) * u, (b.top - pad) * u, (b.right - b.left + 2 * pad) * u, (b.bottom - b.top + 2 * pad) * u);
```

### 4.c Fully hidden reveal

**Problem:** With `reveal` such that no character is visible, the text is not drawn, but the box (computed before the reveal check) remains hittable.

**Fix:** mirror the exact condition used in `draw()`:

```javascript
const { reveal } = this.attributeValues;
if (reveal !== null && reveal >= 0 && Math.floor(reveal * (this._totalChars + 1)) <= 0) return;
```

Partially revealed text keeps the **full** box (simple, predictable; avoids per-character geometry).

### 4.d (Optional, separate) `maxwidth` squeezing is not reflected in the box

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

---

## 7. Implementation Steps

1. `js/interaction.js` — add the optional `hitTest` hook (§3.2).
2. `js/elements/shapes/text.js` — add `hitTest()` (§3.3) incl. extras 4.b and 4.c.
3. `js/elements/shapes/text.js` — empty-text box reset + cache invalidation (§4.a).
4. Run `node build.js`.
5. Update `.agents/KILOPIXEL.md`:
   - Interaction System → Hit Testing Algorithm: document the optional `hitTest(ctx, u)` hook.
   - Element Reference — Text: document bounding-box hit testing (incl. stroke padding and reveal behaviour).
6. Verify (§8).

---

## 8. Test Plan

**Manual:** [`examples/test52.html`](../examples/test52.html) — hover/click rect and text; fill turns yellow, cursor becomes `pointer`, `onclick` logs to the console.

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

**Regression:** load all `docs/*.html` pages headless and assert zero console errors (same procedure as for the D1/D2 fixes).
