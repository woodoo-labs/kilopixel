# Kilopixel — TODO & Roadmap

## 1. Native SVG Path2D & Vector Sprites (`<pxl-path>`)
- **Status**: 🟢 **Design Complete & Ready for Implementation**
- **Reference**: [`design/2026-09-30_path_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-30_path_element_plan.md)
- **Core Features**:
  - Direct integration with native browser `Path2D` API for sub-1 KB bundle footprint.
  - Native copy-paste support for SVG icons (Figma, Lucide, Heroicons, Material, FontAwesome).
  - Dual-format `viewbox` (space-separated string `"0 0 24 24"` or array `[0, 0, 24, 24]`).
  - First-class SVG vector sprite-sheet support via dynamic array `viewbox="[ref.frame.value * 24, 0, 24, 24]"`.
  - Non-scaling stroke normalization (`strokewidth / avgScale`) and 9-point anchor alignment.
  - Multi-path and duotone composition via `<pxl-group>` or sub-path `M` (MoveTo) concatenation.

## 2. Compound Vector Clipping Element (`<pxl-clip>`)
- **Status**: 🟢 **Design Complete & Ready for Implementation**
- **Reference**: [`design/2026-09-29_pxl-clip_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-29_pxl-clip_element_plan.md)
- **Problem Solved**: Fixes the Canvas 2D bug where applying a `mask` to a shape with both a `fill` and `stroke` obliterates the cutout.
- **Core Features**:
  - Dedicated structural container element `<pxl-clip>` mapping to native `ctx.clip()`.
  - Supports compound path unions, `fillrule="evenodd"` boolean holes, and nested intersection clipping without offscreen canvas buffers.

## 3. Animation, Easing & Physics Expansion (`tween`, `ease`, `spring`)
- **Status**: ⚪ **Concept Stage**
- **Motivation**: Current time drivers are strictly periodic loops (`loop`, `wave`, `bounce`). Interactive UIs need one-shot animations and smooth organic state transitions.
- **Proposed Additions**:
  - **One-Shot Tweens (`tween(duration, [ease], [delay])`)**: Progresses 0 to 1 once and clamps at 1.0 forever (essential for entrance/exit animations).
  - **Penner Easing Suite (`ease('back', p)`, `ease('elastic', p)`)**: Adds overshoot, bounce decay, and exponential curves beyond basic `glide()`.
  - **Stateful Physics Springs (`spring(target, [stiffness], [damping])`)**: Eliminates instant snapping on reactive state changes (e.g. `ref.btn.isHovered ? 1.2 : 1.0`) by maintaining zero-GC velocity state per element attribute.
  - **Angle & Vector Helpers**: `deg(rad)` and `rad(deg)` to resolve the degrees vs. radians boundary ergonomically.

## 4. Evaluate Degrees vs. Radians Consistency
- **Current Status**: Mixed angular unit boundary:
  - All Kilopixel attributes use **Degrees** (`rotate`, `start`, `end`, `sweep`, `skewx`, `skewy`).
  - All expression Math functions use **Radians** (`sin`, `cos`, `tan`, `atan2`).
- **Resolution Plan**: Keep current hybrid behavior (best ergonomics for declarative HTML), but inject `deg(rad)` and `rad(deg)` helpers into `pxl.scope` as part of the animation expansion.

## 5. Implement `<pxl-out>` Declarative HTML Output Component
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-08-02_declarative_html_output_pxl_out_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-08-02_declarative_html_output_pxl_out_plan.md)
- **Core Features**:
  - Custom Web Component acting as a declarative DOM bridge outside `<pxl-stage>`.
  - Reactively outputs canvas telemetry (e.g., `ref.main.fps` or coordinates) without JavaScript polling.

## 6. Stage-Level `<pxl-var>` Execution
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md)
- **Problem Solved**: Direct child `<pxl-var>` elements under `<pxl-stage>` currently do not evaluate during animation frames.
- **Proposed Solution**: Update `PxlStage` to register direct `<pxl-var>` children and evaluate animated variables before the layer render loop, avoiding unnecessary empty `<pxl-layer>` buffers.

## 7. Declarative Math Plotting Element (`<pxl-plot>`)
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-09-07_plot_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-07_plot_element_plan.md)
- **Core Features**:
  - Dedicated shape element for high-performance plotting of functions ($y = f(x)$) and parametric curves ($x = f(v), y = g(v)$).
  - Upward $+Y$ mathematical orientation, 1:1 isotropic scaling, decoupled domain intervals, and pre-allocated `Float32Array` vertex caching.

## 8. Layer-Level FPS Throttling (`maxfps`) & Granular Profiling
- **Status**: 🟡 **Plan Drafted** — needs a dedicated, in-depth session
- **References** (two overlapping plans, to be merged in that session):
  - [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md) — stage-level `<pxl-var>` **and** `maxfps`, per-layer metrics.
  - [`design/2026-09-14-layer-throttling.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14-layer-throttling.md) (revised 2026-09-15) — `maxfps` only, more detailed (stage gate, baton relay, keep-alive timer, cross-layer variables, frame counting).
  - The stage-level `<pxl-var>` part could be split off as its own topic.
- **Core Features**:
  - Add `maxfps` attribute to `<pxl-layer>` to throttle secondary layers (e.g. background effects to 24 FPS, clocks to 1 FPS).
  - Add per-layer profiling telemetry (`layer.fps`, `layer.renderAvg`).
- **Performance monitor** (found 2026-10-15): values freeze on idle pages instead of dropping to `0`, and `fps` counts "frames since the last publish" rather than per second. Details and a possible fix in `design/2026-09-14-layer-throttling.md` → Performance Metrics → "Known Issue: Monitor Freezes When Idle".

## 9. Raster Bitmaps & Complex SVG Graphics (`<pxl-image>`)
- **Status**: ⚪ **Concept Stage**
- **Motivation**: Complete the visual asset suite by allowing developers to load raster images (PNG, JPEG, WebP) and complex multi-color SVGs directly into the canvas via native `ctx.drawImage()`, with aspect-ratio fitting (`contain` / `cover`) and anchor transforms.

## 10. Evaluate `map()` Utility Retention vs. API Pruning
- **Current Status**: Open design question
- **Background**:
  - `pxl.scope.map(v, inMin, inMax, outMin, outMax)` provides linear range remapping (familiar from Processing/p5.js).
  - It is currently only used in `examples/test31.html` for distance-to-style mapping, but all such calculations can be written using `lerp(a, b, t)` with normalized progress or raw arithmetic.
- **Options to Investigate**:
  - **Option A (Prune `map()`)**: Remove `map()` from `pxl.scope` to minimize the standard library footprint, eliminate redundant ways of interpolating values alongside `lerp()`, and prevent naming confusion with `Array.prototype.map` or coordinate mapping. Migrate `examples/test31.html` to `lerp()`.
  - **Option B (Retain `map()`)**: Keep `map()` as a convenient 1-line helper for creative coders who want to avoid manual `/ (inMax - inMin)` normalization algebra inside HTML attribute strings.

## 11. Evaluate Default Text Alignment (`align` & `baseline`)
- **Current Status**: Open architectural question
- **Background**:
  - Currently, `<pxl-text>` inherits native HTML5 Canvas defaults: `align="start"` and `baseline="alphabetic"`.
  - In contrast, other geometric primitives in Kilopixel (`<pxl-circle>`, `<pxl-ellipse>`, `<pxl-rect>`) default to centering around their `(x, y)` coordinates.
  - Setting defaults to `align="center"` and `baseline="middle"` would be more consistent with other shapes (*"in Kilopixel, `(x, y)` is always the center of the shape"*), making labels inside buttons, circles, and rotating text effortless.
- **Trade-offs & Considerations**:
  - **Visual Regressions**: Numerous existing text shapes across documentation and examples lack explicit attributes and rely on `start`/`alphabetic`. Labels manually positioned with hand-tuned `y` coordinates (like `y="500"`) would shift vertically downward by ~14px with `middle`, causing visual misalignment.
  - **Divergence from Native Canvas**: It would diverge from standard `CanvasRenderingContext2D` defaults (`textAlign = 'start'`, `textBaseline = 'alphabetic'`).
- **Decision for Now**: Retain `align="start"` and `baseline="alphabetic"` for 100% backward compatibility and native Canvas parity. Revisit if a breaking major version transition is planned.

## 12. Dedicated Arrowheads Documentation Page (`arrows.html`)
- **Status**: 🟡 **In Progress** (updated 2026-10-15)
- **Location**: Sidebar / Navigation category **"Line Styles"** in `docs/js/layout.js`.
- **Motivation**: Arrowheads (`arrowstyle`, `arrowstart`, `arrowend`) are supported across multiple shapes (`<pxl-line>`, `<pxl-polyline>`, `<pxl-circle>`, and `<pxl-ellipse>`). Individual shape pages feature practical, contextual examples, while a centralized hub page (`docs/arrows.html`) under Line Styles will provide the comprehensive reference for arrow geometry, scaling formulas, custom arrow styles, and styling.
- **Done**:
  - Navigation entry, sections 1. Sizing, 2. Styles, 3. Line Caps (line / polyline / elliptical arc with grey reference strokes), 4. Line Joins (miter / bevel / round, miter limit).
  - Cross-links from `line.html`, `circle.html`, `ellipse.html` (identical "More on Arrowheads" callout).
  - Engine: unified arrowhead geometry (`design/2026-10-14_unified_arrowhead_geometry_plan.md`).
- **Open**:
  - **Design question:** should `filled` arrowheads also follow `linejoin` (rounded/bevelled triangle corners, radius = `strokewidth / 2`), or a future `arrowjoin` that applies to both styles? Today chevrons follow `linejoin`, filled heads are always sharp. Testable in section 4 by switching Arrow Style.
  - "Rules & Edge Cases" section: small arrowheads (narrower than stroke), open paths only (`pie` / `closed` / rings / closed polylines ignore arrows), no `stroke` → no arrowheads, path shorter than both heads.
  - Dashed arrows (chevrons stay solid) and animated dashes / arrowheads.
  - Cross-link `polyline.html` once it exists.

## 13. Fix Stroke Gradient Zero-Dimension Collapse & Degeneracy
- **Status**: 🟢 **Design Complete & Ready for Implementation**
- **Reference**: [`design/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md)
- **Problem Solved**:
  - When linear gradients are applied to the `stroke` of shapes with zero geometric width or height (e.g. horizontal/vertical lines, flat polylines), Canvas 2D linear gradient endpoints collapse to identical coordinates at perpendicular angles ($90^\circ$ and $270^\circ$ for horizontal lines; $0^\circ$ and $180^\circ$ for vertical lines).
  - W3C Canvas 2D spec mandates that zero-length gradients paint nothing, causing the stroked shape to completely disappear.
- **Solution Summary**:
  - Update `Shape.prototype.createGradient` in `js/elements/shape.js` to resolve stroke dimensions against `strokewidth` when `slot === 1` or when raw dimensions are zero.
  - Clamp projection distance to a minimum of $0.001$ with coordinate separation fallback.
  - Update `_gradCache` to track `strokewidth` (`sw`) so slider adjustments properly invalidate cached stroke gradients.

## 14. Shape-Level Paint Order (`paintorder`)
- **Status**: ⚪ **Concept Stage** (decided 2026-10-13: keep current behavior until implemented properly)
- **Visual Comparison**: `scratch/test_paint_order.html` / `scratch/paint_order_comparison.png` (local only, scratch is git-ignored)
- **Background**:
  - Path shapes paint via `applyStyle`: fill, then stroke (outline on top, half of `strokewidth` covers the fill).
  - `<pxl-text>` paints per line, alternating: fill L1 → stroke L1 → fill L2 → stroke L2. Only differs from "all fills, then all strokes" where lines overlap (tight `lineheight` / thick outline) — visually negligible, so not worth changing on its own.
  - The significant visual difference is painting the **stroke under the fill**: glyphs/shapes keep their full form and only the outer half of the outline is visible. This is the standard technique for readable text on busy backgrounds (map labels, subtitles, meme text).
- **Proposed Solution**:
  - Add a Shape-level attribute `paintorder` (`'normal'` default | `'stroke'`), modelled on SVG `paint-order`.
  - `applyStyle` respects it for all path shapes (circle, ellipse, rect, line, polyline, grid).
  - `Text.draw()` switches to two passes (all strokes, then all fills when `paintorder="stroke"`; all fills, then all strokes otherwise), reusing `applyStrokeState()`.
  - Zero-GC: one string comparison per draw; same number of `fillText`/`strokeText` calls.
- **Considerations**:
  - With `paintorder="stroke"` only half of `strokewidth` remains visible — must be documented.
  - Semi-transparent fills will show the stroke underneath (expected, same as SVG).
  - Arrowheads (`drawArrows`) use the stroke style; check how they should behave with `paintorder="stroke"`.
  - Add a docs section/example following `docs/DOCS_STANDARDS.md`.

## 15. Smooth Polyline Spline Quality (`smooth`)
- **Status**: ⚪ **Analyzed, deferred** (decided 2026-10-15: keep current behavior for now)
- **Background**: `<pxl-polyline smooth>` uses a **uniform** Catmull-Rom spline with **clamped** ends (the missing neighbour of the first/last point is the point itself).
- **Observed Issues**:
  - The curve straightens out shortly before the first/last point (end direction is forced onto the chord to the next point). Visible on the section 1 wave in `docs/arrows.html` near `(550, 300)`.
  - Unevenly spaced points cause overshoot and hooks near the ends (short first/last segment, duplicate points, high `smooth` values). Even unevenly spaced **collinear** points run backwards past the start point (e.g. `20,110; 40,110; 280,110`), which round caps or arrowheads can reveal.
- **Tested: "natural" ends** (phantom point `2.5·P1 − 2·P2 + 0.5·P3`, scales with tension automatically): looks better for evenly spaced points, but roughly doubles overshoot and flips end directions for uneven spacing → **not recommended on its own**.
- **Next Idea**: **centripetal** Catmull-Rom (alpha 0.5), which accounts for point distances and avoids loops/hooks with uneven spacing. Costs a few square roots per segment; changes the shape of all smooth polylines, so `smooth` (tension) semantics need re-checking. Possibly combined with natural ends.
- **Test Setup** (local only, scratch is git-ignored): `scratch/arrows/natural_compare.html` (15 cases side by side), `scratch/arrows/natural_metrics.js` (end directions & overshoot), patched engine copy `scratch/arrows/lib_natural.js`.
- **Note**: arrow trimming on smooth polylines (`loadSegment` / de Casteljau) must use the same end formula as the drawing loop if the spline changes.



## 16. Text Measurement Accuracy (`<pxl-text>` Bounding Box)
- **Status**: ⚪ **Known Limitations** (split off from `design/2026-10-13_text_hit_testing_plan.md`, 2026-10-15)
- **Background**: The text bounding box (Tier 3 of `Text.draw()`, via `ctx.measureText()`) is used for gradient placement and, since text hit testing, as the hit area.
- **Issues**:
  - **Late web fonts**: the box is measured with whatever font is available at that moment. If a web font finishes loading later, the font string is unchanged, Tier 1 is not dirty, and the box keeps the **fallback font metrics** until the text changes. Docs pages invalidate layers on `document.fonts.ready`, but that does not reset the text caches.
    - Possible fix: a global font generation counter, raised on `document.fonts` `loadingdone` and compared in Tier 1 (one integer check, no per-frame cost). Open question: the global side effect (listener + invalidating all layers) and how it relates to the docs pages' own `document.fonts.ready` handler.
  - **`maxwidth` squeezing**: `measureText()` ignores the `maxWidth` argument of `fillText()`, so a horizontally compressed line gets a box that is too wide (hit area and gradients).
    - Possible fix (Tier 3): per line, scale `actualBoundingBoxLeft/Right` by `min(1, maxwidth * u / metrics.width)`.
