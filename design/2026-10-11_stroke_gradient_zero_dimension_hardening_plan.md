# Stroke Gradient Zero-Dimension Hardening & Degeneracy Prevention Plan

**Date:** 2026-10-11 (revised 2026-11-05)  
**Status**: ✅ **Implemented** (2026-11-05, revised approach of §3–4; 6 tests in `tests/index.html` fail on the old build and pass on the new one; 160 docs canvases pixel-identical before and after)  
**Target Component:** `js/elements/shape.js` (`Shape.prototype.createGradient`, `this._gradCache`)  
**Related:** `design/archive/2026-11-05_draw_errors_plan.md` §3.1 (stop offset clamping in the same function; built together, §7)  
**Prototype** (local, scratch is git-ignored): `scratch/gradient_stops/stroke_gradient_zero.html` (9 cases, before / after)

---

## 1. Executive Summary & Problem Statement

During interactive documentation authoring for [`docs/line.html`](../docs/line.html) (Section 2: Line Styles), an engine bug was observed:
> When applying a linear gradient to the `stroke` attribute of `<pxl-line>` (e.g. `stroke="linear(angle, ['#3b82f6', '#ec4899'])"`), the line completely vanishes whenever `angle` is set to $90^\circ$ or $270^\circ$.

The identical defect also occurs for vertical lines when `angle` is set to $0^\circ$ or $180^\circ$, or for flat horizontal/vertical polylines (`<pxl-polyline>`).

**Reproduced on 2026-11-05** (`stroke_gradient_zero.html`, `strokewidth="28"`):

| Case | Today |
|---|---|
| Horizontal line, `linear(0, …)` and `linear(45, …)` | correct |
| Horizontal line, `linear(90, …)` | **invisible** |
| Vertical line, `linear(0, …)` | **invisible** |
| Flat polyline, `linear(90, …)` | **invisible** |
| Horizontal line, vector `linear([0, 0, 0, 1], …)` | **invisible** |
| Rect `h="4"`, `linear(90, …)` | **squeezed**: the gradient spans the 4 units of the path, so a 28-unit stroke shows a hard edge between the two colors |
| Horizontal line, `radial(['farthest-side'], …)` and `conic(…)` | visible |

**On the docs page** (`docs/line.html` section 2, line `sec2Line2`: `x1="550" y1="300" x2="850" y2="300" strokewidth="30" linecap="round"`, angle slider 0–360 in steps of 15), the pixel at the line's center (700, 300) on 2026-11-05:

| Angle | Pixel |
|---|---|
| 0°, 45°, 180° | the gradient's mid color (148, 101, 199) |
| **90°** | **background** (240, 245, 248): the line is gone |
| 270° | visible (147, 102, 200) |

270° is visible here only by floating-point luck: the rounding errors leave the two end points a tiny distance apart, so the canvas still paints. It is the same degenerate case and must not depend on that.

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

The vector form (`linear([0, 0, 0, 1], …)`) collapses the same way: $y_1$ and $y_2$ are both `box.top + 0 × height`.

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

### Option B: Stroke-Aware Gradient Area in `Shape.prototype.createGradient` (Approved 2026-10-11, revised 2026-11-05)
* **Approach:** Keep `getBoundingBox()` the pure path geometry, but let `createGradient` size the **stroke** gradient (slot 1) to what a stroke actually covers: each side of the gradient area is at least `strokewidth`, **centered on the bounding box**. Fill gradients (slot 0) are unchanged.
* **Revision 2026-11-05** (compared with the 2026-10-11 version):
  1. **Centered for every gradient type.** The first version widened a side to `strokewidth` but kept `box.left` / `box.top` as the starting edge, and only corrected that for vector gradients. Radial and conic centers would have moved by up to half a stroke width (the same happens for a thin rect, whose side is above 0 but below `strokewidth`). Now one edge `center − side / 2` serves vector, radial and conic gradients; where a side isn't narrower than the stroke, it equals `box.left` / `box.top`, so nothing changes there.
  2. **No `strokewidth || 1` fallback.** `strokewidth` always has a value (default `1`, Rule A); a stroke with `strokewidth="0"` isn't drawn, so `createGradient` isn't called for it (`isStroked()`).
  3. **No `0.001` guards** (minimum distance, `gx2 += 0.001`). With a stroke width above 0, every side is above 0, so the angle form can't collapse. Equal end points remain possible only when a user writes them (`linear([0.5, 0.5, 0.5, 0.5], …)`): the canvas then paints nothing, as specified, and nothing throws (CLAUDE.md: guard only where an invalid value would throw or freeze).
  4. **Fill gradients with a zero side stay as they are**: a fill of a zero-area path paints nothing anyway.

---

## 4. Technical Specification

### 4.1 Gradient Area

**Order** (§6): the early return for plain colors stays first. `strokewidth` is read before the cache check, which compares it (§4.4); the area below is computed only after the check, on a cache miss, so a cache hit costs one comparison more than today.

```javascript
const box = this.getBoundingBox();
const c = this._gradCache[slot];
const sw = this.attributeValues.strokewidth;
// … cache check (§4.4) …

// A stroke is at least strokewidth thick: a line's box has a zero side, and a gradient across it would
// have zero length and paint nothing. For the stroke, each side spans at least strokewidth around the center.
const width = slot === 1 ? Math.max(box.right - box.left, sw) : box.right - box.left;
const height = slot === 1 ? Math.max(box.bottom - box.top, sw) : box.bottom - box.top;
const cx = (box.left + box.right) / 2;
const cy = (box.top + box.bottom) / 2;
const left = cx - width / 2;
const top = cy - height / 2;
```

### 4.2 Linear Gradient
```javascript
if (styleValue.angle !== undefined) {
  // Unchanged formula, now with the stroke-aware width / height
  const rad = styleValue.angle * Math.PI / 180;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);
  const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
  gx1 = (cx - distance * cosRad) * u;
  gy1 = (cy - distance * sinRad) * u;
  gx2 = (cx + distance * cosRad) * u;
  gy2 = (cy + distance * sinRad) * u;
} else {
  gx1 = (left + width * styleValue.x1) * u;
  gy1 = (top + height * styleValue.y1) * u;
  gx2 = (left + width * styleValue.x2) * u;
  gy2 = (top + height * styleValue.y2) * u;
}
```

### 4.3 Radial and Conic Gradients
Same as today, with `left` / `top` / `width` / `height` from §4.1 instead of `box.left` / `box.top` and the raw sizes:
```javascript
const px0 = (left + width * styleValue.x0) * u;   // likewise py0, px1, py1
const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height, u);
// conic
const gcx = (left + width * styleValue.cx) * u;
const gcy = (top + height * styleValue.cy) * u;
```

### 4.4 Cache
`getBoundingBox()` of a line doesn't depend on `strokewidth`, so changing `strokewidth` would return a stale stroke gradient. Each cache slot stores `sw` and compares it. Compared for both slots: a fill gradient is then rebuilt once when `strokewidth` changes, which is simpler than a slot check and costs nothing measurable.
```javascript
// In the Shape constructor:
this._gradCache = [
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null },
  { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null }
];

// Reuse check and update in createGradient: one more comparison / assignment
if (c.config === styleValue && c.u === u && c.bl === box.left && c.bt === box.top &&
    c.br === box.right && c.bb === box.bottom && c.sw === sw) {
  return c.grad;
}
// … c.sw = sw;
```

---

## 5. Expected Coordinates

The angle form gives the same end points as in the first version (only the edge for vector, radial and conic gradients changed).

### Horizontal Line ($x_1=550, y_1=300 \to x_2=850, y_2=300, \text{sw}=14$):
| Angle | Start $(gx_1, gy_1)$ | End $(gx_2, gy_2)$ | Vector Length | Visual Effect |
| :---: | :---: | :---: | :---: | :--- |
| **$0^\circ$** | $(550.0, 300.0)$ | $(850.0, 300.0)$ | $300.0$ | Horizontal gradient along the length of the line (left $\to$ right) |
| **$45^\circ$** | $(621.5, 221.5)$ | $(778.5, 378.5)$ | $222.0$ | Diagonal gradient traversing the line at $45^\circ$ |
| **$90^\circ$** | $(700.0, 293.0)$ | $(700.0, 307.0)$ | $14.0$ | **Vertical gradient across the 14-unit stroke thickness** (top $\to$ bottom) |
| **$180^\circ$** | $(850.0, 300.0)$ | $(550.0, 300.0)$ | $300.0$ | Horizontal gradient along the length of the line (right $\to$ left) |
| **$270^\circ$** | $(700.0, 307.0)$ | $(700.0, 293.0)$ | $14.0$ | **Vertical gradient across the 14-unit stroke thickness** (bottom $\to$ top) |

### Vertical Line ($x_1=700, y_1=150 \to x_2=700, y_2=450, \text{sw}=14$):
| Angle | Start $(gx_1, gy_1)$ | End $(gx_2, gy_2)$ | Vector Length | Visual Effect |
| :---: | :---: | :---: | :---: | :--- |
| **$0^\circ$** | $(693.0, 300.0)$ | $(707.0, 300.0)$ | $14.0$ | **Horizontal gradient across the 14-unit stroke width** (left $\to$ right) |
| **$90^\circ$** | $(700.0, 150.0)$ | $(700.0, 450.0)$ | $300.0$ | Vertical gradient along the length of the line (top $\to$ bottom) |

### Other Forms (horizontal line as above):
| Gradient | Today | After |
|---|---|---|
| `linear([0, 0, 0, 1], …)` | $(550, 300) \to (550, 300)$: nothing painted | $(550, 293) \to (550, 307)$: across the stroke |
| `radial(['farthest-side'], …)` | center $(700, 300)$ | center $(700, 300)$ (unchanged; the first version would have moved it to $(700, 307)$) |
| Rect `h="4"`, `strokewidth="28"`, `linear(90, …)` | spans 4 units | spans 28 units around the rect's center |

---

## 6. Performance and Allocations in the Frame Loop

Reviewed 2026-11-05. `createGradient` runs for every fill and stroke on every draw (and on every hit test of an interactive shape). It has three paths:

| Path | When | Today | Added by this plan |
|---|---|---|---|
| A: no gradient | plain colors (most shapes) | early return | nothing (the new code comes after the return) |
| B: cache hit | static gradient: the same descriptor object every frame | `getBoundingBox()` + 6 comparisons | one property read (`strokewidth`) + 1 comparison |
| C: cache miss | animated gradient: a new descriptor every frame | new `CanvasGradient` + color stops | 2 × `Math.max`, a few additions, the offset clamp |

**Measured** (`scratch/gradient_stops/create_gradient_bench.html`, Chrome, the current function against the planned one, median of 7 rounds, two runs):

| Path | Current | Planned |
|---|---|---|
| A: plain color | 10–15 ns | 11–16 ns |
| B: cache hit | 37–38 ns | 37–38 ns |
| C: cache miss | 778–813 ns | 769–833 ns |

All differences are within noise (path A runs identical code in both versions). Path C is dominated by creating the `CanvasGradient` (≈ 800 ns), which both versions need.

**Allocations:** none added. The new code only creates local numbers. `sw` is set in the constructor's cache slot literals, so both slots keep one stable shape.

**Not changed by this plan:** an animated gradient creates a new descriptor (`linear()` returns a new object) and therefore a new `CanvasGradient` in every frame, even when its values happen not to change. That is today's cost (≈ 0.8 µs per animated gradient and frame) and would need a cache that compares values instead of the descriptor object; not worth it while no page needs it.

---

## 7. Implementation & Verification

Built together with `design/archive/2026-11-05_draw_errors_plan.md` §3.1 (stop offset and corner radius clamping): same function, one build, one test round.

1. **Code:** `js/elements/shape.js` (§4.1–4.4, plus the offset clamp from the draw-errors plan), `js/elements/shapes/rect.js` (corner radius clamp).
2. **Build:** `node build.js`; update the `~NNKB` sizes in `docs/installation.html` and the `.agents/KILOPIXEL.md` header.
3. **Tests** (`tests/index.html`, a new test stage; pixels read from the layer canvas):
   1. **The docs case:** the line from `docs/line.html` section 2 (`x1="550" y1="300" x2="850" y2="300" strokewidth="30" linecap="round"`) at every slider angle, 0° to 360° in steps of 15: the pixel at its center (700, 300) is never the background. At 90° and 270° the pixels above and below the center show the two stop colors (gradient across the stroke).
   2. A vertical line with `linear(0, …)` and a flat polyline with `linear(90, …)`: the stroke is visible at its center and shows both colors across its width.
   3. `radial(['farthest-side'], …)` on a horizontal line: the pixel at the line's center has the first stop's color (the center didn't move).
   4. After `setAttribute('strokewidth', …)`, the stroke gradient is rebuilt (`_gradCache[1].sw` equals the new value).
   5. (Draw-errors plan) stop offsets −0.2, 1.3 and `NaN`: the frame finishes without an error and a shape in a later layer updates.
   6. (Draw-errors plan) a rect with `r="-5" r2="10"`: no error, the rect is drawn.
4. **Browser:** all tests pass; on `docs/line.html` section 2 the angle slider moved through all steps (0–360) keeps the gradient line visible (pixel at its center, before / after screenshot at 90°); `stroke_gradient_zero.html` shows all 9 cases with a visible gradient (after screenshot); the docs pages with stroke gradients (`line.html`, `dashes.html`, `text.html`, `walkthrough.html`) keep their static canvases pixel-identical apart from strokes on thin shapes, and the console stays clean.
5. **Reference:** `.agents/KILOPIXEL.md` → Gradient Caching (stroke span, `sw` in the cache); `createGradient` in Shape → Key Methods.
6. **Status:** this plan → ✅ and its TODO item removed; the draw-errors plan and its TODO item note "Part 1 implemented".

### 7.1 Result (2026-11-05)

- **Tests:** 33 / 33 pass. The 6 new tests run against the old build too: 5 fail for their own bug (line invisible at 90° and 270°, vertical line invisible, no `sw` in the cache, `IndexSizeError`, `RangeError`); the radial test passes on both, as a guard that the center doesn't move. The two error cases have their own test stages: in a shared stage, the old engine's error broke every other shape there.
- **Docs:** on `docs/line.html` §2 the line stays visible at every slider angle (0–360° in steps of 15), blue at the top edge and pink at the bottom at 90°. All 160 deterministic layer canvases of the 23 docs pages are pixel-identical to the old build (rendered at a fixed `t = 1`; 2 further layers aren't deterministic and were skipped).
- **Size:** unchanged (~53 KB minified, ~16 KB gzipped).
