# Centralized Arrowhead Geometry & Miter Overshoot Normalization

- **Status**: ⚪ **Superseded by `design/2026-10-14_unified_arrowhead_geometry_plan.md`** (kept as history)
- **Date**: 2026-10-12
- **Target Implementation**: `js/elements/shape.js`, `js/elements/shapes/line.js`, `js/elements/shapes/circle.js`, `js/elements/shapes/ellipse.js`, `js/elements/shapes/polyline.js`
- **Related Documentation**: `docs/arrows.html`, `docs/line.html`, `docs/circle.html`, `docs/ellipse.html`

---

## 1. Executive Summary & Problem Definition

### 1.1 The Chevron Overshoot Defect
In Kilopixel, arrowheads can be added to any open-path shape (`<pxl-line>`, `<pxl-circle>`, `<pxl-ellipse>`, `<pxl-polyline>`) using two styles:
- **`arrowstyle="filled"`**: Draws a solid equilateral triangle using `ctx.fill()`.
- **`arrowstyle="line"`**: Draws an open chevron using `ctx.stroke()`.

**The Defect:**
- While `arrowstyle="filled"` lands precisely on the target coordinate $(x_t, y_t)$, `arrowstyle="line"` **overshoots the target endpoint by a full stroke width** ($\Delta = \text{strokewidth} \times u$).
- When `linecap="square"` is used, this overshoot extends by an additional half-stroke width ($\Delta = 1.5 \times \text{strokewidth} \times u$).
- In technical diagrams, graphs, flowcharts, and vector fields, this causes arrows to penetrate target anchor dots, border boundaries, and adjacent nodes instead of resting flush against them.

### 1.2 Code Duplication Across Shapes
Currently, arrow sizing (`'auto'`), square linecap offsets, and setback math are duplicated across four separate shape files (`line.js`, `circle.js`, `ellipse.js`, `polyline.js`). If arrow behavior is updated or extended (e.g. adding new styles or tweaking angles), all four files must be manually synchronized.

### 1.3 Architectural Goal
1. **Centralize Arrow Resolution & Rendering**: Move sizing formulas, setback computation, and miter compensation directly into the base class `Shape` (`js/elements/shape.js`).
2. **Sub-Pixel Target Landing**: Eliminate the chevron overshoot so that both `filled` and `line` arrows terminate at the exact target coordinate with mathematical precision.
3. **Keep Per-Shape Tangent Geometry**: Retain shape-specific tangent calculations (linear, radial, elliptical derivative, and polyline segment vectors) inside each respective shape class.

---

## 2. Geometric & Mathematical Analysis

### 2.1 The Geometry of `arrowstyle="filled"` (Why it Works)
For a filled arrowhead:
- The triangular path is defined by three vertices: the tip $(x_{\text{tip}}, y_{\text{tip}})$ and two wings $(x_{w1}, y_{w1})$, $(x_{w2}, y_{w2})$.
- It is rendered via `ctx.fill()` with **no stroke**.
- Because filled polygons have zero stroke boundary outside their geometry, the apex vertex is located exactly at $(x_t, y_t)$.
- The underlying parent path is truncated backward by $0.75 \times \text{arrowSize} \times u$, preventing the thick parent stroke from protruding through the triangle's front boundary.

$$\text{Filled Apex Position} = (x_t, y_t)$$

---

### 2.2 The Geometry of `arrowstyle="line"` (Why it Overshoots)
For an open chevron arrowhead:
- The path consists of two stroked segments meeting at a vertex $(x_{\text{tip}}, y_{\text{tip}})$ with half-angle $\phi = \frac{\pi}{6} = 30^\circ$ (total opening angle $= 60^\circ$).
- It is rendered via `ctx.stroke()` using the shape's current `strokewidth` and Canvas's default `miter` join.
- When an angle of $2\phi$ is stroked, the outer edge of the stroke extends forward beyond the path vertex along the bisector (tangent) vector:

$$\text{Miter Extension } (\Delta_{\text{miter}}) = \frac{\text{strokewidth} \times u}{2 \cdot \sin(\phi)}$$

Since $\phi = 30^\circ$ and $\sin(30^\circ) = 0.5$:

$$\Delta_{\text{miter}} = \frac{\text{strokewidth} \times u}{2 \cdot 0.5} = \mathbf{\text{strokewidth} \times u}$$

Consequently, when the apex vertex is placed at $(x_t, y_t)$, the outer stroked point of the chevron overshoots $(x_t, y_t)$ by an entire $\text{strokewidth} \times u$.

```
Current Behavior (Overshoot):
Path Target: ───────────────────────────────┤ (Target Point xt, yt)
Chevron Vertex at xt, yt:                  >==== (Outer Miter extends past by strokewidth!)

Corrected Behavior (Flush Target Landing):
Path Target: ───────────────────────────────┤ (Target Point xt, yt)
Chevron Vertex pulled back by strokewidth:  > (Outer Miter terminates flush at xt, yt!)
```

---

### 2.3 The Exact Normalization Formula
To ensure the outer stroked tip of the chevron lands precisely at the target coordinate $(x_t, y_t)$, the chevron apex $(x_{\text{apex}}, y_{\text{apex}})$ must be retracted backward along the tangent angle $\theta$ by $\Delta_{\text{miter}}$:

$$\Delta_{\text{miter}} = \text{strokewidth} \times u$$

$$x_{\text{apex}} = x_t - \Delta_{\text{miter}} \cdot \cos(\theta)$$
$$y_{\text{apex}} = y_t - \Delta_{\text{miter}} \cdot \sin(\theta)$$

#### Square Linecap Interaction
When `linecap="square"`, Canvas naturally projects path terminations forward by $\frac{\text{strokewidth} \times u}{2}$.
To maintain flush alignment:
- The apex pullback must account for any linecap extension, ensuring the outer visual boundary never crosses $(x_t, y_t)$.

---

## 3. Centralized Engine Architecture (`js/elements/shape.js`)

All shared arrowhead arithmetic is consolidated into three methods on `Shape`:

### 3.1 `Shape.prototype.resolveArrowSize(attrValue, strokewidth)`
Normalizes the attribute value (`number`, string representation, or `'auto'`):
```javascript
resolveArrowSize(attrValue, strokewidth) {
  if (!attrValue || attrValue === '0' || attrValue === 0) return 0;
  if (attrValue === 'auto') return (strokewidth || 1) * 3.6;
  const num = parseFloat(attrValue);
  return isNaN(num) ? 0 : Math.max(0, num);
}
```

---

### 3.2 `Shape.prototype.getArrowSetback(arrowSize, arrowStyle, strokewidth, linecap, u)`
Calculates the physical distance (in scaled canvas pixels) that the parent path must be retracted so it meets the arrowhead seamlessly without protruding:

```javascript
getArrowSetback(arrowSize, arrowStyle, strokewidth, linecap, u) {
  if (arrowSize <= 0) return 0;
  const sw = (strokewidth || 1) * u;
  
  if (arrowStyle === 'filled') {
    // Truncate path deep inside the triangle body (75% of arrow length)
    let setback = arrowSize * u * 0.75;
    if (linecap === 'square') setback += sw * 0.5;
    return setback;
  } else {
    // For line chevrons, the path must truncate where the chevron apex begins
    let setback = sw; // Exactly equal to miter pullback
    if (linecap === 'square') setback += sw * 0.5;
    return setback;
  }
}
```

---

### 3.3 `Shape.prototype.drawArrow(ctx, u, targetX, targetY, tangent, size, style)`
Renders the arrowhead with miter compensation:

```javascript
drawArrow(ctx, u, targetX, targetY, tangent, size, style) {
  const phi = Math.PI / 6; // 30 degrees
  const sw = (this.attributeValues.strokewidth || 1) * u;

  let apexX = targetX;
  let apexY = targetY;

  // Compensate for stroke thickness and miter join extension
  if (style === 'line') {
    const miterOffset = sw;
    apexX -= Math.cos(tangent) * miterOffset;
    apexY -= Math.sin(tangent) * miterOffset;
  }

  const wing1X = apexX - size * u * Math.cos(tangent - phi);
  const wing1Y = apexY - size * u * Math.sin(tangent - phi);
  const wing2X = apexX - size * u * Math.cos(tangent + phi);
  const wing2Y = apexY - size * u * Math.sin(tangent + phi);

  ctx.beginPath();
  if (style === 'line') {
    ctx.moveTo(wing1X, wing1Y);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(wing2X, wing2Y);

    const hasDash = this.attributeValues.linedash && 
                    this.attributeValues.linedash !== 'none' && 
                    this.attributeValues.linedash !== 0 && 
                    this.attributeValues.linedash !== '0';

    if (hasDash) ctx.setLineDash(pxl._emptyDash);
    ctx.stroke();
    if (hasDash) pxl.applyLineDash(ctx, u, this.attributeValues.linedash, this.attributeValues.dashoffset, this);
  } else {
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(wing1X, wing1Y);
    ctx.lineTo(wing2X, wing2Y);
    ctx.closePath();

    const originalFill = ctx.fillStyle;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.fillStyle = originalFill;
  }
}
```

---

## 4. Per-Shape Implementation Specifications

### 4.1 `<pxl-line>` (`js/elements/shapes/line.js`)
1. **Resolve Sizes**:
   ```javascript
   const arrowStartSize = this.resolveArrowSize(arrowstart, strokewidth);
   const arrowEndSize = this.resolveArrowSize(arrowend, strokewidth);
   if (arrowStartSize <= 0 && arrowEndSize <= 0) { /* fast-path lineTo */ }
   ```
2. **Calculate Tangents**:
   ```javascript
   const startAngle = Math.atan2(y1 - y2, x1 - x2);
   const endAngle = Math.atan2(y2 - y1, x2 - x1);
   ```
3. **Retract Endpoints**:
   ```javascript
   const startSetback = this.getArrowSetback(arrowStartSize, arrowstyle, strokewidth, linecap, u);
   const endSetback = this.getArrowSetback(arrowEndSize, arrowstyle, strokewidth, linecap, u);

   const lineStartX = x1 * u - Math.cos(startAngle) * startSetback;
   const lineStartY = y1 * u - Math.sin(startAngle) * startSetback;
   const lineEndX = x2 * u - Math.cos(endAngle) * endSetback;
   const lineEndY = y2 * u - Math.sin(endAngle) * endSetback;
   ```
4. **Draw Line & Call `drawArrow`**:
   - Stroke from `(lineStartX, lineStartY)` to `(lineEndX, lineEndY)`.
   - Pass exact target coordinates `(x1 * u, y1 * u)` and `(x2 * u, y2 * u)` to `this.drawArrow(...)`.

---

### 4.2 `<pxl-circle>` (`js/elements/shapes/circle.js`)
1. **Tangent Angles (Perpendicular to Radius)**:
   ```javascript
   const dir = isAnticlockwise ? -1 : 1;
   const startTangent = startRadians - (Math.PI / 2) * dir;
   const endTangent = endRadians + (Math.PI / 2) * dir;
   ```
2. **Angular Retraction**:
   ```javascript
   const startSetback = this.getArrowSetback(arrowStartSize, arrowstyle, strokewidth, linecap, u);
   const endSetback = this.getArrowSetback(arrowEndSize, arrowstyle, strokewidth, linecap, u);

   const deltaStartRad = startSetback / (safeRadius * u);
   const deltaEndRad = endSetback / (safeRadius * u);

   const drawStartRad = startRadians + (isAnticlockwise ? -deltaStartRad : deltaStartRad);
   const drawEndRad = endRadians + (isAnticlockwise ? deltaEndRad : -deltaEndRad);
   ```
3. **Draw Arc & Call `drawArrow`**:
   - Stroke arc between `drawStartRad` and `drawEndRad`.
   - Compute true target tips: $(R \cos(\theta_s), R \sin(\theta_s))$ and $(R \cos(\theta_e), R \sin(\theta_e))$.
   - Call `this.drawArrow(...)`.

---

### 4.3 `<pxl-ellipse>` (`js/elements/shapes/ellipse.js`)
1. **Parametric Derivative Tangents**:
   For ellipse $(r_x \cos t, r_y \sin t)$, the velocity vector is $(-r_x \sin t, r_y \cos t)$ with local arc speed $v = \sqrt{r_x^2 \sin^2 t + r_y^2 \cos^2 t}$.
   ```javascript
   const speedStart = Math.sqrt(Math.pow(-safeRX * Math.sin(startRadians), 2) + Math.pow(safeRY * Math.cos(startRadians), 2));
   const speedEnd = Math.sqrt(Math.pow(-safeRX * Math.sin(endRadians), 2) + Math.pow(safeRY * Math.cos(endRadians), 2));
   ```
2. **Angular Retraction**:
   ```javascript
   const deltaStartRad = startSetback / (speedStart || 1);
   const deltaEndRad = endSetback / (speedEnd || 1);
   ```
3. **Pass Targets to `this.drawArrow`**.

---

### 4.4 `<pxl-polyline>` (`js/elements/shapes/polyline.js`)
1. **Endpoint Vectors**:
   Tangents are computed from the first two points and the last two points in `flatCache`.
2. **Cache Retraction**:
   Temporarily offset `flatCache[0..1]` and `flatCache[lastX..lastY]` backward by `startSetback` and `endSetback`.
3. Stroke the polyline, call `this.drawArrow(...)`, and restore `flatCache`.

---

## 5. Performance & Zero-GC Guarantees

1. **Zero Garbage Collection**:
   - No temporary objects (`{ x, y }`) are instantiated in the render loop.
   - All setback distances and offsets are computed as primitive numbers.
2. **Subclass Isolation**:
   - Arrowhead observed attributes (`arrowstart`, `arrowend`, `arrowstyle`) remain strictly isolated to `Line`, `Circle`, `Ellipse`, and `Polyline`.
   - `Rect`, `Text`, and `Grid` continue to carry zero arrowhead memory or reactivity overhead.
3. **Fast-Path Bailout**:
   - If `arrowStartSize <= 0 && arrowEndSize <= 0`, all shapes bypass tangent trigonometry and setback math entirely.

---

## 6. Implementation Checklist

- [ ] Add `resolveArrowSize` and `getArrowSetback` to `js/elements/shape.js`.
- [ ] Update `drawArrow` in `js/elements/shape.js` with miter compensation for `style === 'line'`.
- [ ] Refactor `js/elements/shapes/line.js` to use centralized helpers.
- [ ] Refactor `js/elements/shapes/circle.js` to use centralized helpers.
- [ ] Refactor `js/elements/shapes/ellipse.js` to use centralized helpers.
- [ ] Refactor `js/elements/shapes/polyline.js` to use centralized helpers.
- [ ] Run `node build.js` to produce compiled bundle `js/pxl.min.js`.
- [ ] Verify visual accuracy on `docs/line.html` across stroke widths (2, 6, 12, 24, 40).
- [ ] Verify visual accuracy on `docs/circle.html` and `docs/ellipse.html`.
