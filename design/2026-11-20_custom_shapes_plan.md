# Custom Shapes and Element Structure

- **Status**: 🟡 **Proposed** (2026-11-20, one template: `draw(ctx)` in logical units, in two phases; D3 and a test in Firefox and Safari open)
- **Date**: 2026-11-20
- **Replaces**: `design/archive/2026-10-17_shape_authoring_plan.md` (derived `observedAttributes`, `draw()` without `t`, custom animation patterns, verified 2026-10-17 and 2026-11-07) and the structure cleanup draft of 2026-11-20 (`scratch/2026-11-20_engine_structure_cleanup_plan.md` (not kept); its steps and measurements are §6 here)
- **Related**: `design/2026-11-20_evaluation_model_plan.md` (step 2 makes "`draw()` only reads values" a contract), `design/2026-10-19_polygon_star_shape_plan.md` (the first new shape in this form), `design/done/2026-11-01_isolated_shape_compositing_plan.md` (`drawsMoreThanOnce()`), `design/done/2026-11-07_safe_shape_render_plan.md` (a careless shape can't break the layer), `design/ideas/2026-09-29_pxl-clip_element_plan.md` (parked), `design/2026-10-30_space_attribute_plan.md` (with step 6.6)
- **Target Implementation**: `js/elements/shape.js`, `js/elements/shapes/*.js`, `js/elements/node.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/stage.js`, `js/graphics.js`, `js/interaction.js`, `js/engine.js`; `tools/build_types.js`; `tests/`; a new docs page `docs/custom-shapes.html`; `.agents/KILOPIXEL.md`, `.agents/ENGINE.md`
- **Prototypes** (`design/prototypes/2026-11-20_custom_shapes/`): `template/` (the template as a patch over the engine: `proposal.js`, a Star, a Gauge, `minimal.html`, `rich.html`), `logical_units/` (the canvas, text and shadow tests and the page sweep of §5.3), `transform_path/` (§6.6); older: `design/prototypes/2026-10-17_shape_authoring/` (Rule A tests)

---

## 1. Goal

A page author can define a shape of their own:

- **Easy:** a short, clean template. Attributes, expressions, animation, `ref.*`, properties, events, hit testing, gradients, dashes, shadows and compositing come with it, without knowing the engine.
- **Free:** any canvas drawing, with control over the hit area, the box and how it composites.

**One template serves both:** `draw(ctx)` in logical units. The engine scales the canvas by `u` before `draw()`, so authors never see `u`: a path, a line width, a dash, a gradient or a font size is written as it appears in the HTML.

**Custom shapes are built-in shapes written by someone else.** A custom shape file looks like `js/elements/shapes/rect.js`: a class that extends `pxl.Shape` and one line that defines its tag (D3), loaded as a second script after `pxl.min.js`. The engine treats both the same, and the built-in files are the examples.

## 2. Today

The Star prototype (`design/prototypes/2026-10-17_shape_authoring/star.js`; its checks passed with the engine of 2026-11-20 according to the shape authoring plan) works as a separate file: drawing, a gradient fill, `rotate="t * 30"`, a reactive `points`, Rule A, hit testing, events, properties, a clean canvas state, caught errors. What stands in the way of a public template:

| | Today | Effect for authors |
|---|---|---|
| 1 | `observedAttributes` repeats the keys of `static defaults` | two lists that must match |
| 2 | Boolean attributes are one global list (`pxl.BOOLEAN_ATTRIBUTES`) | `<pxl-pump running>` gives `false`: a custom shape can't have a presence attribute |
| 3 | `draw(ctx, u, t)` multiplies every length by `u` (about 220 places in the engine) | noise in every line; forgetting one `u` draws at the wrong size on other stage widths |
| 4 | `draw()` receives `t`; hit testing passes `0` | a shape that uses `t` is hit where it was at time 0 |
| 5 | `drawsMoreThanOnce()` is `true` for custom shapes | a custom shape with `mask`, `blend`, `filter` or a shadow always goes through the scratch canvas (correct, slower) unless it says otherwise |
| 6 | Without `getBoundingBox()` the base method warns on every call | console noise; gradients collapse to a point; no box check in hit testing |
| 7 | Only the built-in tags are `display: none` | text inside a custom tag shows as page text |
| 8 | Writing the box means four assignments to `this.boundingBox` | boilerplate |
| 9 | No typings for custom tags | TypeScript rejects `<pxl-star>` |
| 10 | Internal animated values need internal calls (`pxl.compileAttribute`, `isAnimated`) | not a public pattern |
| 11 | No defined public API | any engine change may break a custom shape |

## 3. The Template

```html
<script src="pxl.min.js"></script>
<script src="star.js"></script>
```

```javascript
// star.js: written like js/elements/shapes/rect.js
pxl.Star = class Star extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };

  // Logical units: no u anywhere
  draw(ctx) {
    const { points, r, ir } = this.values;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = i % 2 ? ir : r;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    this.applyStyle(ctx); // fill, then stroke
  }

  // Optional: it paints at most twice, so it needs the scratch canvas only for fill + stroke
  drawsMoreThanOnce() {
    return this.hasFill() && this.isStroked();
  }

  // The box around the outline: gradients span it, hit testing pre-checks it
  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, r);
  }
};
pxl.defineShape('pxl-star', pxl.Star); // or customElements.define(): D3
```

```html
<pxl-star x="500" y="300" points="6" r="120" ir="ref.depth.value" fill="radial([1], ['gold', 'orange'])"
  stroke="#000" strokewidth="4" rotate="t * 30" pxl-on-click="ref.count.set('value', ref.count.value + 1)"></pxl-star>
```

No `observedAttributes`, no constructor, no `u`. `pxl.Star` puts the class on the namespace like the built-ins (browsable as `pxl` in the console); a plain `class Star` works the same. The shape gets every common attribute (language §7), its own attributes with Rule A, booleans from `false` / `true` defaults, properties, `ref.<id>.points`, exact hit testing along what it fills and strokes.

**More freedom, same template:** a shape with several paint calls, text or its own hit area (the Gauge in `template/gauge.js`: a track, a value arc in the shape's stroke, ticks with the presence attribute `ticks`, a label in the shape's fill through `paint()`, a `hitTest()` for the whole half disc) uses the same `draw(ctx)` with any canvas calls, all in logical units.

## 4. The Contract

Everything listed here is public and stays stable; everything else (names with `_`, `update()`, `render()`, matrices, the key lists) is internal.

| | Name | Meaning |
|---|---|---|
| **write** | `class … extends pxl.Shape` + the defining line (D3) | in a script after `pxl.min.js`, like the built-in files. The tag starts with `pxl-` by convention (any valid custom element name works) |
| | `static defaults` | every attribute of the shape with its default, spread from `pxl.Shape.defaults`. Keys lowercase (HTML lowercases attribute names; a warning otherwise). A `false` / `true` default makes a presence attribute (bare = `true`) |
| | `draw(ctx)` | the drawing, in logical units (the canvas is scaled by `u`). Only reads `this.values`: no `t`, no DOM, no allocation per frame if it can be avoided |
| | `getBoundingBox()` | the box in logical units, through `setBoundingBox(left, top, right, bottom)`. Strongly recommended: without it, gradients collapse, hit testing skips its pre-check, and a warning comes once for the class |
| **may override** | `hitTest(ctx)` | the hit area, in logical units: add a path and call `ctx.fill()` or `ctx.stroke()` (they test the pointer instead of painting). Default: what `draw()` fills and strokes |
| | `drawsMoreThanOnce()` | whether the shape paints more than once, which decides isolation (language §4). Default `true`; a shape that only fills and strokes returns `this.hasFill() && this.isStroked()` |
| | `hitPadding()` | how far the paint reaches beyond the box (default: from the stroke) |
| **may read** | `this.values` | the current value of every attribute (the object `ref.<id>` reads) |
| | `this.stage.unit` | CSS pixels per logical unit, for the rare drawing in device pixels (pixel snapping, `getImageData()`) |
| **may call** | `applyStyle(ctx)` | fill (if set) and stroke (if set) the current path, gradients and dashes included |
| | `applyStrokeState(ctx)` | set the stroke style, width, caps, joins, dash without stroking (for `strokeText()` and the like) |
| | `paint(ctx, 'fill' \| 'stroke')` | the fill or stroke as a canvas style (color string or gradient in the shape's box) |
| | `hasFill()`, `isStroked()` | whether a fill or a stroke is set |
| | `setBoundingBox(left, top, right, bottom)` | write the box and return it (no allocation) |

**Guarantees:** the transform (including `u`), `alpha`, `blend` / `mask`, `filter` and shadow are applied before `draw()`; the canvas state is restored afterwards; an error is caught, reported once and skips the shape for that frame; the shape is redrawn when one of its values changes.

## 5. Engine Changes

### 5.1 `observedAttributes` From `defaults`

From the shape authoring plan §3.1: `PxlNode`'s static getter returns `Object.keys(this.defaults)` (one getter serves every subclass; the browser reads it once at define time), with the lowercase warning; `Shape` and `Group` append the keys of `pxl.HANDLER_EVENTS`; every element keeps `id`. `isHovered` / `isPressed` move out of `defaults` into the constructors of `Shape` and `Group` (runtime state, not attributes). `<pxl-polyline>` gets `points: ''`. Checked 2026-11-07: the derived lists equal today's hand-written ones except for these three cases. `Stage` keeps its own list.

### 5.2 Presence Attributes From `defaults`

`pxl.resolveEmptyAttribute()` treats a bare attribute as `true` when the class default is a boolean, instead of looking it up in `pxl.BOOLEAN_ATTRIBUTES`, which goes away. For the built-ins this is the same set (`hidden`, `closed`, `smooth`, `pie`, `anticlockwise`, `labels`: the boolean defaults once `isHovered` / `isPressed` are out). `pxl.isSpatialKey()` stays a fixed list (custom shapes don't add transforms).

### 5.3 Drawing in Logical Units

**Idea:** the canvas is scaled by `u` (and the DPR) before a shape draws, so every length in `draw()` is a logical unit.

**What follows the canvas transform** (`logical_units/canvas_tests.html`, Chrome, 2026-11-20; the same device pixels with halved values at scale 2):

| Follows the transform: logical units | Ignores it: scaled by the engine, set before `draw()` |
|---|---|
| paths, line width, dashes and dash offset, gradients, `letterSpacing`, `isPointInStroke()` / `isPointInPath()`; `measureText()` returns widths in the font's own units, so logical | shadows (`shadowBlur`, offsets) and `ctx.filter`: bitmap pixels, so `u` × the layer's DPR (`pxl.applyCompositingState()`, fixed 2026-11-20, commit `7cbb439`: they had been scaled by `u` alone, half their size at DPR 2); a layer's CSS `filter`: CSS pixels, so `u` |

**Measured** with today's code called as `draw(ctx, 1)` on a context scaled by `u`, which is exactly drawing in logical units (`logical_units/patch.js`):

- **Pixels** (`logical_units/harness.html`): 24 docs and 56 example pages, 300 layers: 166 identical, 134 differ only on anti-aliased edges and sub-pixel glyph edges (enlarged three times, old and new text look the same).
- **Hit testing:** 903 of 525,146 sampled points (0.17 %) answer differently; on the four pages checked, every one within 1 logical unit of an edge where today's own answer flips.
- **Frame time** (`logical_units/bench.html`, blocks of consecutive frames per variant: 5,000 circles, 500 texts, 1,000 gradient rects, 1,000 smooth polylines with arrowheads): the same as today within the run-to-run noise (0–2 ms either way on 3–25 ms). Alternating variants frame by frame is misleading: caches keyed by `u` rebuild on every switch.
- **After a resize:** 1,000 gradients rebuilt today, 0 in logical units; 500 texts re-measured today, 0 in logical units.
- **Text** (`logical_units/text_tests.html`, 600 cases: `monospace`, `system-ui`, `Inter`, `sans-serif`, `serif`, regular and bold, sizes 10–64, scales 0.37–2, DPR 1 and 2, filled and outlined): 308 cases pixel-identical; 0.073 % of the ink pixels differ by more than 64 / 255; the glyph shapes are the same. Line widths differ by up to 0.72 %, because the font is set at another pixel size (24 px scaled instead of 18.7 px). Centered or right-aligned text can move by a pixel, and a line that just fits its wrap `width` could break one word differently. In return the layout no longer depends on the stage size: a wrapped paragraph on `docs/text.html` measures 236.8 units at every size, today 236.3–238.8.

**Edge cases:**

- Clearing a layer happens in device space, before the scale.
- Isolation and hit testing get `u` in their matrix (`setTransform(m · u · dpr, …)`; hit testing without the DPR).
- Thresholds that are device pixels today become logical units: the polyline's "same point" (0.01), text `maxwidth`, the minimum radial-gradient radius (0.001).
- `getImageData()` / `putImageData()` ignore the transform: a free shape using them reads `this.stage.unit`.
- **Not tested:** Firefox and Safari. Paths follow the specification; text rendering differs most between browsers, so `logical_units/text_tests.html` and the page sweep run there before phase 1 is built.

**Two phases, so that no step risks the built-ins:**

1. **Phase 1, the calling convention:** `Shape.render()`, `renderIsolated()` and the hit test scale the context by `u` and call `draw(ctx, 1)`; the helpers' `u` defaults to 1 (`applyStyle(ctx)`). The built-in shapes keep their code and multiply by 1. This is the patch that ran over all pages above (`template/proposal.js` is the same plus the template's API). Custom shapes can then be written as in §3.
2. **Phase 2 (optional, later), the cleanup:** the built-in shapes and helpers lose their `* u`, the caches their `u` key (`_scaledDash`, `_lastDashU`, Text's `_lastU`), layers and groups transform in logical units. `u` is always 1 there already, so the page sweep must show 0 differences. About −1 KB.

### 5.4 `draw(ctx)` Without `t`

From the shape authoring plan §3.3: the 7 shape signatures, `Shape.render()`, `renderIsolated()`, the hit test. Hit testing calls `draw()` with the values on screen, so a shape that ignored the rule would be hit where it was drawn only by accident.

### 5.5 Defining the Tag (D3)

Two options, both in a script after `pxl.min.js`:

- **`pxl.defineShape(tag, Class)`** for built-in and custom shapes alike: `customElements.define()` plus a `tag { display: none; }` rule in the default styles (the mechanism used today, so content inside a shape never shows), the checks at define time (uppercase keys, no `draw()`, no `getBoundingBox()`), and a warning instead of the browser's `NotSupportedError` when a script is loaded twice. The hand-written tag list in `pxl.DEFAULT_STYLES` goes.
- **Plain `customElements.define()`:** nothing Kilopixel-specific to learn. The engine then hides content without a tag list: the layer's shadow root uses manual slot assignment (`slotAssignment: 'manual'`) and assigns to its `<slot>` only children that aren't Kilopixel elements, re-assigning when children change or upgrade (Chrome 86, Firefox 92, Safari 16.4); the checks run once per class at the first instance. To prototype: assigning on pages with thousands of shapes, and a tag defined late.

### 5.6 `values` and `expressions`

`attributeValues` → `values`, `attributeExpressions` → `expressions`. The template reads `this.values`; `ref.<id>` is the same object. Pre-release, so no alias. About 0.8 KB less in `pxl.min.js` (102 uses in `js/`, 101 in `tests/`, 6 in docs and examples).

### 5.7 Box Helper and Warnings

`setBoundingBox(left, top, right, bottom)` writes `this.boundingBox` and returns it. The base `getBoundingBox()` no longer warns on every call (§5.5 warns once per class).

### 5.8 Fields

The engine keeps "fields in the constructor" (CLAUDE.md "Engine Code Style": one place to see the state, stable hidden classes); the shape authoring plan's class fields (§3.2 there) are dropped for built-ins. Custom shapes need neither: per-instance state is optional, in class fields or a constructor, as the author likes.

### 5.9 Later

- **Internal animated values** (a pump's impeller, Pattern B of the shape authoring plan §4, verified 2026-10-17): a declarative helper (`static animations = { impeller: 'this.values.running ? t * 90 : 0' }`) after the evaluation model (`design/2026-11-20_evaluation_model_plan.md`), which decides how such values are evaluated. Until then: time in an attribute (`spin="t * 180"`, Pattern A).
- **Arrowheads** for custom shapes (`resolveArrow()`, `aimArrow()`, `drawArrows()`) stay internal: their contract (records, insets, call order) is too detailed for a first public API.
- **Typings:** `tools/build_types.js` can't know user tags; the docs page shows a declaration to copy.

## 6. Structure Cleanup (No Behavior Change; Later)

From the cleanup draft of 2026-11-20. **Not part of the custom-shape steps (§9):** to be discussed separately. It touches the same classes, so whichever comes second adapts to the first. Each step one commit; the tests are the check.

1. **`pxl.describe(element)`:** the text `<pxl-rect id="btn">` for warnings, in 4 places today.
2. **`pxl.BaseElement`** (new `js/elements/base.js`), the base of `Stage` and `PxlNode`: `values` with the hidden `set` / `$node`, the `id` registry (`refKey`, `_isRegistered`, rename), properties set before the upgrade, `attributeChangedCallback()` for unchanged values and `id`, passing other names to the subclass. Methods on the class, so the fields stay in their class.
3. **`stage` and `releaseElement()` in `PxlNode`:** set on connect, cleared on disconnect, for every node; removing a layer then releases hover and press in its own `disconnectedCallback()` (same states, no events). `Variable` registers with the stage only when stage-level.
4. **`pxl.Container`** (new `js/elements/container.js`), the base of `Layer` and `Group`: `childList`, sorting, register / unregister (both invalidate `parentLayer`, which is the layer itself for a layer), the update and draw loops.
5. **Split `interaction.js`:** handler compiling to `compiler.js`; `pxl.dummyCtx` and the walk to `js/hit_testing.js`; states, boundary events and dispatch stay (about 470 lines). Organization only.
6. **One transform path** (decision D7): every shape drawn with its global matrix (`setTransform()`), as isolation and hit testing already are; groups and layers apply no transform when drawing; `pxl.applyTransformState()` and `pxl.applyContextState()` go. Measured 2026-11-20 as a patch over commit `2f75888` (`design/prototypes/2026-11-20_custom_shapes/transform_path/`):
   - **Pixels:** 24 docs and 56 example pages, 169 stages, 300 layers, every layer drawn old, patched, old again, compared premultiplied: 284 layers identical, 16 differ only on anti-aliased edges (worst: `examples/test45.html`, filled circles 15 groups deep, at most 77 / 255 on single edge pixels; the matrices agree to 7 · 10⁻⁶ device pixels). Two traps: Chrome moves a canvas from GPU to CPU drawing after a few `getImageData()` calls (read every layer three times first), and un-premultiplied values of nearly transparent pixels jump by up to 255.
   - **Frame time:** 5,000 circles, `Layer.render()` only, old and patched alternating: 3–9 % slower in 8 of 9 runs (0.6–2 ms per frame), from the matrix lookup per shape.
   - So not alone: with `space` (TODO §28), whose extra transform becomes a different parent matrix. Together with §5.3 phase 2 the global matrix would include `u`.

## 7. Size (Estimates; Measured After Each Step)

| Change | `pxl.min.js` |
|---|---|
| §5.1 derived lists (11 hand-written lists) | about −0.5 KB |
| §5.3 phase 1 | about +0.1 KB |
| §5.3 phase 2 (the `* u` out of the built-ins) | about −1 KB |
| §5.5, §5.7 new code (with `defineShape()`, the tag list in the default styles goes) | about +0.3 KB |
| §5.6 rename | about −0.8 KB |
| §6.1–6.4 structure (later) | −1 to −1.5 KB |
| §6.6 transform path (with `space`) | about −0.5 KB |

## 8. Docs

- **`docs/custom-shapes.html`** (new, DOCS_STANDARDS): the Star (live), the Gauge as the example with more freedom, the contract table, the rules (logical units, no `t`, lowercase keys, booleans from defaults, `drawsMoreThanOnce()`), the second script after `pxl.min.js`, a TypeScript declaration, a downloadable `star.js`.
- `.agents/KILOPIXEL.md`: a section "Custom Shapes" (the contract of §4); `.agents/ENGINE.md`: §6.1 (drawing in logical units), the checklist §12.

## 9. Steps

1. **Test phase 1 in Firefox and Safari:** `logical_units/text_tests.html`, the page sweep, `template/rich.html`.
2. §5.1 and §5.2 (derived attribute lists and presence attributes; `isHovered` / `isPressed` out of `defaults`; `points: ''`).
3. §5.3 phase 1 and §5.4: the calling convention, `draw(ctx)` without `t`.
4. §5.6 rename, if decided (D4).
5. §5.5 (after D3) and §5.7: defining the tag, `setBoundingBox()`, `paint()`, the checks once per class; the Star and the Gauge as tests, loaded as a second script.
6. Docs (§8), KILOPIXEL.md and ENGINE.md.
7. `<pxl-polygon>` (`design/2026-10-19_polygon_star_shape_plan.md`) as the first new shape in this form.
8. Later: §5.3 phase 2; the structure cleanup (§6), discussed separately; §6.6 waits for `space`.

## 10. Tests

| # | Case | Expected |
|---|---|---|
| 1 | Every built-in class: derived `observedAttributes` against the old lists | the same sets, apart from §5.1's three cases |
| 2 | Bare and removed attributes of every attribute of every element (Rule A, `tests/unit.html`) | unchanged; presence attributes the same six |
| 3 | A custom shape with a `false` default, written bare | `true`; removed: `false` |
| 4 | The Star at stage widths 500 and 1000 | the same picture scaled; stroke width, dashes and gradient scaled once |
| 5 | The Star with `mask` and fill only / with fill and stroke | not isolated / isolated (its `drawsMoreThanOnce()`) |
| 6 | Hover and click on the Star, on the Gauge with `hitTest()`, on every built-in | hit along the outline, the box, unchanged |
| 7 | Text inside `<pxl-star>`, also with `star.js` loaded late; a `<button>` placed directly in a layer | the text not shown; the button shown |
| 8 | A class with an uppercase default key, without `getBoundingBox()`, without `draw()` | one warning each per class, none per frame |
| 9 | A custom shape that changes canvas state or throws | the next shape draws normally; one warning |
| 10 | Shadows and shape filters at DPR 2 | as at DPR 1 (`tests/render.html`, since commit `7cbb439`) |
| 11 | Pattern A (`spin="t * 180"`) | animates, hit testing follows |
| 12 | Phase 2 | the page sweep shows 0 differences against phase 1 |

The page sweep (no console messages) and `tests/render.html` guard the built-ins.

## 11. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | One template, `draw(ctx)` | **decided 2026-11-20** (the two levels `path()` / `draw(ctx, u)` dropped) |
| D2 | Logical units for every shape, in two phases (§5.3) | yes, after the test in Firefox and Safari (§9 step 1) |
| D3 | Defining the tag: `pxl.defineShape()` for all shapes, or plain `customElements.define()` (§5.5) | `pxl.defineShape()`: the proven CSS rule hides content, checks run at define time; reopened 2026-11-20 |
| D4 | Rename `attributeValues` → `values`, `attributeExpressions` → `expressions` | yes, before the API is public |
| D5 | Class fields for built-ins | no: the engine keeps constructors; authors choose |
| D6 | The public helpers of §4 (`applyStyle`, `applyStrokeState`, `paint`, `hasFill`, `isStroked`, `setBoundingBox`) | yes; arrowheads stay internal (§5.9) |
| D7 | The transform path (§6.6) | with `space`, not alone (the cleanup is discussed separately) |
| D8 | Typings for custom shapes | a declaration to copy on the docs page; generated typings later |
| D9 | Internal animated values (§5.9) | after the evaluation model |

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-20: one template, `draw(ctx)` in logical units (D1 decided): the engine scales the canvas by `u`, in two phases (§5.3) with the measurements of `logical_units/`; `path()` and the two levels dropped. D3 reopened (`pxl.defineShape()` or plain `define()`). The investigation found shape shadows and filters at 1/DPR of their size on HiDPI screens: fixed in commit `7cbb439`. Prototypes moved into `template/`, `logical_units/`, `transform_path/`.
- 2026-11-20: D3 decided: no registration API, custom shapes are written like built-in shapes (a class and `customElements.define()` in a second script). `pxl.defineShape()` dropped; hiding content (§5.5) by manual slot assignment instead of a tag list; the checks run once per class. The structure cleanup (§6) moves after the custom-shape steps and is discussed separately.
- 2026-11-20: written from the shape authoring plan (archived) and the structure cleanup draft, with custom shapes as a public API: a clean template and enough freedom.
