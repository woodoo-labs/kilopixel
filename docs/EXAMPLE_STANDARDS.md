# Kilopixel Documentation Style Guide

This guide establishes the visual and architectural standards for creating interactive documentation examples in the Kilopixel project. Following these rules ensures a unified, beautiful, and highly intuitive learning experience for developers.

## 1. Color Semantics
We use a strict color-coding system to separate context (the stage/layer) from content (the shapes).

* **Violet / Purple (`#6d28d9`, `#a78bfa`)**: Used for the **Environment**. This includes solid `#6d28d9` (`violet-700`) for Layer Center coordinates/dots and `#a78bfa` (`violet-400`) for subtle Layer coordinate helper lines and labels (`x =`, `y =`).
* **Neutral Slate (`#f1f5f9`, `#cbd5e1`)**: Used for **Background Grids** (`#f1f5f9`) and internal coordinate crosshair lines (`#cbd5e1`) to ensure they remain subtle and do not visually compete with the environment or shape coordinates.
* **Shape Palettes (Orange, Blue, Green)**: When demonstrating single or multiple independent interacting shapes, use these standardized single-palette lighter/darker color schemes (`400` Center, `600` Offset Vectors, `700` Offsets, `300` Background Guides):
  * **1. Orange Shape Scheme (Primary / Default):**
    * **Center Dot & Title Label:** `#fb923c` (`orange-400`, Lighter anchor tone)
    * **Offset Dot, Active Point & Offset Label:** `#c2410c` (`orange-700`, Deeper accent tone)
    * **Shape Border (`stroke`):** `#f97316` (`orange-500`)
    * **Shape Fill:** `#ffedd566` (`orange-100` at 40% opacity)
    * **Center Helper Lines & Orbit Guides:** `#fdba74` (`orange-300`)
    * **Offset Radius/Vector Lines:** `#ea580c` (`orange-600`)
  * **2. Blue Shape Scheme (Secondary / Point A):**
    * **Center Dot & Title Label:** `#60a5fa` (`blue-400`, Lighter anchor tone)
    * **Offset Dot, Active Point & Offset Label:** `#1d4ed8` (`blue-700`, Deeper accent tone)
    * **Shape Border (`stroke`):** `#3b82f6` (`blue-500`)
    * **Shape Fill:** `#dbeafe66` (`blue-100` at 40% opacity)
    * **Center Helper Lines & Orbit Guides:** `#93c5fd` (`blue-300`)
    * **Offset Radius/Vector Lines:** `#2563eb` (`blue-600`)
  * **3. Green Shape Scheme (Tertiary / Shape 3):**
    * **Center Dot & Title Label:** `#4ade80` (`green-400`, Lighter anchor tone)
    * **Offset Dot, Active Point & Offset Label:** `#15803d` (`green-700`, Deeper accent tone)
    * **Shape Border (`stroke`):** `#22c55e` (`green-500`)
    * **Shape Fill:** `#dcfce766` (`green-100` at 40% opacity)
    * **Center Helper Lines & Orbit Guides:** `#86efac` (`green-300`)
    * **Offset Radius/Vector Lines:** `#16a34a` (`green-600`)

## 2. Visual Stacking Order (Z-Index)
Elements within a `<pxl-layer>` are drawn in strict DOM order (back-to-front). All examples must adhere to this semantic layering:

1. **Background Grid (Bottom):** `<pxl-grid>` in stage space.
2. **Layer Helpers:** Dashed lines and coordinate labels (`x =`, `y =`) pointing to the layer center.
3. **Layer Axes & Center:** Internal grey crosshairs (`<pxl-line>`) and the Layer Center dot and text (`'Layer (0, 0)'`).
4. **Shape Helpers:** Dashed coordinate helper lines and labels (`x =`, `y =`) pointing to the shape center.
5. **The Shape:** The actual element being demonstrated (`<pxl-rect>`, `<pxl-circle>`, etc.).
6. **Shape Center (Top):** Center dots, dynamic tracking dots, and their primary title labels (e.g., `'Circle (150, 200)'`). This ensures identity markers are *always* visible above all helpers and shapes.

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
* **Variable Placement:** `<pxl-var>` nodes act as invisible shapes in the engine. If they use any mathematical animations (like `t` or `wave()`), they **must** be placed inside a `<pxl-layer>` so their `render` cycle is evaluated by the engine loop.
* **Direct Manipulation over Variables:** `<pxl-var>` nodes should only be used for shared global state. For direct property control, sliders must directly manipulate the target element via the engine: `pxl.nodes.[elementId].set('property', this.value)`.
* HTML code blocks must use `<pre><code class="language-html">`.
* Values in the code block that change dynamically must be wrapped in a `<mark id="code[VarName]">` tag.
* Slider `oninput` handlers must execute inline JS to do exactly three things:
  1. Update the element property: `pxl.nodes.ex4Rect.set('x', this.value)`
  2. Update the UI label: `document.getElementById('lblEx4RectX').innerText = this.value`
  3. Update the HTML Code snippet: `document.getElementById('codeEx4RectX').innerText = this.value`
* *Note: The highlighting system uses a Regex-based Pointer Event Delegation System (`pointerdown`/`touchstart`). It automatically parses the `oninput` strings of sliders to find the `getElementById('code...')` references, dynamically mapping active sliders to their `<mark>` targets.*

### 5. ID Naming Conventions
To ensure perfect consistency across documentation playgrounds, all HTML IDs must follow a strict naming scheme:
* Format: **`ex[Number][Entity][Property]`** (camelCase)
* Target Elements: `ex4Layer`, `ex4Rect`, `ex2Circle`
* UI Labels: `lblEx4LayerX`, `lblEx4RectRot`
* Code Snippet Marks: `codeEx4LayerX`, `codeEx4RectRot`
* Do not append redundant suffixes like `Shape`.
