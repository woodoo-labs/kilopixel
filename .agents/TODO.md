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
- **Status**: 🟡 **Plan Revised** (2026-10-17, ready for review)
- **Reference**: [`design/2026-08-02_declarative_html_output_pxl_out_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-08-02_declarative_html_output_pxl_out_plan.md)
- **Core Features**:
  - Custom Web Component acting as a declarative DOM bridge outside `<pxl-stage>`.
  - Reactively outputs canvas telemetry (e.g., `ref.main.fps` or coordinates) without JavaScript polling.
  - Built on `PxlNode` (Rule A, subscriptions, cleanup); `value` only; DOM write only when the text changes; time expressions not supported (warning).
  - Freezes while its source stage is scrolled out of view → `alwaysrender="true"` on that stage (document in a callout).
  - Accessibility: live values as real DOM text; no automatic `aria-live`.

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

## 17. Shadows on Multi-Part Shapes (Arrowheads, Fill + Stroke)
- **Status**: ⚪ **Noted** (2026-10-15)
- **Problem**: Native shadows (`shadowcolor`, `shadowblur`, `shadowx`, `shadowy`) are applied per canvas draw call. When a shape is drawn with several calls, each part casts its own shadow, and a later part's shadow falls **onto** an earlier part.
  - **Arrowheads**: the shaft (`stroke()`) and the heads (`drawArrows`, one `fill()` / `stroke()`) are separate calls → visible dark band where the shaft enters the arrowhead.
  - Likely the same for **fill + stroke** on any shape (`applyStyle`: `fill()` then `stroke()` → the stroke's shadow falls on the fill) and for `<pxl-text>` with fill and stroke. To be verified.
  - Not affected: overlaps **within one path** (e.g. polyline corners) — a single `stroke()` casts one shadow.
- **Possible Fix**: two passes only when a shadow is set: draw all parts with the shadow, then draw them again without shadow on top (shadows end up underneath everything). Doubles the draw calls, but only for shapes with a shadow.
- **Workaround Today**: `filter="dropShadow(...)"` on the `<pxl-layer>` instead of `shadowcolor` on the shape — the layer casts one shadow of the combined silhouette.

## 18. Attribute Defaults & Canvas State Isolation
- **Status**: 🟢 **Implemented** (2026-10-17)
- **Reference**: `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md`
- **Problem Solved**: bare attributes (`''`) and removed attributes (`null`) were stored as-is. Bare `hidden` / `closed` didn't work (bare `smooth` did), removed `scale` / `alpha` / `strokewidth` made shapes vanish, removed `miterlimit` / text `align` leaked from the previous shape, and removing an `on*` handler threw a TypeError.
- **Rule A**: bare boolean attribute = `true`; bare or removed other attribute = class default (static `defaults` per class, resolved in `pxl.compileAttribute`).
- Always save / restore per shape was split off → §19.

## 19. Always `save()` / `restore()` per Shape
- **Status**: 🟢 **Decided: adopt** (2026-10-17, implementation pending; plan §5.4)
- **Reference**: `design/2026-10-17_always_save_restore_plan.md`
- **Idea**: wrap every shape in `ctx.save()` / `ctx.restore()`, not only shapes with transforms or compositing, so no code path can leak canvas state into the next shape. Simplifies `Shape.render()`, `drawArrows` and `Grid.draw`.
- **Measured**: real pages within noise; worst case 2,000 bare animated lines +1.3 ms per frame (+42%), still 60 fps. A careless custom shape (e.g. `globalAlpha` not reset) fades the whole layer today; always save contains it.
- **Reasoning**: simpler engine code (no `hasStateChanges` list to keep in sync with `applyContextState`), safety for custom shapes, cost only outside the target use. Criterion revised from "worst case < 5%" to "real pages within noise, worst case still 60 fps".
- **Next Step**: implement (plan §6).

## 20. Shape Authoring (Derived Attributes, Class Fields, Custom Animation)
- **Status**: 🟡 **Proposed** (2026-10-17, no code changes yet)
- **Reference**: `design/2026-10-17_shape_authoring_plan.md`
- **Goal**: writing a shape (built-in or user-made, e.g. a separate `star.js` with `class Star extends Shape`) needs only `static defaults`, `draw(ctx, u)` and `getBoundingBox()`. A prototype Star already works with today's engine.
- **Changes**: derive `observedAttributes` from `static defaults` (event handlers appended by `Shape`, `isHovered` / `isPressed` moved out of defaults, Polyline `points: ''`, lowercase-key warning); class fields instead of constructors (except Layer); `draw(ctx, u)` without `t` (hit testing calls `draw()` with `t = 0`).
- **Custom animation (note)**: time belongs in attribute expressions. Pattern A: `spin="t * 180"` in the HTML. Pattern B: internal animated value via `pxl.compileAttribute` (internal API, a public helper like `this.animate()` later).
- **Depends on**: §19 (always save / restore) before publishing a "Custom Shapes" docs page — one careless user shape fades the whole layer until always save is implemented.

## 21. Bundle Scope: No Global Names Except `pxl`
- **Status**: 🟢 **Implemented** (2026-10-18: pure namespace pattern, build check, `--keep-classnames`)
- **Reference**: `design/2026-10-17_bundle_scope_plan.md`
- **Problem**: the bundle declares 13 global class names (`Stage`, `PxlNode`, `Layer`, `Group`, `Shape`, `Circle`, `Ellipse`, `Rect`, `Line`, `Polyline`, `Text`, `Grid`, `Variable`). User scripts declaring the same name at top level (`class Circle {}`, `const Line = 1`) fail with a SyntaxError, and `Text` hides the DOM's `Text` (`textNode instanceof Text` → false).
- **Done (2026-10-17)**: the 5 internal helper globals (`len`, `mathProps`, `driverNames`, `dummyCanvas`, `_parseStops`) are cleaned up (loop-local, inlined, or `pxl._parseStops` / `pxl.dummyCtx`).
- **Fix**: pure namespace pattern like `pxl.InteractionEngine`: `pxl.Line = class Line extends pxl.Shape { … };` for all 13 classes, `customElements.define('pxl-line', pxl.Line)`, remove `window.PxlNode`, build check in `build.js` that fails on any top-level declaration, keep class names in Terser (`--keep-classnames`). An IIFE wrapper was considered and not chosen.
- **Decision**: stay a classic script, no ES module (no JavaScript API to import; modules are deferred and don't load from `file://`; zero build step). An extra `pxl.mjs` only if npm / TypeScript users need it later.

## 22. Polyline Optimization (Parser, Point Storage, Edge Cases)
- **Status**: ⚪ **Backlog** (2026-10-19)
- **Reference**: `design/2026-10-18_polyline_optimization_plan.md` (priority table at the top)
- **Done (2026-10-19)**: `setAttribute('points', …)` updates `ref.<id>.pN` readers (broadcast after a points change; only keys beyond the new count are deleted). `ref.<id>.pN` is internal (`.agents/KILOPIXEL.md`); the public docs recommend a `<pxl-var>` read by both shapes.
- **Small fixes, do when touched**: arrowhead points right when the first / last two points are identical; all X (or all Y) non-finite + gradient throws in `createGradient`; warnings for typos in `points` (missing / extra values, unbalanced parentheses).
- **Deferred**: point storage in numeric arrays (measured ≈ 8 µs per frame for 500 points, a micro-optimization) and the measurement-gated phase 3 items.

## 23. Regular Polygon & Star Shape (`<pxl-polygon>`)
- **Status**: 🟡 **Proposed** (2026-10-19, no code changes yet)
- **Reference**: `design/2026-10-19_polygon_star_shape_plan.md`; prototypes `scratch/regular_polygon/test.html` and `relative.html`
- **Idea**: one shape for regular polygons and stars: `sides`, `r`, a relative star amount (`0` = polygon, `1` = spokes, negative = bulges, same look for every number of sides) and `start`. Arbitrary polygons stay `<pxl-polyline closed="true">`.
- **Open decisions** (plan §7): name of the star amount (`indent` proposed; not `star`, which reads like a switch), element name, default `start` (`-90` = first corner up), default `sides`.
- **Sidebar**: the "Polygon" placeholder link was removed (2026-10-19); it comes back with `docs/polygon.html`.

## 24. Docs: Migrate `radial.html` Variables to the `Var` Naming Rule
- **Status**: 🟡 **Open** (2026-10-21)
- **Rule**: `docs/DOCS_STANDARDS.md` §5 "Variables": entity is always `Var`; input variables set by a control are numbered (`sec1Var1`, controls `sec1Var1Input` / `sec1Var1Val`, meaning in an HTML comment); computed variables are named (`sec3ex1VarTargetX1`). Code marks keep naming the shape attribute. Snippet variables keep short descriptive names.
- **Done (2026-10-21)**: polyline, blend, text, conic, walkthrough, linear (75 variables). Migrated with `scratch/var_migration/migrate.js`, verified with `scratch/var_migration/verify.html` (old vs. new page: same control sequence, all values identical, no errors, no missing IDs).
- **Open: `radial.html`** (45 variables, 178 `ref.*` uses). Its bottom script builds IDs from parts (`${sec}DirX${radiusKey}`, `${sec}${radiusKey}`, `${sec}Grad${radiusKey}Input`), so a text replacement would break it: the script has to be rewritten to use the new names (e.g. a lookup table per section). Sliders there are also named differently from their variables (`sec1ex1GradR1Input` sets `sec1ex1R1`).
- **Then**: run `migrate.js` (dry run first) and `verify.html` with `radial.html` added to the page list.
