# Isolated Shapes: Draw and Composite Only Their Box

- **Status**: ✅ **Implemented** (2026-11-27, built as §3 describes, §11)
- **Date**: 2026-11-26
- **Continues**: `design/done/2026-11-01_isolated_shape_compositing_plan.md` (step 1 built there, §10; this is its step 2, decided there in §6.2: "step 2", with the cost of §4.1)
- **Target Implementation**: `js/elements/shape.js` (`renderIsolated()`, new `prepare()`, `hasBoxBeforeDraw()`), `js/elements/shapes/text.js` (`layout()` out of `draw()`, `prepare()`), `js/elements/shapes/grid.js` (`hasBoxBeforeDraw()`), `tests/index.html` (section "Isolated compositing"), `.agents/ENGINE.md` §6.2 and §6.5, `.agents/KILOPIXEL.md` §4 and §12, `docs/custom-shapes.html`
- **Prototypes** (`design/prototypes/2026-11-26_isolation_box/`): `edge_cases.html` (15 cases, today's version against the box version, pixel by pixel), `test48_variants.html` (what costs the frames of `examples/test48.html`, and the page changes of §2a), `test48_live.html` (the same with switches, for a visible browser), `reach.html` (isolated shapes on every docs and example page), `run.js` (runs them headless)

---

## 1. Problem

`examples/test48.html` runs at about 40 fps on a laptop with a device pixel ratio of 2, although only a few shapes move. Measured with `test48_variants.html` (headless Chrome, Intel Iris Xe, stage 798 × 798 CSS px; the frame rates vary between runs, so each row is two runs):

| Variant | fps at DPR 2 | fps at DPR 3 | Engine time per frame |
|---|---|---|---|
| The page as it is | 42–57 | 21–23 | 1.8–3.2 ms |
| Same shadows, the shapes not isolated (white stroke removed) | 60 | | 1.4 ms |
| No shadows | 60 | | 1.7 ms |
| HUD texts static, or the gradients removed | 38–45 | | 3.0–3.3 ms |
| **The box version of this plan (prototype)** | **54–60** | **41–60** | 1.5–3.1 ms |

At DPR 1 every variant reaches 60 fps. The engine's own work is small; the GPU is the limit: each animated isolated shape with a shadow costs about 2–3 ms of GPU time per frame at DPR 2 and about 5 ms at DPR 3 on this laptop (from the frame rates with and without them); a phone's GPU is weaker.

**How common** (`reach.html`, all 82 docs and example pages, 2026-11-26): isolated shapes on 5 pages (10 shapes); with a shadow or a filter, the expensive case, on 4 pages (8 shapes, 7 of them in layers that redraw every frame): `examples/test48.html` (5), `docs/walkthrough.html` (1), `examples/test31.html` (1), `docs/shadow.html` (1, static). Few today, but "a colored shape with an outline and a glow" is a common look, and its cost doesn't show on a DPR 1 screen.

## 2. Cause

Five shapes on the animated layer have a fill, a stroke and a shadow, so they are isolated (KILOPIXEL.md §4). Step 1 draws an isolated shape into a scratch canvas **the size of the layer** and composites the whole scratch canvas onto the layer with the shape's shadow. The canvas computes a shadow from the whole image it draws: at DPR 2 that is a blur over 1596 × 1596 pixels, five times per frame, instead of five areas of about 120 × 120. A `filter` works on the whole image the same way.

Step 1's measurement (isolation plan §4.1) used `mask="xor"` without shadows and found the box worth it only from about 50 isolated shapes. With shadows or filters a few shapes are enough. Before step 1 (2026-11-20) such shapes were drawn directly: cheap, with the stroke's shadow on the fill. This plan keeps step 1's correct picture and removes the cost step 1 added.

### 2a. Changes to the Page Instead (Measured, Not Proposed for the Engine)

| Variant of `test48` (DPR 3) | fps | Isolated |
|---|---|---|
| The page as it is | 21–23 | 6 |
| The triangle and the complementary axis each in a layer of its own, rotated as a layer | 22 | 6 |
| Each shadowed node split: the fill with blend and glow, a separate white ring without them | 54 | 1 |
| The same, and the triangle polyline split into fill and outline | 60 | 0 |
| Split, and the rotating layers | 50 | 0 |

- **Rotating layers don't help:** a layer's `rotate` is drawn on its canvas like a group's (only `alpha`, `blend` and `filter` are CSS), so the shapes stay isolated, and every extra layer is one more canvas to clear and composite.
- **Splitting the nodes** removes the isolation and gives 60 fps. With the fill grown by half the ring's width (the glow keeps its size), about 18,000 of 2.5 million pixels differ, all at the nodes (a one-pixel rim at the ring's outer edge, the glow's intensity), at most 71 / 255. It works today, but every author would have to know it; the engine fix helps every page, and `test48` can stay as it is, a realistic test of this case.

## 3. Proposal

`renderIsolated()` works on the shape's **device box** instead of the whole layer, computed before drawing:

1. **Prepare:** `prepare(ctx)` runs on the scratch context, inside its `save()` / `restore()`, so state it sets (a font) doesn't leak to the next isolated shape. Empty in `pxl.Shape`; in `Text` it is `layout(ctx)` (item 6).
2. **The box:** the shape's hit box (`getHitBox()`: `getBoundingBox()`, or for a smooth polyline its points and handles) padded by `hitPadding()` (half the stroke, the miter, square caps, arrowheads) plus 1 device pixel for antialiasing, its four corners through the global matrix × `u` × DPR, rounded outwards to whole pixels and clamped to the canvas. Shadows and filters need no margin: they apply at the composite step, outside the scratch canvas, as in step 1.
3. **Draw:** clear only `box width × box height` at the scratch canvas's origin, and draw the shape with its transform shifted by the box's corner (`setTransform(…, e − left, f − top)`).
4. **Composite:** `drawImage(scratch, 0, 0, w, h, left, top, w, h)` with the identity transform and the compositing state, as in step 1.
5. **The whole area, as in step 1**, where the box isn't known before drawing: `hasBoxBeforeDraw()` returns `false` for a shape without its own box (`needsExactHitTest()`: a custom shape without `getBoundingBox()`) and for the grid, whose box is the visible stage area anyway (it computes it in `draw()`), so the box would gain nothing.
6. **Text:** its box comes from `measureText()`, which needs a context with the font set, so today it is computed in `draw()`, from three caches (font string, lines, box). `layout(ctx)` takes those three steps out of `draw()`; `draw()` calls it first, as now, so the direct path doesn't change and measures nothing more (the caches are current). On the isolated path, `prepare()` calls it on the scratch context, so the box is current before it is needed: animated text (`round(t * 8)`) is never cut, and nothing is drawn twice. Measuring and drawing use the same context, so the box matches the drawing (also with the known limit that isolated text without `direction` draws left-to-right there). An empty text sets an empty box (nothing to draw).
7. **An empty box** (zero size, `NaN`, entirely off the canvas): nothing is drawn or composited. Step 1 drew such a shape into the scratch canvas and composited transparent pixels: the same picture.

Why it stays correct without clearing the whole scratch canvas: a shape composites only its own box, which it cleared first. Pixels a shape drew outside its box stay in the scratch canvas but are never composited, and the next shape clears its own box before drawing.

*2026-11-27:* the first version of this plan (2026-11-26) computed the box after drawing again and drew a second time when it had grown (for text and grid). Replaced by `layout()` for text and the whole area for the grid: no second pass, no union of boxes, about 0.4 KB less (§6).

## 4. Edge Cases (checked 2026-11-26)

`edge_cases.html` draws each case with step 1's `renderIsolated()` and with the box version and compares the layer pixel by pixel (premultiplied):

| Case | Software drawing, DPR 1 and 2 | GPU, DPR 2 |
|---|---|---|
| `mask` `destination-in`, `copy`, `destination-atop`, `source-out` (these erase the layer outside the image) | identical | ≤ 1 / 255 in ≤ 5 pixels |
| `mask` `source-in`, `xor` | identical | ≤ 1 / 255 in ≤ 2 pixels |
| Shadow offset far (500, 300); a shape off the canvas whose shadow falls inside | identical | ≤ 1 / 255 |
| `filter="blur(12)"` in a rotated, zoomed group; `dropShadow()` | identical | ≤ 2 / 255 in 65 pixels |
| Smooth closed polyline with `blend="multiply"`; a line with two arrowheads and a shadow | identical | identical |
| Two-line text with a shadow, then a longer three-line text | identical | identical |
| Grid with labels and a shadow; a custom shape without `getBoundingBox()` | identical | identical |

(The text and grid rows used the first version's second pass. With §3 the grid takes the whole area, as in step 1, and the text's box comes from `layout()` before drawing: the build checks text again, §7.)

- **The erasing masks still erase:** the canvas treats the area outside the drawn image as transparent for these modes, so copying only the box changes nothing.
- **The GPU differences** are rounding (a blur or a texture of another size), the same order step 1 accepted (isolation plan §10: up to 16 / 255 for shadows).
- **A shape off the canvas** whose shadow falls inside loses its shadow in both versions: the scratch canvas has the layer's size in step 1 too. Not a change.
- **Not covered by the box** (a contract that already holds): paint beyond `getBoundingBox()` + `hitPadding()`. A custom shape that paints there is cut when it is isolated. Its hit testing already misses those parts, and its gradients don't reach them.

## 5. Performance in the Frame Loop

Per isolated shape and frame, only while its layer redraws (since step 2 of `design/2026-11-20_evaluation_model_plan.md` that is only when something in the layer changed):

| | Step 1 | Box version |
|---|---|---|
| CPU | `clearRect` + `drawImage` of the whole layer (cheap calls) | the same calls, plus the box once: `getHitBox()`, `hitPadding()`, 16 multiply-adds, 8 `min` / `max`, 4 roundings (well under 1 µs; a smooth polyline's hit box walks its segments, O(points), like its drawing); for text one `layout()` call, which only compares its cache keys when nothing changed |
| GPU: clear, copy, shadow, filter | the whole layer (2.5 million pixels at DPR 2 and 798 px) | the box (a node of `test48` at DPR 2: about 50,000 pixels, 2 %) |
| Allocation | none | none: the box is four local numbers, the corners are unrolled (the prototype's array literals allocate and are not kept) |
| Drawing passes | one | one |
| Worst case | | a shape as large as the layer (a full-screen rect): the same pixels as step 1, plus the box math; the grid and shapes without a box: exactly step 1 |

- **Expected:** `test48`: 42–57 → 54–60 fps at DPR 2, 21–23 → 41–60 at DPR 3 (prototype). Step 1's bench (isolation plan §4.1, 100 isolated shapes with `mask="xor"`, no shadows): 26 → 34–36 fps, as measured there with the box.
- **The CPU side doesn't change measurably:** in the prototype the engine time per frame of `test48` stayed within the run-to-run variation.

## 6. Code, Lines and Size

Sketched as engine code and minified with the build's Terser settings (`scratch/isolation_box/new_code_simple.js` and `new_code.js` (not kept)):

| | Source | Minified |
|---|---|---|
| Step 1 `renderIsolated()` | 27 lines | 512 bytes |
| First version (box after drawing again, a second pass) | 72 lines | 1,459 bytes |
| **This version** (`renderIsolated()` with the box, `hasBoxBeforeDraw()`, comments included) | 51 lines | 1,066 bytes |

- **Lines:** about +24 in `shape.js` (the box and the hook), +3 in `grid.js`, about +6 in `text.js` (`layout()` and `prepare()`; the three cache steps move out of `draw()` unchanged): about +35 in all.
- **`pxl.min.js`:** about +0.65 KB, 70.43 → about 71.1 KB, so `~71KB` in `docs/installation.html` and the header of `.agents/KILOPIXEL.md` (CLAUDE.md "File size after a build"). Gzipped about +0.2 KB, 21.21 → about 21.4 KB (`~21KB`).

## 7. Tests (`tests/index.html`, section "Isolated compositing")

The existing 8 tests of step 1 stay; they read pixels of isolated shapes and must pass unchanged. New:

1. **Only the box is composited:** a spy on the layer's `drawImage()` for an isolated circle (r 50) on a 1000-unit stage: the copied width and height are the circle's device box plus the padding, not the canvas size.
2. **Erasing masks still erase:** an ellipse with fill, stroke and `mask="destination-in"` over a full-width rect: a pixel of the rect far outside the ellipse is transparent.
3. **A far shadow:** a circle with fill, stroke and `shadowx="400"`: a pixel in the shadow, far outside the circle's box, is dark.
4. **A filter beyond the box:** a rect with fill, stroke and `filter="blur(12)"`: a pixel just outside the rect's box is partly covered.
5. **Text gets its box before drawing:** an isolated two-line text with a shadow, drawn; then given a longer third line: the next frame shows the third line (a pixel in it is painted) and copies a larger box. The same for a wrapped text (`width`), a text with fill and stroke, and one squeezed by `maxwidth`.
6. **Text measures nothing more:** `measureText()` calls of an isolated, unchanged text over 10 frames: none after the first (`layout()` finds its caches current).
7. **The whole area where the box isn't known:** a custom shape without `getBoundingBox()` and an isolated grid copy the whole canvas.
8. **An empty box** (a rect with `w="NaN"`, isolated; an empty isolated text): nothing is composited, no warning.
9. **No state leaks from `prepare()`:** after an isolated text, a custom shape that reads `ctx.font` on the scratch canvas sees the default.

Plus the page sweep pixel by pixel against the build before (`design/prototypes/2026-11-20_custom_shapes/phase2/run.js pixels`, software drawing): identical except unstable layers.

## 8. Docs and Reference

- `.agents/KILOPIXEL.md` §4 "Isolated shapes": the cost sentence measured again (with the box, the GPU cost depends on the shape's size, not the layer's; the grid and custom shapes without a box keep the old cost). §12: `getBoundingBox()` also limits what an isolated custom shape paints (§4 above), and `prepare(ctx)` if a custom shape needs to measure before its box is known.
- `.agents/ENGINE.md` §6.2: the box, `prepare()`, `hasBoxBeforeDraw()`, the fallback; §6.5 Text: `layout()`.
- `docs/custom-shapes.html`: one sentence in the `getBoundingBox()` row: paint beyond the box and `hitPadding()` is cut when the shape is isolated.
- No other docs page changes: the pictures are the same.

## 9. Decisions

Decided 2026-11-27 as recommended.

| | Question | Recommended |
|---|---|---|
| D1 | The box: hit box + `hitPadding()` + 1 device pixel (as hit testing), or only `getBoundingBox()` + half the stroke | the hit box with `hitPadding()`: one definition shared with hit testing, covers miters, square caps, arrowheads and a smooth polyline's handles |
| D2 | Text: its box through `layout()` before drawing (§3 item 6), or the whole area like the grid | `layout()`: isolated text is common (every multi-line or wrapped text, outlined labels), and with a shadow it has the full cost today |
| D3 | A shape without its own box, and the grid | the whole area, as in step 1 |
| D4 | GPU rounding differences up to 2 / 255 at the edges of blurs and filters (§4) | accept, as in step 1 |

## 10. Steps

1. Decide D1–D4; its TODO item to 🟢.
2. `Text.layout()` out of `draw()` (the direct path must stay pixel-identical: the text tests and `render.html`); then `renderIsolated()` with the box, `prepare()`, `hasBoxBeforeDraw()`; the tests of §7; `node build.js`; the sizes (§6); `node tools/run_tests.js`.
3. Measure: `test48_variants.html` at DPR 2 and 3, step 1's bench (`design/prototypes/2026-11-01_isolated_shape_compositing/isolation_frames.js`), the page sweep pixel by pixel.
4. Reference and docs (§8); a "Built" section here; its TODO item removed; this plan to `design/done/`.

## 11. Built (2026-11-27)

- **`js/elements/shapes/text.js`:** `layout(ctx)` holds the three cache steps that were in `draw()` (font string, lines, box) and returns `false` for an empty text; `draw()` calls it first, then draws. `prepare(ctx)` returns `layout(ctx)`.
- **`js/elements/shape.js`:** `renderIsolated()` calls `prepare(scratch)` inside the scratch canvas's `save()` / `restore()`, computes the device box (`getHitBox()` padded by `hitPadding()`, the four corners through the global matrix × `u` × DPR, unrolled, rounded outwards with one more device pixel, clamped to the canvas), returns for an empty or `NaN` box, clears and draws only the box, and composites it with `drawImage(scratch, 0, 0, w, h, left, top, w, h)`. `prepare(ctx)` (default `true`) and `hasBoxBeforeDraw()` (default: `!needsExactHitTest()`) are new.
- **`js/elements/shapes/grid.js`:** `hasBoxBeforeDraw()` returns `false`.
- **Code:** +63 / −14 lines in `js/`, comments included. `pxl.min.js` 70.43 → 71.16 KB (+0.73 KB, estimated +0.65), gzipped 21.21 → 21.49 KB; the docs say `~71KB`, `~21KB gzipped`.

**Deviations from §3, decided while building:**
- **The antialiasing pixel** is added in device pixels after the transform (`floor() − 1`, `ceil() + 1`), not as 1 / `k` units before it: in shape units it would shrink below a pixel under a small `zoom`. The prototype added a whole unit, which is more than needed.
- **The box is four local numbers** in `renderIsolated()`, not a `pxl._isolationBox` array (§6 first sketched one): no allocation either way, and no shared state.
- **`prepare()` returns whether there is anything to draw** (§3 item 6 said an empty text "sets an empty box"): zeroing the text's cached box would break its cache when the same text comes back, since the cache keys don't change.

**Tests** (`tests/index.html`, "Isolated compositing", "isolated box: …"), 169/169 pass, the 8 tests of step 1 unchanged:
- only the box is composited: a circle with r 50 copies about 70 px of a 500 px layer;
- `mask="destination-in"` still erases the layer far outside the ellipse;
- a shadow 400 units away and a `blur(12)` filter reach beyond the box;
- a text's box comes from its layout before drawing: after it grows to three lines, wraps (`width`), is squeezed (`maxwidth`) and gets a stroke, the copied area covers it, and its third line is painted;
- an unchanged isolated text calls `measureText()` no more in 10 frames;
- a custom shape without `getBoundingBox()` and an isolated grid copy the whole layer;
- an empty box (`w="NaN"`, an empty text) composites nothing and warns nothing;
- after an isolated text, the next isolated shape sees the scratch canvas's default font.

The text test first failed because of the test: the grown text reaches above the canvas, where the box is clamped, and with the alphabetic baseline a text grows upwards, so its third line sits on the original baseline. Both are fixed in the test.

**Measured:**
- **Pages pixel by pixel** (`design/prototypes/2026-11-20_custom_shapes/phase2/run.js pixels` against `e703cdf`, the build before this change, software drawing): 82 pages, 173 stages, 306 layers; 305 identical. `examples/test48.html`'s animated layer: 31 pixels differ by at most 5 / 255 (the edge of a shadow's blur). Hit testing identical at 535,732 points.
- **`examples/test48.html`** (`test48_variants.html`, HEAD's engine and the new build alternating, two runs each): at DPR 3 22.7–23.7 → 56.3 fps, engine time per frame 2.7–4.4 → 1.7–1.9 ms; at DPR 2 50.7–56.3 → 56.3–57 fps (the GPU was faster that day than when `test48` showed about 40 fps; at DPR 3 the effect shows in full).
- **The prototypes** compare their own box version with the engine's `renderIsolated()`, which is the box version itself since this build: to repeat the measurements, load the engine of `e703cdf` (`git show e703cdf:dist/pxl.min.js`).
- **Not run:** step 1's bench (`isolation_frames.js`). It patches its own versions of `renderIsolated()` over the engine; `test48` measures the case this plan is about.

**Reference:** `.agents/ENGINE.md` §6.2 (the box, `prepare()`, `hasBoxBeforeDraw()`), §6.5 (`Text.layout()`); `.agents/KILOPIXEL.md` §4 (the cost sentence) and §12 (`getBoundingBox()` limits an isolated shape, `prepare(ctx)`); `docs/custom-shapes.html` (`getBoundingBox()`, `hitPadding()`, a new `prepare(ctx)` entry). `examples/test48.html` stays as it is (§2a).

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: built (§11); moved to `design/done/`, its TODO item removed.
- 2026-11-27: D1–D4 decided as recommended.
- 2026-11-27: the simpler version: the box only before drawing, text through `layout()` (D2 changed), the grid and shapes without a box keep the whole area; no second pass (§3, §6: +0.65 KB instead of +0.95 KB); §1 how common, §2a the page changes measured (rotating layers don't help, splitting the nodes does).
- 2026-11-26: written after `examples/test48.html` ran at about 40 fps at DPR 2: shadows on isolated shapes blur the whole layer-sized scratch image; edge cases checked (§4), costs and size estimated (§5, §6).
