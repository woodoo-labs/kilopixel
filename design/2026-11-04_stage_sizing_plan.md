# Stage Sizing and Layer Canvas: Overridable Defaults, Zero-Width Warning, Canvas in a Shadow Root

- **Status**: 🟢 **Decided** (2026-11-14, now includes workstream W2 of the framework plan; decisions in §4.5)
- **Date**: 2026-11-04 (extended 2026-11-14)
- **Related**: `design/2026-10-30_framework_compatibility_plan.md` (W2 §5, C9–C11: this plan builds that workstream), `design/2026-10-17_bundle_scope_plan.md` (classic script in `<head>`), `docs/installation.html` (script in `<head>` since 5891224)
- **Target Implementation**: `js/elements/stage.js` (default styles, warning), `js/elements/layer.js` (shadow root), `js/elements/variable.js` (`display: none`), `tests/index.html`, `docs/installation.html`, `.agents/KILOPIXEL.md` (Stage, Layer, Variable)
- **Prototypes** in `design/prototypes/2026-11-04_stage_sizing/`:
  - `stage_width_check.html` (today, eight layouts);
  - `stage_sizing_prototype.html` (defaults in a cascade layer; `?fallback=min` and `?fallback=minpct` for the rejected fallback widths);
  - `zero_width_while_parsing.html` (width 0 while the page is parsed);
  - `cascade_layer_order.html` (where the default sheet must go, with page CSS in cascade layers like Tailwind v4; 2026-11-14);
  - `shadow_root_check.html` (layer canvas moved into a shadow root: mouse coordinates and `layer.innerHTML`; 2026-11-14).

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
- A stage that is laid out but 0 px wide logs one warning that names the cause and the fix.
- The layer canvas can't be removed by changing the layer's children, and the layer's light DOM is exactly what the author or framework wrote.
- The default stays: a stage fills its parent's width. No change for pages that work today, except pages whose stage CSS never applied (§5).

## 4. Design

### 4.1 Default Styles in a Cascade Layer

At load, `stage.js` adds one `<style>` element at the start of `<head>`:

```css
@layer pxl {
  pxl-stage { display: block; position: relative; width: 100%; }
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

### 4.2 Zero-Width Warning

A width of 0 alone is not an error: while the page is still loading, the parent may not have its width yet. Measured in `design/prototypes/2026-11-04_stage_sizing/zero_width_while_parsing.html` (script in `<head>`, stage in a centered wrapper, a paragraph that widens the wrapper later in the HTML): the stage reports `0 (loading, rects 1)`, then `828 (complete, rects 1)`. Warning at the first 0 would flag a page that works. So the warning waits until the page has loaded:

```js
resize() {
  const w = this.clientWidth;
  const h = this.clientHeight;
  if (!this._hasCheckedWidth && this.getClientRects().length > 0) this.checkWidth(w);
  if (w === 0) return;
  …
}

// The first time the stage is laid out, a width of 0 usually means its parent sizes itself to its content.
// While the page loads, later HTML, images or load scripts can still give the parent its width, so the
// warning waits for the load event and one frame.
checkWidth(w) {
  this._hasCheckedWidth = true;
  if (w > 0) return;

  const check = () => requestAnimationFrame(() => {
    if (!this.isConnected || this.clientWidth > 0 || this.getClientRects().length === 0) return;
    console.warn('<pxl-stage> has no width: its parent sizes itself to its content (a flex or grid item, ' +
      'inline-block, absolute). Give the parent a width, e.g. width: 100% or 600px. ' +
      'If the stage is meant to be hidden, ignore this.', this);
  });
  if (document.readyState === 'complete') check();
  else window.addEventListener('load', check, { once: true });
}
```

- **Hidden stages stay quiet:** the ResizeObserver also fires with width 0 for a stage inside `display: none` (a closed tab), but then `getClientRects()` is empty. Measured: case B fires with width 0 and 1 rect, a stage in a `display: none` parent with width 0 and 0 rects. Such a stage is checked the first time it is shown.
- **Only the first layout:** `_hasCheckedWidth` (set in the constructor) is set at the first `resize()` where the stage has a box, so a stage that shrinks to 0 later (a panel being closed) never warns, and the warning appears at most once per stage.
- **Waits for loading:** the load event covers parsing, images without a size and most scripts that size containers at load. One more frame lets their layout settle.
- **Remaining false alarm:** a stage in a panel that is already collapsed when the page opens (`width: 0; overflow: hidden`). Rare; the last sentence of the message covers it.
- **Cost:** none per frame; `resize()` runs only when the size changes, and the check once per stage.

### 4.3 Rejected

- **A default width like `<canvas>` (`min-width: 300px`):** fixes B–F (all draw 300 × 75) but overflows narrow columns: a 250 px column gets a 300 px stage (case I), and a phone at 320 px with 16 px padding has only 288 px. A default that breaks mobile layouts is worse than the warning.
- **`min-width: min(300px, 100%)`:** doesn't help; in a parent that sizes to its content the percentage counts as 0, so B–F stay 0 × 0 (measured).
- **Shadow DOM with `:host` for the stage:** layers are light DOM children; the stage would need a shadow root with a `<slot>` only to get one lowest-priority rule. The cascade layer gives the same priority without changing the DOM. (The layer does get a shadow root, for its canvas: §4.4.)
- **`document.adoptedStyleSheets`** (proposed in the framework plan §5.2): its `pxl` layer ranks above the page's layers (§4.1 table).
- **`:where(pxl-stage)` outside any layer** (proposed in the framework plan §5.2): zero specificity, but a rule outside any layer beats every layered page rule (§4.1 table).

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

## 5. Effects on Existing Pages

Rules that never applied start to apply:

| Page | Rule | Today | After |
|---|---|---|---|
| `examples/test24`, `26`, `27`, `34`, `35`, `36`, `38` | `width: 1000px; margin: 0 auto` | parent width | 1000 px, centered (the intended layout) |
| `examples/test15`, `21`, `22`, `23` | `width: 100vw; height: 100vh` | parent width | 100vw |
| `examples/test37` | `width: 100vw; max-width: 1920px` | parent width | 100vw |

The docs pages don't set a stage width (`docs.css` `.demo-stage` sets only `display`, padding and colors; `gallery.html` sets `width: 100%`), so they stay as they are. `examples/test13.html` can go back to `innerHTML` (optional; its comment explains the old problem). All pages are checked in the browser after the change.

## 6. Docs

- **`docs/installation.html`**, new short section after "Download & Include", "Stage Size": the stage fills its parent's width, and its height follows `ratio`. A parent that sizes itself to its content (a centered flex or grid item, `inline-block`, an absolute card) needs a width. Snippet with a centered wrapper and `width: min(100%, 800px)`. Sections after it are renumbered.
- **`.agents/KILOPIXEL.md`**:
  - Stage, Key Behavior: replace "Sets `display: block`, `position: relative`, `width: 100%` on connect" with the cascade layer and the warning;
  - Layer: the canvas lives in an open shadow root with a `<slot>`;
  - Variable: `display: none` comes from the sheet.

## 7. Tests

In `tests/index.html` (IDs from the framework plan §11 where they exist):

- **T-S2:** an author rule `width: 300px` on a stage gives `clientWidth` 300.
- A stage in a centered flex wrapper logs the warning once, one frame after it is added (spy on `console.warn`).
- No warning when the wrapper gets its width before that frame (a wide sibling added right after the stage), and none for a stage in a `display: none` parent.
- **T-S1:** `stage.style.cssText = 'border: 1px solid'` (full replacement): the stage is still a block with its parent's width.
- **T-M3:** `layer.innerHTML = '<pxl-circle …>'`: the canvas stays in the shadow root and the new circle is drawn.
- **T-H1:** stage / layer / shapes inserted via `innerHTML`: after upgrade, the light DOM is exactly the inserted markup.
- **T-E5:** pointer moves give the right `mouseX` / `mouseY` with the canvas in the shadow root (wait for `unit > 0`).
- A stage inside a shadow root (a test host element with `attachShadow`) gets the sheet in that root and its parent's width.

## 8. Steps

1. `stage.js`: add the sheet, remove the three inline styles; the shadow-root check in `connectedCallback()`. `variable.js`: remove the inline `display`.
2. `stage.js`: `checkWidth()` called from `resize()`, the `_hasCheckedWidth` field in the constructor.
3. `layer.js`: shadow root with `<style>`, canvas and `<slot>` in the constructor; remove the inline styles and the `appendChild` in `connectedCallback()`.
4. `node build.js`, update the sizes (CLAUDE.md "File size after a build").
5. Tests (§7); `tests/index.html` all passing.
6. Check the examples in §5, all docs pages and the console.
7. Docs (§6) and KILOPIXEL.md; the framework plan's W2 and TODO §30 marked as built.

Commit: `refactor(engine): default styles in a cascade layer, layer canvas in a shadow root, zero-width warning`.

## 9. Out of Scope

- **Explicit CSS height:** with `width` and `height` both set (`100vw` / `100vh` in `test15`, `21`, `22`, `23`), `aspect-ratio` is ignored and the box no longer matches `ratio`, while `ref.<stage>.height` still reports `1000 / ratio`. This happens today already, but §5 makes these rules apply. A fix would compute `height` from `clientHeight / unit`; separate TODO entry if wanted.
- **The rest of the framework plan's phase 1** (DOM events, `pxl-on-*` handler names, observing `id`, the cache bound): stays in `design/2026-10-30_framework_compatibility_plan.md`.
