# Kilopixel Log-P-H Diagram Architecture & Scale Interface Specification

This document defines the architectural blueprint for implementing a thermodynamic log-p-h (Pressure-Enthalpy) diagram within the Kilopixel framework. It also formalizes the **Scale Interface** (`mapX` / `mapY`) as a core framework feature applicable to all shapes.

---

## 1. The Scale Interface (Core Framework Feature)

Instead of making `mapX` and `mapY` a "hack" exclusive to the thermodynamic diagram, they are standardized across the framework. 

**The Contract:** `mapX(value)` and `mapY(value)` take a logical "domain value" and return the local logical coordinate on the stage, in the same coordinate space as the parent shape.

### Application A: Data Shapes (e.g., `<pxl-logph>`)
For data-driven shapes, the domain is the dataset (e.g., thermodynamic state points).
```html
<pxl-logph id="diagram" x="500" width="800" h-min="200" h-max="600" />
<!-- Maps enthalpy 400 to the correct physical coordinate -->
<pxl-circle x="ref.diagram.mapX(400)" />
```

### Application B: Geometric Shapes (e.g., `<pxl-rect>`)
For standard shapes that don't have a data domain, the implicit domain is the **Normalized Unit Range (0.0 to 1.0)** across their physical bounding box. This unlocks declarative relative positioning:
```html
<pxl-rect id="menuBar" x="500" width="800" />
<!-- Places avatar exactly at the 90% mark of the menu bar's width -->
<pxl-circle x="ref.menuBar.mapX(0.9)" />
```

### The Coordinate Space Trap (CRITICAL)
`mapX` must return coordinates relative to the *same space* the shape itself resides in, by factoring in its own `x` (pivot) position.
```javascript
// Base Implementation
mapX(domainValue) {
    const pivotX = this.evaluate('x'); 
    const width = this.evaluate('width');
    const normalizedValue = this.normalizeDomain(domainValue); // Custom per shape
    
    // Returns a coordinate that perfectly aligns a sibling shape
    return pivotX - (width / 2) + (normalizedValue * width);
}
```

---

## 2. The Data Pipeline (CoolProp to Canvas)

Thermodynamic Helmholtz equations are too heavy for 60fps browser evaluation. The architecture relies on an offline/online split.

### Offline Generation (Backend)
A Python script using the C++ `CoolProp` library generates sparse, high-fidelity state points.
**Edge Case Handled:** The saturation dome is *not* exported as one array. It is split into `liquid_line` and `vapor_line` (meeting at the critical point) to allow native two-tone coloring in the canvas.

### Plugin Architecture & Async Loading
The `<pxl-logph>` shape is distributed as an optional plugin script (`kilopixel-thermo.js`). Data is fetched asynchronously via the `refrigerant` attribute.
```html
<pxl-logph refrigerant="R134a"></pxl-logph>
```
If the attribute dynamically changes to `R410A`, the shape immediately clears the canvas, aborts rendering, issues a new `fetch()`, and uses a request token to prevent network race conditions.

---

## 3. High-Performance Canvas Rendering

### The Re-Bake Strategy (Avoiding the Stroke Distortion Trap)
It is tempting to use Canvas transformations (`ctx.scale`) to zoom the massive JSON `Path2D` when a user zooms in. 
*Fatal Flaw:* Non-uniform `ctx.scale` stretches the stroke width, causing 1px lines to become massive elliptical smears.

*Hardened Solution:* We do **not** use `ctx.scale`. 
Instead, we only calculate and build the `Path2D` objects when the viewport bounds (`p-min`, `h-max`, `width`) change. 
- Iterating 12,000 JSON points takes ~2ms. 
- During static viewing or drawing on the chart, the draw loop costs 0ms (just `ctx.stroke()`).
- If a user smoothly animates the zoom, the engine handles the 2ms re-bake within the 16.6ms frame budget.

---

## 4. Zero-GC Highlighting and Object Pooling

Kilopixel requires zero Garbage Collection (GC) during the `draw()` loop to prevent stuttering.

### Area and Line Highlighting
Dynamic highlighting is achieved by reading reactive Kilopixel variables and modifying the `strokeStyle` or `fillStyle` before stroking the pre-baked paths.
```javascript
// Inside the 60fps draw() loop
const activeTemp = this.evaluate('highlight-isotherm');

for (const iso of this.diagramData.isotherms) {
    // Zero memory allocation!
    ctx.strokeStyle = (iso.value === activeTemp) ? '#FF0000' : '#E0E0E0';
    ctx.stroke(iso.path);
}
```

### Text Rendering (The Hidden GC Trap)
Drawing dynamic grid lines requires text labels (e.g., `1.5 MPa`). Calling `(p + " MPa")` inside the draw loop allocates new string objects every frame.
*Solution:* The shape utilizes a **String Cache / Object Pool**. Axis labels are cached in a `Map<number, string>` upon scale generation and reused infinitely during the draw loop.

---

## 5. Mathematical Vulnerabilities

1. **Logarithmic Zero:** The Y-axis (Pressure) uses `Math.log10()`. If a user inputs `p-min="0"`, the math evaluates to `-Infinity`, crashing the renderer. The plugin must clamp `p-min` to a tiny positive number (e.g., `0.001`).
2. **Viewport Clipping:** State points plotted outside the chart bounds will resolve to off-screen coordinates. Developers should wrap their UI in a `<pxl-group clip="true">` if strict containment is required.
