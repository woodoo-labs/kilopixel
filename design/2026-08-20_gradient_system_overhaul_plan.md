# Gradient System Overhaul

Complete cleanup of the gradient subsystem: fix cache bugs, add dual cache slots, clean up dead code, add conic gradients, and harden edge cases.

## Proposed Changes

### 1. Fix Bounding Box Cache Bug (test41.html)

**The bug**: `createGradient()` caches on `(config === styleValue && u === lastU)` but the `CanvasGradient` is built from `getBoundingBox()`. When a shape's geometry animates (radius, width, points), the bbox changes but the cache still hits → stale gradient.

**Fix**: Add all 4 bounding box values (`left`, `top`, `right`, `bottom`) to the cache key. Four extra number comparisons per frame — essentially free.

---

### 2. Dual Cache Slots (Fill + Stroke) — Explicit Slot Parameter

**The bug**: One cache slot per shape. If both `fill` and `stroke` use gradients, they thrash each other every frame — even for completely static gradients.

**Fix**: Add a `slot` parameter to `createGradient(ctx, u, styleValue, slot)` — `0` for fill, `1` for stroke. Pre-allocate two cache objects in the constructor (zero GC):

```javascript
// In Shape constructor — pre-allocated, zero GC:
this._gradCache = [
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null },
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null }
];
```

```javascript
// Updated signature:
createGradient(ctx, u, styleValue, slot) {
  if (typeof styleValue !== 'object' || !styleValue.isGradient) return styleValue;

  const box = this.getBoundingBox();
  const c = this._gradCache[slot];

  if (c.config === styleValue && c.u === u &&
      c.bl === box.left && c.bt === box.top &&
      c.br === box.right && c.bb === box.bottom) {
    return c.grad;
  }

  // Cache miss → create gradient, store in slot
  const grad = /* ... create CanvasGradient ... */;
  c.config = styleValue; c.u = u;
  c.bl = box.left; c.bt = box.top;
  c.br = box.right; c.bb = box.bottom;
  c.grad = grad;
  return grad;
}
```

**Why explicit slots over LRU**: Direct indexed lookup — no loop, no round-robin counter, deterministic, O(1), immediately clear intent.

> **Note — Why text.js and grid.js also call `createGradient` directly:**
> They don't have separate caches — they all inherit the same `createGradient()` from Shape. Text bypasses `applyStyle()` because it uses `fillText()`/`strokeText()` instead of path-based `fill()`/`stroke()`. Grid's label rendering (line 101) similarly uses `fillText()` separately from the grid lines drawn via `applyStyle()`. The changes are trivial — just appending `, 0` or `, 1` to existing calls.

> **Note — Animated gradients** (e.g. `fill="linear(t * 90, ['red', 'blue'])"`) create a new descriptor object every frame, so the reference check (`config === styleValue`) naturally misses → gradient is correctly recreated. No separate fix needed — animated gradients simply can't be cached, and the current design handles this correctly by virtue of object identity.

> **Note**: This also solves Point 1 (bounding box cache bug) automatically — bbox values are part of every cache check.

---

### 3. Clean Up Angle Calculation (Dead Code Removal)

**The problem**: In `compiler.js:55-69`, when `linear()` receives an angle (number), it computes `x1, y1, x2, y2` using a `stretch` normalization formula. But `shape.js:125-133` has a completely separate angle→endpoint calculation using `distance = |w/2·cos| + |h/2·sin|` and **ignores** the descriptor's x1/y1/x2/y2. The stretch computation is dead code.

**Fix**: In `linear()`, when angle mode, only store `angle` and `stops` — skip the x1/y1/x2/y2 computation entirely:

```javascript
pxl.scope.linear = (direction, colorsArray) => {
  const stops = _parseStops(colorsArray);
  if (typeof direction === 'number') {
    return { isGradient: true, type: 'linear', angle: direction, stops };
  }
  const [x1, y1, x2, y2] = direction;
  return { isGradient: true, type: 'linear', x1, y1, x2, y2, stops };
};
```

---

### 4. Add Conic Gradient

**Browser support**: `createConicGradient()` is Baseline Widely Available (Chrome 99+, Firefox 112+, Safari 16.4+, Edge 99+).

**Proposed API** (consistent with `linear` and `radial`):

```html
<!-- Simple mode: just start angle (degrees), centered on bbox center -->
fill="conic(0, ['red', 'yellow', 'lime', 'cyan', 'blue', 'magenta', 'red'])"

<!-- Config mode: [startAngle, cx, cy] with proportional center -->
fill="conic([90, 0.3, 0.7], ['red', 'blue'])"
```

**Pattern consistency**:
| Gradient | Simple | Config array |
|----------|--------|-------------|
| `linear` | `(angle, colors)` | `([x1,y1,x2,y2], colors)` |
| `radial` | `(radius, colors)` | `([cx,cy,r], colors)` |
| `conic`  | `(startAngle, colors)` | `([startAngle,cx,cy], colors)` |

**Implementation in `compiler.js`**:
```javascript
pxl.scope.conic = (angleOrConfig, colorsArray) => {
  const stops = _parseStops(colorsArray);
  let startAngle = 0, cx = 0.5, cy = 0.5;
  if (typeof angleOrConfig === 'number') startAngle = angleOrConfig;
  else if (Array.isArray(angleOrConfig)) [startAngle, cx, cy] = angleOrConfig;
  return { isGradient: true, type: 'conic', startAngle, cx, cy, stops };
};
```

**Implementation in `shape.js`** (new branch in `createGradient`):
```javascript
} else if (styleValue.type === 'conic') {
  const gcx = (box.left + width * styleValue.cx) * u;
  const gcy = (box.top + height * styleValue.cy) * u;
  grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
}
```

---

### 5. Edge Cases — No Changes Needed

| Case | Current behavior | Assessment |
|------|-----------------|------------|
| Single-color `['red']` | `|| 1` prevents div-by-zero → one stop at offset 0 → solid color | ✅ Correct |
| Empty array `[]` | No stops added → transparent black | ✅ Acceptable (user error) |
| Zero-area bbox (`w=0`, `r=0`) | Degenerate gradient created but shape is invisible | ✅ No-op in practice |

---

### 6. Extract Shared Stop Parsing

All three gradient functions (`linear`, `radial`, `conic`) share identical stop-parsing logic. Extract it into a local helper to eliminate duplication:

```javascript
function _parseStops(colorsArray) {
  const stops = [];
  if (!Array.isArray(colorsArray) || colorsArray.length === 0) return stops;
  if (typeof colorsArray[0] === 'string') {
    const step = 1 / (colorsArray.length - 1 || 1);
    for (let i = 0; i < colorsArray.length; i++) {
      stops.push({ offset: i * step, color: colorsArray[i] });
    }
  } else {
    for (let i = 0; i < colorsArray.length; i += 2) {
      stops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
    }
  }
  return stops;
}
```

---

## GC & Performance Audit

### Cache HIT path (60fps hot loop, most common):
- `getBoundingBox()`: returns pre-allocated `this.boundingBox` — **zero alloc**
- `this._gradCache[slot]`: array index into pre-allocated array — **zero alloc**
- 6 primitive comparisons → return cached `CanvasGradient`
- **New cost vs old**: `getBoundingBox()` call + 4 extra comparisons (O(1) for all shapes except polyline O(n), negligible for typical point counts)

### Cache MISS path:
- 1 `CanvasGradient` allocation (unavoidable, same as before)
- Cache storage: mutates pre-allocated object properties — **zero alloc**

### Constructor (once per shape):
- Old: 3 flat properties (`_cachedGradient`, `_lastGradientConfig`, `_lastGradientU`)
- New: 1 array + 2 objects (pre-allocated, mutated in-place forever)
- One-time cost, no per-frame impact

### `_parseStops()` allocations:
- Creates new `stops[]` array + `{ offset, color }` objects per call
- **Same allocation pattern as existing code** — just extracted into a helper
- Static gradients: runs once at compile time (cached in `staticCache`)
- Animated gradients: runs every frame — existing behavior, no regression

---

## Summary of File Changes

### [MODIFY] `js/compiler.js`
- Extract `_parseStops()` helper (used by all 3 gradient functions)
- Clean up `linear()` — remove dead stretch computation for angle mode, use `_parseStops`
- Clean up `radial()` — use `_parseStops`
- Add `conic()` scope function
- `pxl.scopeKeys` auto-updates (it reads `Object.keys(pxl.scope)`)

### [MODIFY] `js/elements/shape.js`
- Replace 3 flat cache properties with pre-allocated `_gradCache[2]` array
- Rewrite `createGradient(ctx, u, styleValue, slot)` with bbox-aware dual-slot cache
- Add `conic` gradient creation branch
- Deduplicate stop-application loop (shared across linear/radial/conic)

### [MODIFY] `js/elements/shapes/text.js` — 2 trivial changes
- Line 167: `this.createGradient(ctx, u, fill)` → `this.createGradient(ctx, u, fill, 0)`
- Line 169: `this.createGradient(ctx, u, stroke)` → `this.createGradient(ctx, u, stroke, 1)`

### [MODIFY] `js/elements/shapes/grid.js` — 1 trivial change
- Line 101: `this.createGradient(ctx, u, fillAttr)` → `this.createGradient(ctx, u, fillAttr, 0)`

### [MODIFY] `.agents/KILOPIXEL.md`
- Document `conic()` gradient syntax and behavior in Color & Gradient System section
- Update gradient caching section to reflect dual-slot + bbox-aware cache
- Add `conic()` to scope reference in AI Code Generation Guide

### No changes needed
- All existing HTML examples/docs — `linear`/`radial` syntax unchanged, `conic` is new ✅

---

## Verification Plan

### Automated
- `node build.js` — verify clean build and no size regression beyond expected conic addition

### Manual (test41.html)
- **Test B** (animated width): gradient should now stretch with the rect at all sizes
- **Test C** (animated polyline): gradient center should track the triangle's centroid
- **Test A** (moving rect): should remain working (no regression)
- **New test**: dual fill+stroke gradients on same shape — both should render correctly
- **New test**: conic gradient on circle, rect, and text
