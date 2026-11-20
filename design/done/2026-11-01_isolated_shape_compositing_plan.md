# Isolated Shape Compositing: Fill and Stroke Composite as One

- **Status**: ✅ **Implemented** (2026-11-20, step 1 built, §10; step 2 is TODO §31)
- **Date**: 2026-11-01
- **Related**: `design/done/2026-11-07_safe_shape_render_plan.md` (built 2026-11-07, same function `Shape.render()`; the base for this plan, §9), TODO §14 `paintorder` (changes the order of the same draw calls; build it after this plan, §9), `docs/DOCS_STANDARDS.md` §2 ("Ghosts of fill-only shapes", the docs rule this removes), `design/2026-11-12_two_phase_frame_plan.md` and `design/2026-11-15_per_frame_evaluation_plan.md` (no shared code since 2026-11-13, §9), `design/2026-10-17_shape_authoring_plan.md` (TODO §20, custom shapes, §3.5), `design/2026-09-29_pxl-clip_element_plan.md` (TODO §2, a clip on the layer also clips the composite step, §9)
- **Target Implementation**: `js/elements/shape.js` (`render()`), `js/graphics.js` (`applyContextState` split), `js/elements/stage.js` (scratch canvas size), `js/elements/shapes/text.js` and `grid.js` (draw count)
- **Prototypes**: `design/prototypes/2026-11-01_isolated_shape_compositing/mask_fill_stroke.html` (today vs isolated, every mask mode plus alpha, blend, shadow, multi-line text), `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_bench.html` (cost, 2026-11-01, plain canvas), `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_patch.html` (2026-11-20: the isolated `Shape.render()` as a patch over the engine, with the transform check of §3.4), `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_frames.js` (2026-11-20: that patch in real frames, §4), `design/prototypes/2026-11-01_isolated_shape_compositing/paint_order_text.html` (`paintorder` for text, §9)

---

## 1. Problem

A shape with both `fill` and `stroke` draws wrong as soon as it has `mask`, `shadowcolor`, `filter` or `blend`:

| Shape state | What happens today |
|---|---|
| `mask="source-in"` | The stroke erases the shape's own fill: only a thin arc of stroke is left |
| `mask="xor"` | The inner half of the stroke cuts a line out of the shape's own fill |
| `mask="destination-over"` | The stroke slides under the shape's own fill |
| `mask` (7 of 9 modes) | Wrong; only `source-over` and `destination-out` look right |
| `shadowcolor` | The stroke casts its own shadow onto the shape's fill: a second, dark outline inside the shape |
| `blend="multiply"` | The inner half of the stroke multiplies with the shape's own fill (darker band) |
| `alpha="0.5"` | The inner half of the stroke shows the fill through it (subtle) |
| multi-line `<pxl-text>` with `mask` | Each line is masked against the previous lines; with `source-in` the text disappears |

Users hit this in normal use: a stroked card with a drop shadow, a masked badge with an outline. The docs work around it: `mask.html` uses fill-only shapes, and DOCS_STANDARDS.md needs an extra rule for their ghosts ("a colored outline would look like the shape's own stroke"). `shadow.html` §1 shows it today: the translucent circle with stroke and `shadowblur="15"` has a soft dark band inside its upper edge, the stroke's own shadow.

## 2. Cause

`pxl.applyContextState()` sets `globalCompositeOperation`, `globalAlpha`, `filter` and the shadow once for the shape. The shape then issues several draw calls with that state:

- `Shape.applyStyle()`: `ctx.fill()`, then `ctx.stroke()`
- `drawArrows()`: one more `fill()` or `stroke()` for the arrowheads
- `Text.draw()`: `fillText()` and `strokeText()` per line
- `Grid.draw()`: the minor lines, the major lines (a second `stroke()`), then `fillText()` per label

Canvas composites each call separately, so the second call is composited against the result of the first. SVG and CSS don't have this problem: `opacity`, `filter`, `mix-blend-mode` and masks apply to the element as a whole (an isolated group). Konva has the same problem and solves it the same way as proposed here (`perfectDrawEnabled`: draw into a buffer canvas, then composite once).

## 3. Proposal

When a shape **issues more than one draw call** and **has compositing state**, draw it normally into a shared scratch canvas, then composite that bitmap onto the layer once, with the shape's compositing state.

```
ctx (layer)                          scratch
-----------                          -------
                                     clear
                                     transform = ctx's current transform
                                     draw(scratch)   ← fill, stroke, arrows, lines: source-over, no alpha/shadow/filter
save
identity transform
alpha, mask/blend, filter, shadow
drawImage(scratch)                   ← one composite
restore
```

Every other shape keeps today's direct path. A single draw call already composites correctly, so isolating it would cost time and change nothing.

### 3.1 When to Isolate

**Compositing state** (any of): `mask !== 'none'`, `blend !== 'source-over'`, `filter !== 'none'`, a visible `shadowcolor`. `alpha` is an open decision (§6.1).

**More than one draw call** (decided per frame in `draw()`, from values already computed there):

| Shape | Draws more than once when |
|---|---|
| circle, ellipse, rect, line, polyline | `hasFill()` and `isStroked()`, or an arrowhead is drawn |
| text | `hasFill()` and `isStroked()`, or more than one visible line |
| grid | major lines (`major > 0`, a second stroke) or labels are drawn |

A method `needsIsolation()` on the shape answers this. Shapes compute it from the same values they draw with, so the condition can't drift from the drawing code. Custom shapes: §3.5.

### 3.2 Scratch Canvas

- One canvas for the whole page: `pxl._isolationCanvas` and its context, created on first use.
- Size: the largest layer canvas (device pixels). Layers report their size on `resize()`; the scratch only grows, so a resize never allocates per frame.
- Nested isolation can't happen: groups have no compositing state, and a shape doesn't contain shapes.

### 3.3 Composite Step

- `pxl.applyContextState()` is split into the transform part (`applyTransformState`, exists) and a compositing part (`applyCompositingState`: alpha, mask / blend, filter, shadow). The direct path calls both, as today; the isolated path calls the transform part on the scratch and the compositing part before `drawImage`.
- Shadows and filters are applied at the composite step, so they act on the finished shape: one shadow for the whole silhouette, like CSS `filter: drop-shadow()`.
- Canvas shadows and filters ignore the current transform, so drawing the bitmap with an identity transform keeps today's shadow offsets and blur sizes.

### 3.4 Copying the Transform without Allocation

`ctx.getTransform()` returns a new `DOMMatrix` on every call, which breaks the zero-allocation rule for per-frame paths. Options:

- **(a)** Read the shape's cached global matrix (`getGlobalMatrix()`, pre-allocated in `node.js`) and set it on the scratch with `setTransform(a, b, c, d, e, f)`, scaled by the unit `u` and the DPR. Needs a check that the global matrix uses the same units as the canvas transform (it's built for `toLocal` and hit testing).
- **(b)** Replay the transform chain on the scratch: the layer's and groups' `applyTransformState`, then the shape's. Exact by construction, but needs the ancestors at hand.

**Decided 2026-11-20: (a)**, with an engine test that compares it against `ctx.getTransform()` for nested, rotated, skewed and zoomed layers and groups.

**Checked 2026-11-20:** (a) works. The global matrix has unitless linear parts and its translation in stage units, so the canvas transform is `setTransform(m[0]·d, m[1]·d, m[2]·d, m[3]·d, m[4]·u·d, m[5]·u·d)` with the layer's DPR `d`. The hit test already sets it this way on `pxl.dummyCtx` (`InteractionEngine.hitsShape()`, without `d`). In `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_patch.html` a layer and two groups (rotated, skewed, scaled, zoomed, `dx` / `dy`) hold an ellipse, a rect, a polyline with an arrowhead and two-line text with a stroke; drawn through the scratch canvas they land on the same pixels as drawn directly: largest channel difference 1 (antialiasing), no pixel off by more than 2, at DPR 1 (320,000 pixels) and DPR 2 (1.28 million).

### 3.5 Custom Shapes

A custom shape (`design/2026-10-17_shape_authoring_plan.md`) overrides `draw()` and may call `fill()` and `stroke()`, so the engine can't count its draw calls from the outside. The base `needsIsolation()` therefore answers "has compositing state": always correct, and a custom shape that draws only once can override it. The built-in shapes override it with the exact rule of §3.1. Open decision §6.3.

(2026-11-20, as built, §10: `needsIsolation()` is `hasCompositingState()` and `drawsMoreThanOnce()`. The built-in shapes override `drawsMoreThanOnce()`, not `needsIsolation()`; the base `drawsMoreThanOnce()` returns true, so a custom shape is isolated whenever it has compositing state, and one that draws only once overrides either method.)

## 4. Cost

Measured with `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_bench.html` in the desktop app's browser pane: layer 1000 × 600 at DPR 2 (2000 × 1200 px), ellipse 180 × 120 with fill and stroke, `mask="xor"`, 20 shapes per frame, GPU work included.

| Variant | Per shape |
|---|---|
| Direct (today) | 0.01 ms |
| Isolated, full scratch canvas (clear + `drawImage` of 2000 × 1200 px) | 0.75–0.9 ms |
| Isolated, bounding box only (≈ 380 × 260 px) | 0.35–0.37 ms |

- **Real pages:** `mask.html` has one masked shape, `shadow.html` a few shadowed ones: under 1 ms per frame, and only on frames where the layer redraws.
- **Worst case:** 20 animated, masked, stroked shapes cost 15–18 ms per frame with the full canvas (over budget) and 7 ms with the bounding box. (2026-11-20: in real frames 20 shapes stay at 60 fps with about 1 ms of CPU per frame, §4.1.)
- **Plan:** implement the full-canvas version first (simplest, always correct), then the bounding-box version as step 2. The bounding box is the shape's `getBoundingBox()` transformed to device space, plus half the stroke width, the miter and the arrowheads. Shadows and filters don't need margin: they are applied at the composite step, outside the scratch.

### 4.1 Measured Again in Real Frames (2026-11-20)

The table above draws in one long loop and ends each run with `getImageData()`, which makes the CPU wait for the GPU. In a real frame the GPU works on its own, and the cost splits into CPU time in the frame and GPU time, which shows only as a lower frame rate. Measured with the patch over today's engine (`design/prototypes/2026-11-01_isolated_shape_compositing/isolation_patch.html`, run by `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_frames.js`): a visible Chrome on this laptop, DPR 2, a stage 800 px wide (1,600 × 800 device pixels), n animated ellipses with fill, stroke and `mask="xor"` over a rect; CPU time of `Stage.render()` with a 5 µs timer, two runs each.

| Isolated shapes | Direct (today) | Full scratch canvas | Bounding box |
|---|---|---|---|
| 1 | 0.26–0.27 ms, 60 fps | 0.49–0.62 ms, 60 fps | 0.47–0.56 ms, 60 fps |
| 5 | 0.33–0.38 ms, 60 fps | 1.21–1.38 ms, 60 fps | 1.23–1.32 ms, 60 fps |
| 20 | 0.65–0.72 ms, 60 fps | 1.64–1.72 ms, 59–63 fps | 1.45–1.91 ms, 58–60 fps |
| 100 | 0.65–0.68 ms, 60 fps | 4.2–4.3 ms, **26 fps** | 3.0 ms, **34–36 fps** |

- **Typical pages** (a few isolated shapes): about 0.3–1 ms of CPU per frame in which the layer redraws, nothing visible on the GPU. Far less than the 15–18 ms the plain-canvas bench above suggested for 20 shapes.
- **Many isolated shapes:** the GPU becomes the limit. From the frame rates at 100 shapes, about 0.22 ms of GPU time per shape with the full canvas and 0.12 ms with the bounding box, so the bounding box (step 2) matters from about 50 isolated shapes in one frame.
- Measured on one laptop's GPU; a weaker GPU reaches the limit earlier.

## 5. What Changes for Users

- Masked, shadowed, filtered and blended shapes with fill and stroke look like their SVG / CSS equivalent. Single-draw shapes look exactly as before.
- `shadow.html` §1: the dark band from the stroke's shadow inside the circle disappears. The page text doesn't mention the stroke, so only the picture changes.
- `mask.html`: the shapes can get a normal fill and stroke (fill 100 at 40 %, stroke 500). The ghosts then follow the standard rule (300, solid), and the "Ghosts of fill-only shapes" note in DOCS_STANDARDS.md goes.
- KILOPIXEL.md: "Blend vs. Masking" and the render path describe isolation; the rendering section names the scratch canvas.

## 6. Open Decisions

### 6.1 `alpha`

Isolating `alpha` is correct (SVG `opacity` is isolated too), but fades are common, and every stroked, filled shape that fades would pay §4 per frame. The artifact is subtle (`design/prototypes/2026-11-01_isolated_shape_compositing/mask_fill_stroke.html`, row "alpha 0.5").

**Decided 2026-11-20: `alpha` is not isolated** for now. It keeps today's per-call behavior, like SVG `fill-opacity` / `stroke-opacity`. Revisit if users notice it.

### 6.2 Bounding Box in Step 1 or Step 2

**Decided 2026-11-20: step 2.** The full-canvas version is enough for every docs page and has no margin bugs; step 2 is a measured optimization. (2026-11-20: confirmed by §4.1; the bounding box only pays off from about 50 isolated shapes per frame. The patch's bounding box, `getBoundingBox()` plus `hitPadding()` through the global matrix, already reuses the hit test's padding.)

### 6.3 Custom Shapes

Options for a custom shape with compositing state (§3.5):
- **(a)** Always isolate it, unless it overrides `needsIsolation()`: always correct; a custom shape that draws once pays §4.1 for nothing (about 0.3 ms per frame for the first such shape).
- **(b)** Never isolate it unless it overrides `needsIsolation()`: no cost, but a custom shape with fill and stroke keeps the bug until its author notices.

**Decided 2026-11-20: (a)**, isolated unless the shape overrides `needsIsolation()`. Custom shapes with `mask`, `shadowcolor`, `filter` or `blend` are rare, and a correct picture is the better default; the shape authoring docs then mention the override.

## 7. Tests (`tests/index.html`)

Pixel reads on a small stage, one test per row:

1. `mask="source-in"`, ellipse with fill and stroke over a rect: a pixel in the ellipse's fill inside the rect has the fill color (today: transparent).
2. `mask="xor"`: a pixel in the inner half of the ellipse's stroke, outside the rect, has the stroke color (today: cut out).
3. `shadowcolor` with fill and stroke: a pixel just inside the stroke, where the stroke's shadow fell, has the fill color.
4. Multi-line text with `mask="source-in"` over a rect: both lines are visible inside the rect.
5. Fill-only shape with `mask`: same pixels as before (direct path).
6. Transform copy (§3.4): nested rotated / skewed / zoomed layer and group, isolated shape lands on the same pixels as a direct one (as in `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_patch.html`).
7. Custom shape (§3.5, if §6.3 (a)): a custom shape whose `draw()` fills and strokes, with `mask="source-in"`, keeps its fill; one that overrides `needsIsolation()` takes the direct path.
8. Arrowheads with `shadowcolor`: no dark band where the shaft meets the head (the shaft's shadow under the head).

## 8. Steps

1. Agree on this plan (§6.1, §6.2, §6.3): decided 2026-11-20. Always save / restore, which comes first (§9), was built on 2026-11-07.
2. Split `applyContextState`; add `needsIsolation()` and the isolated path in `Shape.render()`; scratch canvas sized by the layers.
3. Tests §7; `node build.js`; all tests pass.
4. KILOPIXEL.md, TODO.md entry.
5. Docs: `mask.html` shapes with fill and stroke and the standard ghosts; remove the "Ghosts of fill-only shapes" note; check `shadow.html` §1, `blend.html` and `fill.html`.
6. Step 2: bounding-box scratch region, measured with `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_frames.js` (real frames, §4.1; `isolation_bench.html` forces a GPU readback and overstates the cost).

## 9. Build Order with Related Plans

Three plans change how a shape's draw calls (fill, stroke, arrowheads, text lines) reach the layer. Built in this order, each one makes the next simpler:

1. **Always `save()` / `restore()` per shape** (`design/done/2026-11-07_safe_shape_render_plan.md`, built 2026-11-07): `Shape.render()` gets one path, save → transform → draw → restore, instead of the `hasStateChanges` check. The isolated path then only swaps the target of `draw()` (the scratch canvas) instead of adding a third path. The shared scratch canvas also needs the same protection against custom shapes that change canvas state and don't reset it (the `GhostStar` test, `design/archive/2026-10-17_always_save_restore_plan.md` §5.2): a leak there would reach every isolated shape after it.
2. **This plan** (TODO §31).
3. **`paintorder`** (TODO §14, concept): `paintorder="stroke"` draws the stroke first and the fill on top. Without isolation it has the same compositing bug: with a shadow, the fill's shadow falls onto the stroke drawn just before it. With isolation it only swaps two calls inside the scratch canvas, and shadow, mask and filter apply to the finished shape. Shared open questions: arrowheads (§3.1 counts them as an extra draw call; §14 asks how they paint with `paintorder="stroke"`) and semi-transparent fills (§14 "fills show the stroke underneath", here §6.1 `alpha`). Prototype for text: `design/prototypes/2026-11-01_isolated_shape_compositing/paint_order_text.html` (plain canvas: per line as today, all fills then all strokes, strokes under the fills; overlapping lines and a label on a busy background).

**Other plans** (checked 2026-11-20):
- **Two-phase frame and per-frame evaluation** (`design/2026-11-12_two_phase_frame_plan.md` §6 and §7, `design/2026-11-15_per_frame_evaluation_plan.md`): the two-phase plan asks to build this plan and its own one after the other, because both changed `Shape.render()`. Since its step 1 (built 2026-11-13) evaluation happens in `update()`, and `Shape.render()` only draws (save, `applyContextState()`, `draw()`, restore). The remaining steps of both plans change the update phase (dirty flags, the heartbeat, broadcasts), this plan only the draw phase, so they can be built in any order.
- **`<pxl-clip>`** (`design/2026-09-29_pxl-clip_element_plan.md`, TODO §2, not built): the clip is set on the layer's context with `ctx.clip()`; the composite step draws onto that context, so `drawImage()` is clipped like a direct draw. The scratch canvas carries no clip. A test belongs to whichever of the two plans is built second.
- **Layer compositing** (`design/done/2026-10-30_framework_compatibility_plan.md` §29): a layer's `alpha`, `blend` and `filter` are CSS on its canvas and already apply to the layer as a whole; this plan is only about shapes.

## 10. Step 1 Built (2026-11-20)

- **Engine:** `js/graphics.js`: `pxl.applyContextState()` calls `pxl.applyTransformState()` and the new `pxl.applyCompositingState()`; `pxl.getIsolationContext(w, h)` creates the scratch canvas on first use and grows it (`pxl._isolationContext`). `js/elements/shape.js`: `render()` sends a shape that `needsIsolation()` to `renderIsolated()`; `hasCompositingState()` (§3.1, without `alpha`, §6.1), `drawsMoreThanOnce()` (true in the base, §3.5 and §6.3), `fillsAndStrokesOrHasArrows()` and `hasArrowheads()` for the path shapes. Overrides of `drawsMoreThanOnce()` in circle, ellipse, rect, line and polyline (the path rule), text (fill and stroke, a line break in `text` or a wrap `width`: the line count is only known after the layout in `draw()`) and grid (`major > 0`, or fill and stroke). `js/elements/layer.js`: `_dpr` became `dpr`, read by `renderIsolated()` (the tests and four prototypes that read `layer._dpr` follow).
- **Transform** (§3.4, decided (a)): `setTransform(m[0]·d, m[1]·d, m[2]·d, m[3]·d, m[4]·u·d, m[5]·u·d)`, the whole scratch area of the layer's size, composited with an identity transform. Checked in the engine at DPR 1 and 2: filters (`blur`) give the same pixels as the direct path (largest difference 1 / 255); a shadow has the same offset and size, but a bitmap's shadow blurs its soft edge slightly differently from a path's (up to 16 / 255 in about 2,000 channel values of a 240-unit circle, at DPR 1 as at DPR 2; scripts `scratch/isolation/dpr.html` and `scratch/isolation/dpr.js` (not kept)).
- **Visual check:** `scratch/isolation/compare.html` (not kept), before and after side by side with every mask mode, a shadow, `blend="multiply"`, an arrow with a shadow, two-line text with `source-in`, a polyline with `blur` and `source-atop` with a shadow.
- **Tests** (`tests/index.html`, section "Isolated compositing", the 8 of §7): `source-in` keeps the fill, `xor` keeps the stroke's inner half, a shadow changes no pixel of the shape itself (1,596 pixels before), two-line text with `source-in` keeps both lines, `needsIsolation()` for 17 shapes (fill only, `alpha`, `shadowcolor="none"`, arrows without stroke, wrap width, grid, custom shapes), the transform in nested rotated, skewed and zoomed groups (to 2 / 255), a custom shape with and without the override, an arrowhead's shadow on its own shaft (189 pixels before). Run against the build before: the 7 that check the bug fail for the right reason; the transform test passes there too (it guards the new path).
- **Docs:** `mask.html` shapes have fill and stroke; the fills are the opaque `100` steps (`#ffedd5`, `#dbeafe`), not the 40 % fill of DOCS_STANDARDS.md §2 (§5 said 40 %): with half-transparent fills the boolean operations don't show (`xor` only lightens the overlap). Ghosts follow the standard rule (`300`, solid); the callout "Don't Mix Fill and Stroke" became "Fill and Stroke Mask as One"; the "Ghosts of fill-only shapes" rule left DOCS_STANDARDS.md. (2026-11-20, after a look at the page: solid colored ghosts along a cut edge looked like a leftover of the stroke, so the ghosts are light slate and dashed again, `#cbd5e1`, and DOCS_STANDARDS.md §2 has the rule "Ghosts of masked shapes".) `shadow.html` §1 and `blend.html` change only in the picture (the stroke's shadow and the multiplied inner half of the stroke are gone), not in their text.
- **Size:** `pxl.min.js` 70.58 → 72.52 KB (~73KB in the docs), gzipped 20.84 → 21.28 KB.
- **Open:** step 2, the bounding-box scratch region (§6.2, TODO §31). Known limit: an isolated text with `direction` unset draws left-to-right on the scratch canvas, which is outside the document, also on a right-to-left page (checked 2026-11-20); `direction="rtl"` on the text avoids it.
