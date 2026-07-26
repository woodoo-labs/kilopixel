# Kilopixel Documentation Style Guide

This guide establishes the visual and architectural standards for creating interactive documentation examples in the Kilopixel project. Following these rules ensures a unified, beautiful, and highly intuitive learning experience for developers.

## 1. Color Semantics (2014 Material Design Color System)
We use a strict color-coding system based on the 2014 Material Design palettes to separate context (the stage/layer) from content (the shapes).

* **Transparency Rule:** Always use 100% solid colors for strokes, dots, text labels, and dashed helper lines. Only use semitransparent hex colors (e.g., `#FF8A6526`) for shape fills.
* **Environment (Material Deep Purple):**
  * **Layer Center Dot & `'Layer (0, 0)'` Text:** Deep Purple 400 (`#7E57C2`)
  * **Layer Coordinate Vectors & Guides:** Deep Purple 200 (`#B39DDB`)
  * **Layer Rotated Axes Crosshair:** Deep Purple 100 (`#D1C4E9`) with thin stroke (`strokewidth="1"`)
* **Neutral Slate (`#f1f5f9`, `#cbd5e1`):**
  * **Background Grids:** Subtle Slate (`#f1f5f9`)
  * **Origin Crosshairs:** Slate 300 (`#cbd5e1`) with thin stroke (`strokewidth="1"`) for layer `(0, 0)` axes and orbit path guides so they resemble delicate coordinate grid lines.
* **Shapes (Material Deep Orange):**
  * **Center Dot & Title Text:** Deep Orange 400 (`#FF7043`)
  * **Shape Stroke & Fill:** Deep Orange 300 solid (`#FF8A65`) for stroke and semitransparent (`#FF8A6526`) for fill.
  * **Shape Coordinate Vectors & Labels:** Deep Orange 200 (`#FFAB91`)
  * **Shape Rotated Axes Crosshair:** Deep Orange 100 (`#FFCCBC`) with thin stroke (`strokewidth="1"`)
* **Action & Results (Red / Pink):** Used for Offset vectors, orbital paths, and dynamically tracked result points (`#ef4444`, `#f43f5e`).

## 2. Visual Stacking Order (Z-Index)
Elements within a `<pxl-stage>` and `<pxl-layer>` are drawn in strict DOM order (back-to-front). When demonstrating Stage and Layer coordinates together, use this 3-layer architecture:

1. **Background Layer (Bottom):** A layer (`<pxl-layer x="ref.main.x" y="ref.main.y" rotate="ref.main.rotate">`) containing the `<pxl-grid>`, grey origin crosshairs, and the `'Layer (0, 0)'` dot and text label.
2. **Stage-Level Helper Layer (Middle):** A static, unrotated layer (`<pxl-layer x="0" y="0">`) containing the violet dashed helper lines (`#B39DDB`) and `x = ...` / `y = ...` labels connecting the stage borders to the layer origin. Placing this above the background layer ensures the grid never covers the helper lines or labels.
3. **Main Shape Layer (Top):** The main interactive layer (`id="main"`) containing the demonstrated shape (`<pxl-rect>`, `<pxl-circle>`, etc.), shape center/pivot markers, and orange shape coordinate vectors (`#FFAB91`).

## 3. Coordinate Labels, Alignments & Vectors
* **Mathematical Tuples:** When labeling origin points or centers, always use standard tuple syntax without axis assignments inside the string:
  * **Correct:** `Layer (0, 0)` or `Circle (200, 150)`
  * **Incorrect:** `Layer (x=0, y=0)` or `Circle x/y: 200, 150`
* **Label Alignments:**
  * **Origin / Center Points:** Position labels at the **top-right** of the dot (`x="... + 15" y="... - 15" baseline="bottom"`).
  * **Horizontal Vector Labels (`x = ...`):** Position **below** the horizontal dashed line (`y="... + 15" baseline="top" align="center"`).
  * **Vertical Vector Labels (`y = ...`):** Position **to the right** of the vertical dashed line (`x="... + 15" baseline="middle" align="left"`).
* **Layer vs. Shape Vectors:**
  * When demonstrating Layer X/Y coordinates, draw violet dashed helper lines (`#B39DDB`) inside an unrotated stage-level layer (`<pxl-layer x="0" y="0">`) connecting the stage borders (`x1="0"` and `y1="0"`) to the layer center (`ref.layer.x` and `ref.layer.y`). Because these coordinates are relative to the stage, this ensures they remain horizontal/vertical and do not rotate when the target layer tilts.
  * For Shape X/Y coordinates, draw orange dashed helper lines (`#FFAB91`) connecting the layer origin `(0, 0)` to the shape center `(x, y)`.
* **Conditional Local Coordinate Axes (Rotated Crosshairs):**
  * When demonstrating rotation, show local X and Y crosshair axes centered at the element's origin that rotate with the element.
  * To prevent visual clutter when unrotated, hide these crosshairs when rotation is `0°` using the reactive attribute `hidden="ref.target.rotate == 0"` on a `<pxl-group>`.
  * **Layer Rotated Crosshair:** Use Deep Purple 100 (`#D1C4E9`) inside `<pxl-group hidden="ref.layer.rotate == 0">`.
  * **Shape Rotated Crosshair:** Use Deep Orange 100 (`#FFCCBC`) inside `<pxl-group x="ref.shape.x" y="ref.shape.y" rotate="ref.shape.rotate" hidden="ref.shape.rotate == 0">` placed in the DOM right before the shape so the shape draws on top of its crosshair.
* **Stroke Width Hierarchy:**
  * **`strokewidth="1"` (or default 1):** Background grids, origin crosshairs, rotated axes crosshairs, and coordinate vector helper lines.
  * **`strokewidth="2"`:** Primary interactive shapes being demonstrated (`<pxl-rect>`, `<pxl-circle>`, `<pxl-ellipse>`, etc.).
  * **`strokewidth="3"` / `"4"`:** Special highlight strokes (e.g., interactive orbit rings or primary coordinate axes in dedicated examples).
* **HTML Code Snippets:** Keep introductory `<pre><code>` HTML snippets clean and focused on coordinates by showing `stroke` and omitting redundant `fill` or `strokewidth` attributes.

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
