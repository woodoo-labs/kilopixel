# Kilopixel Documentation Style Guide

This guide establishes the visual and architectural standards for creating interactive documentation examples in the Kilopixel project. Following these rules ensures a unified, beautiful, and highly intuitive learning experience for developers.

## 1. Color Semantics
We use a strict color-coding system to separate context (the stage/layer) from content (the shapes).

* **Violet / Purple (`#8b5cf6`, `#a78bfa`)**: Used for the **Environment**. This includes Layers, Layer Origin coordinates, background grids, and coordinate crosshairs.
* **Orange (`#ea580c`, `#f97316`, `#ffedd5`)**: Used for the **Shapes**. This includes Shape borders/fills, Pivot points, and Shape coordinate texts.
* **Red / Pink (`#ef4444`, `#f43f5e`)**: Used for **Action & Results**. This includes Offset vectors, orbital paths, and dynamically tracked result points (like `Rect Offset`).

## 2. Visual Stacking Order (Z-Index)
Elements within a `<pxl-layer>` are drawn in strict DOM order (back-to-front). All examples must adhere to this semantic layering:

1. **Helpers (Bottom):** The background grid and center crosshairs (`<pxl-grid>`, `<pxl-line>`).
2. **The Shape:** The actual element being demonstrated (`<pxl-rect>`, `<pxl-circle>`, etc.).
3. **Environment Overlays:** Layer Origin dots and their associated text labels.
4. **Shape Overlays (Top):** Pivot point dots, dynamic tracking dots, and their associated text labels. This ensures the pivot is *always* visible, even when inside the shape.

## 3. Coordinate Labels
When labeling points on the canvas, always use standard mathematical tuple syntax without explicit axis assignments inside the string:
* **Correct:** `Layer (0, 0)` or `Rect (100, 200)`
* **Incorrect:** `Layer (x=0, y=0)` or `Rect x/y: 100, 200`

## 4. UI Controls & Architecture
Interactive playgrounds must follow a standardized DOM architecture to maintain visual parity across the site.

### Layout Structure
```html
<div class="demo-container">
  <!-- 1. The reactive stage -->
  <pxl-stage class="demo-stage">...</pxl-stage>
  
  <!-- 2. The controls block -->
  <div class="demo-controls">
    <div class="demo-controls-header">Controls</div>
    
    <!-- Optional: Tabs for grouping -->
    <div class="playground-tabs">...</div>
    
    <!-- The sliders -->
    <div class="playground-sliders">
      <div class="control-group">
        <label>Rotation <span id="lblRot">0°</span></label>
        <input type="range" oninput="...">
      </div>
    </div>
  </div>
</div>
```

### Reactivity & Live Code
* Use `<pxl-var>` nodes at the root of the example to declare reactive state.
* HTML code blocks must use `<pre><code class="language-html">`.
* Values in the code block that change dynamically must be wrapped in a `<mark id="code[VarName]">` tag.
* Slider `oninput` handlers must do three things:
  1. Update the reactive variable: `pxl.nodes.myVar.set('value', Number(this.value))`
  2. Update the UI label: `document.getElementById('lblVar').innerText = this.value`
  3. Update the Code snippet: `document.getElementById('codeVar').innerText = this.value`
* *Note: A global `MutationObserver` in the documentation template automatically detects changes to `<mark>` elements and applies a brilliant orange CSS flash (`.highlight-active`) for an "alive" feeling.*
