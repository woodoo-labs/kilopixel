# Stage Sizing and Layer Canvas: Overridable Defaults, Fallback Width, Canvas in a Shadow Root

- **Status**: ✅ **Implemented** (2026-11-15, results in §10)
- **Date**: 2026-11-04 (extended 2026-11-14, built 2026-11-15)
- **Related**: `design/done/2026-10-30_framework_compatibility_plan.md` (W2 §5, C9–C11: this plan builds that workstream), `design/done/2026-10-17_bundle_scope_plan.md` (classic script in `<head>`), `docs/installation.html` (script in `<head>` since 5891224)
- **Target Implementation**: `js/elements/stage.js` (default styles), `js/elements/layer.js` (shadow root), `js/elements/variable.js` (`display: none`), `tests/index.html`, `docs/installation.html`, `.agents/KILOPIXEL.md` (Stage, Layer, Variable)
- **Prototypes** in `design/prototypes/2026-11-04_stage_sizing/`:
  - `stage_width_check.html` (today, eight layouts);
  - `stage_sizing_prototype.html` (defaults in a cascade layer; `?fallback=min` and `?fallback=minpct` for the rejected fallback widths);
  - `make_zero_width_while_parsing.js` (writes `zero_width_while_parsing.html` to `scratch/`, 2.6 MB: width 0 while the page is parsed);
  - `cascade_layer_order.html` (where the default sheet must go, with page CSS in cascade layers like Tailwind v4; 2026-11-14);
  - `shadow_root_check.html` (layer canvas moved into a shadow root: mouse coordinates and `layer.innerHTML`; 2026-11-14);
  - `fallback_width_check.html` (the 300 px fallback width on every stage in 16 layouts, with and without `min-width: 0`; 2026-11-14);
  - `fallback_trigger_check.html` (the fallback on every stage vs. only on stages measured at 0 width; cards in a narrow grid and the `test16` layout; 2026-11-15);
  - `shadow_root_perf.html` (frame cost of the canvas in a shadow root: 4 layers × 300 animated circles, interleaved rounds; 2026-11-14).

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
  pxl-stage { display: block; position: relative; width: 100%; }
  pxl-stage:state(fallback) { contain: inline-size; contain-intrinsic-inline-size: 300px; min-width: 0; }
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

A stage whose parent has a width fills it, as today. A parent that sizes itself to its content (cases B–F) asks the stage for its own width, and the answer was 0, because the layers are absolutely positioned. A stage that measures 0 px wide while it has a box gets the custom state `fallback`, and the rule `pxl-stage:state(fallback)` (§4.1) makes its answer 300 px, the default width of `<canvas>`:

- **`contain: inline-size`:** the stage's width no longer depends on its content (the layers never added any, so nothing is lost). It creates no stacking context and no containing block, so layers and compositing are unchanged.
- **`contain-intrinsic-inline-size: 300px`:** the width the stage reports when a parent asks for its content width. `width: 100%` still decides whenever the parent has a width of its own.
- **`min-width: 0`:** flex and grid items can't shrink below their minimum content width by default (`min-width: auto`). The fallback raises that minimum from 0 to 300 px; `min-width: 0` keeps a stage with the fallback shrinkable when it is a flex or grid item itself (rows K–M).
- **Only stages measured at 0 width** (changed 2026-11-15): the 300 px is also the stage's minimum content width for every container around it, and `min-width: 0` on the stage doesn't change that. With the fallback on every stage, a card or a grid column that holds a stage could no longer shrink below 300 px plus its padding: in `examples/test16.html` the stage grid grew and squeezed the control panel beside it, and two columns of cards on a 320 px phone overflowed (rows R and S). A stage with a width of its own never gets the state, so its minimum stays 0, as before.
- **The trigger:** `resize()` (the ResizeObserver) calls `markFallbackWidth()` when the width is 0, and `connectedCallback()` checks once in the next animation frame, because a ResizeObserver needn't report an element that stays 0 × 0. `markFallbackWidth()` does nothing for a stage without a box (`display: none`); otherwise it attaches `ElementInternals` once (`attachInternals()`) and adds the state. The new width then reaches `resize()` through the ResizeObserver, which sizes the canvases. `disconnectedCallback()` removes the state, so a moved stage is checked again in its new place.
- **Setting it too eagerly is harmless:** if the parent has a width of its own, `width: 100%` still decides; the state only changes what the stage answers to a parent that asks for its content width.
- **A custom state, not an attribute:** `:state(fallback)` leaves the DOM as the page wrote it, so frameworks that compare or own attributes don't see a change.

Measured in `design/prototypes/2026-11-04_stage_sizing/fallback_width_check.html` (A–Q, `ratio` 4 / 1, page 900 px wide, `box-sizing: border-box`) and `design/prototypes/2026-11-04_stage_sizing/fallback_trigger_check.html` (R, S, `ratio` 16 / 9), and with the real engine in `design/prototypes/2026-11-04_stage_sizing/stage_width_check.html` plus the two `contain` lines (cases A–F identical, the layer canvases resized to 300 × 75). In A–Q a stage gets the fallback exactly where it was 0 wide, so "only at 0 width" gives the same widths as the third column:

| Layout | Before | Fallback on every stage, without `min-width: 0` | Built (only at 0 width, with `min-width: 0`) |
|---|---|---|---|
| A. Plain `div` | 900 × 225 | 900 × 225 | 900 × 225 |
| B. Wrapper in a centered flex container | **0 × 0** | 300 × 75 | **300 × 75** |
| C. Stage directly in a centered flex container | 900 × 225 | 900 × 225 | 900 × 225 |
| D. Wrapper in a centered grid | **0 × 0** | 300 × 75 | **300 × 75** |
| E. `inline-block` wrapper | **0 × 0** | 300 × 75 | **300 × 75** |
| F. Absolutely positioned card | **0 × 0** | 300 × 75 | **300 × 75** |
| G. Author CSS `width: 300px` | 300 × 75 | 300 × 75 | 300 × 75 |
| I. 250 px column | 250 × 63 | 250 × 63 | 250 × 63 |
| J. 288 px phone, centered wrapper without a width | **0 × 0** | 300 × 75, overflows 12 px | 300 × 75, overflows 12 px (like `<canvas>`; accepted) |
| K. Stage beside a 200 px sidebar, 400 px flex row | 200 × 50 | **300 × 75, overflows** | 200 × 50 |
| L. Two `1fr` grid columns, 288 px | 140 × 35 | **300 × 75, overflows** | 140 × 35 |
| M. One `1fr` grid column, 250 px | 250 × 63 | **300 × 75, overflows** | 250 × 63 |
| N. `auto` grid column next to a `1fr` one | **0 × 0** | 300 × 75 | **300 × 75** |
| O. Table cell | **0 × 0** | 300 × 75 | **300 × 75** |
| P. Stage with padding (`border-box`) | 900 × 225 | 900 × 225 | 900 × 225 |
| Q. Author `display: inline-block` on the stage | 900 × 225 | 900 × 225 | 900 × 225 |
| R. Two `1fr` columns of cards (12 px padding), 320 px phone | 130 wide | 300 wide, overflows (also with `min-width: 0`) | 130 wide |
| S. `test16` layout: a growing grid of cards beside a 420 px panel | 293 wide, panel 420 | 300 wide, panel 405 (also with `min-width: 0`) | 293 wide, panel 420 |

- **No warning needed:** with the fallback, a stage is 0 px wide only when it is meant to be (hidden, or in a collapsed panel). The zero-width warning planned until 2026-11-14 had nothing left to catch, and needed care to avoid false alarms while the page loads; it is dropped (§4.3).
- **A small stage explains itself:** users see a 300 px stage and give the parent a width; the docs say how (§6).
- **Overridable:** the rule is in `@layer pxl`, so any width or `min-width` rule of the page, or `contain: none`, wins.
- **Browser support:** custom states (`states.add('fallback')`, `:state()`) in Chrome and Edge 125, Firefox 126 and Safari 17.4 and later; `contain-intrinsic-inline-size` in Safari 17. In an older browser `markFallbackWidth()` catches the error (no `attachInternals()`, no states, or only `--dashed` names), the `:state()` rule doesn't parse, and the stage stays 0 × 0 as before.
- **Cost:** none per frame: `resize()` runs only when the size changes, and the connect check once per connect.

### 4.3 Rejected

- **The fallback on every stage** (decided 2026-11-14, built and replaced 2026-11-15): `contain` and `min-width: 0` in the plain `pxl-stage` rule. It kept every container around a stage from shrinking below 300 px (rows R and S, found by the page sweep in `examples/test16.html`); `min-width: 0` only helps when the stage itself is the flex or grid item.
- **`min-width: 300px`:** fixes B–F (all draw 300 × 75) but overflows narrow columns: a 250 px column gets a 300 px stage (case I), and a phone at 320 px with 16 px padding has only 288 px. The fallback in §4.2 isn't a minimum: it only answers a parent that asks for the content width, and `min-width: 0` keeps flex and grid items shrinkable, so cases I, K, L and M keep today's widths.
- **`min-width: min(300px, 100%)`:** doesn't help; in a parent that sizes to its content the percentage counts as 0, so B–F stay 0 × 0 (measured).
- **Shadow DOM with `:host` for the stage:** layers are light DOM children; the stage would need a shadow root with a `<slot>` only to get one lowest-priority rule. The cascade layer gives the same priority without changing the DOM. (The layer does get a shadow root, for its canvas: §4.4.)
- **`document.adoptedStyleSheets`** (proposed in the framework plan §5.2): its `pxl` layer ranks above the page's layers (§4.1 table).
- **`:where(pxl-stage)` outside any layer** (proposed in the framework plan §5.2): zero specificity, but a rule outside any layer beats every layered page rule (§4.1 table).
- **Zero-width warning** (planned 2026-11-04 to 2026-11-14): a `console.warn` when the stage is still 0 px wide after the `load` event and one frame (`checkWidth()` called from `resize()`, about 15 lines). It had to wait for loading, because a parent can get its width late (measured with the page that `design/prototypes/2026-11-04_stage_sizing/make_zero_width_while_parsing.js` writes). Replaced by the fallback width (§4.2): the stage draws instead of asking the user to fix the CSS.
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
- **Cost:** one shadow root and one small `<style>` per layer, created once. Nothing per frame (measured, §4.6).

### 4.5 Decisions (2026-11-14)

1. The stage and `pxl-var` defaults go in `@layer pxl`, in a `<style>` element at the start of `<head>`, or at the start of the shadow root the stage sits in.
2. The layer's default styles go in `:host` in its own shadow root.
3. The layer's shadow root has a `<slot>` (framework plan D6).
4. `aspect-ratio` stays inline on the stage (framework plan D7). Documented: set single properties on a stage's `style`, don't replace the whole attribute.
5. A stage in a parent without a width is 300 px wide, like `<canvas>` (`contain-intrinsic-inline-size`, §4.2), with `min-width: 0` so flex and grid items still shrink; no zero-width warning. Changed 2026-11-15: only stages measured at 0 width get it, through the custom state `:state(fallback)`.

### 4.6 Performance and Memory

- **Per frame:** nothing changes. The sheet is added once when the script loads (and once per shadow root that holds a stage), each layer creates its shadow root once in its constructor, the fallback check runs in `resize()` and once per connect, and `contain` / `min-width` are plain CSS. No allocation is added to the frame path.
- **Measured** in `design/prototypes/2026-11-04_stage_sizing/shadow_root_perf.html`: 4 layers × 300 animated circles, three layers with compositing (`alpha`, `blend`, `filter`); each canvas moved between the layer's light DOM and its shadow root (with a `<slot>` in both modes, so both show the canvas), 5 interleaved rounds of 2 s per mode:

  | Run | Render time, light DOM | Render time, shadow root | Frame time (light / shadow) |
  |---|---|---|---|
  | 1 | 5.89 ms | 6.17 ms | 16.68 / 16.70 ms |
  | 2 | 5.04 ms | 4.90 ms | 16.68 / 16.68 ms |

  The difference changes sign between runs: noise (about ±5 %). Both modes hold 60 fps. (A first run without the `<slot>` in light mode showed the shadow root 18 % slower; the light-DOM canvases weren't displayed at all there, so that run was discarded.)
- **Pointer events:** the browser retargets them at the shadow boundary natively; no extra work in `handleEvent()`, and `offsetX` / `offsetY` stay exact (§4.4).
- **Memory:** one shadow root and one `<style>` per layer. A single constructed `CSSStyleSheet` adopted by every layer's shadow root would parse the layer CSS once instead of per layer; a micro-optimization, not needed for the usual handful of layers.

### 4.7 Edge Cases

| Case | Result |
|---|---|
| `hidden` attribute on a stage or layer | Unchanged: `display: block` from `@layer pxl` or `:host` still beats the browser's `[hidden]` rule, like the inline style today (measured). The layer handles its `hidden` attribute in the engine. |
| `stage.cloneNode(true)` | Better: today the clone copies each canvas into the cloned layer, which then appends its own and keeps a stray blank one. Shadow roots aren't cloned. |
| Script in `<head>` before the page's stylesheets, or at the end of `<body>` | The `<style>` is prepended, so `pxl` is the first cascade layer declared in either case. |
| Parent gets its width late while the page loads | If the stage is 0 wide at its check, it gets the fallback (300 px), then the parent's width: one extra `resize()` at load. The state stays until the stage is removed; harmless, because `width: 100%` decides once the parent has a width. |
| Stage connected while hidden (`display: none` around it), shown later in a parent without a width | Not covered: the connect check skips it (no box), and the ResizeObserver reports nothing for 0 × 0 → 0 × 0. It stays 0 × 0, as before, until it is connected again. Rare (a tab or dialog that is closed at load and has no width when opened). |
| Collapsed panel (`width: 0; overflow: hidden`) | The stage may get the state, but `width: 100%` of a 0 px parent is still 0: nothing changes. |
| Stage moved between the document and a shadow root | The check in `connectedCallback()` runs on every connect and adds the sheet to the new root once (`data-pxl` marker). |
| Layer moved to another stage (`examples/test16.html`) | The canvas stays in the layer's shadow root; `connectedCallback()` no longer appends it. Checked after the build (§10). |
| Nested layers (`examples/test26.html`, `test27.html`) | The inner layer is a slotted child of the outer one; its `:host` box is positioned as today. Checked after the build (§10; nested layers aren't really supported today). |
| Page code that expects the canvas as `event.target` | Outside the layer the target is now `<pxl-layer>`. No page in the repo checks the target of canvas events (searched 2026-11-14). |
| Declarative shadow DOM on a `<pxl-layer>` (server-rendered `<template shadowrootmode>`) | `attachShadow()` would throw. Not a realistic case; no guard. |

## 5. Effects on Existing Pages

Rules that never applied start to apply:

| Page | Rule | Today | After |
|---|---|---|---|
| `examples/test24`, `26`, `27`, `34`, `35`, `36`, `38` | `width: 1000px; margin: 0 auto` | parent width | 1000 px, centered (the intended layout) |
| `examples/test15`, `21`, `22`, `23`, `28` | `width: 100vw; height: 100vh` | parent width | 100vw |
| `examples/test37` | `width: 100vw; max-width: 1920px` | parent width | 100vw |
| `examples/test47` | `position: absolute; left: 0; top: 0; width: 100vw; height: 100vh` | `position: relative`, parent width | absolutely positioned, full viewport (the intended full-screen stage) |

- **Unchanged** (they set `width: 100%`, the same as the default; other declarations already applied): `examples/test08`–`10`, `16`, `29`–`31`, `40`–`42`, `45`, `46`, `48`–`52`; `tests/index.html` (border only).
- **Docs:** every docs stage has `width: 100%`: `.demo-stage` from the default (`docs.css` sets `display: block`, padding, border and colors), `.showcase-stage`, `.diagram-stage` and `gallery.html` set it themselves. The starter kit (`docs/download/index.html`) has no stage CSS. No docs page changes except the new section (§6).
- **Code:** no page reads a layer's canvas through the DOM (`querySelector('canvas')`, `children`, `firstChild`) or checks a canvas event target (searched 2026-11-14).
- **Check after the build:** all docs pages and examples in the browser, especially the pages in the table, `test16` (moves layers between stages), `test26` / `test27` (nested layers) and `test13` (its `insertAdjacentHTML` comment can go; optional).

## 6. Docs

- **`docs/installation.html`**, new short section after "Download & Include", "Stage Size": the stage fills its parent's width, and its height follows `ratio`. In a parent that sizes itself to its content (a centered flex or grid item, `inline-block`, an absolute card) it is 300 px wide, like `<canvas>`; give the parent or the stage a width to change that. Snippet with a centered wrapper and `width: min(100%, 800px)`. Page CSS always wins over the defaults. Sections after it are renumbered.
- **`.agents/KILOPIXEL.md`**:
  - Stage, Key Behavior: replace "Sets `display: block`, `position: relative`, `width: 100%` on connect" with the cascade layer and the 300 px fallback width (only at 0 width);
  - Layer: the canvas lives in an open shadow root with a `<slot>`;
  - Variable: `display: none` comes from the sheet.

## 7. Tests

In `tests/index.html` (IDs from the framework plan §11 where they exist):

- **T-S2:** an author rule `width: 300px` on a stage gives `clientWidth` 300.
- A stage in a centered flex wrapper (case B) gets the fallback state and is 300 px wide, and so are its layer canvases; removed from the page, it loses the state.
- A stage in a card in a narrow two-column grid (case R) gets no fallback state and is as wide as the card.
- A stage in a `1fr` grid column narrower than 300 px is as wide as the column (case M, guards `min-width: 0`).
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
6. Docs (§6) and KILOPIXEL.md; the framework plan's W2 marked as built.

Commit: `refactor(engine): default styles in a cascade layer, 300 px fallback width, layer canvas in a shadow root`.

## 9. Out of Scope

- **Explicit CSS height:** with `width` and `height` both set, `aspect-ratio` is ignored and the box no longer matches `ratio`, while `ref.<stage>.height` still reports `1000 / ratio`. It happens today already in `test40`–`42` and `test48`–`52` (`height: 100%` beside the inline `width: 100%`); §5 adds `test15`, `21`, `22`, `23`, `28` and `47` (`100vw` / `100vh`). A fix would compute `height` from `clientHeight / unit`; separate TODO entry if wanted.
- **The rest of the framework plan's phase 1** (DOM events, `pxl-on-*` handler names, observing `id`, the cache bound): stays in `design/done/2026-10-30_framework_compatibility_plan.md`.

## 10. Built 2026-11-15

- **Engine:** `stage.js` (`pxl.DEFAULT_STYLES`, `pxl.addDefaultStyles()`, `markFallbackWidth()`, the field `_internals`), `layer.js` (shadow root, `pxl.Layer.STYLES`), `variable.js` (no inline style). `pxl.min.js` 57.37 KB minified, 17.00 KB gzipped (before: 56.52 / 16.68).
- **Tests:** `tests/index.html`, group "stage sizing" / "layer canvas", 10 tests (§7); 86/86 passing. With the previous build 7 of them fail; the shrink and pointer tests guard against regressions and pass with both. Two older tests that expect an idle stage at 0 FPS failed now and then with both builds: a web font that finishes loading redraws every stage once (`text.js`); they now wait for `document.fonts.ready` (and the monitor test for one more timer interval).
- **Page sweep:** every example and docs page (78 pages, 167 stages) loaded with the previous and the new build in the same HTML, comparing stage sizes, `position`, drawn layers, light-DOM canvases and console messages (`scratch/sizing_sweep.html` (not kept)). With the fallback on every stage, `test16` changed (rows R and S, §4.3); with the built version the only differences are the ones in §5: `test24`, `26`, `27`, `34`–`36`, `38` now 1000 px wide, `test47` absolutely positioned. No new console messages, no layer that stopped drawing, no canvas in a light DOM; docs pages unchanged. (A few pages showed "drawn layers" differences in both directions in the second run; checked again one at a time with a longer wait, they showed none: timing while the browser pane was busy.) In `test16` moving a layer to another stage keeps its canvas in its shadow root and draws it there.
- **Docs:** `docs/installation.html` section 2 "Stage Size" (snippet and the callout "Your CSS Wins"); sections 3–5 renumbered (IDs `sec4…` → `sec5…`). KILOPIXEL.md: Stage, Layer and Variable.
