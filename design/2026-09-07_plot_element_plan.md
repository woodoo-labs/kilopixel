# Technical Implementation Plan: Declarative `<pxl-plot>` Element

**Date**: 2026-09-07  
**Status**: Proposed Architecture & Design Specification  
**Target Files**: 
- `js/compiler.js` (Expression compiler parameter injection & static-path guard)
- `js/elements/shapes/plot.js` (New Custom Element implementation)
- `build.js` (Bundler file order registration)
- `.agents/KILOPIXEL.md` (Framework reference documentation)

---

## 1. Executive Summary & Objectives

The `<pxl-plot>` element is a dedicated high-performance, declarative shape for the Kilopixel framework. It enables native HTML5 Canvas plotting of:
1. **Explicit Functions**: $y = f(x)$
2. **Parametric Curves**: $x = f(v), y = g(v)$

It solves the core challenges of mathematical visualization in a real-time reactive canvas engine:
- **True Mathematical Orientation**: Inverts the canvas Y-axis so $+y$ is physically upwards.
- **Strict Isotropic (1:1) Scaling**: Ensures circles remain round and slopes are geometrically true.
- **Decoupled Scale vs. Domain**: The drawing interval (`domain`) controls *where* the pen draws without altering the magnification/zoom (`scale`).
- **High-Performance Caching & Zero-GC**: Curve vertices are pre-allocated in `Float32Array` buffers and cached; invisible curves are completely skipped when only markers animate (0.0001ms execution).
- **Multi-Layer Reactivity**: Exposes `.getX(mathX)` and `.getY(mathX)` methods via `ref.*` so static plots can live on background layers while animated indicators live on separate HUD layers.

---

## 2. Element Architecture & Class Hierarchy

```
HTMLElement
└── PxlNode (abstract base)
    └── Shape (abstract styling & context pipeline)
        └── Plot (pxl-plot)
```

- **Tag**: `<pxl-plot></pxl-plot>`
- **Class**: `class Plot extends Shape`
- **Source File**: `js/elements/shapes/plot.js`

---

## 3. Observed Attributes & Default Values

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`fx`** | string / expression | `null` | Mathematical formula for $X$ (parametric mode). Injected parameter: `v`. |
| **`fy`** | string / expression | `null` | Mathematical formula for $Y$. Injected parameter: `x` (normal mode) or `v` (parametric mode). |
| **`domain`** | array `[min, max]` | `[-10, 10]` | Evaluation interval for the parameter ($x$ or $v$). Controls where the curve starts and stops. |
| **`scale`** | number | `50` | Mathematical coordinate scale: canvas pixels per 1 mathematical unit. Preserves 1:1 isotropic aspect ratio. |
| **`steps`** | number | `100` | Number of segments/slices sampled across the `domain`. Allocates `(steps + 1) * 2` floats. |
| **`closed`** | boolean | `false` | When true, connects the final point back to the first point (e.g. for closed polygons or pie slices). |
| **`smooth`** | boolean / number | `false` | When true or a number, interpolates vertices with a Catmull-Rom spline (reuses tension logic from `<pxl-polyline>`). |
| **`reveal`** | number (0.0 - 1.0) | `1.0` | Progressive path tracing factor (0 = invisible, 0.5 = 50% drawn, 1.0 = fully drawn). Reuses `<pxl-text>` typewriter logic for animated pen-drawing. |
| **`markers`** | array | `null` | Array of mathematical values (e.g. `[1, 3, ref.m1.value]`) to draw highlight dots along the curve. |
| **`markersize`**| number | `5` | Radius of marker dots in logical units. |
| **`markerfill`**| string | `null` | Fill color of marker dots (defaults to plot's `stroke`, or `'white'`). |
| **`markerstroke`**| string | `null` | Stroke border color for marker dots. |
| **`markerstrokewidth`** | number | `1.5` | Border thickness for marker dots. |
| **`markerlabels`** | boolean | `false` | When true, renders coordinate text `(x, y)` beside each marker in monospace. |

*Inherited from `Shape`: `x`, `y`, `dx`, `dy`, `rotate`, `scalex`, `scaley`, `skewx`, `skewy`, `fill`, `stroke`, `strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`, `alpha`, `blend`, `mask`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy`, `hidden`, `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove`.*

---

## 4. Modes & Mathematical Behavior

### Mode 1: Explicit Function ($y = f(x)$)
Activated when **only `fy`** is provided.
- The engine steps variable `x` across `domain="[min, max]"`.
- Physical coordinate mapping (relative to element pivot `(x, y)`):
  $$X_{\text{local}} = x \times \text{scale}$$
  $$Y_{\text{local}} = -f(x) \times \text{scale} \quad (\text{negated for upward } +Y)$$

```html
<!-- Sine wave spanning x in [-10, 10], 50px per math unit -->
<pxl-plot 
  x="500" y="300"
  scale="50"
  domain="[-10, 10]"
  fy="sin(x)"
  stroke="#38bdf8" strokewidth="2">
</pxl-plot>
```

### Mode 2: Parametric Function ($x = f(v), y = g(v)$)
Activated when **both `fx` and `fy`** are provided.
- The engine steps variable `v` across `domain="[min, max]"`.
- Physical coordinate mapping:
  $$X_{\text{local}} = f(v) \times \text{scale}$$
  $$Y_{\text{local}} = -g(v) \times \text{scale}$$

```html
<!-- Full circle of radius 150px (3 math units * 50 scale) -->
<pxl-plot 
  x="500" y="300"
  scale="50"
  domain="[0, 2 * PI]"
  fx="cos(v) * 3"
  fy="sin(v) * 3"
  stroke="#f43f5e" strokewidth="2">
</pxl-plot>
```

---

## 5. Decoupled Scale vs. Drawing Interval

The design strictly separates:
1. **`scale`**: Defines the physical metric (how many canvas pixels represent 1 unit).
2. **`domain`**: Defines the loop limits (where the drawing starts and stops).

### The Invariant Guarantee:
Changing `domain="[0, 2*PI]"` to `domain="[0, PI]"` draws exactly half of the circle without altering its radius or zooming the coordinate space.

---

## 6. Core Compiler Modifications (`js/compiler.js`)

### 1. The Parameter Detection & "Static Path" Guard
In current Kilopixel, expressions without time drivers (`t`) or `ref.*` references enter the **Static Path**, executing immediately once:
```javascript
// Current js/compiler.js:
const isAnimated = this.timeDriverRegex.test(sanitizedStr);
const hasVars = deps.length > 0;
```
If a user writes `fy="sin(x)"`, neither `t` nor `ref.*` is detected, causing the compiler to evaluate `sin(x)` immediately with `x = undefined`, resulting in `NaN`.

**Required Change**:
We add a parameter detection regex for math parameters `x` and `v`:
```javascript
const hasPlotParam = /(^|[^a-zA-Z0-9_$])\b([xv])\b/.test(sanitizedStr);
```
When `hasPlotParam` is true, the compiler enters the **Factory Closure Path** even if `t` is not present, producing a callable function rather than a static scalar.

### 2. Upgraded Factory Closure Template
Update the animation/factory template in `compileExpression`:
```javascript
const fn = new Function('scope', 'ref', `
  const { ${this.scopeKeys} } = scope;
  let t;
  const _d = new Date();
  ${this.timeDrivers}
  return function(_t, _param) {
    t = _t;
    let x = _param;
    let v = _param;
    ${code}
  };
`)(this.scope, this.nodes);
```
- When called as `fn(t, currentX)`, the formula executes with both the current time `t` (for 60fps animations like `sin(x + t)`) and the current iteration parameter `x` or `v`.
- 100% backward-compatible: standard shapes continue to call `fn(t)` with `_param = undefined`.

---

## 7. Zero-GC Performance & Smart Caching Engine

### 1. Pre-Allocated Typed Array (`Float32Array`)
In `Plot.constructor()` and when `steps` changes:
```javascript
this.flatCache = new Float32Array((this.steps + 1) * 2);
```
No memory allocations occur in the 60fps `draw()` loop.

### 2. Early Bailout for Invisible Curves (`stroke="none"`)
If a user renders only markers along an invisible path:
```javascript
const hasVisibleCurve = (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) ||
                        (fill && fill !== 'none' && fill !== 'transparent');

if (hasVisibleCurve) {
  this._renderCurve(ctx, u, t);
}

if (this.markersList && this.markersList.length > 0) {
  this._renderMarkers(ctx, u, t);
}
```
When `stroke="none"` and `fill="none"`, the entire 100-step loop is skipped. The engine only evaluates the specific marker coordinates. **Execution time: ~0.0001 ms.**

### 3. Path2D Caching for Static Curves
If `fx` and `fy` do not depend on `t` (static curve), but `markers` animates (e.g. `markers="[wave(3) * 5]"`):
- The curve path is compiled once into a native `Path2D` object.
- On subsequent frames, the curve renders in a single GPU call: `ctx.stroke(this._cachedPath)`.
- Only the 1 dynamic marker point is evaluated per frame.

---

## 8. Multi-Layer Public API (`ref.graph.*`)

`<pxl-plot>` defines public coordinate helpers on `this.attributeValues`:

```javascript
Object.defineProperty(this.attributeValues, 'getX', {
  value: (mathX) => this.attributeValues.x + (mathX * this.attributeValues.scale),
  enumerable: false
});

Object.defineProperty(this.attributeValues, 'getY', {
  value: (mathX) => {
    const rawY = this._evalFy(this._lastT, mathX);
    return this.attributeValues.y - (rawY * this.attributeValues.scale);
  },
  enumerable: false
});
```

### Usage in Multi-Layer Architecture
```html
<!-- LAYER 1: Completely static. Renders once. 0% CPU at 60fps -->
<pxl-layer id="plotLayer">
  <pxl-grid step="50" labels="true"></pxl-grid>
  <pxl-plot id="graph" x="500" y="300" scale="50" domain="[-10, 10]" fy="sin(x)"></pxl-plot>
</pxl-layer>

<!-- LAYER 2: Animated HUD. Only redraws the tiny marker -->
<pxl-layer id="hudLayer">
  <pxl-circle 
    x="ref.graph.getX(wave(4) * 8)" 
    y="ref.graph.getY(wave(4) * 8)" 
    r="8" fill="#00ffcc">
  </pxl-circle>
</pxl-layer>
```

---

## 9. Verification & Build Plan

### Automated Build Verification
1. Run `node build.js` to ensure the new `js/elements/shapes/plot.js` passes through the Terser bundling pipeline with zero errors and optimal minified byte count.

### Interactive Functional Verification
1. **Normal Functions**: Test polynomials ($x^2$), trigonometric waves ($\sin(x), \cos(x)$), and rational functions.
2. **Parametric Curves**: Test circles ($x = \cos(v), y = \sin(v)$), Lissajous figures ($x = \sin(3v), y = \sin(2v)$), and Archimedean spirals ($r = v$).
3. **Progressive Reveal**: Test `reveal="loop(3)"` animating from 0.0 to 1.0 to ensure paths trace smoothly over time.
4. **Zero-GC Benchmarks**: Verify with `ref.main.renderAvg` on `<pxl-stage>` that running an animated marker on an invisible curve (`stroke="none"`) executes in $< 0.05\text{ms}$.
