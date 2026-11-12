# Stage Sizing: Overridable Defaults and a Zero-Width Warning

- **Status**: 🟡 **Proposed** (2026-11-04, no code changes yet)
- **Date**: 2026-11-04
- **Related**: `design/2026-10-17_bundle_scope_plan.md` (classic script in `<head>`), `docs/installation.html` (script in `<head>` since 5891224)
- **Target Implementation**: `js/elements/stage.js` (default styles, warning), `js/elements/variable.js` (`display: none`), `tests/index.html`, `docs/installation.html`, `.agents/KILOPIXEL.md` (Stage, Key Behavior)
- **Prototypes**: `design/prototypes/2026-11-04_stage_sizing/stage_width_check.html` (today, eight layouts), `design/prototypes/2026-11-04_stage_sizing/stage_sizing_prototype.html` (defaults in a cascade layer; `?fallback=min` and `?fallback=minpct` for the rejected fallback widths), `design/prototypes/2026-11-04_stage_sizing/zero_width_while_parsing.html` (width 0 while the page is parsed)

---

## 1. Problem

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

- **B–F, silent 0 × 0:** the wrapper sizes itself to its content. The stage's only content is its layers, which are absolutely positioned and add no width, so `width: 100%` resolves to 100 % of 0. Nothing is drawn and nothing is logged. B and D are the usual way to center something, and AI tools write them almost every time; they expect the stage to keep a size of its own like `<canvas>` (H), `<img>` or `<video>`.
- **G, author CSS ignored:** `connectedCallback()` writes `display`, `position` and `width` as inline styles. Inline styles beat every stylesheet rule, so `pxl-stage { width: 600px }` does nothing. Several examples already set a width that never applied (§5).

## 2. Cause

`js/elements/stage.js` `connectedCallback()`:

```js
this.style.display = 'block';
this.style.position = 'relative';
this.style.width = '100%';
this.style.aspectRatio = this._parsedRatio;
```

`resize()` returns early when `clientWidth` is 0 and says nothing.

## 3. Goals

- Author CSS can change a stage's `display`, `position` and `width`, like on any HTML element. Custom elements usually get this from `:host` styles in a shadow DOM, which have the lowest priority.
- A stage that is laid out but 0 px wide logs one warning that names the cause and the fix.
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

- **Lowest priority:** styles outside any layer beat styles in a layer, whatever their specificity or order. So any author rule wins, even `pxl-stage { width: 300px }` in a stylesheet loaded earlier. If the author uses layers too, `pxl` is declared first and so ranks lowest.
- **Prototype:** with the inline `display`, `position` and `width` removed and this sheet added, case G draws 300 × 75; A and C are unchanged.
- **What stays inline:** styles that must hold for the drawing to match the box, and that are internal state rather than defaults:
  - `aspect-ratio` from the `ratio` attribute (the attribute is the API, and the coordinate system depends on it);
  - the layer box (`position: absolute; inset: 0`) and its canvas, which must cover the stage exactly;
  - `cursor` (interaction state);
  - layer `opacity`, `mix-blend-mode` and `filter` (the compositing fast path).
- **Where:** a function in `stage.js`, run once when the file loads (`document.head` exists for a script in `<head>` and at the bottom of `<body>`). `pxl-var` moves to the sheet as well, so its `display: none` is no longer written per element in `variable.js`.
- **Alternative:** `document.adoptedStyleSheets` instead of a `<style>` element (no node in `<head>`). Both work from `file://`; the `<style>` element is easier to find in the inspector. Decide during implementation.

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
- **Shadow DOM with `:host`:** layers and shapes are light DOM children; the stage would need a shadow root with a `<slot>` only to get one lowest-priority rule. The cascade layer gives the same priority without changing the DOM.

## 5. Effects on Existing Pages

Rules that never applied start to apply:

| Page | Rule | Today | After |
|---|---|---|---|
| `examples/test24`, `26`, `27`, `34`, `35`, `36`, `38` | `width: 1000px; margin: 0 auto` | parent width | 1000 px, centered (the intended layout) |
| `examples/test15`, `21`, `22`, `23` | `width: 100vw; height: 100vh` | parent width | 100vw |
| `examples/test37` | `width: 100vw; max-width: 1920px` | parent width | 100vw |

The docs pages don't set a stage width (`docs.css` `.demo-stage` sets only `display`, padding and colors; `gallery.html` sets `width: 100%`), so they stay as they are. All pages are checked in the browser after the change.

## 6. Docs

- **`docs/installation.html`**, new short section after "Download & Include", "Stage Size": the stage fills its parent's width, and its height follows `ratio`. A parent that sizes itself to its content (a centered flex or grid item, `inline-block`, an absolute card) needs a width. Snippet with a centered wrapper and `width: min(100%, 800px)`. Sections after it are renumbered.
- **`.agents/KILOPIXEL.md`**, Stage, Key Behavior: replace "Sets `display: block`, `position: relative`, `width: 100%` on connect" with the cascade layer and the warning.

## 7. Tests

In `tests/index.html`:

- An author rule `width: 300px` on a stage gives `clientWidth` 300.
- A stage in a centered flex wrapper logs the warning once, one frame after it is added (spy on `console.warn`).
- No warning when the wrapper gets its width before that frame (a wide sibling added right after the stage), and none for a stage in a `display: none` parent.

## 8. Steps

1. `stage.js`: add the sheet, remove the three inline styles; `variable.js`: remove the inline `display`.
2. `stage.js`: `checkWidth()` called from `resize()`, the `_hasCheckedWidth` field in the constructor.
3. `node build.js`, update the sizes (CLAUDE.md "File size after a build").
4. Tests; `tests/index.html` all passing.
5. Check the examples in §5, all docs pages and the console.
6. Docs (§6) and KILOPIXEL.md.

## 9. Out of Scope

- **Explicit CSS height:** with `width` and `height` both set (`100vw` / `100vh` in `test15`, `21`, `22`, `23`), `aspect-ratio` is ignored and the box no longer matches `ratio`, while `ref.<stage>.height` still reports `1000 / ratio`. This happens today already. A fix would compute `height` from `clientHeight / unit`; separate TODO entry if wanted.
