# Circle & Ellipse Geometry Hardening, Zero-GC Safety & 'mode' Architecture

**Date:** 2026-09-23 (Updated 2026-09-24)  
**Status:** Approved Design Plan  
**Target Components:** `js/elements/shapes/circle.js`, `js/elements/shapes/ellipse.js`

---

## 1. Executive Summary & Context

During an architectural audit and redesign of [`docs/circle.html`](../docs/circle.html), we analyzed how `<pxl-circle>` behaves across its primary geometric archetypes: **solid discs**, **hollow rings**, **open arcs**, **circular segments**, **pie slices (circular sectors)**, and **donut wedges (annular sectors)**.

Two fundamental architectural questions emerged:
1. **Should the engine support partial-arc inner radii (`ir > 0` with `sweep`) as native Annular Sectors?**
   - *Alternative evaluated:* Removing partial-arc `ir` support and requiring developers to fake donut chart slices using two concentric circles (masking).
   - *Conclusion:* **Removing partial-arc `ir` is rejected.** As proven by compositing physics, faking donut wedges with separate inner shapes completely breaks with `alpha < 1` (transparency bleed), `filter="dropShadow(...)"` (causes broken double-shadow artifacts), and non-standard `blend` modes (`multiply`, `screen`). A true compound vector path is mathematically required.
2. **How does `<pxl-circle>` perform in a 60 FPS hot loop, and what edge cases threaten animation stability?**
   - *Risk identified:* Animated mathematical expressions like `r="50 + wave(t) * 80"` can produce negative values when the wave dips below zero. Native HTML5 Canvas `ctx.arc()` immediately throws an uncaught `DOMException: The radius provided is negative`, which halts the entire `requestAnimationFrame` loop and permanently freezes the canvas.
   - *Consideration evaluated:* We analyzed whether `ir > r` requires clamping. Because concentric arcs and radial boundary rays never intersect, `ir > r` is mathematically valid (forming a clean inverted annular sector or expanding donut). Therefore, `ir` is NOT clamped to `r`, preserving full creative freedom in animations. Only negative radii (`< 0`) require clamping to prevent `DOMException`.
   - *Risk identified:* The current threshold `Math.abs(endRadians - startRadians) >= Math.PI * 1.99` evaluates to $358.2^\circ$, causing sweeps like $359^\circ$ (e.g. Pac-Man with his mouth almost shut) to falsely snap into full circles.

This plan details the exact mathematical hardening, zero-GC safety guards, and clean semantic architecture to make `<pxl-circle>` bulletproof, crash-resilient, and high-performance in hot animation loops.

---

## 2. Why Annular Sectors Must Remain First-Class

### 2.1 The Compositing Barrier (Why Masking Fails)
If Kilopixel only supported `ir` on full $360^\circ$ rings and forced developers to fake donut slices with a second shape:
* **Alpha / Translucency Bleed**: If a wedge has `alpha="0.5"`, a masking inner circle painted with the stage background color will be translucent, exposing the center graphic or stage grid behind it. If opaque, it blocks background layers.
* **Filters & Drop Shadows**: A native `<pxl-circle>` with `filter="dropShadow(0, 0, 15, 'rgba(0,0,0,0.5)')"` generates a single drop shadow matching the true geometric perimeter (outer arc, inner arc, and radial end walls). Two overlaid circles generate a double shadow (one from the outer disc and another from the inner plug).
* **Blend Modes**: When using `blend="screen"` or `blend="multiply"`, an inner masking circle blends into underlying canvas elements rather than carving out an empty hole.
* **Vector Path Operations**: Clipping regions and potential SVG/PDF export require a single, mathematically closed 2D contour.

### 2.2 Why "Dual Open Concentric Arcs" Was Rejected
We explored whether `pie="false"` + `ir > 0` should draw two parallel open arcs using `ctx.moveTo()` to skip radial closure lines. This was rejected because:
1. **Broken Fill Glitch**: When filled, Canvas 2D connects open subpath endpoints with straight chords. Because the inner and outer arcs run in opposite directions, non-zero winding fill creates a chaotic self-intersecting bowtie polygon.
2. **Hit-Testing Breakdown**: `ctx.isPointInPath()` behaves erratically on disjoint unclosed subpaths.
3. **Hot-Loop Overhead**: Calculating `Math.cos()` and `Math.sin()` dynamically in JavaScript on every frame just to place the `moveTo()` point wastes CPU cycles in a 60 FPS loop.
4. **Violates YAGNI**: Developers who want two parallel curved tracks can already declare two standard `<pxl-circle>` elements, giving them independent control over stroke color, stroke width, and dashing.

---

## 3. The Unified Semantic Model

The complete behavioral matrix for `<pxl-circle>` and `<pxl-ellipse>`:

| Archetype | `isFull` ($360^\circ$) | `ir` | `mode` | Visual Result | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Solid Disc** | `true` | `0` | Any *(ignored)* | Full circle | Standard filled or stroked disc |
| **Hollow Ring** | `true` | `> 0` | Any *(ignored)* | Concentric donut | Two subpaths separated by `moveTo` |
| **Open Arc** | `false` | `0` | `'open'` *(default)* | Open curved stroke | Arc rim only (no center spokes, no chord line) |
| **Circular Segment** | `false` | `0` | `'chord'` | Closed chord segment | Straight chord closes path; stroke outlines arc + chord |
| **Pie Slice** | `false` | `0` | `'pie'` | Circular Sector | Path connects endpoints to `(0, 0)` with spokes |
| **Donut Wedge** | `false` | `> 0` | Any / `'pie'` | Annular Sector | Closed 4-sided wedge between `r` and `ir`. Seamlessly morphs to pie slice if `ir -> 0`. |

### 3.1 Applicability Rules & Defaults (Zero Boilerplate)
1. **When does `mode` apply?**
   * `mode` **only applies to partial sweeps** ($|\text{sweep}| < 360^\circ$ or `isFull === false`).
   * On full $360^\circ$ sweeps, the path naturally loops into a seamless boundary; `mode` is ignored.
2. **Will a user need to set `mode` for a standard arc?**
   * **No.** Because `mode="open"` is the engine default (`defaults = { ..., mode: 'open' }`), writing `<pxl-circle r="50" sweep="180" stroke="#fff">` automatically renders an open arc with zero boilerplate.
3. **Will a user need to set `mode` for a donut wedge?**
   * **No.** Setting `ir > 0` on a partial sweep automatically generates a closed annular sector. Specifying `mode="pie"` is best practice if `ir` is dynamically animated down to `0`, ensuring it smoothly collapses into a classic pie slice.

---

## 4. Hot-Loop & Zero-GC Hardening Specification

### 4.1 Zero-GC Clamping
To prevent DOM exceptions from negative values without allocating objects or running complex branches:

```javascript
// Clamp radii to 0 to prevent DOMException: Negative radius
const safeR = Math.max(0, r);
const safeIR = Math.max(0, ir);
```

* **Performance profile**: Compiles down directly to assembly `fmax` instructions in the V8 JIT compiler. Zero heap allocation, zero GC pressure.
* **Behavior under dynamic negative expressions**: If `r="50 + wave(t) * 100"` dips to $-50$, `safeR` cleanly collapses to `0` (a zero-size point). The animation continues rendering smoothly at 60 FPS without crashing the browser's render pipeline.
* **Why `ir` is not clamped to `r`**: Concentric arcs at $r$ and $ir$ never intersect, and the radial spokes lie on distinct angular rays ($\theta_s$ and $\theta_e$). Therefore, `ir > r` is mathematically completely valid and well-behaved. Omitting artificial `Math.min(safeR, ir)` clamping allows creative animations where an inner radius breathes or expands beyond the outer radius without hitting a brick wall.

### 4.2 Precision Full-Circle Threshold
Currently:
```javascript
const isFull = Math.abs(endRadians - startRadians) >= Math.PI * 1.99;
```
$1.99 \times \pi = 358.2^\circ$. Any sweep between $358.2^\circ$ and $359.9^\circ$ is falsely classified as a full circle, causing Pac-Man's mouth to vanish abruptly before it actually reaches $360^\circ$.

Updated formula:
```javascript
const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);
```
Preserves angular fidelity up to $359.99^\circ$.

### 4.3 Division by Zero Guard for Arrow Math
Currently, in lines 41–42 and 61–62 of `circle.js`:
```javascript
const arrowStartDelta = 2 * Math.asin(clampL / (2 * r));
```
If `r === 0`, `2 * r === 0`, yielding `Infinity`, which causes `Math.asin()` to return `NaN`. This poisons downstream coordinates (`arrowStartTipX = NaN`), producing silent canvas rendering failures.

Updated formula:
```javascript
const arrowStartDelta = (safeR > 0) ? 2 * Math.asin(clampL / (2 * safeR)) : 0;
```

### 4.4 Natural Zero-Span Geometry (Preserving Animation Continuity)
We evaluated whether `sweep === 0` (or `end === start`) should trigger an early `return` to suppress the collapsed radial line:
* **Why Early Exit is Rejected**:
  1. **The 1-Frame Strobe/Flicker Glitch**: In dynamic animations where an angle sweeps or bounces through zero (e.g. `sweep="sin(t) * 90"` or bouncing from $+90^\circ$ to $-90^\circ$), an early exit causes the element's stroke to abruptly disappear for a single 16ms frame as it crosses zero, before reappearing on the other side. This creates an ugly, distracting visual stutter.
  2. **Mathematical & Physical Continuity**: A wedge or sector is bounded by its outer arc, inner arc, and two radial edges. As the sweep angle shrinks to $0^\circ$, the two radial boundary edges naturally converge into a single radial line segment between $r$ and $ir$ (or between $r$ and $0$). Stroking that collapsed boundary is the true mathematical limit of the geometry as $\Delta\theta \to 0$.
  3. **Fills Naturally Disappear**: When an element has only `fill` (no stroke), Canvas `fill()` of a zero-area path paints **zero pixels**. A filled slice already disappears completely at `0°` without needing any artificial exit.
* **KISS Principle for Arrows**:
  Consistent with `<pxl-line>` and `<pxl-polyline>`, arrowheads follow the declared points without artificial suppression. The only required guard is `safeR > 0` to prevent division-by-zero (`Math.asin() -> NaN`).

### 4.5 The Unified 'mode' Attribute ('open' | 'chord' | 'pie')
Instead of an ambiguous boolean flag like `pie="true"` or guessing geometry from `fill`, `<pxl-circle>` introduces a first-class closure mode enumeration:

```
mode="open" | "chord" | "pie"    (default: 'open')
```

* **Industry Alignment**: This matches standard 2D vector geometry conventions (e.g. **p5.js** and **Java 2D**: `OPEN`, `CHORD`, `PIE`).
* **Mutually Exclusive & Self-Documenting**: A single attribute prevents contradictory states (e.g. `pie="true" chord="true"`).

#### 4.5.1 Styling Matrix: Stroke-Only (Wireframe) vs. Fill + Stroke
Because `mode` defines the **vector subpath topology** rather than paint style, `stroke` cleanly outlines whatever geometry `mode` produces:

| Mode | Stroke Only (`stroke="..." fill="none"`) | Fill + Stroke (`fill="..." stroke="..."`) |
| :--- | :--- | :--- |
| **`mode="open"`** *(default)* | **Open Arc Line**<br>Only the curved perimeter is stroked. Endpoints are open and respect `strokecap` (`butt`, `round`, `square`) and arrowheads (`arrowstart`, `arrowend`). Ideal for gauges, spinners, curved arrows. | **Filled Arc**<br>Canvas fills the interior (straight chord implied by Canvas non-zero winding fill), but **only the curved arc** has a stroked border. |
| **`mode="chord"`** | **Wireframe D-Shape (Segment Outline)**<br>Strokes both the curved arc **and** the straight chord line connecting the two endpoints without needing any fill! | **Solid D-Shape**<br>Filled circular segment with a stroke around the entire closed perimeter (arc + chord). |
| **`mode="pie"`** | **Wireframe Pie Wedge Outline**<br>Strokes the curved arc **and both radial spokes** meeting at `(0, 0)`. | **Solid Pie Slice**<br>Filled pizza slice with a stroke around the entire closed perimeter (arc + 2 spokes). |
| **Annular Wedge (`ir > 0`)** | **Wireframe Donut Wedge Outline**<br>Strokes outer arc, inner arc, and both radial end walls. | **Solid Donut Wedge**<br>Filled annular sector with a complete stroked boundary. |

---

## 5. Proposed Implementation Changes

### 5.1 Circle: `js/elements/shapes/circle.js`

```javascript
class Circle extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'r', 'ir', 'start', 'end', 'sweep', 'mode', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { r: 0, ir: 0, start: 0, end: null, sweep: null, mode: 'open', anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, mode, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    // Zero-GC safety clamping
    const safeR = Math.max(0, r);
    const safeIR = Math.max(0, ir);

    if (safeR === 0 && safeIR === 0) return;

    const isAnti = anticlockwise === true;

    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    // Precision full-circle threshold (preserves arcs up to 359.99°)
    const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0 && safeR > 0) {
      arrowStartTipX = safeR * Math.cos(startRadians) * u;
      arrowStartTipY = safeR * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, safeR * 2);
      const arrowStartDelta = 2 * Math.asin(clampL / (2 * safeR));
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      
      const basePointX = safeR * Math.cos(baseRadians) * u;
      const basePointY = safeR * Math.sin(baseRadians) * u;
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0 && safeR > 0) {
      arrowEndTipX = safeR * Math.cos(endRadians) * u;
      arrowEndTipY = safeR * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, safeR * 2);
      const arrowEndDelta = 2 * Math.asin(clampL / (2 * safeR));
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      
      const basePointX = safeR * Math.cos(baseRadians) * u;
      const basePointY = safeR * Math.sin(baseRadians) * u;
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.arc(0, 0, safeR * u, drawStartRadians, drawEndRadians, isAnti);

    if (safeIR > 0) {
      if (isFull) {
        ctx.moveTo((safeIR * u) * Math.cos(drawEndRadians), (safeIR * u) * Math.sin(drawEndRadians));
      }
      ctx.arc(0, 0, safeIR * u, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isFull) {
      ctx.closePath();
    } else if (mode === 'pie') {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if (mode === 'chord') {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0 && safeR > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0 && safeR > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
}
customElements.define('pxl-circle', Circle);
```

### 5.2 Ellipse: `js/elements/shapes/ellipse.js`

To maintain 100% parity across the radial shape family, `<pxl-ellipse>` replaces `pie` with `mode="open" | "chord" | "pie"` (default `'open'`) and adds zero-GC safety clamping:

```javascript
class Ellipse extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'mode', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, mode: 'open', anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, mode, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const safeRX = Math.max(0, rx);
    const safeRY = Math.max(0, ry);
    const safeIRX = Math.max(0, irx);
    const safeIRY = Math.max(0, iry);

    if (safeRX === 0 && safeRY === 0) return;

    const isAnti = anticlockwise === true;
    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0 && safeRX > 0 && safeRY > 0) {
      arrowStartTipX = safeRX * Math.cos(startRadians) * u;
      arrowStartTipY = safeRY * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, Math.max(safeRX, safeRY));
      const s = -safeRX * Math.sin(startRadians);
      const c = safeRY * Math.cos(startRadians);
      const speed = Math.sqrt(s * s + c * c) || 1;
      const arrowStartDelta = clampL / speed;
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      
      const basePointX = safeRX * Math.cos(baseRadians) * u;
      const basePointY = safeRY * Math.sin(baseRadians) * u;
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0 && safeRX > 0 && safeRY > 0) {
      arrowEndTipX = safeRX * Math.cos(endRadians) * u;
      arrowEndTipY = safeRY * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, Math.max(safeRX, safeRY));
      const s = -safeRX * Math.sin(endRadians);
      const c = safeRY * Math.cos(endRadians);
      const speed = Math.sqrt(s * s + c * c) || 1;
      const arrowEndDelta = clampL / speed;
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      
      const basePointX = safeRX * Math.cos(baseRadians) * u;
      const basePointY = safeRY * Math.sin(baseRadians) * u;
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.ellipse(0, 0, safeRX * u, safeRY * u, 0, drawStartRadians, drawEndRadians, isAnti);

    if (safeIRX > 0 || safeIRY > 0) {
      if (isFull) {
        ctx.moveTo((safeIRX * u) * Math.cos(drawEndRadians), (safeIRY * u) * Math.sin(drawEndRadians));
      }
      ctx.ellipse(0, 0, safeIRX * u, safeIRY * u, 0, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isFull) {
      ctx.closePath();
    } else if (mode === 'pie') {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if (mode === 'chord') {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0 && safeRX > 0 && safeRY > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0 && safeRX > 0 && safeRY > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
}
customElements.define('pxl-ellipse', Ellipse);
```

---

## 6. Verification & Test Plan

### 6.1 Automated Verification
Create a test script in `scratch/test_circle_hardening.js` to execute via Node:
1. Verify `safeR` clamps negative numbers to `0`.
2. Verify `ir > r` renders smoothly without errors or clamping, allowing dynamic animations to expand outward.
3. Verify sweep of `359°` sets `isFull = false`.
4. Verify sweep of `360°` sets `isFull = true`.
5. Verify `r = 0` with arrows does not produce `NaN` angles or tips.
6. Verify `sweep = 0` and `end = start` preserves continuous path execution without throwing errors, stroke outlines the collapsed radial boundary, and fill paints 0 pixels.
7. Verify `mode="open"` leaves path unclosed.
8. Verify `mode="chord"` calls `closePath()` directly.
9. Verify `mode="pie"` calls `lineTo(0, 0)` and `closePath()`.

### 6.2 Browser Verification
1. Open [`docs/circle.html`](../docs/circle.html) in browser.
2. Confirm Section 1 (Hero sandbox), Section 3 (Radius & Inner Radius), and Section 4 (Pie Slice & Donut Wedge) render correctly using `mode="pie"` and `mode="open"`.
3. In Section 4 Circle 2, drag the `ir` slider to `0` and verify it smoothly morphs into a solid pie slice without glitches.
4. In an oscillating animation crossing $0^\circ$ (e.g. `sweep="sin(t) * 90"`), verify the stroke remains smooth and flicker-free without 1-frame dropouts.
5. In Section 5, verify that a circular segment with `mode="chord"` has a completely closed, stroked chord (both with fill and with stroke-only wireframe).
6. Inject a test element with dynamic oscillating radius: `<pxl-circle r="50 + wave(2) * 100">` and verify it cycles smoothly through zero without throwing `DOMException` or freezing the stage.

### 6.3 Post-Edit Actions
After modifying `js/elements/shapes/circle.js` and `js/elements/shapes/ellipse.js`, run:
```powershell
node build.js
```
to compile production bundles into `dist/`.

---

## 7. Complete Migration Checklist (Files using `pie=`)

Once the engine changes are implemented, the following 7 HTML files and documentation guides will be migrated from `pie="..."` to `mode="..."`:

### 7.1 Documentation Files
* [ ] **`docs/circle.html`**:
  - Section 1 Hero Sandbox: update snippet mark, stage element, and toggle buttons (`mode="open"`, `mode="chord"`, `mode="pie"`).
  - Section 2 API Reference: replace `pie` attribute card with `mode` (`'open' | 'chord' | 'pie'`).
  - Section 4: update snippet marks and stage circles to `mode="pie"`.
  - Section 5: update Pac-Man demo from `pie="true"` to `mode="pie"`.
* [ ] **`docs/fill.html`**:
  - Line 600: `pie="true"` &rarr; `mode="pie"`
  - Line 633: `pie="true"` &rarr; `mode="pie"`
  - Line 650: `pie="true"` &rarr; `mode="pie"`
  - Line 651: `pie="true"` &rarr; `mode="pie"`
* [ ] **`docs/DOCS_STANDARDS.md`**:
  - Line 175: Update toggle button example snippet to use `mode`.

### 7.2 Example Test Files
* [ ] **`examples/test21.html`** (Line 48): `pie="true"` &rarr; `mode="pie"`
* [ ] **`examples/test22.html`** (Line 72): `pie="true"` &rarr; `mode="pie"`
* [ ] **`examples/test26.html`** (Line 85): `pie="true"` &rarr; `mode="pie"`
* [ ] **`examples/test27.html`** (Line 69): `<pxl-ellipse pie="true">` &rarr; `<pxl-ellipse mode="pie">`
* [ ] **`examples/test37.html`** (Lines 191, 193): `pie="true"` &rarr; `mode="pie"`
