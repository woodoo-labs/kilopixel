# Isolated Shape Compositing: Fill and Stroke Composite as One

- **Status**: 🟡 **Proposed** (2026-11-01, no code changes yet)
- **Date**: 2026-11-01
- **Related**: `design/2026-11-07_safe_shape_render_plan.md` (built 2026-11-07, same function `Shape.render()`; the base for this plan, §9), TODO §14 `paintorder` (changes the order of the same draw calls; build it after this plan, §9), `docs/DOCS_STANDARDS.md` §1 ("Ghosts of fill-only shapes", the docs rule this removes)
- **Target Implementation**: `js/elements/shape.js` (`render()`), `js/graphics.js` (`applyContextState` split), `js/elements/stage.js` (scratch canvas size), `js/elements/shapes/text.js` and `grid.js` (draw count)
- **Prototypes**: `scratch/mask_fill_stroke.html` (today vs isolated, every mask mode plus alpha, blend, shadow, multi-line text), `scratch/isolation_bench.html` (cost)

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

Users hit this in normal use: a stroked card with a drop shadow, a masked badge with an outline. The docs work around it: `mask.html` uses fill-only shapes, and DOCS_STANDARDS.md needs an extra rule for their ghosts ("a colored outline would look like their own stroke"). `shadow.html` §1 shows it today: the translucent circle with stroke and `shadowblur="15"` has a soft dark band inside its upper edge, the stroke's own shadow.

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

A method `needsIsolation()` on the shape answers this. Shapes compute it from the same values they draw with, so the condition can't drift from the drawing code.

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

Recommendation: (a), with an engine test that compares it against `ctx.getTransform()` for nested, rotated, skewed and zoomed layers and groups.

## 4. Cost

Measured with `scratch/isolation_bench.html` in the desktop app's browser pane: layer 1000 × 600 at DPR 2 (2000 × 1200 px), ellipse 180 × 120 with fill and stroke, `mask="xor"`, 20 shapes per frame, GPU work included.

| Variant | Per shape |
|---|---|
| Direct (today) | 0.01 ms |
| Isolated, full scratch canvas (clear + `drawImage` of 2000 × 1200 px) | 0.75–0.9 ms |
| Isolated, bounding box only (≈ 380 × 260 px) | 0.35–0.37 ms |

- **Real pages:** `mask.html` has one masked shape, `shadow.html` a few shadowed ones: under 1 ms per frame, and only on frames where the layer redraws.
- **Worst case:** 20 animated, masked, stroked shapes cost 15–18 ms per frame with the full canvas (over budget) and 7 ms with the bounding box.
- **Plan:** implement the full-canvas version first (simplest, always correct), then the bounding-box version as step 2. The bounding box is the shape's `getBoundingBox()` transformed to device space, plus half the stroke width, the miter and the arrowheads. Shadows and filters don't need margin: they are applied at the composite step, outside the scratch.

## 5. What Changes for Users

- Masked, shadowed, filtered and blended shapes with fill and stroke look like their SVG / CSS equivalent. Single-draw shapes look exactly as before.
- `shadow.html` §1: the dark band from the stroke's shadow inside the circle disappears. The page text doesn't mention the stroke, so only the picture changes.
- `mask.html`: the shapes can get a normal fill and stroke (fill 100 at 40 %, stroke 500). The ghosts then follow the standard rule (300, solid), and the "Ghosts of fill-only shapes" note in DOCS_STANDARDS.md goes.
- KILOPIXEL.md: "Blend vs. Masking" and the render path describe isolation; the rendering section names the scratch canvas.

## 6. Open Decisions

### 6.1 `alpha`

Isolating `alpha` is correct (SVG `opacity` is isolated too), but fades are common, and every stroked, filled shape that fades would pay §4 per frame. The artifact is subtle (`scratch/mask_fill_stroke.html`, row "alpha 0.5").

Recommendation: leave `alpha` out for now. It keeps today's per-call behavior, like SVG `fill-opacity` / `stroke-opacity`. Revisit if users notice it.

### 6.2 Bounding Box in Step 1 or Step 2

Recommendation: step 2. The full-canvas version is enough for every docs page and has no margin bugs; step 2 is a measured optimization.

## 7. Tests (`tests/index.html`)

Pixel reads on a small stage, one test per row:

1. `mask="source-in"`, ellipse with fill and stroke over a rect: a pixel in the ellipse's fill inside the rect has the fill color (today: transparent).
2. `mask="xor"`: a pixel in the inner half of the ellipse's stroke, outside the rect, has the stroke color (today: cut out).
3. `shadowcolor` with fill and stroke: a pixel just inside the stroke, where the stroke's shadow fell, has the fill color.
4. Multi-line text with `mask="source-in"` over a rect: both lines are visible inside the rect.
5. Fill-only shape with `mask`: same pixels as before (direct path).
6. Transform copy (§3.4): nested rotated / skewed / zoomed layer and group, isolated shape lands on the same pixels as a direct one.

## 8. Steps

1. Agree on this plan (§6.1, §6.2). Always save / restore, which comes first (§9), was built on 2026-11-07.
2. Split `applyContextState`; add `needsIsolation()` and the isolated path in `Shape.render()`; scratch canvas sized by the layers.
3. Tests §7; `node build.js`; all tests pass.
4. KILOPIXEL.md, TODO.md entry.
5. Docs: `mask.html` shapes with fill and stroke and the standard ghosts; remove the "Ghosts of fill-only shapes" note; check `shadow.html` §1, `blend.html` and `fill.html`.
6. Step 2: bounding-box scratch region, measured with `scratch/isolation_bench.html` again.

## 9. Build Order with Related Plans

Three plans change how a shape's draw calls (fill, stroke, arrowheads, text lines) reach the layer. Built in this order, each one makes the next simpler:

1. **Always `save()` / `restore()` per shape** (`design/2026-11-07_safe_shape_render_plan.md`, built 2026-11-07): `Shape.render()` gets one path, save → transform → draw → restore, instead of the `hasStateChanges` check. The isolated path then only swaps the target of `draw()` (the scratch canvas) instead of adding a third path. The shared scratch canvas also needs the same protection against custom shapes that change canvas state and don't reset it (the `GhostStar` test, `design/archive/2026-10-17_always_save_restore_plan.md` §5.2): a leak there would reach every isolated shape after it.
2. **This plan** (TODO §31).
3. **`paintorder`** (TODO §14, concept): `paintorder="stroke"` draws the stroke first and the fill on top. Without isolation it has the same compositing bug: with a shadow, the fill's shadow falls onto the stroke drawn just before it. With isolation it only swaps two calls inside the scratch canvas, and shadow, mask and filter apply to the finished shape. Shared open questions: arrowheads (§3.1 counts them as an extra draw call; §14 asks how they paint with `paintorder="stroke"`) and semi-transparent fills (§14 "fills show the stroke underneath", here §6.1 `alpha`).
