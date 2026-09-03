# Architectural Design: Dual-Mode Radial Gradients

### 1. The Core Problem: The DX Paradox
In declarative graphics frameworks, developers generally want radial gradients to behave in one of two completely different ways:

1. **Responsive Anchoring:** The gradient stretches and adapts to the geometry of the shape. If the bounding box gets wider, the gradient should stay anchored to a specific edge or corner (similar to CSS `farthest-corner`).
2. **Fixed-Size Panning:** The gradient acts like a "spotlight" or a "glowing orb." It has a fixed physical volume, and if the center point moves across the screen, the radius point must move perfectly in lockstep with it.

Currently, Kilopixel uses an **Absolute Coordinate System** for radii. This solves the first use case brilliantly, acting as a geometric constraint. However, it makes the second use case frustrating: if a developer wants to pan a fixed-size circle, they are forced to manually do math (e.g., `ref.cx + offset`) to drag the radius point along with the center point. 

Trying to force both behaviors into a single `radial()` function creates confusing edge cases (like 6-value mode magically binding the radius to 0, while 8-value mode doesn't).

### 2. The Shared Foundation (Global Gradient Behaviors)
Before splitting into modes, it is important to note that **both** gradient modes share Kilopixel's powerful responsive foundation:
* **Spatial Inheritance:** Because gradients are drawn *after* the Canvas context has been transformed, all gradients inherently inherit the spatial properties of their parent shape. If you rotate, skew, or scale the shape, the gradient perfectly rotates, skews, and scales with it.
* **Responsive Geometry:** Both modes calculate their final pixel values dynamically based on the parent shape's real-time bounding box (`width` and `height`). 

### 3. The Solution: Two Distinct Modes
To provide a flawless Developer Experience (DX) without mathematical compromises, Kilopixel will replace the original `radial()` function by splitting radial gradients into two distinct, explicit modes: `radial1()` and `radial2()`. 

*(Note: The legacy `radial()` function will be fully retired to keep the API clean.)*

#### Mode 1: Vector Mode (`radial1`)
* **Mental Model:** Think of the bounding box.
* **Behavior:** The radius is derived from a 2D vector created by two absolute geometric coordinates (Center Point and Radius Point).
* **Strengths:** Responsive design. The gradient will automatically stretch and scale to stay anchored to the defined points, regardless of how the aspect ratio of the shape changes.
* **Syntax:** `radial1([cx0, cy0, rx0, ry0, cx1, cy1, rx1, ry1], colors)`

#### Mode 2: Radius Mode (`radial2`)
* **Mental Model:** Think of a localized light source.
* **Behavior:** The radius is a 1D vector (a scalar magnitude) tied explicitly to the **X-axis (width)** of the bounding box. It represents a relative offset from the center.
* **Strengths:** Perfect for panning effects. Because the radius is defined relative to the X-axis, the developer can animate the center point `(cx, cy)` anywhere on the screen, and the radius will seamlessly follow it without changing size.
* **Syntax Examples:** 
  * 3-value shortcut: `radial2([cx, cy, r])` (Start radius is 0, End radius is `r`)
  * 6-value explicit: `radial2([cx0, cy0, r0, cx1, cy1, r1])` (Start radius `r0`, End radius `r1`)

### 4. Engine Implementation Plan

**Step 1: Update the Compiler (`js/compiler.js`)**
* Remove the existing `pxl.scope.radial`.
* Introduce `pxl.scope.radial1` to parse the absolute coordinate arrays (2, 4, 6, and 8 values) exactly like the original behavior.
* Introduce `pxl.scope.radial2` to parse arrays of length 3 or 6. It will return scalar radius properties (`r0`, `r1`):

```javascript
pxl.scope.radial2 = (config, colorsArray) => {
  const stops = _parseStops(colorsArray);
  const a = config;
  const len = a.length;

  let cx0 = 0.5, cy0 = 0.5, r0 = 0;
  let cx1 = 0.5, cy1 = 0.5, r1 = 0.5;

  if (len === 3) {
    cx1 = a[0]; cy1 = a[1]; r1 = a[2];
    cx0 = cx1; cy0 = cy1;
  } else if (len >= 6) {
    cx0 = a[0]; cy0 = a[1]; r0 = a[2];
    cx1 = a[3]; cy1 = a[4]; r1 = a[5];
  }

  return { isGradient: true, type: 'radial2', cx0, cy0, r0, cx1, cy1, r1, stops };
};
```

**Step 2: Update the Renderer (`js/elements/shape.js`)**
* Inside the `createGradient` rendering loop, intercept `styleValue.type === 'radial2'` and calculate the radius explicitly using the bounding box width:

```javascript
} else if (styleValue.type === 'radial2') {
  const pcx0 = (box.left + width * styleValue.cx0) * u;
  const pcy0 = (box.top + height * styleValue.cy0) * u;
  const r0_pixels = Math.abs(styleValue.r0 * width * u);

  const pcx1 = (box.left + width * styleValue.cx1) * u;
  const pcy1 = (box.top + height * styleValue.cy1) * u;
  const r1_pixels = Math.abs(styleValue.r1 * width * u);

  grad = ctx.createRadialGradient(pcx0, pcy0, r0_pixels, pcx1, pcy1, r1_pixels);
}
```
