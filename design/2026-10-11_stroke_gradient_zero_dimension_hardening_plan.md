# Stroke Gradient Zero-Dimension Hardening & Degeneracy Prevention Plan

**Date:** 2026-10-11  
**Status:** Approved Design Plan  
**Target Component:** `js/elements/shape.js` (`Shape.prototype.createGradient`, `this._gradCache`)  
**Related Components:** `js/elements/shapes/line.js`, `js/elements/shapes/polyline.js`

---

## 1. Executive Summary & Problem Statement

During interactive documentation authoring for [`docs/line.html`](../docs/line.html) (Section 2: Line Styles), an engine bug was observed:
> When applying a linear gradient to the `stroke` attribute of `<pxl-line>` (e.g. `stroke="linear(angle, ['#3b82f6', '#ec4899'])"`), the line completely vanishes whenever `angle` is set to $90^\circ$ or $270^\circ$.

The identical defect also occurs for vertical lines when `angle` is set to $0^\circ$ or $180^\circ$, or for flat horizontal/vertical polylines (`<pxl-polyline>`).

---

## 2. Mathematical Root Cause Analysis

### 2.1 Geometric Bounding Box of Zero-Thickness Shapes
In Kilopixel, shape geometry classes implement `getBoundingBox()` to report their raw vector extents:
```javascript
// js/elements/shapes/line.js
getBoundingBox() {
  const { x1, y1, x2, y2 } = this.attributeValues;
  this.boundingBox.left = Math.min(x1, x2);
  this.boundingBox.right = Math.max(x1, x2);
  this.boundingBox.top = Math.min(y1, y2);
  this.boundingBox.bottom = Math.max(y1, y2);
  return this.boundingBox;
}
```
For a horizontal line spanning $(550, 300) \to (850, 300)$ with `strokewidth="14"`:
* `box.left = 550`, `box.right = 850` $\implies \text{width} = 300$
* `box.top = 300`, `box.bottom = 300` $\implies \text{height} = 0$

### 2.2 Gradient Half-Span Projection Collapse
In `js/elements/shape.js` (`createGradient`), the gradient's half-span projection distance is calculated as:
$$\text{distance} = \left|\frac{\text{width}}{2} \cdot \cos(\theta)\right| + \left|\frac{\text{height}}{2} \cdot \sin(\theta)\right|$$

When $\theta = 90^\circ$ or $270^\circ$:
* $\cos(90^\circ) = 0$ (in IEEE 754 float: $\approx 6.12 \times 10^{-17}$)
* $\sin(90^\circ) = 1$
* Because $\text{height} = 0$:
  $$\text{distance} = \left|150 \cdot 6.12 \times 10^{-17}\right| + |0 \cdot 1| \approx 9.18 \times 10^{-15}$$

When computing the Canvas gradient endpoints around the line's center $(bx, by) = (700, 300)$:
$$gx_1 = (bx - \text{distance} \cdot \cos\theta) \cdot u = (700 - 0) \cdot u = 700 \cdot u$$
$$gx_2 = (bx + \text{distance} \cdot \cos\theta) \cdot u = (700 + 0) \cdot u = 700 \cdot u$$
$$gy_1 = (by - \text{distance} \cdot \sin\theta) \cdot u = (300 - 9.18 \times 10^{-15}) \cdot u = 300 \cdot u$$
$$gy_2 = (by + \text{distance} \cdot \sin\theta) \cdot u = (300 + 9.18 \times 10^{-15}) \cdot u = 300 \cdot u$$

Due to 64-bit double float precision limits, $300 \pm 9.18 \times 10^{-15} \equiv 300$.

### 2.3 W3C HTML5 Canvas 2D Specification Mandate
The resulting native Canvas call is:
```javascript
ctx.createLinearGradient(700 * u, 300 * u, 700 * u, 300 * u);
```
Per the official W3C Canvas 2D Context Specification:
> *"If $x_0 = x_1$ and $y_0 = y_1$, then the linear gradient must paint nothing."*

The browser natively renders the stroke as **100% transparent**, causing the line to completely disappear.

---

## 3. Architecture & Alternatives Evaluated

### Option A: Expand `getBoundingBox()` in `line.js` and `polyline.js`
* **Approach:** Expand `left, right, top, bottom` by $\pm \text{strokewidth} / 2$.
* **Rejection Rationale:**
  1. **Semantic Inconsistency:** Across all other Kilopixel shapes (`<pxl-circle>`, `<pxl-rect>`, `<pxl-ellipse>`), `getBoundingBox()` strictly returns path geometry bounds without stroke expansion.
  2. **Imperfect Alignment for `linecap="butt"`:** Expanding the longitudinal axis by $\text{strokewidth} / 2$ would artificially stretch a $0^\circ$ horizontal gradient beyond the line's actual endpoints when using butt caps.
  3. **Near-Zero Slopes:** If a line has a microscopic vertical slope (e.g. $y_1 = 300, y_2 = 300.1$), `height` would be non-zero ($0.1$), yet still far smaller than `strokewidth` ($14$). The gradient across the stroke would be squeezed into a $0.1$-unit sliver.

### Option B: Stroke-Aware Dimension Resolution in `Shape.prototype.createGradient` (Approved)
* **Approach:** Keep `getBoundingBox()` mathematically pure, but recognize the physical reality of the rendering pipeline inside `createGradient`:
  * Slot 0 is **fill**; slot 1 is **stroke**.
  * A stroked shape has a physical rendering footprint of at least `strokewidth` across any dimension.
  * When `slot === 1`, any dimension smaller than `strokewidth` expands to `strokewidth`.
  * If any dimension is 0 (even for fill), fallback to `strokewidth || 1` to guarantee mathematical non-degeneracy.
  * Clamp $\text{distance}$ to a minimum of $0.001$, with an explicit endpoint separation guard ($gx_2 += 0.001$).

---

## 4. Technical Specification

### 4.1 Dimension Resolution Algorithm
```javascript
const rawWidth = box.right - box.left;
const rawHeight = box.bottom - box.top;
const sw = this.attributeValues.strokewidth || 1;

// Stroke slot expands to at least strokewidth; zero dimensions fall back safely to sw
const width = rawWidth > 0 ? (slot === 1 && rawWidth < sw ? sw : rawWidth) : sw;
const height = rawHeight > 0 ? (slot === 1 && rawHeight < sw ? sw : rawHeight) : sw;
```

### 4.2 Angle-Based Linear Gradient Guard
```javascript
if (styleValue.angle !== undefined) {
  const bx = (box.left + box.right) / 2;
  const by = (box.top + box.bottom) / 2;
  const rad = styleValue.angle * Math.PI / 180;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);
  const distance = Math.max(0.001, Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad));
  gx1 = (bx - distance * cosRad) * u;
  gy1 = (by - distance * sinRad) * u;
  gx2 = (bx + distance * cosRad) * u;
  gy2 = (by + distance * sinRad) * u;
  if (gx1 === gx2 && gy1 === gy2) gx2 += 0.001 * u;
}
```

### 4.3 Coordinate-Based Linear Gradient Guard (`linear([x1, y1, x2, y2])`)
When a gradient uses unit-interval coordinates rather than an angle:
```javascript
} else {
  const baseX = rawWidth > 0 ? box.left : (box.left - width / 2);
  const baseY = rawHeight > 0 ? box.top : (box.top - height / 2);
  gx1 = (baseX + width * styleValue.x1) * u;
  gy1 = (baseY + height * styleValue.y1) * u;
  gx2 = (baseX + width * styleValue.x2) * u;
  gy2 = (baseY + height * styleValue.y2) * u;
  if (gx1 === gx2 && gy1 === gy2) gx2 += 0.001 * u;
}
```

### 4.4 Stroke-Width-Aware Cache Invalidation
Currently, `this._gradCache` checks `config`, `u`, and `box` coordinates:
```javascript
// Existing check (shape.js line 110)
if (c.config === styleValue && c.u === u &&
    c.bl === box.left && c.bt === box.top &&
    c.br === box.right && c.bb === box.bottom) {
  return c.grad;
}
```
Because `getBoundingBox()` on `<pxl-line>` depends only on $(x_1, y_1, x_2, y_2)$, moving the `strokewidth` slider does not change `box`. If `strokewidth` changes, the stroke gradient would return the stale cached gradient!

**Fix:** Add `sw: 0` to pre-allocated cache slots in the `Shape` constructor and include `(slot === 0 || c.sw === sw)` in the validation check:
```javascript
// In Shape constructor:
this._gradCache = [
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null },
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null }
];

// In createGradient check:
if (c.config === styleValue && c.u === u &&
    c.bl === box.left && c.bt === box.top &&
    c.br === box.right && c.bb === box.bottom &&
    (slot === 0 || c.sw === sw)) {
  return c.grad;
}

// In createGradient cache update:
c.config = styleValue;
c.u = u;
c.bl = box.left;
c.bt = box.top;
c.br = box.right;
c.bb = box.bottom;
c.sw = sw;
c.grad = grad;
```

---

## 5. Mathematical Verification & Coordinate Output

Empirical verification script (`scratch/test_grad_fix.js`) confirms the resulting coordinate behavior:

### Horizontal Line ($x_1=550, y_1=300 \to x_2=850, y_2=300, \text{sw}=14$):
| Angle | Start $(gx_1, gy_1)$ | End $(gx_2, gy_2)$ | Vector Length | Visual Effect |
| :---: | :---: | :---: | :---: | :--- |
| **$0^\circ$** | $(550.0, 300.0)$ | $(850.0, 300.0)$ | $300.0$ | Horizontal gradient along the length of the line (left $\to$ right) |
| **$45^\circ$** | $(621.5, 221.5)$ | $(778.5, 378.5)$ | $222.0$ | Diagonal gradient traversing the line at $45^\circ$ |
| **$90^\circ$** | $(700.0, 293.0)$ | $(700.0, 307.0)$ | $14.0$ | **Vertical gradient across the 14-unit stroke thickness** (top $\to$ bottom) |
| **$180^\circ$** | $(850.0, 300.0)$ | $(550.0, 300.0)$ | $300.0$ | Horizontal gradient along the length of the line (right $\to$ left) |
| **$270^\circ$** | $(700.0, 307.0)$ | $(700.0, 293.0)$ | $14.0$ | **Vertical gradient across the 14-unit stroke thickness** (bottom $\to$ top) |
| **$360^\circ$** | $(550.0, 300.0)$ | $(850.0, 300.0)$ | $300.0$ | Identical to $0^\circ$ |

### Vertical Line ($x_1=700, y_1=150 \to x_2=700, y_2=450, \text{sw}=14$):
| Angle | Start $(gx_1, gy_1)$ | End $(gx_2, gy_2)$ | Vector Length | Visual Effect |
| :---: | :---: | :---: | :---: | :--- |
| **$0^\circ$** | $(693.0, 300.0)$ | $(707.0, 300.0)$ | $14.0$ | **Horizontal gradient across the 14-unit stroke width** (left $\to$ right) |
| **$90^\circ$** | $(700.0, 150.0)$ | $(700.0, 450.0)$ | $300.0$ | Vertical gradient along the length of the line (top $\to$ bottom) |
| **$180^\circ$** | $(707.0, 300.0)$ | $(693.0, 300.0)$ | $14.0$ | **Horizontal gradient across the 14-unit stroke width** (right $\to$ left) |
| **$270^\circ$** | $(700.0, 450.0)$ | $(700.0, 150.0)$ | $300.0$ | Vertical gradient along the length of the line (bottom $\to$ top) |

---

## 6. Zero-GC & Performance Compliance

* **Zero Allocations:** No objects, arrays, or closures are created in the hot render path. All operations use primitive IEEE 754 scalars.
* **Pre-allocated Cache:** `_gradCache` maintains fixed slot objects `[0]` and `[1]` instantiated once in constructor.
* **60 FPS Sustained Throughput:** When sliders are idle, `createGradient` returns cached `CanvasGradient` instances in $O(1)$ time with zero garbage collection overhead.

---

## 7. Implementation & Rollout Steps

1. **Source Code Edit:** Apply changes to `js/elements/shape.js`.
2. **Build Execution:** Run `node build.js` to compile and minify `dist/pxl.min.js` and `docs/js/pxl.min.js`.
3. **Interactive Verification:** Open `docs/line.html` Section 2 ("Line Styles") and verify that adjusting the Gradient Angle slider through $90^\circ$ and $270^\circ$ renders continuously without vanishing.
4. **Git Commit & Push:** Commit both the design document and engine fix.
