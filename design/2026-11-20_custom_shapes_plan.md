# Custom Shapes and Element Structure

- **Status**: 🟡 **Proposed** (2026-11-20, custom shapes written like built-in shapes, no registration API; the structure cleanup comes later)
- **Date**: 2026-11-20
- **Replaces**: `design/archive/2026-10-17_shape_authoring_plan.md` (derived `observedAttributes`, `draw()` without `t`, custom animation patterns, verified 2026-10-17 and 2026-11-07) and the structure cleanup draft of 2026-11-20 (`scratch/2026-11-20_engine_structure_cleanup_plan.md` (not kept); its steps and measurements are §6 here)
- **Related**: `design/2026-11-20_evaluation_model_plan.md` (step 2 makes "`draw()` only reads values" a contract), `design/2026-10-19_polygon_star_shape_plan.md` (the first shape in the new form), `design/done/2026-11-01_isolated_shape_compositing_plan.md` (`drawsMoreThanOnce()`), `design/done/2026-11-07_safe_shape_render_plan.md` (a careless shape can't break the layer), `design/ideas/2026-09-29_pxl-clip_element_plan.md` (parked; `path()` would give it the path-only method it needed), `design/2026-10-30_space_attribute_plan.md` (with step 6.6)
- **Target Implementation**: `js/elements/node.js`, `js/elements/shape.js`, `js/elements/shapes/*.js`, `js/elements/group.js`, `js/elements/layer.js`, `js/elements/stage.js`, `js/elements/variable.js`, `js/engine.js`, `js/interaction.js`, new `js/elements/base.js`, `js/elements/container.js`, `js/hit_testing.js`; `tools/build_types.js`; `tests/`; a new docs page `docs/custom-shapes.html`; `.agents/KILOPIXEL.md`, `.agents/ENGINE.md`
- **Prototypes**: `design/prototypes/2026-10-17_shape_authoring/` (Star, Rule A tests), `design/prototypes/2026-11-20_custom_shapes/` (the transform path of §6.6 as a patch, the pixel comparison of all pages, the frame bench)

---

## 1. Goal

A page author can define a shape of their own:

- **Easy:** a short, clean template. Attributes, expressions, animation, `ref.*`, properties, events, hit testing, gradients, dashes, shadows and compositing come with it, without knowing the engine.
- **Free:** any canvas drawing, with control over the hit area, the box and how it composites.

Two levels serve both. A **path shape** describes its outline in `path(ctx)` in logical units; the engine paints it. A **free shape** overrides `draw(ctx, u)` and paints itself, with the engine's helpers.

**Custom shapes are built-in shapes written by someone else.** A custom shape file looks exactly like `js/elements/shapes/rect.js`: a class that extends `pxl.Shape` and the standard `customElements.define()` line, loaded as a second script after `pxl.min.js`. No Kilopixel registration API; the engine treats both the same, and the built-in files are the examples.

## 2. Today

The Star prototype (`design/prototypes/2026-10-17_shape_authoring/star.js`; its checks passed with the engine of 2026-11-20 according to the shape authoring plan, not run again for this plan) works as a separate file: drawing, a gradient fill, `rotate="t * 30"`, a reactive `points`, Rule A, hit testing, events, properties, a clean canvas state, caught errors. What stands in the way of a public template:

| | Today | Effect for authors |
|---|---|---|
| 1 | `observedAttributes` repeats the keys of `static defaults` | two lists that must match |
| 2 | Boolean attributes are one global list (`pxl.BOOLEAN_ATTRIBUTES`) | `<pxl-pump running>` gives `false`: a custom shape can't have a presence attribute |
| 3 | `draw(ctx, u, t)` multiplies every length by `u` | noise in every line; forgetting one `u` draws at the wrong size on other stage widths |
| 4 | `draw()` receives `t`; hit testing passes `0` | a shape that uses `t` is hit where it was at time 0 |
| 5 | `drawsMoreThanOnce()` is `true` for custom shapes | a custom shape with `mask`, `blend`, `filter` or a shadow always goes through the scratch canvas (correct, slower) |
| 6 | Without `getBoundingBox()` the base method warns on every call | console noise; gradients collapse to a point; no box check in hit testing |
| 7 | Only the built-in tags are `display: none` | text inside a custom tag shows as page text |
| 8 | Writing the box means four assignments to `this.boundingBox` | boilerplate |
| 9 | No typings for custom tags | TypeScript rejects `<pxl-star>` |
| 10 | Internal animated values need internal calls (`pxl.compileAttribute`, `isAnimated`) | not a public pattern |
| 11 | No defined public API | any engine change may break a custom shape |

## 3. The Template

### 3.1 Path Shape (the Easy Level)

```html
<script src="pxl.min.js"></script>
<script src="star.js"></script>
```

```javascript
// star.js: written like js/elements/shapes/rect.js
pxl.Star = class Star extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };

  // The outline in logical units: the engine scales it, fills and strokes it, and hit-tests it
  path(ctx) {
    const { points, r, ir } = this.values;
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = i % 2 ? ir : r;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
  }

  // The box around the outline, in logical units: gradients span it, hit testing pre-checks it
  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, r);
  }
};
customElements.define('pxl-star', pxl.Star);
```

```html
<pxl-star x="500" y="300" points="6" r="120" ir="ref.depth.value" fill="radial([1], ['gold', 'orange'])"
  stroke="#000" strokewidth="4" rotate="t * 30" pxl-on-click="ref.count.set('value', ref.count.value + 1)"></pxl-star>
```

No `observedAttributes`, no constructor, no `u`, no `beginPath()`, no painting, nothing to register beyond the browser's own `define()`. `pxl.Star` puts the class on the namespace like the built-ins (browsable as `pxl` in the console); a plain `class Star` works the same. The shape gets every common attribute (language §7), its own attributes with Rule A, booleans from `false` / `true` defaults, properties, `ref.<id>.points`, exact hit testing along its outline, and the isolation rule of the built-in path shapes.

### 3.2 Free Shape (the Free Level)

```javascript
pxl.Gauge = class Gauge extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, value: 0, r: 80, label: '' };

  // Any canvas calls; lengths times u. Canvas state is restored afterwards, errors are caught.
  draw(ctx, u) {
    const { value, r, label } = this.values;
    ctx.beginPath();
    ctx.arc(0, 0, r * u, Math.PI, Math.PI * (1 + value));
    this.applyStyle(ctx, u);                      // fill and stroke like any shape
    ctx.fillStyle = this.paint(ctx, u, 'stroke'); // the stroke color or gradient
    ctx.font = `${16 * u}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 24 * u);
  }

  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, 30);
  }

  // Optional: the hit area, when it isn't what draw() fills and strokes (here: the whole box)
  hitTest(ctx, u) {
    const b = this.getBoundingBox();
    ctx.rect(b.left * u, b.top * u, (b.right - b.left) * u, (b.bottom - b.top) * u);
    ctx.fill();
  }
};
customElements.define('pxl-gauge', pxl.Gauge);
```

## 4. The Contract

Everything listed here is public and stays stable; everything else (names with `_`, `update()`, `render()`, matrices, the key lists) is internal.

| | Name | Meaning |
|---|---|---|
| **write** | `class … extends pxl.Shape` + `customElements.define(tag, Class)` | in a script after `pxl.min.js`, like the built-in files. The tag starts with `pxl-` by convention (any valid custom element name works) |
| | `static defaults` | every attribute of the shape with its default, spread from `pxl.Shape.defaults`. Keys lowercase (HTML lowercases attribute names; a warning at define time otherwise). A `false` / `true` default makes a presence attribute (bare = `true`) |
| | `path(ctx)` **or** `draw(ctx, u)` | the outline in logical units (path shape), or the whole drawing with lengths times `u` (free shape). Both only read `this.values`: no `t`, no DOM, no allocation per frame if it can be avoided |
| | `getBoundingBox()` | the box in logical units, through `setBoundingBox(left, top, right, bottom)`. Strongly recommended: without it, gradients collapse, hit testing skips its pre-check, and a warning comes once for the class |
| **may override** | `hitTest(ctx, u)` | the hit area: add a path and call `ctx.fill()` or `ctx.stroke()` (they test the pointer instead of painting). Default: the outline (path shape) or what `draw()` fills and strokes (free shape) |
| | `drawsMoreThanOnce()` | whether the shape paints more than once, which decides isolation (language §4). Default: fill and stroke (path shape), `true` (free shape) |
| | `hitPadding()` | how far the paint reaches beyond the box (default: from the stroke) |
| **may read** | `this.values` | the current value of every attribute (the object `ref.<id>` reads) |
| **may call** | `applyStyle(ctx, u)` | fill (if set) and stroke (if set) the current path, gradients and dashes included |
| | `applyStrokeState(ctx, u)` | set the stroke style, width, caps, joins, dash without stroking (for `strokeText()` and the like) |
| | `paint(ctx, u, 'fill' \| 'stroke')` | the fill or stroke as a canvas style (color string or gradient in the shape's box) |
| | `hasFill()`, `isStroked()` | whether a fill or a stroke is set |
| | `setBoundingBox(left, top, right, bottom)` | write the box and return it (no allocation) |

**Guarantees:** the transform, `alpha`, `blend` / `mask`, `filter` and shadow are applied before `path()` / `draw()`; the canvas state is restored afterwards; an error is caught, reported once and skips the shape for that frame; the shape is redrawn when one of its values changes.

## 5. Engine Changes

### 5.1 `observedAttributes` From `defaults`

From the shape authoring plan §3.1: `PxlNode`'s static getter returns `Object.keys(this.defaults)` (one getter serves every subclass; the browser reads it once at define time), with the lowercase warning; `Shape` and `Group` append the keys of `pxl.HANDLER_EVENTS`; every element keeps `id`. `isHovered` / `isPressed` move out of `defaults` into the constructors of `Shape` and `Group` (runtime state, not attributes). `<pxl-polyline>` gets `points: ''`. Checked 2026-11-07: the derived lists equal today's hand-written ones except for these three cases. `Stage` keeps its own list.

### 5.2 Presence Attributes From `defaults`

`pxl.resolveEmptyAttribute()` treats a bare attribute as `true` when the class default is a boolean, instead of looking it up in `pxl.BOOLEAN_ATTRIBUTES`, which goes away. For the built-ins this is the same set (`hidden`, `closed`, `smooth`, `pie`, `anticlockwise`, `labels`: the boolean defaults once `isHovered` / `isPressed` are out). `pxl.isSpatialKey()` stays a fixed list (custom shapes don't add transforms).

### 5.3 `path(ctx)` and the Default `draw()`

`pxl.Shape.prototype.draw(ctx, u)`: `ctx.beginPath()`, `ctx.scale(u, u)`, `this.path(ctx)`, scale back, `this.applyStyle(ctx, u)`. Canvas paths are transformed when their points are added, so the outline is built in logical units while stroke width, dashes and gradients stay in today's space (each multiplied by `u` once). To check while building: scaling back by `1 / u` against `save()` / `restore()` (cost and exactness), and a `path()` that changes canvas state.

- `drawsMoreThanOnce()` of the base class: `hasFill() && isStroked()` when the class has no `draw()` of its own, otherwise `true`.
- A class with neither `path()` nor `draw()`: a warning at define time.
- Built-in path shapes: `<pxl-rect>` (its radii in logical units then). The others keep `draw()`: circle, ellipse, line and polyline add arrowheads after painting, text and grid paint several times.

### 5.4 `draw(ctx, u)` Without `t`

From the shape authoring plan §3.3: the 7 shape signatures, `Shape.render()`, `renderIsolated()`, the hit test. Hit testing calls `draw()` with the values on screen, so a shape that ignored the rule would be hit where it was drawn only by accident.

### 5.5 No Registration: What `define()` Alone Must Give

A custom shape is defined with the browser's `customElements.define()`, like the built-ins. Two things the engine must then do on its own:

- **Content of a shape is never shown,** for any tag. Today only the built-in tags are `display: none` (a hand-written list in `pxl.DEFAULT_STYLES`), so text inside `<pxl-star>` would show. Proposed: the layer's shadow root uses **manual slot assignment** (`attachShadow({ mode: 'open', slotAssignment: 'manual' })`) and assigns to its `<slot>` only the children that aren't Kilopixel elements (`!(child instanceof pxl.PxlNode)`): accessible HTML placed in a layer still shows; shapes, groups and variables, built-in or custom, are never rendered as page content, with everything inside them. The layer re-assigns when its children change (`registerChild()` / `unregisterChild()` for Kilopixel elements; a `MutationObserver` for other nodes, or `slotchange`). A tag defined after the page was parsed is an unknown element until then and would show for that moment: it is assigned only once it isn't a `PxlNode`, so the layer checks again when a child upgrades (its `connectedCallback()` registers with the layer). The `display: none` tag list goes, except `pxl-var` (a stage-level variable sits outside every layer). Support: Chrome 86, Firefox 92, Safari 16.4, below the engine's need for `createConicGradient`. To prototype: the cost of assigning on pages with thousands of shapes (only non-Kilopixel children are assigned, usually none).
- **The checks once per class,** at the first instance (the constructor already prepares each class once for the property accessors, `pxl._accessorClasses`): uppercase default keys, neither `path()` nor `draw()`, no `getBoundingBox()`, each warned once naming the class. The lowercase check also runs in the `observedAttributes` getter, at define time.

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
6. **One transform path** (decision D7): every shape drawn with its global matrix (`setTransform()`), as isolation and hit testing already are; groups and layers apply no transform when drawing; `pxl.applyTransformState()` and `pxl.applyContextState()` go. Measured 2026-11-20 as a patch over commit `2f75888` (`design/prototypes/2026-11-20_custom_shapes/`):
   - **Pixels:** 24 docs and 56 example pages, 169 stages, 300 layers, every layer drawn old, patched, old again, compared premultiplied: 284 layers identical, 16 differ only on anti-aliased edges (worst: `examples/test45.html`, filled circles 15 groups deep, at most 77 / 255 on single edge pixels; the matrices agree to 7 · 10⁻⁶ device pixels). Two traps: Chrome moves a canvas from GPU to CPU drawing after a few `getImageData()` calls (read every layer three times first), and un-premultiplied values of nearly transparent pixels jump by up to 255.
   - **Frame time:** 5,000 circles, `Layer.render()` only, old and patched alternating: 3–9 % slower in 8 of 9 runs (0.6–2 ms per frame), from the matrix lookup per shape.
   - So not alone: with `space` (TODO §28), whose extra transform becomes a different parent matrix.

## 7. Size (Estimates; Measured After Each Step)

| Change | `pxl.min.js` |
|---|---|
| §6.1–6.4 structure | −1 to −1.5 KB |
| §5.1 derived lists (11 hand-written lists) | about −0.5 KB |
| §5.6 rename | about −0.8 KB |
| §5.3, §5.5, §5.7 new code (the tag list in the default styles goes) | about +0.4 KB |
| §6.6 transform path (with `space`) | about −0.5 KB |

## 8. Docs

- **`docs/custom-shapes.html`** (new, DOCS_STANDARDS): the Star as a path shape (live), a free shape, the contract table, the rules (logical units in `path()`, `u` in `draw()`, no `t`, lowercase keys, booleans from defaults), the second script after `pxl.min.js`, a TypeScript declaration, a downloadable `star.js`.
- `.agents/KILOPIXEL.md`: a section "Custom Shapes" (the contract of §4); `.agents/ENGINE.md`: §2 (`BaseElement`, `Container`), §6.1 (`path()`, the default `draw()`), the checklist §12.

## 9. Steps

1. §5.1 and §5.2 (derived attribute lists and presence attributes; `isHovered` / `isPressed` out of `defaults`; `points: ''`).
2. §5.6 rename, if decided (D4).
3. §5.4 `draw(ctx, u)`.
4. §5.5: content hidden by manual slot assignment (prototype first), the checks once per class.
5. §5.3, §5.7: `path()`, `setBoundingBox()`; `<pxl-rect>` as a path shape; the Star prototype rewritten as the test, loaded as a second script.
6. Docs (§8), KILOPIXEL.md and ENGINE.md.
7. `<pxl-polygon>` (`design/2026-10-19_polygon_star_shape_plan.md`) as the first new path shape.

The structure cleanup (§6) is discussed separately; §6.6 waits for `space`.

## 10. Tests

| # | Case | Expected |
|---|---|---|
| 1 | Every built-in class: derived `observedAttributes` against the old lists | the same sets, apart from §5.1's three cases |
| 2 | Bare and removed attributes of every attribute of every element (Rule A, `tests/unit.html`) | unchanged; presence attributes the same six |
| 3 | A custom shape with a `false` default, written bare | `true`; removed: `false` |
| 4 | The Star as a path shape at stage widths 500 and 1000 | the same picture scaled; stroke width, dashes and gradient scaled once |
| 5 | A path shape with `mask` and fill only / with fill and stroke | not isolated / isolated |
| 6 | Hover and click on a path shape, on a free shape with `hitTest()`, on every built-in | hit along the outline, the box, unchanged |
| 7 | Text inside `<pxl-star>`, also with `star.js` loaded late; a `<button>` placed directly in a layer | the text not shown; the button shown |
| 8 | A class with an uppercase default key, without `getBoundingBox()`, without `path()` and `draw()` | one warning each per class, none per frame |
| 9 | A free shape that changes canvas state or throws | the next shape draws normally; one warning |
| 10 | Two rects, two polylines | separate buffers per instance |
| 11 | Pattern A (`spin="t * 180"`) | animates, hit testing follows |

The page sweep (no console messages) and `tests/render.html` guard the built-ins.

## 11. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | Two levels, `path(ctx)` and `draw(ctx, u)` | yes |
| D2 | `path()` in logical units (the engine scales by `u`); `draw()` with `u` | yes |
| D3 | Registration | **decided 2026-11-20:** none beyond `customElements.define()`, like the built-ins (§1, §5.5) |
| D3a | Hiding a shape's content without a tag list | manual slot assignment in the layer (§5.5), if the prototype confirms it |
| D4 | Rename `attributeValues` → `values`, `attributeExpressions` → `expressions` | yes, before the API is public |
| D5 | Class fields for built-ins | no: the engine keeps constructors; authors choose |
| D6 | The public helpers of §4 (`applyStyle`, `applyStrokeState`, `paint`, `hasFill`, `isStroked`, `setBoundingBox`) | yes; arrowheads stay internal (§5.9) |
| D7 | The transform path (§6.6) | with `space`, not alone (the cleanup is discussed separately) |
| D8 | Typings for custom shapes | a declaration to copy on the docs page; generated typings later |
| D9 | Internal animated values (§5.9) | after the evaluation model |

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-20: D3 decided: no registration API, custom shapes are written like built-in shapes (a class and `customElements.define()` in a second script). `pxl.defineShape()` dropped; hiding content (§5.5) by manual slot assignment instead of a tag list; the checks run once per class. The structure cleanup (§6) moves after the custom-shape steps and is discussed separately.
- 2026-11-20: written from the shape authoring plan (archived) and the structure cleanup draft, with custom shapes as a public API: a clean template and enough freedom.
