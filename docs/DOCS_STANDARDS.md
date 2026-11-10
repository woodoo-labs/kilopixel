# Kilopixel Documentation Standards

Rules for the pages in `docs/`, so every page looks and works the same way. The newest pages are the reference implementations: `circle.html`, `ellipse.html`, `line.html`, `polyline.html`. Copy page structure, controls and stage setup from them.

## 1. Page Structure

* **Title:** `<title>[Page Name] | Kilopixel</title>`, page name first so browser tabs stay readable. Plain names (`Circle | Kilopixel`): no suffix like "Documentation", no HTML tags or entities.
* **Scripts in `<head>`:** `js/layout.js`, `js/docs.js`, `js/pxl.min.js`, plus `js/api-tabs.js` on pages with an API reference table. Custom elements then upgrade while the page is parsed (no layout shift), and `pxlDocs` is ready for inline handlers.
* **Scripts at the end of `<body>`:** Prism and its `keep-markup` plugin, after all content. Without `keep-markup`, Prism strips the `<mark>` tags and live code stops updating. Only a page script (Tier 3, §4) may follow them.
  ```html
  <!-- Prism Syntax Highlighting -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/keep-markup/prism-keep-markup.min.js"></script>
  ```
* **Example layout:** every example has three parts, in this order:
  1. The code snippet, `<pre><code class="language-html">`, above the demo container (§3).
  2. `<div class="demo-container">` with the controls, `<div class="demo-controls">` (§4). The header title is just `Controls`. Tabs are `.demo-tabs` buttons inside `.demo-controls-header` with `onclick="pxlDocs.switchTab(this, '…')"`; the header scrolls horizontally on phones.
  3. The stage inside the same container: `<pxl-stage class="demo-stage" ratio="5 / 3">` (logical width 1000, height 600). Another ratio only when the example is about aspect ratios; showcases are square (§7).

  Every example has controls (sliders, dropdowns or toggle buttons). Exception: the introduction (`index.html`) shows a snippet and a stage without controls or `demo-container`, because its examples show how markup becomes a picture. Its snippets follow §3.
* **Callouts:** notes and caveats use `<div class="callout-info">` with `<p class="callout-title">` and `<p class="callout-body">`.
* **No inline styles:** use existing classes from `docs/css/docs.css`. Exceptions: styles a slider's script changes (e.g. `width`, `transform`) plus the styles that only support that change (`margin: 0 auto`, a `transition`), and `style="display: none;"` on initially hidden dual-mode control groups. Ask the user before adding a CSS rule or another inline style.

## 2. Drawing on the Stage

### Colors

Colors separate context (the stage and its layers) from content (the shapes). Every layer, group and shape uses the same steps in its own hue, so markers build up the same way everywhere.

| Step | Role | Orange | Blue | Green |
|---|---|---|---|---|
| `200` | Layer crosshairs and helpers (only with two or more layers, see below) | `#fed7aa` | `#bfdbfe` | `#bbf7d0` |
| `300` | Center helper lines and labels (`x =`, `y =`), orbit guides, ghost outline (solid, `strokewidth="2"`) | `#fdba74` | `#93c5fd` | `#86efac` |
| `400` | Center dot and label, defining points (polyline vertices, line ends) | `#fb923c` | `#60a5fa` | `#4ade80` |
| `500` | Shape border (`stroke`) | `#f97316` | `#3b82f6` | `#22c55e` |
| `600` | Offset helper lines and labels (`dx =`, `dy =`), offset vectors | `#ea580c` | `#2563eb` | `#16a34a` |
| `700` | Offset dot and label, active point and label | `#c2410c` | `#1d4ed8` | `#15803d` |
| fill | Shape fill (`100` at 40% opacity) | `#ffedd566` | `#dbeafe66` | `#dcfce766` |

* **Shapes:** the first shape is orange, the second blue, the third green. Several shapes in one layer each keep their own hue.
* **Active point:** the one defining point the controls move (a slider-driven polyline vertex, the start of a line) uses `700`. Centers stay `400` even when controls move them.
* **Points on a thick stroke:** when a thick stroke is the subject (`caps.html`), a `400` dot on it almost disappears. All defining points use `700` there, and the centerline on the stroke is white (`#ffffff`, `strokewidth="2"`, `linedash="[5, 5]"`).
* **Ghosts of fill-only shapes** (`mask.html`): a colored outline would look like the shape's own stroke, so these ghosts are slate (`#94a3b8`, `strokewidth="2"`, `linedash="[5, 5]"`).
* **Stage (sky):** origin dot `#0284c7` (`600`, label `Stage Origin (0, 0)`); dimension arrows (`width = 1000 (fixed)`) and helper lines `#0ea5e9` (`500`); other corners and their labels (`(1000, 0)`) `#7dd3fc` (`300`).
* **One layer (violet):** helper lines and labels `#c4b5fd` (`300`), Layer Center dot and label `#a78bfa` (`400`), offset helpers `#7c3aed` (`600`), offset point `#6d28d9` (`700`).
* **Two or more layers:** as soon as a demo shows the centers of two or more layers, each layer takes the hue of its shapes instead of violet, one step below them: crosshairs and helpers `200`, Layer Center dot and label `300`. A layer that shows no center or crosshairs (e.g. an untransformed layer that only holds a reader) doesn't count.
* **Pink (special):** for what the section teaches when it is neither a shape nor a helper, e.g. gradient geometry (vectors, centers, radii, color-band boundaries) or a line that links shapes across spaces with `toLocal()`. Same steps: helpers `#f9a8d4` (`300`), center `#f472b6` (`400`), line or vector `#ec4899` (`500`, `strokewidth="4"`), offset helpers `#db2777` (`600`), offset or active point `#be185d` (`700`).
* **Slate:** background grid `#f1f5f9`, layer crosshairs `#cbd5e1`, so they stay behind everything else.

### Stroke Widths

Widths of 2 and 4 stay crisp on high-PPI screens and keep shapes visually above their helpers.

* **Helpers** (axes, crosshairs, center and offset helpers, guidelines, orbit guides): `strokewidth="2"`. Dashed helpers use `linedash="[5, 5]"`. Other dash patterns only where the dash is the subject (`dashes.html`, `arrows.html`) and in showcases.
* **Shapes** and important connecting or leader vectors: `strokewidth="4"`; secondary or nested shapes at least `2`.

### Stacking Order

A layer draws its children in DOM order, back to front:

1. `<pxl-var>` elements (variables always live inside a layer; first by convention, the engine accepts them anywhere in it)
2. `<pxl-grid>`
3. Layer helpers (dashed lines and `x =` / `y =` labels to the layer center)
4. Layer crosshairs and the Layer Center dot and label
5. Shape helpers
6. The shape
7. Center dots, tracking dots and their labels, on top so they stay visible

A `<pxl-group>` of helpers sits below the shape; a group of markers or labels sits above it.

### Canvas Labels

* **Size:** `size="27"` for all annotations, coordinate labels, titles and axis guides.
* **Center labels** describe the point (`Layer Center`, `Circle Center`) without coordinates: the helper lines already show them. Only the stage origin and corners use tuples (`Stage Origin (0, 0)`, `(1000, 0)`).
* **Title Case:** canvas labels capitalize both words (`Layer Center`, `Shape Offset`), unlike prose.
* **Web fonts** need no preloader or load handler: text uses a fallback font until the font has loaded, then the engine redraws and measures it again.

## 3. Code Snippets

A snippet shows the markup behind the demo, as short and easy to scan as possible, in the same order as the controls.

* **Only the topic:** leave out the grid, axes, dimension arrows, annotations, decorative shapes and tracking dots.
* **Short IDs:** `id="circle"`, `id="master"`, `id="line1"`, `id="angle"` instead of page IDs (`sec5Circle1`); `ref.*` expressions use the same names (`ref.master.x`, `ref.angle.value`).
* **Marks:** wrap every value a control changes in `<mark id="sec[N][exM][Entity][Target]Code">` (§5). A value a slider, dropdown or toggle sets directly gets a plain `<mark>`; it flashes yellow-orange when the control changes it. A value that is an expression depending on a control (`x="-ref.master.rotate"`) gets `<mark class="highlight-reactive">`; it looks like normal code until its source changes, then flashes a softer orange.
* **Line length:** a code block shows 84 characters, counting indentation. A line with a mark stays within 84 characters, so changing values are always visible; only a single long value (a gradient) may exceed it. A line with only fixed values may run up to 100 characters when that saves a line.
* **Lines per element:** an element that fits these limits, closing tag included, stays on one line. Otherwise it gets at most 4 attribute lines, never one attribute per line, and the closing tag goes on its own line at the indentation of the opening tag (custom elements can't self-close).
* **Attribute order:** fixed values first, then the values controls change. Expressions (`ref.circle.x`, `t * 45`) count as fixed.
  * **Line 1:** `id`, the fixed position (`x y` or `x1 y1 x2 y2`), then the paint of the shape family: lines (`<pxl-line>`, `<pxl-polyline>`) `stroke strokewidth fill`; text: font (`font size weight`), then paint (`fill stroke strokewidth`), then layout (`align baseline`); other shapes `fill stroke strokewidth`. If a control changes the position, a fixed size takes its place.
  * **Next:** other fixed values (size, angles). `points` and `text` get a line of their own.
  * **Then:** controlled values in the top-to-bottom order of the controls, dropdown and toggle values on the last line.
  * **Single-line elements:** a fixed size comes right after position (`x y r fill`).
  * **No lone values:** a single fixed value that would end up alone on its line joins line 1 (a size right after position) if that line stays within 100 characters. Taught attributes keep their own line.
  * **`strokewidth`** is shown whenever the stage sets it, so the snippet matches the drawing.
* **Pairs stay on one line:** `x y`, `x1 y1`, `x2 y2`, `w h`, `rx ry`, `r ir`, `irx iry`, `start sweep`, `start end`, `arrowstart arrowend`, `linecap linejoin`. A pair with one controlled value goes where the controlled value goes. Paint, font and layout values follow the line 1 order instead: a slider-driven `strokewidth` or `size` moves alone.
* **Taught attributes:** a fixed attribute that is the topic of the example (`closed="true"`, `pie="true"`, `anchor="top-left"`, `direction="rtl"`, `toLocal()` positions where mapping is the topic) goes on a feature line, not on line 1.
* **Comments and blank lines:** every shape, or the layer, group or unit that holds it, gets a comment on the line above: `<!-- Position: Name, what it shows -->`. A layer or group may get its own comment as well (walkthrough, mapping).
  * **Position:** where the shape is on the stage (`Left`, `Right`, `Top`, `Middle`, `Bottom`, or combined like `Top Left`). Overlapping shapes and a shape alone in its snippet get no position (`<!-- Text, wraps at the width -->`).
  * **Name:** its tab name, so the reader can match the snippet to the controls, or a short name when the tabs aren't per shape (`Layer Filter`).
  * **What it shows:** a few lowercase words, not a sentence (`Right: Pill, radius is half the height`). Left out when the name already says it (`Left: Center Spin`).
  * No color schemes, notes or explanations: the stage shows the colors, and explanations belong in the text.
  * One blank line between commented blocks, none between a comment and its element.

```html
<pxl-stage ratio="5 / 3">
  <pxl-layer>
    <!-- Left: Arc, filled arrowheads -->
    <pxl-circle x="300" y="300" stroke="#f97316" strokewidth="4"
      arrowstart="<mark id="sec5Circle1ArrowstartCode">25</mark>" arrowend="<mark id="sec5Circle1ArrowendCode">25</mark>"
      start="-45" sweep="<mark id="sec5Circle1SweepCode">270</mark>"
      arrowstyle="filled">
    </pxl-circle>

    <!-- Right: Disc, fixed values on one line -->
    <pxl-circle x="700" y="300" r="120" fill="#dbeafe66"></pxl-circle>
  </pxl-layer>
</pxl-stage>
```

## 4. Controls

* **Tier 1, one attribute:** a slider or dropdown that sets one attribute uses an inline handler (below).
* **Tier 2, several inputs to one attribute** (`linear([x0, y0, x1, y1])`, `rgba(…)`, projection overlays): each slider sets a `<pxl-var>` (`setAttribute('value', this.value)`); the shape refers to the variables (`fill="linear([ref.x0.value, …])"`). No long inline template strings.
* **Tier 3, branching** (mode switches, showing and hiding controls, state across tabs, e.g. `radial.html`, `filter.html`): helper functions in one `<script>` after the Prism scripts.
* **Native DOM only:** handlers and scripts change elements with `document.getElementById('id').setAttribute('attr', value)`, so readers see that Kilopixel needs no JavaScript API. Shared helpers live under `window.pxlDocs` in `docs/js/docs.js`; no other globals.
* **Slider:** `oninput` does three things inline: `setAttribute` on the element, the readout (`…Val`), the code mark (`…Code`):
  ```html
  oninput="document.getElementById('sec4Rect').setAttribute('x', this.value); document.getElementById('sec4RectXVal').innerText = this.value; document.getElementById('sec4RectXCode').innerText = this.value;"
  ```
  `docs.js` finds the mark to highlight in `oninput`. To highlight several marks (e.g. a plain and a reactive one), list them: `data-mark="sec4RectXCode, sec4MirrorRefXCode"`.
* **Toggle buttons:** `onclick` calls `setAttribute` first, so readers see how Kilopixel works, then `pxlDocs.updateToggle(this, null, 'codeId', 'value')` for the button state, the mark and its flash.
* **Dropdowns:** `onchange` sets the attribute and the mark; `data-mark="…Code"` on the `<select>` makes the mark flash and dismisses a beacon. Group options of different kinds with `<optgroup label="…">`. A dropdown is taller than a slider, so dropdowns go on the last row of `.playground-sliders` (or together in one row).
* **No readout** for toggle buttons and dropdowns: they show their state themselves.
* **Dual mode (numeric or keyword):** a toggle button pair ("Numeric" / "Keyword") above two `.control-group` containers (`…SliderGroup`, `…KeywordGroup`); switching sets `style.display` to `'flex'` / `'none'` and updates the active button, the attribute and the mark.
* **Beacons:** `<span class="indicator-dot"></span>` next to a label in a `.control-group` marks an important control. `docs.js` adds the numbered tab badges and removes dots when the reader uses the control; nothing else to wire.

## 5. IDs

Every ID on a page (stages, shapes, controls, tabs, marks) follows `sec[N][exM][Entity][Target][Role]` in camelCase, without hyphens: `ref.*` would read `-` as subtraction. Only snippet code uses the short IDs of §3.

* **`sec[N]`:** section number. **`[exM]`:** example number (`ex1`, `ex2`), only when a section has several examples.
* **`[Entity]`:** shape, layer, group or table category (`Stage`, `Layer`, `Circle`, `Styling`), numbered when there are several (`sec1Polyline1`).
* **`[Target]`:** the attribute name with only its first letter capitalized, without exceptions: `X`, `X1`, `Ir`, `W`, `Rotate`, `Strokewidth`, `Linecap`, `Arrowend`, `Scalex`. When one value has several parts (color channels, polyline vertices, gradient angle), the target names the part (`Red`, `Hue`, `PeakY`). For a tab content box it is `Tab`.
* **`[Role]`:** `Val` (readout), `Code` (mark), `Input` (slider), `Select` (dropdown), `Btn` (button), `Group` (control group). No other suffixes like `Shape` or `Attr`.
* **Variables:** `[Entity]` is `Var`. Inputs set by a control are numbered in declaration order (`sec1Var1`, `sec2ex1Var3`), with an HTML comment above them saying what each one is (`<!-- Var1, Var2: Zig-Zag peak (x, y) -->`). Computed variables are named (`sec1ex1VarCos`, `sec3ex1VarTargetX1`), so formulas stay readable.
* **Controls follow the variable** (`sec1Var1Input`, `sec1Var1Val`, `sec1Var1Select`); **marks follow the shape attribute** they show (`sec1Polyline1PeakXCode`), even when a variable drives it.

Examples: `sec2CircleTab`, `sec2CircleXVal`, `sec2CircleXCode`, `sec2CircleXInput`, `sec4LayerRotateCode`, `sec3ex1RingIrVal`, `sec1ex1ModeKeywordBtn`, `sec1ex1SliderGroup`.

## 6. Prose

* **Tone:** like engineering docs (MDN, Tailwind, Stripe), not marketing. No buzzwords, drama or performance claims. Avoid "A multi-mode radial primitive that renders…", "Backed by an intelligent 3-tier layout cache…", "All from a single declarative tag." Prefer "The circle shape renders discs, hollow rings, pie slices…"
* **Lead paragraph** (`<p class="lead">`): what the shape or feature does and its 2–3 main capabilities.
* **"Shape", not "element",** for drawing primitives (`<pxl-circle>`, `<pxl-text>`): they draw on the canvas, they aren't HTML boxes. "Element" or "container" is for `<pxl-stage>` and `<pxl-layer>`.
* **Concepts lowercase, API names as code:** "a shape nested inside a rotating layer"; "nest the `<code>&lt;pxl-circle&gt;</code>`". Title Case only for canvas labels and for the name in snippet comments (`<!-- Left: Arc, filled arrowheads -->`).
* **Attributes and values:** names and keywords are code (`<code>strokewidth</code>`, `<code>round</code>`). Introduce a short or technical attribute once with its concept first: `width (<code>w</code>)`, `height (<code>h</code>)`, `thickness (<code>strokewidth</code>)`, `outer radius (<code>r</code>)`, `inner radius (<code>ir</code>)`, `corner radius (<code>r</code>)`, `rotation (<code>rotate</code>)`, `uniform scale (<code>zoom</code>)`, `scaling (<code>zoom</code>, <code>scalex</code>, <code>scaley</code>)`, `start (<code>arrowstart</code>) and end (<code>arrowend</code>) arrowheads`, `end caps (<code>linecap</code>)`, `corner joins (<code>linejoin</code>)`, `dash patterns (<code>linedash</code>)`. No pair when the concept repeats the name (`fill`, `stroke`, `mask`, `miterlimit`, `size`, `font`). Write `attr="value"` only when the attribute isn't clear from the sentence or the reader should copy it.
* **Coordinates:** a point is a bare tuple (*"moves to `(350, 150)`"*, not "coordinate (350, 150)"); attributes are joined by *and* (*"Set `x="350"` and `y="150"`"*).
* **No units:** no `px`, `em` or `%` after attribute values in prose, no scale factor `u`, no "logical units" or "coordinate units". Bare numbers, or "the 1000-width logical canvas".
* **Bold lead-ins** (paragraph, list item, callout): plain English in Title Case, colon inside the `<strong>`, no `<code>` in it.
* **Punctuation:**

  | Character | Rule | Example |
  |---|---|---|
  | Hyphen `-` | No spaces; compound adjectives and prefixes | `zero-based index` |
  | En dash `–` (`&ndash;`) | No spaces; ranges | `0°–360°` |
  | Em dash `—` (`&mdash;`) | Spaces around it; sentence breaks and asides | `The layer rotates — its shapes follow` |
  | Minus `−` (`&minus;`) | Spaces around operators; equations and negative numbers | `−10 + 5 = −5` |

## 7. Showcase

An optional, animated composition near the end of a feature page that shows the feature used freely. Technical topics (`caps.html`) can do without one.

* **Placement:** the last numbered section before the Element Reference, titled `[N]. Showcase`.
* **Markup:** `<div class="showcase-container">` around `<pxl-stage id="sec[N]Stage" ratio="1 / 1" class="showcase-stage">` (square and dark).
* **Declarative only:** no controls, snippet, JavaScript, HUD text or FPS counter.
* **Made from the page's feature** (only `<pxl-rect>` on `rect.html`); other shapes may support it but not dominate.
* **Two layers:** shapes that never change in a background layer, animated shapes in a foreground layer, so the static layer isn't redrawn every frame.
* **Free colors and sizes:** §2's colors, stroke widths and `size="27"` don't apply.
* **One paragraph** below the heading: what the composition shows (an homage, if there is one) and which technique it uses, in the tone of §6.
