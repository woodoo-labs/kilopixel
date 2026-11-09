# Kilopixel Documentation Style Guide

This guide sets the visual and structural rules for the interactive examples in the Kilopixel documentation, so every page looks and works the same way.

## 1. Color Semantics
Colors separate context (the stage and its layers) from content (the shapes).

* **Sky Blue (`#0284c7`, `#0ea5e9`, `#7dd3fc`)**: Used for the **Stage Environment** (Stage space). This includes solid `#0284c7` (`sky-600`) for the Stage origin dot (`Stage Origin (0, 0)`), `#0ea5e9` (`sky-500`) for Stage dimension arrows (`width = 1000 (fixed)`) and helper lines, and `#7dd3fc` (`sky-300`) for other Stage corners and their labels (`(1000, 0)`).
* **Color Steps (every layer, group and shape):** Each layer, group and shape uses the same palette steps in its own hue, so center and offset markers build up the same way everywhere:

  | Role | Step |
  |---|---|
  | Center helper lines and labels (`x =`, `y =`), orbit guides | `300` |
  | Ghost outline of a shape (solid, `strokewidth="2"`) | `300` |
  | Center dot and label (`'Layer Center'`, `'Circle Center'`) | `400` |
  | Defining points (polyline vertices, line ends) | `400` |
  | Shape border (`stroke`) | `500` |
  | Offset helper lines and labels (`dx =`, `dy =`), offset vectors | `600` |
  | Offset dot and label | `700` |
  | Active point and label | `700` |

  The active point is the one defining point that the demo's controls move (e.g. the slider-driven polyline vertex or the start point of a line). Centers stay `400` even when controls move them.

  **Points on a thick stroke:** When a thick stroke is the subject of the demo (e.g. `caps.html`), the defining points sit on top of it, where a `400` dot almost disappears. All of them use `700` there, and the centerline drawn on the stroke is white (`#ffffff`, `strokewidth="2"`, `linedash="[5, 5]"`).

  **Ghosts of fill-only shapes:** When the shapes have a fill and no stroke (e.g. `mask.html`), a colored outline would look like their own stroke. Their ghosts use neutral slate (`#94a3b8`, `strokewidth="2"`, `linedash="[5, 5]"`).
* **Violet / Purple (`#c4b5fd`, `#a78bfa`, `#7c3aed`, `#6d28d9`)**: Used for the **Layer Environment** (Layer space) when a demo shows one layer: `#c4b5fd` (`violet-300`) for Layer coordinate helper lines and labels (`x =`, `y =`), `#a78bfa` (`violet-400`) for the Layer Center dot and label, `#7c3aed` (`violet-600`) and `#6d28d9` (`violet-700`) for layer offset helpers and the layer offset point.
* **Pink (`#f9a8d4`, `#f472b6`, `#ec4899`, `#db2777`, `#be185d`)**: The **special color** for elements that show the feature a section teaches and are neither a regular shape nor a helper, e.g. gradient geometry (vectors, gradient centers, radii, color-band boundaries) or a line that links shapes across spaces with `toLocal()`. Pink uses the same steps as every entity: helpers `300`, center `400`, line or vector `500` (`strokewidth="4"`), offset helpers `600`, offset or active point `700`.
* **Two or More Layers:** As soon as a demo shows the centers of two or more layers, each layer takes the hue of the shapes inside it instead of violet (e.g. layer 1 and its circle orange, layer 2 and its circle blue). The layer then sits one step below its shapes so the hue still builds up from layer to shape: layer crosshairs and helpers `200` (`#fed7aa`, `#bfdbfe`, `#bbf7d0`), Layer Center dot and label `300` (`#fdba74`, `#93c5fd`, `#86efac`), then the shape steps above. A layer that shows no center or crosshairs (e.g. an untransformed layer that only holds a reader) does not count.
* **Neutral Slate (`#f1f5f9`, `#cbd5e1`)**: Used for **Background Grids** (`#f1f5f9`) and internal coordinate crosshair lines (`#cbd5e1`) so they stay in the background and don't compete with the stage, layer and shape helpers.
* **Shape Palettes (Orange, Blue, Green)**: When demonstrating single or multiple independent interacting shapes, use these color schemes. Several shapes in the same layer each keep their own scheme:
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

### Stroke Width Hierarchy (`strokewidth`)
Widths of 2 and 4 stay crisp on high-PPI screens (no faded subpixel lines) and keep shapes visually above their helpers. All stage examples use these widths:

* **Helper Lines & Guides (`strokewidth="2"`):** All dashed coordinate axes, layer origin lines, center-tracking lines, local offset lines (`dx`, `dy`), guidelines, and orbit ring guides use `strokewidth="2"`.
* **Helper Dash Pattern (`linedash="[5, 5]"`):** All dashed helper lines (crosshairs, center and offset helpers, orbit guides) use `linedash="[5, 5]"`. Other dash patterns are only for shapes whose dash is the subject of the demo (e.g. `dashes.html`, `arrows.html`) and for showcases.
* **Primary Shapes & Emphasis Vectors (`strokewidth="4"`):** The primary interactive shapes being demonstrated (`<pxl-circle>`, `<pxl-rect>`, `<pxl-ellipse>`, etc.) and important connecting or leader vectors use `strokewidth="4"` (at least `strokewidth="2"` for secondary or nested shapes), so the subject stands out above the `strokewidth="2"` helper lines.

## 2. Visual Stacking Order (Z-Index)
Elements within a `<pxl-layer>` are drawn in DOM order, back to front. All examples use this order:

1. **Background Grid (Bottom):** `<pxl-grid>` in stage space.
2. **Layer Helpers:** Dashed lines and coordinate labels (`x =`, `y =`) pointing to the layer center.
3. **Layer Axes & Center:** Internal grey crosshairs (`<pxl-line>`) and the Layer Center dot and its label (`'Layer Center'`).
4. **Shape Helpers:** Dashed coordinate helper lines and labels (`x =`, `y =`) pointing to the shape center.
5. **The Shape:** The actual element being demonstrated (`<pxl-rect>`, `<pxl-circle>`, etc.).
6. **Shape Center (Top):** Center dots, dynamic tracking dots, and their labels (e.g., `'Circle Center'`). Markers on top stay visible above all helpers and shapes.

## 3. Typography & Coordinate Labels
* **Standard Font Size (`size="27"`):** Within the 1000-width logical canvas, all `<pxl-text>` annotations, coordinate labels, shape titles, and axis guides use `size="27"`. It reads well on desktop and phone screens without cluttering the canvas.
* **Center Point Labels (Canvas):** Center point labels (e.g., the colored dots at the center of layers or shapes) use descriptive text like `'Layer Center'` or `'Circle Center'`, without coordinates `(x, y)`: the dashed helper lines around them already show the coordinates.
  * **Exception for Absolute Stage Bounds:** The Stage origin and corners are the only points that use absolute tuple syntax in labels: `'Stage Origin (0, 0)'` or `'(1000, 0)'`.
* **Coordinate Syntax in Text (Prose):**
  * **Spatial Locations (Points):** When describing a mathematical location on the stage in paragraphs, write the bare tuple (e.g., *"The shape moves to `(350, 150)`"*). Not *"coordinate (0, 0)"*.
  * **HTML Attributes:** When referring to specific properties in declarative code in paragraphs, use inline code with quotes, joined by *and* (e.g., *"Set `x="350"` and `y="150"`"*). Not *"placed at x="350", y="150""*.
* **Terminology & Formatting (The "Code vs. Prose Rule"):**
  Keep general concepts apart from exact API names:
  * **Prose (Lowercase):** When referring generally to a conceptual environment or spatial concept, use standard lowercase English. No capitalized "Proper Nouns" (e.g., *"When a shape is nested inside a rotating layer, its center moves."* or *"The physical stage width..."*).
  * **Code Formatting:** When referring specifically to a Kilopixel HTML element, component, or declarative attribute, format the text as code. Use `<code>` tags when writing in HTML documents, or backticks when writing in Markdown. (e.g., *"Nest the `<code>&lt;pxl-circle&gt;</code>` inside..."*).
  * **Combined Markers (Canvas Labels):** UI markers and canvas labels (e.g., the text floating on the canvas next to a dot) are the only exception. Capitalize both words (e.g., `Layer Center`, `Shape Offset`) so they stand out on the canvas.
  * **Structural HTML Comments:** HTML comments inside code blocks that act as structural titles or headers (e.g., `<!-- Hero Sandbox Stage -->`, `<!-- Left: Animated Pac-Man -->`) may use Title Case. They are treated as document headers rather than conversational prose.
  * **Inline Callout/List Headers:** Bold prefixes at the beginning of paragraphs, bulleted lists, or callout bodies (e.g., `<li><strong>Concept Name:</strong> ...</li>`) use plain English in Title Case, with the colon *inside* the `<strong>` tag. Don't put `<code>` in the bold lead-in; name attributes and keywords in the sentence that follows.
  * **Unitless Coordinates (No `u` or `px`):** The docs treat the 1000-width canvas as a plain number space. Don't add units (`px`, `em`, `%`) to attribute values in prose, don't mention the internal scale factor `u`, and don't write "logical units" or "coordinate units". Use bare numbers, or refer to the "1000-width logical canvas".
  * **Attributes and Values in Prose (`concept (attribute)`):**
    * **Code:** Attribute names and keyword values are code: `<code>strokewidth</code>`, `<code>round</code>`.
    * **Introducing a Feature:** When the attribute name is short or technical, give the plain lowercase concept first, then the attribute in parentheses. Do this once, where the feature is introduced; after that, use the attribute alone.
      * Dimensions: `width (<code>w</code>)`, `height (<code>h</code>)`, `thickness (<code>strokewidth</code>)`
      * Radii: `outer radius (<code>r</code>)`, `inner radius (<code>ir</code>)`, `corner radius (<code>r</code>)`
      * Transforms: `rotation (<code>rotate</code>)`, `uniform scale (<code>zoom</code>)`, `scaling (<code>zoom</code>, <code>scalex</code>, <code>scaley</code>)`
      * Line Styles: `corner joins (<code>linejoin</code>)`, `end caps (<code>linecap</code>)`, `dash patterns (<code>linedash</code>)`
      * Arrowheads: `start (<code>arrowstart</code>) and end (<code>arrowend</code>) arrowheads`
    * **No Pair When the Name Already Says It:** If the concept would only repeat the attribute name (`fill`, `stroke`, `mask`, `miterlimit`, `size`, `font`), write the attribute alone: *"a low `<code>miterlimit</code>`"*, not *"a low miter limit (`<code>miterlimit</code>`)"*.
    * **Values:** Write a keyword value as bare code (*"the default `<code>miter</code>`"*). Use `attr="value"` when the attribute isn't clear from the sentence, or when the reader should copy it (*"The examples use `<code>linejoin="round"</code>`"*).

## 4. UI Controls & Architecture
All interactive examples share one page structure, so every page looks and works the same.

### Callout Boxes (Notes & Architecture Rules)
For notes and important caveats, use the callout classes, not inline styles.

```html
<div class="callout-info">
  <p class="callout-title">Shapes Only!</p>
  <p class="callout-body">The <code>mask</code> attribute applies only to shapes (like <code>&lt;pxl-circle&gt;</code> or <code>&lt;pxl-rect&gt;</code>). Applying a mask to a <code>&lt;pxl-layer&gt;</code> will be ignored.</p>
</div>
```

### Layout Structure
Every example has three parts:
1. **Visible Declarative Code Block (`<pre><code class="language-html">`)**: Placed **above** the demo container so developers see the declarative syntax immediately. Use `<mark id="sec[N]…Code">` around dynamic values (see §5).
2. **Interactive Controls (`<div class="demo-controls">`)**: Placed **above** `<pxl-stage>` inside `<div class="demo-container">`. Every example must feature interactive controls (sliders, dropdowns or toggle buttons). The header title is just `Controls`.
3. **Reactive Stage (`<pxl-stage class="demo-stage" ratio="5 / 3">`)**: Placed at the bottom inside `<div class="demo-container">`. The container's CSS flex gap automatically spaces the stage away from the controls. Examples use `ratio="5 / 3"` (logical width 1000, height 600) unless the example is about another aspect ratio. Showcase sections are square (`ratio="1 / 1"`, see §11).

* **Exception: Introduction:** The introduction (`index.html`) shows short examples without controls: a code snippet followed by a `<pxl-stage class="demo-stage">`, without a `demo-container`. Its examples show how markup becomes a picture rather than teaching one attribute, so controls would distract. All snippet rules still apply. Every other page keeps the 3-part layout.

```html
<!-- 1. Declarative Code Block Above Container -->
<pre><code class="language-html">&lt;pxl-stage ratio="5 / 3"&gt;
  &lt;pxl-layer&gt;
    &lt;pxl-circle x="500" y="300" stroke="#f97316" strokewidth="4"
      r="&lt;mark id="sec1CircleRCode"&gt;200&lt;/mark&gt;"&gt;
    &lt;/pxl-circle&gt;
  &lt;/pxl-layer&gt;
&lt;/pxl-stage&gt;</code></pre>

<div class="demo-container">
  <!-- 2. The controls block above stage -->
  <div class="demo-controls">
    <div class="demo-controls-header">
      <h3 class="demo-controls-title">Controls</h3>
      <div class="demo-tabs">
        <button class="tab-btn active" onclick="pxlDocs.switchTab(this, 'sec1CircleTab')">Circle</button>
      </div>
    </div>

    <!-- Circle Tab -->
    <div class="tab-content active" id="sec1CircleTab">
      <div class="playground-sliders">
        <div class="control-group">
          <label>Radius <span id="sec1CircleRVal">200</span></label>
          <input type="range" min="10" max="400" step="10" value="200" autocomplete="off"
            oninput="document.getElementById('sec1Circle').setAttribute('r', this.value); document.getElementById('sec1CircleRVal').innerText = this.value; document.getElementById('sec1CircleRCode').innerText = this.value;">
        </div>
      </div>
    </div>
  </div>

  <!-- 3. The reactive stage -->
  <pxl-stage class="demo-stage">...</pxl-stage>
</div>
```
* **Script Architecture & Placement (Head vs. Bottom):**
  * **`<head>` Imports (Engine & Structure):** Every docs page loads the layout components, the docs helpers and the engine in `<head>`: `<script src="js/layout.js"></script>`, `<script src="js/docs.js"></script>` and `<script src="js/pxl.min.js"></script>`. Pages with an API reference table also load `<script src="js/api-tabs.js"></script>`. Custom elements defined in `<head>` are upgraded while the page is parsed, which avoids a flash of unstyled content and layout shifts, and `window.pxlDocs` is ready for inline handlers (`onclick`, `oninput`).
  * **Bottom of `<body>` Imports (Syntax Highlighting):** Every page that uses Prism loads its highlighter scripts at the very bottom of `<body>`, after all content. Only a page-specific script (Tier 3) may follow them:
    ```html
    <!-- Prism Syntax Highlighting -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/keep-markup/prism-keep-markup.min.js"></script>
    ```
    At the bottom, all code blocks exist before Prism highlights them. Without the `keep-markup` plugin, Prism strips the `<mark>` tags from code blocks and live code updates stop working.
* **Tab Bars & Mobile Scrolling:** Use `.demo-tabs` inside `.demo-controls-header` for tab navigation with `onclick="pxlDocs.switchTab(this, '...')"` handlers. The header container (`.demo-controls-header`) scrolls horizontally on phones instead of wrapping.

### JavaScript Namespace & Native DOM Methods
* **Namespace (`pxlDocs`):** Shared helper functions live under `window.pxlDocs` in `docs/js/docs.js` (e.g., `pxlDocs.switchTab`, `pxlDocs.initHighlighting`). Don't add other globals on `window`.
* **Native DOM API:** JavaScript that changes Kilopixel elements (slider `oninput` handlers, page scripts) uses standard DOM methods such as `document.getElementById('id').setAttribute('attr', value)`. Readers of the source then see that Kilopixel has no JavaScript API of its own: everything works through HTML attributes.

### Reactivity & Live Code
* **Variable Placement & Layer Organization:** `<pxl-var>` nodes define reactive state and act as invisible nodes in the engine. They go inside a `<pxl-layer>`.
  * **State First (Recommended):** Declare `<pxl-var>` elements at the **very top of `<pxl-layer>`** (directly below the opening tag, preceding `<pxl-grid>`), so the layer reads as state first, then drawing:
    1. **Layer State**: `<pxl-var>` (non-rendering state declarations)
    2. **Drawing**: everything else in the stacking order of §2: the grid, helpers, the shape, then center dots and labels on top. A `<pxl-group>` of helpers sits below the shape; a group of markers or labels sits above it.
  * **Order Doesn't Matter to the Engine:** State first is a convention, not a requirement. Variables work anywhere inside the layer (before, between or after shapes); references resolve when the elements connect.
* **Three Control Tiers:**
  Controls (sliders, buttons, dropdowns) use one of three tiers:
  * **Tier 1: Direct Native DOM (`setAttribute`) — Simple 1-to-1 Attributes:**
    When a slider or dropdown directly maps to a single property on a target element (e.g., `x`, `y`, `r`, `rotate`, `alpha`, `shadowblur`, or discrete 1-to-1 dropdowns like `mask="xor"`):
    Use a short inline handler without any `<pxl-var>` or bottom scripts (see Slider Implementations and Dropdown Implementations below).
  * **Tier 2: Reactive Variables (`<pxl-var>`) — Composite / Multi-Control Attributes:**
    When multiple inputs contribute to a single compound attribute without UI branching (such as vector coordinates in `linear([x0, y0, x1, y1])`, color components in `rgba(r, g, b, a)`, or geometric projection overlays):
    Use `<pxl-var>` nodes declared at the top of `<pxl-layer>`. The target shape binds reactively to the variables (`fill="linear([ref.x0.value, ref.y0.value, ...])"`). Sliders simply update their individual `<pxl-var>` (`setAttribute('value', this.value)`) alongside the UI label and code mark. This avoids long inline template strings and extra scripts.
  * **Tier 3: Bottom Scripts (`<script>`) — Mode Switching & Conditional Branching:**
    When a playground involves branching UI logic, mode switching (such as toggling between numeric sliders and keyword dropdowns in `radial.html`), dynamic visibility toggling (`style.display`), or multi-tab state aggregation (such as compound filter chains in `filter.html`):
    Place dedicated helper functions in a single `<script>` block at the very bottom of `<body>` directly preceding `</body>` (after the Prism highlighter scripts).
* **Code Highlights & Reactive Bindings:** Values in the code block that change are wrapped in a `<mark id="sec[N][Entity][Target]Code">` tag.
  * **Standard Marks:** Use a standard `<mark>` for values that a slider, dropdown or toggle sets directly. They flash yellow-orange when the control changes them.
  * **Reactive Marks:** When a value in the code block is a math expression or dependent variable (e.g., `x="-ref.master.rotate"`), use `<mark class="highlight-reactive">`. It looks like normal code until the value it depends on changes, then flashes a softer orange.
* **Declarative Code Snippets & Control Synchronization:** HTML code blocks (`<pre><code class="language-html">`) show the markup behind the demo. Keep them minimal and easy to scan, and make them mirror the controls:
  * **Pedagogical Filtering (Noise Reduction):** Show only the markup the section's topic needs:
    * **Exclude Stage Environment:** Leave out background grids (`<pxl-grid>`), coordinate axes, dimension arrows, or leader annotations in the HTML snippet.
    * **Exclude Auxiliary Shapes:** Leave out decorative shapes or visual tracking anchor dots.
    * **Simplified Pedagogical IDs:** When elements require IDs for references or reactive bindings, use short, readable names (e.g., `id="circle"`, `id="master"`, `id="line1"`, `id="line2"`) rather than internal playground IDs (`sec5Circle1`). Any `ref.*` expressions in the snippet mirror these simplified names (e.g., `ref.master.x`, `ref.spread.value`).
  * **Vertical Density (The "2-to-4 Line Budget"):** Keep snippets short, so the controls and stage stay on screen, without making lines hard to read:
    * **Line Length (84 / 100 characters):** A code block shows 84 characters, counting indentation. A line with a code mark stays within 84 characters, so values that change are always visible. A line with only fixed values may run up to 100 characters when that saves a line; the rest of it scrolls horizontally.
    * **Single Line:** If the whole element, including its closing tag, fits these limits, keep it on a single line:
      ```html
      <pxl-rect x="300" y="300" w="240" h="240" fill="#ffedd566" stroke="#f97316"></pxl-rect>
      ```
    * **Multi-Line Budget (2 to 4 attribute lines):** Whenever an element does not fit on a single line, break its attributes across 2 to 4 indented lines. Don't put one attribute per line.
  * **Attribute Order (Fixed Values First):** Fixed values come first; values that controls change come after them (see 1-to-1 Control-to-Snippet Synchronization below). Expressions (`ref.circle.x`, `toLocal(…)`) count as fixed values.
    * **Line 1 (Fixed Frame):** The opening line holds `id`, the fixed position (`x y` or `x1 y1 x2 y2`), then the paint of the shape family:
      * **Lines** (`<pxl-line>`, `<pxl-polyline>`): `stroke strokewidth`, then `fill`.
      * **Text** (`<pxl-text>`): font (`font size weight`), then paint (`fill stroke strokewidth`), then layout (`align baseline`).
      * **Other shapes:** `fill stroke strokewidth`.
      ```html
      <pxl-rect x="300" y="300" fill="#ffedd566" stroke="#f97316" strokewidth="4"
      <pxl-line x1="100" y1="300" x2="500" y2="300" stroke="#f97316" strokewidth="4"
      <pxl-text x="500" y="300" font="Inter" fill="#f97316" align="center" baseline="middle"
      ```
    * **Controlled Position:** If a control changes the position, a fixed size takes its place on line 1: `<pxl-circle id="circle" r="40" fill="#ffedd566" stroke="#f97316" strokewidth="4"`.
    * **Other Fixed Values:** Size, angles and other fixed values go on the next line. Long values (`points`, `text`) get a line of their own.
    * **Single-Line Elements:** A fixed size comes right after position: `x y r fill`, `x y w h fill stroke`.
    * **Stroke Width:** Show `strokewidth` whenever the stage sets it, so the snippet matches what is drawn. A slider-driven `strokewidth` moves to a later line like any controlled value.
    * **The Pedagogical Exception:** If an otherwise static attribute is the **core subject being taught** in that example (e.g., `closed="true"` in chords, `pie="true"` in sectors, `anchor="top-left"` in transform hinges, or `direction="rtl"` in typography), it doesn't go on line 1. Put it on a feature line below, where the reader sees it as the topic.
  * **Semantic Attribute Pairing (Natural Geometric Tuples):** Attributes that are functionally or mathematically coupled stay together on one line:
    * **Spatial Coordinates:** `x="..." y="..."` or `x1="..." y1="..."` and `x2="..." y2="..."`
    * **Dimensions & Extents:** `w="..." h="..."` or `rx="..." ry="..."` or `r="..." ir="..."`
    * **Angles & Spans:** `start="..." sweep="..."` or `start="..." end="..."`
    * **Arrowhead Sizes:** `arrowstart="..." arrowend="..."`
    * **Stroke Aesthetics:** `stroke="..." strokewidth="..."` or `linecap="..." linejoin="..."`
    * **Typography:** `font="..." size="..." weight="..."` or `align="..." baseline="..."`
  * **1-to-1 Control-to-Snippet Synchronization:** The top-to-bottom order of the controls matches the reading order of the attributes in the snippet:
    1. **Interactive Sliders First:** Dynamic attributes driven by sliders come after all fixed values, in the order of the sliders (e.g., line 2 for arrow dimensions `arrowstart` / `arrowend`, line 3 for arc angles `start` / `sweep`).
    2. **Categorical Controls Last:** Dropdown menus (`<select>`) and toggle buttons (`.toggle-group`) sit on the **last row** of the controls (see Placement on the Last Row), so their attributes (e.g., `arrowstyle`, `anchor`, `linecap`) go on the **last attribute line** of the snippet.
  * **Closing Tag Syntax & Vertical Alignment:** Custom Web Components cannot be self-closed (`/>`) in standard HTML. So the indentation stays easy to follow:
    * **Dedicated Closing Line for Multi-Line Shapes:** Whenever an element spans multiple lines, the closing tag (`</pxl-[shape]>`) **sits on its own line**, at the indentation of the opening tag. Don't glue `></pxl-[shape]>` to the end of the final attribute:
      ```html
      <pxl-circle x="300" y="300" stroke="#f97316" strokewidth="4"
        arrowstart="25" arrowend="25"
        start="-45" sweep="270"
        arrowstyle="filled">
      </pxl-circle>
      ```
    * **Inline Closing for Single-Line Shapes:** For single-line elements (see Line Length), close inline on the same line:
      ```html
      <pxl-circle x="500" y="300" r="150" fill="#f97316"></pxl-circle>
      ```
  * **Canonical Multi-Shape Example:** Two shapes in a `<pxl-layer>`, following all the rules above:
    ```html
    <pxl-stage ratio="5 / 3">
      <pxl-layer>
        <!-- Left: Filled Arrows -->
        <pxl-circle x="300" y="300" stroke="#f97316" strokewidth="4"
          arrowstart="<mark id="sec5Circle1StartArrowCode">25</mark>" arrowend="<mark id="sec5Circle1EndArrowCode">25</mark>"
          start="-45" sweep="<mark id="sec5Circle1SweepCode">270</mark>"
          arrowstyle="filled">
        </pxl-circle>

        <!-- Right: Line Arrows -->
        <pxl-circle x="700" y="300" stroke="#3b82f6" strokewidth="4"
          arrowstart="<mark id="sec5Circle2StartArrowCode">0</mark>" arrowend="<mark id="sec5Circle2EndArrowCode">35</mark>"
          start="-45" sweep="<mark id="sec5Circle2SweepCode">270</mark>" linedash="<mark id="sec5Circle2DashCode">15</mark>"
          arrowstyle="line">
        </pxl-circle>
      </pxl-layer>
    </pxl-stage>
    ```
* **Slider Implementations:**
  * An `oninput` handler does three things inline:
    1. Update the element property: `document.getElementById('sec4Rect').setAttribute('x', this.value)`
    2. Update the UI label: `document.getElementById('sec4RectXVal').innerText = this.value`
    3. Update the HTML Code snippet: `document.getElementById('sec4RectXCode').innerText = this.value`
  * **Multi-Highlighting (`data-mark`):** By default, `docs.js` finds the `<mark>` to highlight in the slider's `oninput`. To highlight several marks at once (e.g., a standard mark and a reactive mark), list them on the input: `<input type="range" data-mark="sec4RectXCode, sec4MirrorRefXCode">`.
* **Toggle Button Implementations:** A toggle button's `onclick` first calls `document.getElementById('id').setAttribute('attr', 'value')`, so readers see how Kilopixel works, then `pxlDocs.updateToggle(this, null, 'codeId', 'value')` for the button state, the code mark and its flash:
  ```html
  <button class="toggle-btn active" onclick="document.getElementById('sec1Circle').setAttribute('pie', 'false'); pxlDocs.updateToggle(this, null, 'sec1CirclePieCode', 'false');">false (Open Arc)</button>
  ```
  * **No Value Readout in Label (Buttons & Dropdowns):** Toggle button groups (`.toggle-group`) and dropdown menus (`<select>`) already show their state (the `.active` button or the selected `<option>`), so their `<label>` has no `<span id="...Val">` readout, unlike a slider's. For toggle buttons, pass `null` as the `lblId` argument in `pxlDocs.updateToggle`.
* **Dropdown (`<select>`) Implementations:** Dropdowns select among keywords or discrete values (e.g., blend modes):
  * **Option Groups (`<optgroup>`):** When options fall into distinct categories (e.g., perimeter anchors vs. dynamic CSS keywords), group them with `<optgroup label="...">`.
  * **Native DOM `onchange` Handlers:** An `onchange` handler does two things:
    1. Update the target attribute: `document.getElementById('sec1Rect').setAttribute('anchor', this.value)`
    2. Update the code snippet: `document.getElementById('sec1RectAnchorCode').innerText = this.value`
  * **Multi-Highlighting (`data-mark`):** When a dropdown updates a code mark or requires beacon tracking, specify `data-mark="sec1RectAnchorCode"` on the `<select>` element.
  * **Placement on the Last Row:** A dropdown is taller than a slider, so the two don't line up in one row. When a `.playground-sliders` container mixes them, dropdowns go on the last row (or together in one row).
* **Dual-Mode Controls (Numeric Slider vs. Keyword Dropdown):** When a property supports both numeric values and discrete keyword presets (e.g. radial gradient radii, focal offsets):
  * Provide a `.toggle-group` button pair above the input controls (e.g., "Numeric" vs. "Keyword").
  * Wrap the numeric slider and the keyword dropdown in separate `.control-group` containers (e.g. `id="sec1R1SliderGroup"` and `id="sec1R1KeywordGroup"`).
  * Toggle their visibility by switching `style.display` between `'flex'` and `'none'`.
  * Sync the active button's class (`.active`) and update the target element's attribute and code snippet mark to reflect the newly active control mode.

### Onboarding Beacons
Beacons point readers to the most important controls of a complex example.
* **Controls (Sliders & Dropdowns)**: Put `<span class="indicator-dot"></span>` next to a label inside a `.control-group`. The CSS draws it as a pulsing dot.
* **Auto-Generated Tab Badges**: Don't add badges to `.tab-btn` by hand. On page load, `docs.js` counts the `.indicator-dot` controls in each `.tab-content` and adds a numbered badge (e.g., `<span class="indicator-badge">3</span>`) to its tab button.
* **Automatic Dismissal**: When the reader uses a control (the `input` event of a slider or dropdown), its dot is removed and the tab badge counts down; at zero the badge disappears. No IDs or extra JavaScript are needed.

## 5. ID Naming Conventions
Every HTML ID on a page (stages, shapes, controls, tabs and `<mark>` tags) follows the hierarchical `camelCase` formula below. The one exception is the code shown inside snippets, which uses the simplified IDs of §4 (Simplified Pedagogical IDs):
* Formula: **`sec[N][exM][Entity][Target][Role]`** (**camelCase**, no hyphens)
  * **`sec[N]`** *(Required)*: Major Section number on the page (`sec1`, `sec2`, `sec3`, `sec4`).
  * **`[exM]`** *(Optional)*: Example number within that section (`ex1`, `ex2`, `ex3`...). Used when a section has multiple examples or sub-sections. Omitted when a section has only a single interactive example.
  * **`[Entity]`** *(Required)*: Target shape, layer, group, or table category (`Stage`, `Layer`, `Circle`, `Ellipse`, `Styling`, `Transforms`).
  * **`[Target]`** *(Optional)*: Container component (`Tab`) or attribute name (`X`, `Y`, `R`, `Rx`, `Rot`, `Width`).
  * **`[Role]`** *(Optional)*: UI modifier for attribute controls (`Val`, `Code`, `Input`, `Select`, `Btn`, `Group`).
* **Canvas Target Shapes (`camelCase`):** Any `<pxl-layer>`, `<pxl-var>`, or canvas shape element that will be referenced by `ref.*` in declarative expressions use **camelCase** (`sec4Layer`, `sec4Ellipse`, `sec3ex1Ring`).
  * Hyphens would break `ref.*` expressions, because `-` means subtraction there (see `.agents/KILOPIXEL.md`).
* **Variables (`<pxl-var>`):** A variable's `[Entity]` is always `Var`, so every variable is recognizable as one. There are two kinds:
  * **Input Variables (Set by a Control):** Numbered in declaration order within their section or example: **`sec[N][exM]Var[M]`** (`sec1Var1`, `sec1Var2`, `sec2ex1Var1`). Like shapes (`sec1Polyline1`), the ID names the element, not its meaning: no `[Target]` such as `PeakX`. Describe what each one is for in an HTML comment directly above the variables (e.g. `<!-- Var1, Var2: Zig-Zag peak (x, y) -->`).
  * **Computed Variables (Derived from Other Values):** Named, not numbered: **`sec[N][exM]Var[Name]`** (`sec3ex1VarTargetX1`, `sec1ex1VarCos`). Their value is an expression of other variables, and the name keeps formulas readable (`ref.sec3ex1VarPcx1.value + ref.sec3ex1VarDx1.value`).
  * **Rule of Thumb:** Inputs are numbered, derived values are named.
  * **Controls Follow the Variable:** A slider, readout or dropdown that drives a variable takes the variable's ID plus `[Role]`: `sec1Var1Input`, `sec1Var1Val`, `sec1Var1Select`.
  * **Code Marks Follow the Shape:** A `<mark>` in the code snippet names the shape attribute whose value it shows, even when a variable drives it: `sec1Polyline1PeakXCode`.
  * **Code Snippets:** Variables shown inside `<pre><code>` snippets use short, descriptive camelCase names instead (`id="angle"`, `ref.angle.value`), following the Simplified Pedagogical IDs rule in §4.
* **Examples by Component Type:**
  * Base Canvas Shapes & Layers: `sec1Stage`, `sec2Circle`, `sec4Layer`, `sec4Ellipse`, `sec3ex1Ring`
  * Tab Content Boxes (`[Target]` = `Tab`): `sec2CircleTab`, `sec4LayerTab`, `sec4EllipseTab`, `sec3ex1RingTab`
  * UI Numeric Label Spans (`[Role]` = `Val`): `sec2CircleXVal`, `sec4LayerRotVal`, `sec4EllipseRxVal`, `sec3ex1RingIRVal`
  * Code Snippet Marks (`[Role]` = `Code`): `sec2CircleXCode`, `sec4LayerRotCode`, `sec4EllipseRxCode`, `sec3ex1RingIRCode`
  * Slider Inputs (`[Role]` = `Input`): `sec2CircleXInput`, `sec4LayerRotInput`
  * Dropdown Selects (`[Role]` = `Select`): `sec1ex1Var1Select`, `sec3ex1Var6Select`
  * Toggle & Mode Buttons (`[Role]` = `Btn`): `sec1ex1ModeNumericBtn`, `sec1ex1ModeKeywordBtn`
  * Conditional Control Groups (`[Role]` = `Group`): `sec1ex1SliderGroup`, `sec1ex1KeywordGroup`
  * Input Variables (`[Entity]` = `Var`, numbered): `sec1Var1`, `sec1Var1Input`, `sec1Var1Val`, `sec2ex1Var3`
  * Computed Variables (`[Entity]` = `Var`, named): `sec1ex1VarCos`, `sec3ex1VarTargetX1`
* **Do not append redundant suffixes** like `Shape` or `Attr`.

## 6. Punctuation
All docs pages use these characters:

| Name | Character | Canonical Rule | Example |
| :--- | :---: | :--- | :--- |
| **Hyphen** | `-` | **No spaces.** For compound adjectives and prefixes. | `zero-based index`, `two-layer demo` |
| **En Dash** | `–` (`&ndash;`) | **No spaces.** For number, date and coordinate ranges (*"to / through"*). | `Angles are evaluated in degrees (0°–360°)` |
| **Em Dash** | `—` (`&mdash;`) | **Space before and after (` — `).** For sentence breaks and asides. Not unspaced, and not an en dash. | `The layer rotates — its shapes follow` |
| **Minus Sign** | `−` (`&minus;`) | **Spaces around arithmetic operators.** For equations and negative numbers. | `−10 + 5 = −5` |

## 7. Page Metadata
* **Title Tags (`<title>`)**: Every page uses the format `[Page Name] | Kilopixel`.
  * With the page name first, browser tabs stay readable when many are open.
  * No suffixes like "Documentation".
  * No HTML tags or entities (`&lt;pxl-circle&gt;`); use plain names (e.g. `Circle | Kilopixel`).

## 8. CSS & Styling Rules
* **No Inline Styles**: Docs HTML has no `style="..."` attributes. For a margin, layout tweak, typography or color, use an existing class from `docs/css/docs.css`.
* **Permission Required**: If a new CSS rule or an inline style seems necessary, ask the user before adding it.
* **Exceptions**: The only exceptions to the inline style ban are functional JavaScript targets (e.g., dynamically controlled `width` or `transform` properties explicitly driven by a slider's JavaScript, together with the styles that only support that change, such as `margin: 0 auto` to keep it centered or a `transition` to smooth it), or `style="display: none;"` for initially inactive/hidden dual-mode control group containers.

## 9. Canvas Typography & Web Fonts
* **Lazy Loading**: Each web font and weight is downloaded the first time text is drawn with it. Until then, the text uses a fallback font; the engine redraws and measures it again when the font arrives. Pages need neither a preloader nor a handler.

## 10. Editorial Voice & Neutral Tone

Docs text is plain and factual:

* **Engineering Clarity Over Marketing Drama**:
  Write like modern engineering documentation (e.g., MDN, Tailwind, or Stripe), not a sales brochure or marketing landing page. Avoid buzzwords, drama, and hyperbolic claims:
  * ❌ *Avoid:* "A multi-mode radial primitive that renders...", "Backed by an intelligent 3-tier layout cache...", "All from a single declarative tag."
  * ✅ *Prefer:* "The circle shape renders discs, hollow rings, pie slices...", "Renders text directly on canvas with automatic word-wrapping..."
* **Standard Lead Paragraph Formula**:
  Every documentation page lead paragraph (`<p class="lead">`) says what the shape or feature does and lists its 2–3 main capabilities in plain English.
* **Use "Shape" Instead of "Element" for Canvas Primitives**:
  When introducing visual primitives (`<pxl-circle>`, `<pxl-rect>`, `<pxl-ellipse>`, `<pxl-text>`, etc.), refer to them as "shapes" rather than "elements" (e.g., *"The circle shape renders..."*). They draw on the canvas; they are not HTML boxes. (Reserve "element" or "container" for structural nodes like `<pxl-stage>` and `<pxl-layer>`).

## 11. Showcase Sections
A showcase is one artistic, animated composition near the end of a feature page. It shows what the page's feature can do when used freely, after the sections have taught it step by step.

* **Optional:** Not every page needs a showcase. Technical topics (e.g. `caps.html`) can do without one.
* **Placement:** The last numbered section before the Element Reference, titled `[N]. Showcase`.
* **Markup:** `<div class="showcase-container">` around `<pxl-stage id="sec[N]Stage" ratio="1 / 1" class="showcase-stage">`. Showcases are square (an exception to the `5 / 3` rule in §4) and dark (set by `.showcase-stage`).
* **Pure Declarative HTML:** No controls, no code snippet, no JavaScript, no HUD text or FPS counters. Everything is drawn with Kilopixel elements and expressions.
* **Built From the Page's Feature:** The composition is made mainly from the shape or feature the page teaches (e.g. only `<pxl-rect>` on `rect.html`). Other shapes may support it but not dominate.
* **Static and Animated Layers:** Put shapes that never change into a background `<pxl-layer>` and animated shapes into a foreground layer, so the static layer is not redrawn every frame.
* **Free Colors and Sizes:** The color semantics (§1), the stroke width hierarchy and the `size="27"` font rule do not apply. Showcases use their own palette.
* **One Paragraph:** A single `<p>` directly below the heading says what the composition shows (an homage to an artist or work, if there is one) and which technique of the page it uses. It follows §10: neutral tone, no performance claims such as "60fps" or "GPU-accelerated".


