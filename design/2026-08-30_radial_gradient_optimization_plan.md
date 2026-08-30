# Radial Gradient — Point-Based Syntax

## Goal

Replace the current scalar-radius radial gradient API with a point-based system where every radius is defined by the Euclidean distance between two points in normalized 0–1 bounding-box space. This eliminates the ambiguity of what a scalar radius means on non-square bounding boxes.

### New Syntax

| Args | Syntax | Description |
|:---:|---|---|
| **2** | `radial([ex1, ey1], colors)` | Extent only. Center at (0.5, 0.5) |
| **4** | `radial([x1, y1, ex1, ey1], colors)` | End center + extent |
| **6** | `radial([x0, y0, x1, y1, ex1, ey1], colors)` | Start center, End center + extent |
| **8** | `radial([x0, y0, ex0, ey0, x1, y1, ex1, ey1], colors)` | Full — both circles defined |

| Variable | Label | Canvas Mapping |
|---|---|---|
| `x0, y0` | Start Center X/Y | Canvas `x0, y0` |
| `ex0, ey0` | Start Extent X/Y | Replaces Canvas `r0` |
| `x1, y1` | End Center X/Y | Canvas `x1, y1` |
| `ex1, ey1` | End Extent X/Y | Replaces Canvas `r1` |

> [!IMPORTANT]
> **Breaking change**: The old `radial(number, colors)` and all previous array-length modes are removed. This is intentional — we're designing the correct API, not maintaining backward compatibility.

---

## Proposed Changes

### Compiler

#### [MODIFY] [compiler.js](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js)

Replace the `pxl.scope.radial` function (lines 81–118). The new function:

- **Always requires an array** as first argument (no number mode)
- **Dispatches by array length**: 2, 4, 6, 8
- **Stores 8 normalized coordinates** in the descriptor object: `x0, y0, ex0, ey0, x1, y1, ex1, ey1`
- Shorter modes fill defaults: center at (0.5, 0.5), extent = center (r = 0)

```javascript
pxl.scope.radial = (config, colorsArray) => {
  const stops = _parseStops(colorsArray);
  const a = config;
  const len = a.length;

  // Defaults: both circles at center, zero radii
  let x0 = 0.5, y0 = 0.5, ex0 = 0.5, ey0 = 0.5;
  let x1 = 0.5, y1 = 0.5, ex1 = 0.5, ey1 = 0.5;

  if (len === 2) {
    // [ex1, ey1] — center implied at (0.5, 0.5)
    ex1 = a[0]; ey1 = a[1];
  } else if (len === 4) {
    // [x1, y1, ex1, ey1] — end circle center + extent
    x1 = a[0]; y1 = a[1]; ex1 = a[2]; ey1 = a[3];
    x0 = x1; y0 = y1;  // start circle collapses to end center
  } else if (len === 6) {
    // [x0, y0, x1, y1, ex1, ey1] — start center, end center + extent
    x0 = a[0]; y0 = a[1]; x1 = a[2]; y1 = a[3]; ex1 = a[4]; ey1 = a[5];
    ex0 = x0; ey0 = y0;  // start circle has r0 = 0
  } else if (len >= 8) {
    // [x0, y0, ex0, ey0, x1, y1, ex1, ey1] — full
    x0 = a[0]; y0 = a[1]; ex0 = a[2]; ey0 = a[3];
    x1 = a[4]; y1 = a[5]; ex1 = a[6]; ey1 = a[7];
  }

  return { isGradient: true, type: 'radial', x0, y0, ex0, ey0, x1, y1, ex1, ey1, stops };
};
```

**GC note**: One descriptor object is allocated per `radial()` call. This is identical to the current behavior — the scope function is called during expression evaluation (once per frame for animated gradients, or once on change for reactive). The object is compared by reference in the gradient cache, so identical static gradients reuse the cached `CanvasGradient`.

---

### Shape Rendering

#### [MODIFY] [shape.js](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/shape.js)

Replace the radial branch in `createGradient()` (lines 147–160). The new code:

1. Converts all 8 normalized coordinates to pixel space using the bounding box
2. Computes each radius as Euclidean distance between center and extent in pixel space
3. Calls `ctx.createRadialGradient(px0, py0, r0, px1, py1, r1)`

```javascript
} else if (styleValue.type === 'radial') {
  // Convert normalized coordinates to pixel space
  const px0  = (box.left + width * styleValue.x0) * u;
  const py0  = (box.top + height * styleValue.y0) * u;
  const pex0 = (box.left + width * styleValue.ex0) * u;
  const pey0 = (box.top + height * styleValue.ey0) * u;
  const px1  = (box.left + width * styleValue.x1) * u;
  const py1  = (box.top + height * styleValue.y1) * u;
  const pex1 = (box.left + width * styleValue.ex1) * u;
  const pey1 = (box.top + height * styleValue.ey1) * u;

  // Radii = Euclidean distance between center and extent in pixel space
  const dx0 = pex0 - px0, dy0 = pey0 - py0;
  const r0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);

  const dx1 = pex1 - px1, dy1 = pey1 - py1;
  const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

  grad = ctx.createRadialGradient(px0, py0, r0, px1, py1, r1);
}
```

**Performance notes**:

- **Zero new allocations** — all values are local `const` variables on the stack. No objects, no arrays.
- **Two `Math.sqrt` calls** per cache miss — negligible. These only execute when the gradient is recreated (bounding box change, `u` change, or descriptor change).
- **Existing cache is sufficient** — the dual-slot cache (line 110–117) already tracks `styleValue` by reference, `u`, and all 4 bounding box edges. If none of these change, the cached `CanvasGradient` is returned immediately. This handles:
  - **Shape moves/rotates**: Bounding box is in local space (before transforms), so translation and rotation don't change it → cache hit ✓
  - **Shape resizes** (animated `w`, `h`, `r`, etc.): Bounding box values change → cache miss → gradient recreated ✓
  - **Window resize**: `u` changes → cache miss → gradient recreated ✓
  - **Animated gradient** (e.g., `fill="radial([wave(2), 0.5], colors)"`): Descriptor object reference changes every frame → cache miss → gradient recreated ✓
  - **Static gradient on static shape**: Everything matches → cache hit every frame ✓

---

### Documentation

#### [MODIFY] [KILOPIXEL.md](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md)

Update the "Color & Gradient System" section (around lines 401–428) to replace the old 7-mode radial documentation with the new 4-mode point-based syntax.

---

## Verification Plan

### Manual Verification

1. **2-arg mode** — `radial([1, 1], ['red', 'blue'])` on a `pxl-rect` with `w="400" h="200"`. Gradient should radiate from center to corners.
2. **4-arg mode** — `radial([0.3, 0.3, 1, 1], ['white', 'blue'])` on same rect. Off-center highlight reaching bottom-right corner.
3. **6-arg spotlight** — `radial([0.3, 0.3, 0.5, 0.5, 1, 0.5], ['white', 'blue'])`. Focus offset from center, gradient reaching right edge.
4. **8-arg full** — `radial([0.3, 0.3, 0.35, 0.3, 0.5, 0.5, 1, 1], ['white', 'blue'])`. Both circles with non-zero radii.
5. **Circle shape** — `radial([0.5, 1], ['red', 'blue'])` on a `pxl-circle`. Gradient should perfectly inscribe the circle.
6. **Animated shape** — Rect with `w="200 + wave(3) * 400"`. Gradient should smoothly adapt as dimensions change.
7. **Animated gradient** — `fill="radial([wave(2), 0.5], ['red', 'blue'])"`. Gradient center should animate left-to-right.
8. **Stroke gradient** — `stroke="radial([1, 1], ['red', 'blue'])"` with `fill="none"`. Gradient should apply to stroke.
9. **Rotated shape** — Apply `rotate="45"` to the rect. Gradient should rotate with the shape, not shift.
10. **Build** — Run `node build.js` and verify minified output.
