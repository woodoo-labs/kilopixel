# Radial Gradient: Unified 6-Value Mode

## 1. The Problem

The current `radial()` function uses a **point-based** radius system with 4 overloaded sub-modes (2, 4, 6, 8 values). This creates several issues:

1. **DX Paradox**: Two fundamentally different use cases — responsive anchoring (radius locked to a bounding box position) vs. panning spotlights (radius travels with center) — are forced into one mental model.
2. **Inconsistency**: In 4/6-value modes, the inner radius point secretly tracks the center point (`rx0 = cx0`), breaking the "absolute coordinate" philosophy that the 8-value mode follows.
3. **Unintuitive radius specification**: Raw coordinate pairs like `[1, 1]` require the user to think in Euclidean distance to understand the resulting radius.

## 2. The Solution: Canvas-Aligned Syntax

Replace the current `radial()` entirely with a new design that mirrors the native Canvas `createRadialGradient(x0, y0, r0, x1, y1, r1)` signature — **6 arguments, two circles** — but with a type-based dual-mode for radii.

### Full Syntax (6-Value)

```
radial([x0, y0, r0, x1, y1, r1], colorsArray)
```

- `x0, y0` — Center of the start circle. Normalized 0–1, relative to bounding box.
- `x1, y1` — Center of the end circle. Normalized 0–1, relative to bounding box.
- `r0` — Radius of the start circle. Can be a **number** (proportional to bounding box width / x-direction) or a **string keyword**.
- `r1` — Radius of the end circle. Can be a **number** (proportional to bounding box width / x-direction) or a **string keyword**.
- `colorsArray` — Color stops array (unchanged from current system).

### Simplified Modes

```
radial([r1], colorsArray)                      — 1-value
radial([x0, y0, r1], colorsArray)              — 3-value
radial([x0, y0, r0, x1, y1, r1], colorsArray)  — 6-value (full)
```

**1-value** — Centered glow. Start and end circles share center at `(0.5, 0.5)`, start radius is 0.

```html
fill="radial([0.5], ['white', 'black'])"
fill="radial(['farthest-corner'], ['white', 'black'])"
```

Defaults: `x0 = 0.5, y0 = 0.5, r0 = 0, x1 = 0.5, y1 = 0.5`

**3-value** — Off-center highlight. Place the gradient origin and define how far it reaches. Start radius is 0, end circle shares the same center.

```html
fill="radial([0.3, 0.3, 'farthest-corner'], ['white', 'black'])"
fill="radial([0.2, 0.2, 0.4], ['white', 'black'])"
```

Defaults: `r0 = 0, x1 = x0, y1 = y0`

**6-value** — Full control. Two independent circles, each with center and radius.

```html
fill="radial([0.3, 0.3, 0, 0.5, 0.5, 0.5], ['white', 'black'])"
fill="radial([0.5, 0.5, 'center', 0.5, 0.5, 'farthest-corner'], ['white', 'black'])"
```

### Radius Mode Detection (typeof r)

The engine detects the radius mode by checking `typeof r`:

| `r` value | Type | Mode | Behavior |
|---|---|---|---|
| `0.5` | number | **Relative** | Scalar radius = `r × bounding box width`. Moves with center. Standard Canvas behavior. |
| `'top-right'` | string | **Anchor** | Euclidean pixel distance from center to the named position on the bounding box. Responsive. |
| `'farthest-corner'` | string | **Dynamic** | Auto-computed distance based on center position and bounding box geometry. Matches CSS. |

### Supported Keywords (13 total)

**9 Position Anchors** (reuse existing `pxl.anchorX` / `pxl.anchorY` tables):

| Keyword | Bounding Box Position (x, y) |
|---|---|
| `'top-left'` | (0, 0) |
| `'top'` | (0.5, 0) |
| `'top-right'` | (1, 0) |
| `'left'` | (0, 0.5) |
| `'center'` | (0.5, 0.5) |
| `'right'` | (1, 0.5) |
| `'bottom-left'` | (0, 1) |
| `'bottom'` | (0.5, 1) |
| `'bottom-right'` | (1, 1) |

**4 CSS Dynamic Keywords:**

| Keyword | Behavior |
|---|---|
| `'closest-side'` | Distance from center to the nearest bounding box edge |
| `'farthest-side'` | Distance from center to the farthest bounding box edge |
| `'closest-corner'` | Distance from center to the nearest bounding box corner |
| `'farthest-corner'` | Distance from center to the farthest bounding box corner |

### Coverage

- ✅ Standard Canvas `createRadialGradient` (all numbers)
- ✅ CSS `farthest-corner` / `closest-side` behavior
- ✅ Specific edge/corner anchoring (**CSS cannot do this**)
- ✅ r0 and r1 can independently use different modes (number + keyword mixed)
- ✅ Single `radial()` function, no mode split needed

## 3. Engine Implementation

### Step 1: Update Compiler (`js/compiler.js`)

Replace the current `pxl.scope.radial` (lines 81–103) with:

```javascript
pxl.scope.radial = (config, colorsArray) => {
  const stops = _parseStops(colorsArray);
  const a = config;
  const len = a.length;

  let x0 = 0.5, y0 = 0.5, r0 = 0;
  let x1 = 0.5, y1 = 0.5, r1 = 0.5;

  if (len === 1) {
    r1 = a[0];
  } else if (len === 3) {
    x0 = a[0]; y0 = a[1]; r1 = a[2];
    x1 = x0; y1 = y0;
  } else if (len >= 6) {
    x0 = a[0]; y0 = a[1]; r0 = a[2];
    x1 = a[3]; y1 = a[4]; r1 = a[5];
  }

  return { isGradient: true, type: 'radial', x0, y0, r0, x1, y1, r1, stops };
};
```

### Step 2: Update Renderer (`js/elements/shape.js`)

Replace the radial branch in `createGradient()` (lines 147–163) with:

```javascript
} else if (styleValue.type === 'radial') {
  const px0 = (box.left + width * styleValue.x0) * u;
  const py0 = (box.top + height * styleValue.y0) * u;
  const px1 = (box.left + width * styleValue.x1) * u;
  const py1 = (box.top + height * styleValue.y1) * u;

  const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height, u);
  const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height, u);

  grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);
}
```

### Step 3: Add Radius Resolver (`js/graphics.js`)

Add a new helper function `pxl.resolveRadius` that handles all three radius modes:

```javascript
pxl.resolveRadius = (r, x, y, w, h, u) => {
  // MODE 1: Relative (number) — scalar radius, relative to width
  if (typeof r === 'number') {
    return Math.abs(r * w * u);
  }

  // MODE 2: Position Anchor — distance from center to named point
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const ay = pxl.anchorY[r];
    const dx = (x - ax) * w * u;
    const dy = (y - ay) * h * u;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // MODE 3: CSS Dynamic Keywords — auto-computed from center + bbox
  const lx = x * w * u;           // distance from center to left edge
  const rx = (1 - x) * w * u;     // distance from center to right edge
  const ty = y * h * u;           // distance from center to top edge
  const by = (1 - y) * h * u;     // distance from center to bottom edge

  switch (r) {
    case 'closest-side':
      return Math.min(lx, rx, ty, by);
    case 'farthest-side':
      return Math.max(lx, rx, ty, by);
    case 'closest-corner':
      return Math.min(
        Math.sqrt(lx*lx + ty*ty), Math.sqrt(rx*rx + ty*ty),
        Math.sqrt(lx*lx + by*by), Math.sqrt(rx*rx + by*by)
      );
    case 'farthest-corner':
      return Math.max(
        Math.sqrt(lx*lx + ty*ty), Math.sqrt(rx*rx + ty*ty),
        Math.sqrt(lx*lx + by*by), Math.sqrt(rx*rx + by*by)
      );
    default:
      return 0;
  }
};
```

## 4. Files Changed

| File | Change |
|---|---|
| `js/compiler.js` | Replace `pxl.scope.radial` (lines 81–103) |
| `js/elements/shape.js` | Replace radial branch in `createGradient()` (lines 147–163) |
| `js/graphics.js` | Add `pxl.resolveRadius()` |

## 5. What Gets Removed

- The entire point-based radius system (`rx0, ry0, rx1, ry1` coordinate pairs)
- All 2/4/6/8 value sub-mode branching in the compiler
- No backward compatibility — old `radial()` syntax is fully retired

## 6. Future Extensions (Not In This Plan)

- **Elliptical gradients**: Would require Canvas context transform trick
- **Documentation update**: `docs/gradients.html` sections 3–6 need full rewrite
- **KILOPIXEL.md update**: Gradient API reference section
