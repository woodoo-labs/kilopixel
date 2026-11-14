# Stage Sizing and Layer Canvas: Overridable Defaults, Fallback Width, Canvas in a Shadow Root

- **Status**: 🟢 **Decided** (2026-11-14, now includes workstream W2 of the framework plan; a 300 px fallback width replaces the zero-width warning; decisions in §4.5)
- **Date**: 2026-11-04 (extended 2026-11-14)
- **Related**: `design/2026-10-30_framework_compatibility_plan.md` (W2 §5, C9–C11: this plan builds that workstream), `design/2026-10-17_bundle_scope_plan.md` (classic script in `<head>`), `docs/installation.html` (script in `<head>` since 5891224)
- **Target Implementation**: `js/elements/stage.js` (default styles), `js/elements/layer.js` (shadow root), `js/elements/variable.js` (`display: none`), `tests/index.html`, `docs/installation.html`, `.agents/KILOPIXEL.md` (Stage, Layer, Variable)
- **Prototypes** in `design/prototypes/2026-11-04_stage_sizing/`:
  - `stage_width_check.html` (today, eight layouts);
  - `stage_sizing_prototype.html` (defaults in a cascade layer; `?fallback=min` and `?fallback=minpct` for the rejected fallback widths);
  - `zero_width_while_parsing.html` (width 0 while the page is parsed);
  - `cascade_layer_order.html` (where the default sheet must go, with page CSS in cascade layers like Tailwind v4; 2026-11-14);
  - `shadow_root_check.html` (layer canvas moved into a shadow root: mouse coordinates and `layer.innerHTML`; 2026-11-14);
  - `fallback_width_check.html` (the 300 px fallback width in nine layouts; 2026-11-14).

---

## 1. Problem

### 1.1 Stage Size

A stage takes the full width of its parent. Two cases go wrong, measured in `design/prototypes/2026-11-04_stage_sizing/stage_width_check.html` (parent 880 px wide, `ratio="4 / 1"`):

| Layout | Stage size |
|---|---|
| A. Plain block `div` | 880 × 220 |
| B. Wrapper `div` centered in a flex container | **0 × 0** |
| C. Stage directly in a centered flex container | 880 × 220 |
| D. Wrapper `div` in a grid with `place-items: center` | **0 × 0** |
| E. `inline-block` wrapper | **0 × 0** |
| F. Absolutely positioned card (modal style) | **0 × 0** |
| G. Author CSS `#authorWidth { width: 300px }` | **880 × 220** (the rule is ignored) |
| H. Plain `<canvas>` in layout B, for comparison | 300 × 150 |

- **B–F, silent 0 × 0:** the wrapper sizes itself to its content. The stage's only content is its layers, which are absolutely positioned and add no width, so `width: 100%` resolves to 100 % of 0. Nothing is drawn and nothing is logged. B and D are the usual way to center something, and AI tools write them almost every time; they expect the stage to keep a size of its own like `<canvas>` (H), `<img>` or `<video>`. Case B confirmed again with the engine of 2026-11-14.
- **G, author CSS ignored:** `connectedCallback()` writes `display`, `position` and `width` as inline styles. Inline styles beat every stylesheet rule, so `pxl-stage { width: 600px }` does nothing. Several examples already set a width that never applied (§5). A framework that replaces the whole `style` attribute (Angular `[style]`, Lit `style=${…}`) removes them (framework plan C10).

### 1.2 Layer Canvas

Each `<pxl-layer>` appends its `<canvas>` as a normal child. Anything that replaces the layer's children removes it: `layer.innerHTML = …`, an htmx swap, a framework re-rendering the children. Nothing is drawn and nothing is logged. It broke `examples/test13.html` (fixed there on 2026-11-13 with `insertAdjacentHTML`) and was confirmed again on 2026-11-14. Frameworks that hydrate server HTML also find a `<canvas>` they didn't render (framework plan C9, C11).

## 2. Cause

`js/elements/stage.js` `connectedCallback()`:

```js
this.style.display = 'block';
this.style.position = 'relative';
this.style.width = '100%';
this.style.aspectRatio = this._parsedRatio;
```

`resize()` returns early when `clientWidth` is 0 and says nothing.

`js/elements/layer.js` writes `display: block; position: absolute; inset: 0` inline and appends its canvas to itself in `connectedCallback()`.

## 3. Goals

- Author CSS can change a stage's `display`, `position` and `width`, like on any HTML element, also when the page puts its own CSS in cascade layers (Tailwind v4).
- A stage in a parent that sizes itself to its content still draws, 300 px wide like `<canvas>`, without CSS from the user.
- The layer canvas can't be removed by changing the layer's children, and the layer's light DOM is exactly what the author or framework wrote.
- The default stays: a stage fills its parent's width. No change for pages that work today, except pages whose stage CSS never applied (§5).

## 4. Design

### 4.1 Default Styles in a Cascade Layer

At load, `stage.js` adds one `<style>` element at the start of `<head>`:

```css
@layer pxl {
  pxl-stage {
    display: block; position: relative; width: 100%;
    contain: inline-size; contain-intrinsic-inline-size: 300px;
  }
  pxl-var { display: none; }
}
```

- **Lowest priority:** styles outside any layer beat styles in a layer, whatever their specificity or order. So any author rule wins, even `pxl-stage { width: 300px }` in a stylesheet loaded earlier.
- **At the start of `<head>`:** between cascade layers, the layer declared first ranks lowest. Placed first, `pxl` is declared before the page's own layers, so classes in a page layer (Tailwind v4's `utilities`) win too. Measured in `design/prototypes/2026-11-04_stage_sizing/cascade_layer_order.html`, page CSS `@layer theme, base, components, utilities` with a 300 px class, default `width: 100%`:

  | Where the default sheet goes | Class in the page's `utilities` layer | Page rule outside any layer |
  |---|---|---|
  | **`<style>` at the start of `<head>`** | **300** ✓ | 300 ✓ |
  | `<style>` at the end of `<head>` | 853 ✗ | 300 ✓ |
  | `document.adoptedStyleSheets` | 853 ✗ | 300 ✓ |
  | `:where(x-box)` outside any layer, start of `<head>` | 853 ✗ | 300 ✓ |

  Adopted sheets count as coming after all of the document's sheets, so their `pxl` layer is declared last and beats the page's layers. A rule outside any layer beats every layered rule.
- **Prototype:** with the inline `display`, `position` and `width` removed and this sheet added, case G draws 300 × 75; A and C are unchanged.
- **Stage inside a shadow root** (a Lit or Stencil component that renders the Kilopixel tree in its own shadow root, framework plan C12): document styles don't reach into it, and today the stage works there only because its styles are inline. On connect, the stage looks at `this.getRootNode()`; when that is a `ShadowRoot` without the sheet yet, it adds the same `<style>` element at the start of that root. One sheet per root, checked by a marker attribute on the `<style>` (`data-pxl`).
- **What stays inline:** styles that must hold for the drawing to match the box, and that are internal state rather than defaults:
  - `aspect-ratio` from the `ratio` attribute (the attribute is the API, and the coordinate system depends on it; D7 of the framework plan);
  - `cursor` (interaction state);
  - layer `opacity`, `mix-blend-mode` and `filter` on the canvas (the compositing fast path; the canvas is private, §4.4).
- **Where:** a function in `stage.js`, run once when the file loads (`document.head` exists for a script in `<head>` and at the bottom of `<body>`), plus the shadow-root check in `connectedCallback()`. `pxl-var` moves to the sheet as well, so its `display: none` is no longer written per element in `variable.js`. The layer's styles are not in this sheet; they are `:host` styles in its own shadow root (§4.4).

### 4.2 Fallback Width of 300 px

A stage whose parent has a width fills it, as today. A parent that sizes itself to its content (cases B–F) asks the stage for its own width, and today the answer is 0, because the layers are absolutely positioned. The two lines `contain: inline-size; contain-intrinsic-inline-size: 300px` in the sheet (§4.1) make the answer 300 px, the default width of `<canvas>`:

- **`contain: inline-size`:** the stage's width no longer depends on its content (the layers never added any, so nothing is lost). It creates no stacking context and no containing block, so layers and compositing are unchanged.
- **`contain-intrinsic-inline-size: 300px`:** the width the stage reports when a parent asks for its content width. `width: 100%` still decides whenever the parent has a width of its own.

Measured in `design/prototypes/2026-11-04_stage_sizing/fallback_width_check.html` (`ratio` 4 / 1, page 900 px wide), and with the real engine in `design/prototypes/2026-11-04_stage_sizing/stage_width_check.html` plus these two lines (cases A–F identical, the layer canvases resized to 300 × 75):

| Layout | Today | With the fallback |
|---|---|---|
| A. Plain `div` | 900 × 225 | 900 × 225 |
| B. Wrapper in a centered flex container | **0 × 0** | **300 × 75** |
| C. Stage directly in a centered flex container | 900 × 225 | 900 × 225 |
| D. Wrapper in a centered grid | **0 × 0** | **300 × 75** |
| E. `inline-block` wrapper | **0 × 0** | **300 × 75** |
| F. Absolutely positioned card | **0 × 0** | **300 × 75** |
| G. Author CSS `width: 300px` | 300 × 75 | 300 × 75 |
| I. 250 px column | 250 × 63 | 250 × 63 (no overflow) |
| J. 288 px phone, centered wrapper without a width | **0 × 0** | 300 × 75 (12 px too wide, like `<canvas>`) |

- **No warning needed:** with the fallback, a stage is 0 px wide only when it is meant to be (hidden, or in a collapsed panel). The zero-width warning planned until 2026-11-14 had nothing left to catch, and needed care to avoid false alarms while the page loads; it is dropped (§4.3).
- **A small stage explains itself:** users see a 300 px stage and give the parent a width; the docs say how (§6).
- **Overridable:** both lines are in `@layer pxl`, so any width rule of the page, or `contain: none`, wins.
- **Browser support:** `contain: inline-size` and `contain-intrinsic-inline-size` in current Chrome, Edge, Firefox and Safari (17 and later). An older browser ignores them and behaves as today (0 × 0 in cases B–F).
- **Cost:** none per frame.

### 4.3 Rejected

- **`min-width: 300px`:** fixes B–F (all draw 300 × 75) but overflows narrow columns: a 250 px column gets a 300 px stage (case I), and a phone at 320 px with 16 px padding has only 288 px. The fallback in §4.2 isn't a minimum: it only answers a parent that asks for the content width, so case I stays 250 px.
- **`min-width: min(300px, 100%)`:** doesn't help; in a parent that sizes to its content the percentage counts as 0, so B–F stay 0 × 0 (measured).
- **Shadow DOM with `:host` for the stage:** layers are light DOM children; the stage would need a shadow root with a `<slot>` only to get one lowest-priority rule. The cascade layer gives the same priority without changing the DOM. (The layer does get a shadow root, for its canvas: §4.4.)
- **`document.adoptedStyleSheets`** (proposed in the framework plan §5.2): its `pxl` layer ranks above the page's layers (§4.1 table).
- **`:where(pxl-stage)` outside any layer** (proposed in the framework plan §5.2): zero specificity, but a rule outside any layer beats every layered page rule (§4.1 table).
- **Zero-width warning** (planned 2026-11-04 to 2026-11-14): a `console.warn` when the stage is still 0 px wide after the `load` event and one frame (`checkWidth()` called from `resize()`, about 15 lines). It had to wait for loading, because a parent can get its width late (measured in `design/prototypes/2026-11-04_stage_sizing/zero_width_while_parsing.html`). Replaced by the fallback width (§4.2): the stage draws instead of asking the user to fix the CSS.
- **Detecting author styles in JavaScript and writing the defaults inline otherwise:** `getComputedStyle()` returns the width in pixels whether or not the page set it (only `computedStyleMap()` reports `auto`, and Firefox lacks it); the check would be a snapshot that misses stylesheets loaded later, CSS-in-JS, classes added later and media queries; and the inline defaults would again beat every later rule. The cascade layer makes the same choice in the browser, and keeps making it when the CSS changes.

### 4.4 Layer Canvas in a Shadow Root

From the framework plan §5.1. Each `<pxl-layer>` attaches an open shadow root in its constructor and puts its canvas there, with its default styles and a `<slot>`:

```
<pxl-layer>                    host
  #shadow-root (open)
    <style>:host { display: block; position: absolute; inset: 0; }
           canvas { display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; }</style>
    <canvas>                   the layer's pixels
    <slot>                     the light-DOM children are shown here
  <pxl-circle …>               light DOM: exactly what the author or framework wrote
```

| | Today (canvas is a normal child) | With the shadow root |
|---|---|---|
| `layer.innerHTML = …`, htmx swaps | remove the canvas, nothing is drawn | the canvas stays; the new shapes are drawn (measured) |
| `layer.children`, `querySelectorAll('*')` | include the `<canvas>` | only shapes and groups |
| Frameworks updating or hydrating the layer's children | find a `<canvas>` they didn't render | see only their own elements |
| Pointer events | target the canvas | target the canvas; outside the shadow root they appear to come from `<pxl-layer>`. `mouseX` / `mouseY` exact (measured) |
| Layer styles | inline, beat author CSS | `:host`, lose to any author rule on `pxl-layer` |
| DevTools | `<canvas>` among the shapes | `#shadow-root (open)` |

- **Measured** in `design/prototypes/2026-11-04_stage_sizing/shadow_root_check.html` (the canvas moved into a shadow root at runtime): pointer moves at 100, 50 px and 400, 200 px give exactly these `mouseX` / `mouseY` (times `unit`); `layer.innerHTML = '<pxl-circle …>'` keeps the canvas, the light DOM is exactly the new circle, and it is drawn at its position. The framework plan's fallback for `offsetX` (§5.1) isn't needed. Test note: the stage ignores pointer moves until its ResizeObserver has set `unit`, so tests wait for `unit > 0`.
- **`<slot>`** (D6 of the framework plan): shapes draw nothing as DOM elements and don't need it, but normal elements placed in a layer for accessibility (a `<button>`, text) would disappear without it.
- **`:host` styles:** the host's own defaults with the lowest priority; any page rule on `pxl-layer` wins. The canvas styles are constant and move from `cssText` into the same `<style>`. Compositing (`opacity`, `mix-blend-mode`, `filter`) stays on the canvas element as today.
- **Page CSS can no longer reach the canvas** (`pxl-layer canvas { … }`): no page in the repo does this (searched 2026-11-14).
- **Code that reads the canvas:** the engine and the tests use `layer._canvas`; nothing uses `querySelector('canvas')` on a layer. A test that removes children with `:scope > :not(canvas)` (`tests/index.html`) keeps working.
- **Cost:** one shadow root and one small `<style>` per layer, created once. Nothing per frame.

### 4.5 Decisions (2026-11-14)

1. The stage and `pxl-var` defaults go in `@layer pxl`, in a `<style>` element at the start of `<head>`, or at the start of the shadow root the stage sits in.
2. The layer's default styles go in `:host` in its own shadow root.
3. The layer's shadow root has a `<slot>` (framework plan D6).
4. `aspect-ratio` stays inline on the stage (framework plan D7). Documented: set single properties on a stage's `style`, don't replace the whole attribute.
5. A stage in a parent without a width is 300 px wide, like `<canvas>` (`contain-intrinsic-inline-size`, §4.2); no zero-width warning.

## 5. Effects on Existing Pages

Rules that never applied start to apply:

| Page | Rule | Today | After |
|---|---|---|---|
| `examples/test24`, `26`, `27`, `34`, `35`, `36`, `38` | `width: 1000px; margin: 0 auto` | parent width | 1000 px, centered (the intended layout) |
| `examples/test15`, `21`, `22`, `23` | `width: 100vw; height: 100vh` | parent width | 100vw |
| `examples/test37` | `width: 100vw; max-width: 1920px` | parent width | 100vw |

The docs pages don't set a stage width (`docs.css` `.demo-stage` sets only `display`, padding and colors; `gallery.html` sets `width: 100%`), so they stay as they are. `examples/test13.html` can go back to `innerHTML` (optional; its comment explains the old problem). All pages are checked in the browser after the change.

## 6. Docs

- **`docs/installation.html`**, new short section after "Download & Include", "Stage Size": the stage fills its parent's width, and its height follows `ratio`. In a parent that sizes itself to its content (a centered flex or grid item, `inline-block`, an absolute card) it is 300 px wide, like `<canvas>`; give the parent or the stage a width to change that. Snippet with a centered wrapper and `width: min(100%, 800px)`. Page CSS always wins over the defaults. Sections after it are renumbered.
- **`.agents/KILOPIXEL.md`**:
  - Stage, Key Behavior: replace "Sets `display: block`, `position: relative`, `width: 100%` on connect" with the cascade layer and the 300 px fallback width;
  - Layer: the canvas lives in an open shadow root with a `<slot>`;
  - Variable: `display: none` comes from the sheet.

## 7. Tests

In `tests/index.html` (IDs from the framework plan §11 where they exist):

- **T-S2:** an author rule `width: 300px` on a stage gives `clientWidth` 300.
- A stage in a centered flex wrapper (case B) is 300 px wide, and so are its layer canvases; a stage in a 250 px column is 250 px wide.
- **T-S1:** `stage.style.cssText = 'border: 1px solid'` (full replacement): the stage is still a block with its parent's width.
- **T-M3:** `layer.innerHTML = '<pxl-circle …>'`: the canvas stays in the shadow root and the new circle is drawn.
- **T-H1:** stage / layer / shapes inserted via `innerHTML`: after upgrade, the light DOM is exactly the inserted markup.
- **T-E5:** pointer moves give the right `mouseX` / `mouseY` with the canvas in the shadow root (wait for `unit > 0`).
- A stage inside a shadow root (a test host element with `attachShadow`) gets the sheet in that root and its parent's width.

## 8. Steps

1. `stage.js`: add the sheet (with the fallback width), remove the three inline styles; the shadow-root check in `connectedCallback()`. `variable.js`: remove the inline `display`.
2. `layer.js`: shadow root with `<style>`, canvas and `<slot>` in the constructor; remove the inline styles and the `appendChild` in `connectedCallback()`.
3. `node build.js`, update the sizes (CLAUDE.md "File size after a build").
4. Tests (§7); `tests/index.html` all passing.
5. Check the examples in §5, all docs pages and the console.
6. Docs (§6) and KILOPIXEL.md; the framework plan's W2 and TODO §30 marked as built.

Commit: `refactor(engine): default styles in a cascade layer with a fallback width, layer canvas in a shadow root`.

## 9. Out of Scope

- **Explicit CSS height:** with `width` and `height` both set (`100vw` / `100vh` in `test15`, `21`, `22`, `23`), `aspect-ratio` is ignored and the box no longer matches `ratio`, while `ref.<stage>.height` still reports `1000 / ratio`. This happens today already, but §5 makes these rules apply. A fix would compute `height` from `clientHeight / unit`; separate TODO entry if wanted.
- **The rest of the framework plan's phase 1** (DOM events, `pxl-on-*` handler names, observing `id`, the cache bound): stays in `design/2026-10-30_framework_compatibility_plan.md`.
