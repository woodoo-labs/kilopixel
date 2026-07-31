# Kilopixel Documentation Style Guide

This guide establishes the visual and architectural standards for creating interactive documentation examples in the Kilopixel project. Following these rules ensures a unified, beautiful, and highly intuitive learning experience for developers.

## 1. Color Semantics
We use a strict color-coding system to separate context (the stage/layer) from content (the shapes).

* **Teal / Cyan (`#0f766e`, `#14b8a6`)**: Used for the **Stage Environment** (Stage space). This includes solid `#0f766e` (`teal-700`) for Stage corners, origin dots (`Stage (0, 0)`), and corner coordinate labels (`(1000, 0)`), and `#14b8a6` (`teal-500`) for Stage dimension arrows (`width = 1000 (fixed)`) and helper lines.
* **Violet / Purple (`#6d28d9`, `#a78bfa`)**: Used for the **Layer Environment** (Layer space). This includes solid `#6d28d9` (`violet-700`) for Layer Center coordinates/dots and `#a78bfa` (`violet-400`) for subtle Layer coordinate helper lines and labels (`x =`, `y =`).
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
Every documentation example must follow a standardized 3-part layout:
1. **Visible Declarative Code Block (`<pre><code class="language-html">`)**: Placed **above** the demo container so developers see the declarative syntax immediately. Use `<mark id="code...">` around dynamic values.
2. **Reactive Stage (`<pxl-stage class="demo-stage">`)**: Placed at the top inside `<div class="demo-container">`.
3. **Interactive Controls (`<div class="demo-controls">`)**: Placed **below** `<pxl-stage>` inside `<div class="demo-container">`. Every example must feature interactive controls (sliders or toggle buttons). The header title must be simply `Controls` without redundant prefixes.

```html
<!-- 1. Declarative Code Block Above Stage -->
<pre><code class="language-html">&lt;pxl-stage ratio="5 / 3"&gt;
  &lt;pxl-layer&gt;
    &lt;pxl-circle x="500" y="300" r="&lt;mark id="codeEx1R"&gt;200&lt;/mark&gt;" stroke="#f97316"&gt;&lt;/pxl-circle&gt;
  &lt;/pxl-layer&gt;
&lt;/pxl-stage&gt;</code></pre>

<div class="demo-container">
  <!-- 2. The reactive stage -->
  <pxl-stage class="demo-stage">...</pxl-stage>
  
  <!-- 3. The controls block below stage -->
  <div class="demo-controls">
    <div class="demo-controls-header">
      <h3 class="demo-controls-title">Controls</h3>
      <div class="demo-tabs">
        <button class="tab-btn active" onclick="pxlDocs.switchTab(this, 'ex1-circle')">Circle</button>
      </div>
    </div>
    
    <!-- Circle Tab -->
    <div class="tab-content active" id="ex1-circle">
      <div class="playground-sliders">
        <div class="control-group">
          <label>Radius <span id="lblEx1R">200</span></label>
          <input type="range" min="10" max="400" step="10" value="200" autocomplete="off"
            oninput="document.getElementById('ex1Circle').setAttribute('r', this.value); document.getElementById('lblEx1R').innerText = this.value; document.getElementById('codeEx1R').innerText = this.value;">
        </div>
      </div>
    </div>
  </div>
</div>
```
* **Required Script Imports:** Every documentation page must include `<script src="js/layout.js"></script>` and `<script src="js/docs.js"></script>` in `<head>`.
* **Tab Bars & Mobile Scrolling:** Always use `.demo-tabs` inside `.demo-controls-header` for tab navigation with `onclick="pxlDocs.switchTab(this, '...')"` handlers. The header container (`.demo-controls-header`) automatically scrolls horizontally on mobile devices to prevent wrapping or layout overflow.

### JavaScript Namespace & Native DOM Methods
* **Strict Namespacing (`pxlDocs`):** All documentation playground helper functions, utilities, and interactive methods MUST be defined under the `window.pxlDocs` namespace in `docs/js/docs.js` (e.g., `pxlDocs.switchTab`, `pxlDocs.initHighlighting`). Never define global functions on `window` or in ad-hoc `<script>` blocks on individual pages.
* **Native DOM API (Zero-Magic Interaction):** When interacting with Kilopixel HTML elements from JavaScript (e.g., in slider `oninput` handlers or custom scripts), ALWAYS use standard native DOM methods like `document.getElementById('id').setAttribute('attr', value)`. This makes it transparent to developers inspecting the source code that Kilopixel has no proprietary or secret JavaScript API—it works 100% via standard declarative HTML attributes and native DOM manipulation.

### Reactivity & Live Code
* **Variable Placement:** `<pxl-var>` nodes act as invisible shapes in the engine. If they use any mathematical animations (like `t` or `wave()`), they **must** be placed inside a `<pxl-layer>` so their `render` cycle is evaluated by the engine loop.
* **Direct Manipulation over Variables:** `<pxl-var>` nodes should only be used for shared global state. For direct property control, sliders must directly manipulate the target element using standard HTML5 Web Component DOM methods: `document.getElementById('elementId').setAttribute('property', this.value)`.
* HTML code blocks must use `<pre><code class="language-html">`.
* Values in the code block that change dynamically must be wrapped in a `<mark id="code[VarName]">` tag.
* **Prism Syntax Highlighting & Keep-Markup:** Every documentation page that uses Prism syntax highlighting MUST load both `prism.min.js` and `<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/keep-markup/prism-keep-markup.min.js"></script>`. Without the `keep-markup` plugin, Prism strips out `<mark id="...">` tags during syntax highlighting, breaking live code updates.
* **Simplified Pedagogical Code Snippets:** HTML code blocks (`<pre><code class="language-html">`) MUST show only the minimal, clean markup needed to teach the section's core concept:
  * **Exclude Stage Helpers:** Never include background grids (`<pxl-grid>`), coordinate axes, dimension lines, or leader markers in the HTML snippet.
  * **Exclude Auxiliary Shapes:** Do not show secondary decorative shapes in the code block.
  * **Minimal Styling:** Use simple `stroke` or basic `fill` attributes. Do not include verbose `strokewidth`, `alpha`, or long CSS `filter` strings unless that specific styling attribute is what is being demonstrated or controlled.
* Slider `oninput` handlers must execute inline JS to do exactly three things:
  1. Update the element property: `document.getElementById('ex4Rect').setAttribute('x', this.value)`
  2. Update the UI label: `document.getElementById('lblEx4RectX').innerText = this.value`
  3. Update the HTML Code snippet: `document.getElementById('codeEx4RectX').innerText = this.value`
* Toggle button `onclick` handlers must follow **Option 1 (Explicit Native DOM + UI Helper)**: put the native `document.getElementById('id').setAttribute('attr', 'value')` call explicitly first so developers see transparently how Kilopixel works, then call `pxlDocs.updateToggle(this, 'lblId', 'codeId', 'value')` to handle UI button state and label/mark updates:
  ```html
  <button class="toggle-btn active" onclick="document.getElementById('heroCircle').setAttribute('pie', 'false'); pxlDocs.updateToggle(this, 'lblHeroPie', 'codeHeroPie', 'false');">false (Open Arc)</button>
  ```
* *Note: The highlighting system uses a Regex-based Pointer Event Delegation System (`pointerdown`/`touchstart`). It automatically parses the `oninput` strings of sliders to find the `getElementById('code...')` references, dynamically mapping active sliders to their `<mark>` targets.*

### 5. ID Naming Conventions
To ensure perfect consistency across all documentation playgrounds and guides, 100% of HTML IDs must follow our **Universal 100% `camelCase` Hierarchical ID Standard**:
* Formula: **`sec[N][exM][Entity][Target][Role]`** (strict **camelCase**, zero hyphens anywhere)
  * **`sec[N]`** *(Required)*: Major Section number on the page (`sec1`, `sec2`, `sec3`, `sec4`).
  * **`[exM]`** *(Optional)*: Example number within that section (`ex1`, `ex2`, `ex3`...). Used when a section has multiple examples or sub-sections. Omitted when a section has only a single interactive example.
  * **`[Entity]`** *(Required)*: Target shape, layer, group, or table category (`Stage`, `Layer`, `Circle`, `Ellipse`, `Styling`, `Transforms`).
  * **`[Target]`** *(Optional)*: Container component (`Tab`) or attribute name (`X`, `Y`, `R`, `Rx`, `Rot`, `Width`).
  * **`[Role]`** *(Optional)*: UI modifier for attribute controls (`Val`, `Code`, `Input`).
* **Canvas Target Shapes (`camelCase`):** Any `<pxl-layer>`, `<pxl-var>`, or canvas shape element that will be referenced by `ref.*` in declarative expressions must use strict **camelCase** (`sec4Layer`, `sec4Ellipse`, `sec3ex1Ring`).
  * *(Why? Using hyphens (`-`) in kebab-case breaks JavaScript dot notation in `ref.*` expressions because `-` is evaluated as subtraction—see `.agents/KILOPIXEL.md`).*
* **Examples by Component Type:**
  * Base Canvas Shapes & Layers: `sec1Stage`, `sec2Circle`, `sec4Layer`, `sec4Ellipse`, `sec3ex1Ring`
  * Tab Content Boxes (`[Target]` = `Tab`): `sec2CircleTab`, `sec4LayerTab`, `sec4EllipseTab`, `sec3ex1RingTab`
  * UI Numeric Label Spans (`[Role]` = `Val`): `sec2CircleXVal`, `sec4LayerRotVal`, `sec4EllipseRxVal`, `sec3ex1RingIRVal`
  * Code Snippet Marks (`[Role]` = `Code`): `sec2CircleXCode`, `sec4LayerRotCode`, `sec4EllipseRxCode`, `sec3ex1RingIRCode`
  * Slider Inputs (`[Role]` = `Input`): `sec2CircleXInput`, `sec4LayerRotInput`
* **Do not append redundant suffixes** like `Shape` or `Attr`.

### 6. Typography & Punctuation Standards
To maintain a cohesive, highly professional editorial presentation across all documentation and guides, follow this strict typography standard:

| Name | Character | Canonical Rule | Example |
| :--- | :---: | :--- | :--- |
| **Hyphen** | `-` | **No spaces.** Strictly for compound adjectives and prefixes. | `zero-cost fast path`, `multi-mode primitive` |
| **En Dash** | `–` (`&ndash;`) | **No spaces.** Strictly for numerical, date, and coordinate ranges (*"to / through"*). | `Angles are evaluated in degrees (0°–360°)` |
| **Em Dash** | `—` (`&mdash;`) | **Always use a space before and after (` — `).** Strictly for sentence breaks, dramatic pauses, or parenthetical explanations. Never use unspaced em dashes or en dashes for sentence breaks. | `animated loading spinners — all from a single tag` |
| **Minus Sign** | `−` (`&minus;`) | **Always use spaces around arithmetic operators.** Strictly for mathematical equations and negative numbers. | `−10 + 5 = −5` |
