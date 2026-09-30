# Design Plan: `<pxl-path>` — Native SVG Path2D Element & Vector Sprites

**Date**: 2026-09-30  
**Status**: Draft  
**Files affected**: `js/elements/shapes/path.js` (new), `js/elements/shape.js`, `js/interaction.js`, `build.js`

---

## 1. Problem Statement & Motivation

Kilopixel currently excels at parametric shapes (`<pxl-circle>`, `<pxl-rect>`, `<pxl-polyline>`), but lacks first-class support for arbitrary vector graphics, complex bezier curves, and SVG icons.

Modern web browsers support the native HTML5 Canvas `Path2D` interface, which accepts standard SVG path strings (`d="..."`) directly into the browser's C++ rendering engine. 

Implementing `<pxl-path>` unlocks:
1. **Instant Access to Vector Asset Libraries**: Millions of icons from Figma, Lucide, Heroicons, Material, and FontAwesome can be pasted directly into Kilopixel.
2. **Sub-1 KB Bundle Cost**: Zero client-side SVG parsing or bezier math; the browser's native engine handles all path tessellation.
3. **Zero-GC 60 FPS Rendering**: Path geometry is parsed once into native memory, while transforms (`x`, `y`, `w`, `h`, `rotate`, `scale`) run at 60 FPS without allocations.
4. **Vector Sprite-Sheet Animation**: Leveraging reactive JavaScript array syntax on `viewbox` allows single compound SVG paths to function as multi-frame vector sprite sheets.

---

## 2. Element Taxonomy & Separation of Concerns

`<pxl-path>` establishes a clean architectural division within Kilopixel's vector toolkit:

```
┌────────────────────────────────────────────────────────┐
│                      KILOPIXEL                         │
├──────────────────────────┬─────────────────────────────┤
│        <pxl-path>        │       <pxl-polyline>        │
├──────────────────────────┼─────────────────────────────┤
│  Rigid Vector Geometry   │ Elastic Deformable Geometry │
│                          │                             │
│ • Icons (Lucide/Figma)   │ • Audio waveforms           │
│ • Vector sprite sheets   │ • Oscilloscopes             │
│ • Native C++ Path2D      │ • Wobbling jelly curves     │
│ • Animates: x, y, w, h,  │ • Animates: individual x, y │
│   rotation, fill, stroke │   points via Catmull-Rom    │
└──────────────────────────┴─────────────────────────────┘
```

---

## 3. Attribute Architecture

### 3.1 Inherited Attributes (from `Shape`)

`<pxl-path>` inherits all standard [`Shape`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/shape.js) attributes:
* **Spatial Transforms**: `x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`
* **Styling**: `fill`, `stroke`, `strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`
* **Compositing & Effects**: `alpha`, `blend`, `mask`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy`, `hidden`
* **Interaction**: `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove`, `isHovered`, `isPressed`

> [!NOTE]
> **No Arrowheads on `<pxl-path>`**:  
> Because native `Path2D` is an opaque native structure that does not expose vertex endpoints or analytical tangents, arrow attributes (`arrowstart`, `arrowend`, `arrowstyle`) are intentionally omitted.

### 3.2 Path-Specific Observed Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `d` | string | `''` | SVG path definition string (`M... Z`). Compiled once into a cached `Path2D` object. |
| `viewbox` | string \| array | `null` | Intrinsic SVG bounds. Supports space-separated string (`"0 0 24 24"`) OR array syntax (`[0, 0, 24, 24]`). Supports expressions. |
| `w` | number | `null` | Target width in logical canvas units. |
| `h` | number | `null` | Target height in logical canvas units. Derives from `viewbox` aspect ratio if omitted. |
| `size` | number | `null` | Convenience shorthand setting both `w` and `h` uniformly. |
| `anchor` | string | `'center'` | 9-point alignment anchor relative to the viewBox (`'center'`, `'top-left'`, `'bottom'`, etc.). |
| `fillrule` | string | `'nonzero'` | Fill rule passed to `ctx.fill(path, rule)`: `'nonzero'` or `'evenodd'`. |

---

## 4. ViewBox, Sizing & Vector Sprite Engine

### 4.1 Dual-Format ViewBox Parser (`parseViewBox`)

Following Kilopixel's established precedent for [`linedash="[20, 10]"`](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md#L804), `viewbox` accepts both standard SVG strings and JavaScript Arrays:

```javascript
parseViewBox(val) {
  if (!val) return null;

  // 1. Array Syntax (Static or Evaluated by Expression Compiler)
  if (Array.isArray(val) && val.length === 4) {
    return { x: val[0], y: val[1], w: val[2], h: val[3] };
  }

  // 2. Standard SVG String Syntax (e.g., "0 0 24 24" copied from Figma)
  if (typeof val === 'string') {
    const parts = val.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
  }

  return null;
}
```

### 4.2 The SVG Vector Sprite-Sheet Pattern

Because the expression compiler evaluates arrays natively, developers can drive animated vector sprite sheets with zero string concatenation:

```html
<!-- Reactive frame variable (0, 1, 2, 3...) -->
<pxl-var id="frame" value="floor(loop(2) * 4)"></pxl-var>

<!-- 4-frame icon strip: each frame is 24 units wide -->
<pxl-path
  d="M0 0 ... M24 0 ... M48 0 ... M72 0 ..."
  viewbox="[ref.frame.value * 24, 0, 24, 24]"
  size="60"
  fill="cyan">
</pxl-path>
```

* **Zero String Allocations**: `[ref.frame.value * 24, 0, 24, 24]` evaluates directly into a 4-number array in JS memory.
* **Instant Frame Switching**: Only the viewBox translation shifts; the underlying C++ `Path2D` geometry is never re-parsed.

### 4.3 Sizing & Aspect-Ratio Preservation

Dimensions are resolved with smart fallbacks:
1. `size` provided: `targetW = size`, `targetH = size`.
2. Both `w` and `h` provided: Explicit dimensions (allows non-uniform stretching).
3. Only `w` provided: `targetH = w * (vb.h / vb.w)`.
4. Only `h` provided: `targetW = h * (vb.w / vb.h)`.
5. Neither provided: 1:1 fallback with viewBox (`targetW = vb.w`, `targetH = vb.h`).
6. `viewbox` omitted entirely: 1 SVG unit = 1 Kilopixel logical unit (raw coordinate mode).

### 4.4 Non-Scaling Stroke Normalization

When Canvas scales via `ctx.scale(sx, sy)`, border widths scale with the geometry. `<pxl-path>` normalizes `ctx.lineWidth` against the average scale factor:

$$\text{effectiveLineWidth} = \frac{\text{strokewidth} \cdot u}{\text{averageScale}}$$

This ensures `strokewidth="2"` renders at exactly 2 logical units regardless of whether the icon is rendered at 24px or 240px.

### 4.5 Multi-Path Icons & Duotone Composition

While ~80–90% of web icons (FontAwesome, Material Symbols) are a single `<path>`, some icons (e.g. Bootstrap `chat-dots`, `bell-fill` with notification badge, or FontAwesome Duotone) consist of 2–3 distinct paths.

Kilopixel provides two seamless patterns to handle multi-path icons:

#### Pattern A: Composed Duotone Group (`<pxl-group>`)
When sub-parts require distinct colors, different opacities, or independent animation:

```html
<pxl-group x="500" y="300" rotate="sin(t * 2) * 5">
  <!-- Path 1: Primary shape -->
  <pxl-path d="M...bubble..." viewbox="0 0 16 16" size="80" fill="#3b82f6"></pxl-path>
  <!-- Path 2: Secondary detail / accent -->
  <pxl-path d="M...dots..." viewbox="0 0 16 16" size="80" fill="white"></pxl-path>
</pxl-group>
```
* Because both paths share identical `viewbox` and `size`, their coordinate spaces align with 100% mathematical precision.
* The outer `<pxl-group>` handles common positioning (`x`, `y`), rotation, and scaling.

#### Pattern B: Single-Node Sub-Path Merge (MoveTo `M`)
If the multi-path icon is monochrome and the developer prefers a single DOM node:

```html
<!-- Concatenate multiple sub-paths into a single d attribute -->
<pxl-path d="M...subpath 1...Z  M...subpath 2...Z" viewbox="0 0 16 16" size="80" fill="currentColor"></pxl-path>
```
Native `Path2D` natively supports multiple `M` (MoveTo) commands in a single string, drawing disconnected contours as a single vector shape.

---

## 5. Render Algorithm & Zero-GC Guarantees

### 5.1 Structure of `Path.draw(ctx, u, t)`

```javascript
draw(ctx, u, t) {
  if (!this._path2d) return;

  const { w, h, size, anchor, fillrule } = this.attributeValues;
  const rawVb = this.attributeValues.viewbox;

  // 1. Resolve ViewBox (Array from compiler OR cached static string)
  let vb;
  if (Array.isArray(rawVb)) {
    vb = { x: rawVb[0], y: rawVb[1], w: rawVb[2], h: rawVb[3] };
  } else if (rawVb !== this._lastVbStr) {
    this._vb = this.parseViewBox(rawVb);
    this._lastVbStr = rawVb;
    vb = this._vb;
  } else {
    vb = this._vb;
  }

  // Fallback if no viewBox provided
  if (!vb) vb = { x: 0, y: 0, w: 100, h: 100 };

  // 2. Resolve Dimensions
  const explicitW = size ?? w;
  const explicitH = size ?? h;
  const targetW = explicitW !== null ? explicitW : (explicitH !== null ? explicitH * (vb.w / vb.h) : vb.w);
  const targetH = explicitH !== null ? explicitH : (explicitW !== null ? explicitW * (vb.h / vb.w) : vb.h);

  // 3. Resolve 9-Point Anchor
  const ax = pxl.anchorX[anchor] ?? 0.5;
  const ay = pxl.anchorY[anchor] ?? 0.5;

  // 4. Matrix Pipeline
  const sx = (targetW / vb.w) * u;
  const sy = (targetH / vb.h) * u;
  const ox = -(vb.x + vb.w * ax);
  const oy = -(vb.y + vb.h * ay);

  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(ox, oy);

  // 5. Draw & Apply Style
  const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
  this.applyStyle(ctx, u, this._path2d, fillrule, avgScale);

  ctx.restore();
}
```

### 5.2 Bounding Box Resolution

```javascript
getBoundingBox() {
  const { w, h, size, anchor } = this.attributeValues;
  const vb = this._vb || { x: 0, y: 0, w: 100, h: 100 };
  const explicitW = size ?? w;
  const explicitH = size ?? h;
  const targetW = explicitW !== null ? explicitW : (explicitH !== null ? explicitH * (vb.w / vb.h) : vb.w);
  const targetH = explicitH !== null ? explicitH : (explicitW !== null ? explicitW * (vb.h / vb.w) : vb.h);

  const ax = pxl.anchorX[anchor] ?? 0.5;
  const ay = pxl.anchorY[anchor] ?? 0.5;

  this.boundingBox.left = -targetW * ax;
  this.boundingBox.right = targetW * (1 - ax);
  this.boundingBox.top = -targetH * ay;
  this.boundingBox.bottom = targetH * (1 - ay);

  return this.boundingBox;
}
```

---

## 6. Core Engine Modifications

### 6.1 `Shape.applyStyle` Update ([`js/elements/shape.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/shape.js))

Update `applyStyle` to accept optional `path2d`, `fillrule`, and `scaleMultiplier` without breaking any existing shape:

```javascript
applyStyle(ctx, u, path2d = null, fillrule = 'nonzero', scaleMultiplier = 1) {
  const { fill, stroke, strokewidth, linecap, linejoin, miterlimit, linedash, dashoffset } = this.attributeValues;

  if (fill && fill !== 'none' && fill !== 'transparent') {
    ctx.fillStyle = this.createGradient(ctx, u, fill, 0);
    if (path2d) {
      ctx.fill(path2d, fillrule);
    } else {
      ctx.fill();
    }
  }

  if (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) {
    ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);
    ctx.lineWidth = (strokewidth * u) / scaleMultiplier;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    pxl.applyLineDash(ctx, u, linedash, dashoffset, this);

    if (path2d) {
      ctx.stroke(path2d);
    } else {
      ctx.stroke();
    }
  }
}
```

### 6.2 `InteractionEngine` Dummy Context Interception ([`js/interaction.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/interaction.js))

Forward `Path2D` instances in the dummy hit-test context:

```javascript
pxl.dummyCtx.fill = function(pathOrRule, fillRule) {
  if (pathOrRule instanceof Path2D) {
    if (this.isPointInPath(pathOrRule, pxl._hitX, pxl._hitY, fillRule || 'nonzero')) {
      pxl._hitResult = true;
    }
  } else {
    if (this.isPointInPath(pxl._hitX, pxl._hitY, pathOrRule || 'nonzero')) {
      pxl._hitResult = true;
    }
  }
};

pxl.dummyCtx.stroke = function(path) {
  if (path instanceof Path2D) {
    if (this.isPointInStroke(path, pxl._hitX, pxl._hitY)) {
      pxl._hitResult = true;
    }
  } else {
    if (this.isPointInStroke(pxl._hitX, pxl._hitY)) {
      pxl._hitResult = true;
    }
  }
};
```

### 6.3 Build System Integration ([`build.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/build.js))

Add `js/elements/shapes/path.js` to the `files` array immediately following `grid.js`:

```javascript
const files = [
  // ...
  'js/elements/shapes/text.js',
  'js/elements/shapes/grid.js',
  'js/elements/shapes/path.js',  // <-- NEW
  'js/elements/variable.js'
];
```

---

## 7. Verification & Test Plan

### Test Case 1: Standard Lucide / Figma Icon
* **Setup**: Paste a Lucide flame icon `d="..."` with `viewbox="0 0 24 24"` and `size="80"`.
* **Expectation**: Renders crisp and sharp at logical size 80.

### Test Case 2: Multi-Frame SVG Vector Sprite Sheet
* **Setup**: Construct a multi-icon path containing 4 icons at $x = 0, 24, 48, 72$.
* **Expression**: Set `viewbox="[ref.frame.value * 24, 0, 24, 24]"` with an interactive slider or button cycling `frame` (0 to 3).
* **Expectation**: Cycles cleanly between all 4 icons at 60 FPS with zero GC churn or dropped frames.

### Test Case 3: Aspect-Ratio Auto-Derivation
* **Setup**: Path with `viewbox="0 0 100 50"` (2:1 ratio) and only `w="120"` provided.
* **Expectation**: Engine derives `h = 60` automatically without visual stretching.

### Test Case 4: Non-Scaling Stroke Verification
* **Setup**: Path with `strokewidth="2"` animated with `scale="wave(1) * 2 + 1"`.
* **Expectation**: Border remains a steady 2 units thick on screen, without ballooning when the shape scales up.

### Test Case 5: 9-Point Anchor Pivot
* **Setup**: Set `anchor="center"` and animate `rotate="t * 90"`.
* **Expectation**: Shape spins cleanly around its visual center. Set `anchor="top-left"` and verify it spins around its top-left vertex.

### Test Case 6: Interactive Hit Testing & Events
* **Setup**: Set `onclick="ref.counter.set('value', ref.counter.value + 1)"` and `fill="ref.icon.isHovered ? 'red' : 'blue'"`.
* **Expectation**: Hover and click state triggers strictly within the bezier contour of the icon.

### Test Case 7: Compositing & Gradients
* **Setup**: Apply `fill="linear(45, ['gold', 'red'])"` and `mask="destination-out"`.
* **Expectation**: Linear gradient spans the icon's bounding box and correctly clips out background pixels.

### Test Case 8: Multi-Path & Duotone Composition
* **Setup**: Assemble Bootstrap `chat-dots` or `bell-fill` using 2 `<pxl-path>` elements sharing `viewbox="0 0 16 16"` inside a `<pxl-group>`.
* **Expectation**: Primary body and inner details align with 100% precision. Sub-parts can have independent fills/animations while rotating together as a unit. Also test string-concatenation (`M... Z M... Z`) into a single `<pxl-path>` element.
