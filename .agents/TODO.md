# Kilopixel — TODO & Roadmap

Open work only. Done items are removed: the plan's status line, `.agents/KILOPIXEL.md` and git history keep the record.

- **Status words** (same as in the plans): 💬 **Discussion** (ideas, nothing decided) · 🟡 **Proposed** (complete plan, waiting for a decision) · 🟢 **Decided** (agreed, not built yet). Plans also use ✅ **Implemented**, ⚪ **Superseded by** `<file>` and ⚪ **Dropped** (decided not to do it); those have no TODO item.
- **Numbers are stable:** other files refer to items as "TODO §29". A removed item leaves a gap; a new item gets the next free number (next: §37).
- **Plans:** `design/`; superseded, dropped and outdated plans are in `design/archive/`. Workflow: `.claude/CLAUDE.md` → "Plans and TODO". Check: `node tools/check_plans.js`.

## 1. Native SVG Path2D & Vector Sprites (`<pxl-path>`)
- **Status**: 🟡 **Proposed** (2026-09-30)
- **Reference**: `design/2026-09-30_path_element_plan.md`
- **Core Features**:
  - Direct integration with native browser `Path2D` API for sub-1 KB bundle footprint.
  - Native copy-paste support for SVG icons (Figma, Lucide, Heroicons, Material, FontAwesome).
  - Dual-format `viewbox` (space-separated string `"0 0 24 24"` or array `[0, 0, 24, 24]`).
  - First-class SVG vector sprite-sheet support via dynamic array `viewbox="[ref.frame.value * 24, 0, 24, 24]"`.
  - Non-scaling stroke normalization (`strokewidth / avgScale`) and 9-point anchor alignment.
  - Multi-path and duotone composition via `<pxl-group>` or sub-path `M` (MoveTo) concatenation.

## 2. Compound Vector Clipping Element (`<pxl-clip>`)
- **Status**: 🟡 **Proposed** (2026-09-29)
- **Reference**: `design/2026-09-29_pxl-clip_element_plan.md`
- **Problem Solved**: Fixes the Canvas 2D bug where applying a `mask` to a shape with both a `fill` and `stroke` obliterates the cutout (see also §31, which fixes `mask` on such shapes directly).
- **Core Features**:
  - Dedicated structural container element `<pxl-clip>` mapping to native `ctx.clip()`.
  - Supports compound path unions, `fillrule="evenodd"` boolean holes, and nested intersection clipping without offscreen canvas buffers.

## 3. Animation, Easing & Physics Expansion (`tween`, `ease`, `spring`)
- **Status**: 🟡 **Proposed** (`tween`, 2026-10-01); easing, springs and angle helpers: 💬 **Discussion**
- **Reference**: `design/2026-10-01_tween_animation_plan.md` (`tween` only)
- **Motivation**: Current time drivers are strictly periodic loops (`loop`, `wave`, `bounce`). Interactive UIs need one-shot animations and smooth organic state transitions.
- **Proposed Additions**:
  - **One-Shot Tweens (`tween(duration, [ease], [delay])`)**: Progresses 0 to 1 once and clamps at 1.0 forever (essential for entrance/exit animations).
  - **Penner Easing Suite (`ease('back', p)`, `ease('elastic', p)`)**: Adds overshoot, bounce decay, and exponential curves beyond basic `glide()`.
  - **Stateful Physics Springs (`spring(target, [stiffness], [damping])`)**: Eliminates instant snapping on reactive state changes (e.g. `ref.btn.isHovered ? 1.2 : 1.0`) by maintaining zero-GC velocity state per element attribute.
  - **Angle Helpers (`deg(rad)`, `rad(deg)`)**: All Kilopixel attributes use degrees (`rotate`, `start`, `end`, `sweep`, `skewx`, `skewy`), all expression Math functions use radians (`sin`, `cos`, `tan`, `atan2`). Keep this split (best for declarative HTML) and add the two helpers to `pxl.scope`.

## 5. Implement `<pxl-out>` Declarative HTML Output Component
- **Status**: 🟡 **Proposed** (revised 2026-10-17)
- **Reference**: `design/2026-08-02_declarative_html_output_pxl_out_plan.md`
- **Core Features**:
  - Custom Web Component acting as a declarative DOM bridge outside `<pxl-stage>`.
  - Reactively outputs canvas telemetry (e.g., `ref.main.fps` or coordinates) without JavaScript polling.
  - Built on `PxlNode` (Rule A, subscriptions, cleanup); `value` only; DOM write only when the text changes; time expressions not supported (warning).
  - Freezes while its source stage is scrolled out of view → `alwaysrender="true"` on that stage (document in a callout).
  - Accessibility: live values as real DOM text; no automatic `aria-live`.

## 7. Declarative Math Plotting Element (`<pxl-plot>`)
- **Status**: 🟡 **Proposed** (2026-09-07)
- **Reference**: `design/2026-09-07_plot_element_plan.md`
- **Core Features**:
  - Dedicated shape element for high-performance plotting of functions ($y = f(x)$) and parametric curves ($x = f(v), y = g(v)$).
  - Upward $+Y$ mathematical orientation, 1:1 isotropic scaling, decoupled domain intervals, and pre-allocated `Float32Array` vertex caching.
- **Open**: the plan names the plot's own magnification (pixels per math unit) `scale`. Since 2026-10-30 every element has `zoom`, `scalex` and `scaley`, so a plot attribute `scale` beside them would be confusing; find another name before implementing.

## 8. Layer FPS Throttling (`maxfps`), Stage-Level `<pxl-var>` & Performance Monitor
- **Status**: 🟡 **Proposed** — needs a dedicated, in-depth session
- **References** (two overlapping plans, to be merged in that session):
  - `design/2026-09-14_stage_variables_and_layer_throttling_plan.md` — stage-level `<pxl-var>` **and** `maxfps`, per-layer metrics.
  - `design/2026-09-14_layer_throttling_plan.md` (revised 2026-09-15) — `maxfps` only, more detailed (stage gate, baton relay, keep-alive timer, cross-layer variables, frame counting).
- **Layer throttling**: a `maxfps` attribute on `<pxl-layer>` throttles secondary layers (e.g. background effects to 24 FPS, clocks to 1 FPS); per-layer profiling telemetry (`layer.fps`, `layer.renderAvg`).
- **Stage-level `<pxl-var>`**: a `<pxl-var>` directly under `<pxl-stage>` is never evaluated today (only layers render their children). The stage would register its direct `<pxl-var>` children and evaluate animated ones before the layer loop, so no empty `<pxl-layer>` (and canvas) is needed just to hold variables. Could be split off as its own topic.
- **Performance monitor** (found 2026-10-15, confirmed in the code 2026-11-05): values freeze on idle pages instead of dropping to `0`, because `pxl.perf.publish()` only runs inside `stage.render()`; and `fps` counts "frames since the last publish" rather than per second. Details and a possible fix in `design/2026-09-14_layer_throttling_plan.md` → Performance Metrics → "Known Issue: Monitor Freezes When Idle".

## 9. Raster Bitmaps & Complex SVG Graphics (`<pxl-image>`)
- **Status**: 💬 **Discussion** (no plan yet)
- **Motivation**: Complete the visual asset suite by allowing developers to load raster images (PNG, JPEG, WebP) and complex multi-color SVGs directly into the canvas via native `ctx.drawImage()`, with aspect-ratio fitting (`contain` / `cover`) and anchor transforms.

## 11. Evaluate Default Text Alignment (`align` & `baseline`)
- **Status**: 💬 **Discussion**
- **Background**:
  - Currently, `<pxl-text>` inherits native HTML5 Canvas defaults: `align="start"` and `baseline="alphabetic"`.
  - In contrast, other geometric primitives in Kilopixel (`<pxl-circle>`, `<pxl-ellipse>`, `<pxl-rect>`) default to centering around their `(x, y)` coordinates.
  - Setting defaults to `align="center"` and `baseline="middle"` would be more consistent with other shapes (*"in Kilopixel, `(x, y)` is always the center of the shape"*), making labels inside buttons, circles, and rotating text effortless.
- **Trade-offs & Considerations**:
  - **Docs and examples**: Many text shapes rely on `start` / `alphabetic` without setting them. Labels positioned with hand-tuned `y` coordinates would shift by ~14px with `middle` and need explicit attributes or new values.
  - **Divergence from Native Canvas**: It would diverge from standard `CanvasRenderingContext2D` defaults (`textAlign = 'start'`, `textBaseline = 'alphabetic'`).
- **Current decision**: keep `align="start"` and `baseline="alphabetic"` until we decide otherwise. Kilopixel is pre-release, so no backwards compatibility is needed (`.claude/CLAUDE.md`); if the defaults change, before the first release is the cheapest time, afterwards it would be a breaking change.

## 12. Dedicated Arrowheads Documentation Page (`arrows.html`)
- **Status**: 🟢 **Decided** (page in progress, updated 2026-10-15)
- **Reference**: `design/2026-10-14_unified_arrowhead_geometry_plan.md` (geometry); `design/2026-10-15_arrowcap_arrowjoin_plan.md` (💬, arrowhead look)
- **Location**: Sidebar / Navigation category **"Line Styles"** in `docs/js/layout.js`.
- **Motivation**: Arrowheads (`arrowstyle`, `arrowstart`, `arrowend`) are supported across multiple shapes (`<pxl-line>`, `<pxl-polyline>`, `<pxl-circle>`, and `<pxl-ellipse>`). Individual shape pages feature practical, contextual examples, while a centralized hub page (`docs/arrows.html`) under Line Styles will provide the comprehensive reference for arrow geometry, scaling formulas, custom arrow styles, and styling.
- **Done**: Navigation entry, sections 1. Sizing, 2. Styles, 3. Line Caps, 4. Line Joins; cross-links from `line.html`, `polyline.html`, `circle.html`, `ellipse.html` (identical "More on Arrowheads" callout).
- **Open**:
  - **Design question:** should `filled` arrowheads also follow `linejoin` (rounded/bevelled triangle corners, radius = `strokewidth / 2`), or a future `arrowjoin` that applies to both styles? Today chevrons follow `linejoin`, filled heads are always sharp. Testable in section 4 by switching Arrow Style. Discussed in `design/2026-10-15_arrowcap_arrowjoin_plan.md`.
  - "Rules & Edge Cases" section: small arrowheads (narrower than stroke), open paths only (`pie` / `closed` / rings / closed polylines ignore arrows), no `stroke` → no arrowheads, path shorter than both heads.
  - Dashed arrows (chevrons stay solid) and animated dashes / arrowheads.

## 14. Shape-Level Paint Order (`paintorder`)
- **Status**: 💬 **Discussion** (decided 2026-10-13: keep current behavior until implemented properly; no plan yet)
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
- **Related**: build after §19 and §31 (`design/2026-11-01_isolated_shape_compositing_plan.md` §9). Without isolation, `paintorder="stroke"` has the same compositing bug as §31 (with a shadow, the fill's shadow falls onto the stroke drawn before it); with isolation it only swaps two draw calls.

## 16. Text Measurement Accuracy (`<pxl-text>` Bounding Box)
- **Status**: 💬 **Discussion** (known limitations, split off from `design/2026-10-13_text_hit_testing_plan.md` on 2026-10-15)
- **Background**: The text bounding box (Tier 3 of `Text.draw()`, via `ctx.measureText()`) is used for gradient placement and, since text hit testing, as the hit area.
- **Issues**:
  - **Late web fonts**: the box is measured with whatever font is available at that moment. If a web font finishes loading later, the font string is unchanged, Tier 1 is not dirty, and the box keeps the **fallback font metrics** until the text changes. Docs pages invalidate layers on `document.fonts.ready`, but that does not reset the text caches.
    - Possible fix: a global font generation counter, raised on `document.fonts` `loadingdone` and compared in Tier 1 (one integer check, no per-frame cost). Open question: the global side effect (listener + invalidating all layers) and how it relates to the docs pages' own `document.fonts.ready` handler.
  - **`maxwidth` squeezing**: `measureText()` ignores the `maxWidth` argument of `fillText()`, so a horizontally compressed line gets a box that is too wide (hit area and gradients).
    - Possible fix (Tier 3): per line, scale `actualBoundingBoxLeft/Right` by `min(1, maxwidth * u / metrics.width)`.

## 19. Always `save()` / `restore()` per Shape
- **Status**: 🟢 **Decided** (2026-10-17: adopt; implementation pending, plan §6)
- **Reference**: `design/2026-10-17_always_save_restore_plan.md`
- **Idea**: wrap every shape in `ctx.save()` / `ctx.restore()`, not only shapes with transforms or compositing, so no code path can leak canvas state into the next shape. Simplifies `Shape.render()`, `drawArrows` and `Grid.draw`.
- **Measured**: real pages within noise; worst case 2,000 bare animated lines +1.3 ms per frame (+42%), still 60 fps. A careless custom shape (e.g. `globalAlpha` not reset) fades the whole layer today; always save contains it.
- **Reasoning**: simpler engine code (no `hasStateChanges` list to keep in sync with `applyContextState`), safety for custom shapes, cost only outside the target use. Criterion revised from "worst case < 5%" to "real pages within noise, worst case still 60 fps".
- **Related**: build before §31 (isolated compositing builds on the single save → transform → draw → restore path) and §14 `paintorder`; order in `design/2026-11-01_isolated_shape_compositing_plan.md` §9. §20 needs it before a "Custom Shapes" docs page. §36 (draw errors) rewrites the same `Shape.render()` and could be built together with it.

## 20. Shape Authoring (Derived Attributes, Class Fields, Custom Animation)
- **Status**: 🟡 **Proposed** (2026-10-17, no code changes yet)
- **Reference**: `design/2026-10-17_shape_authoring_plan.md`
- **Goal**: writing a shape (built-in or user-made, e.g. a separate `star.js` with `class Star extends Shape`) needs only `static defaults`, `draw(ctx, u)` and `getBoundingBox()`. A prototype Star already works with today's engine.
- **Changes**: derive `observedAttributes` from `static defaults` (event handlers appended by `Shape`, `isHovered` / `isPressed` moved out of defaults, Polyline `points: ''`, lowercase-key warning); class fields instead of constructors (except Layer); `draw(ctx, u)` without `t` (hit testing calls `draw()` with `t = 0`).
- **Custom animation (note)**: time belongs in attribute expressions. Pattern A: `spin="t * 180"` in the HTML. Pattern B: internal animated value via `pxl.compileAttribute` (internal API, a public helper like `this.animate()` later).
- **Depends on**: §19 (always save / restore) before publishing a "Custom Shapes" docs page — one careless user shape fades the whole layer until always save is implemented.

## 22. Polyline Optimization (Parser, Point Storage, Edge Cases)
- **Status**: 🟡 **Proposed** (low priority; measured gains are small)
- **Reference**: `design/2026-10-18_polyline_optimization_plan.md` (priority table at the top)
- **Small fixes, do when touched**: all X (or all Y) non-finite + gradient throws in `createGradient` (covered by §36); warnings for typos in `points` (missing / extra values, unbalanced parentheses).
- **Deferred**: point storage in numeric arrays (measured ≈ 8 µs per frame for 500 points, a micro-optimization) and the measurement-gated phase 3 items.
- **Note**: `ref.<id>.pN` is internal (`.agents/KILOPIXEL.md`); the public docs recommend a `<pxl-var>` read by both shapes.

## 23. Regular Polygon & Star Shape (`<pxl-polygon>`)
- **Status**: 🟡 **Proposed** (2026-10-19, no code changes yet)
- **Reference**: `design/2026-10-19_polygon_star_shape_plan.md`; prototypes `scratch/regular_polygon/test.html` and `relative.html`
- **Idea**: one shape for regular polygons and stars: `sides`, `r`, a relative star amount (`0` = polygon, `1` = spokes, negative = bulges, same look for every number of sides) and `start`. Arbitrary polygons stay `<pxl-polyline closed="true">`.
- **Open decisions** (plan §7): name of the star amount (`indent` proposed; not `star`, which reads like a switch), element name, default `start` (`-90` = first corner up), default `sides`.
- **Sidebar**: the "Polygon" placeholder link was removed (2026-10-19); it comes back with `docs/polygon.html`.

## 25. Refs Across Coordinate Spaces (`toLocal` Point Form, `ref.<id>.points`)
- **Status**: 💬 **Discussion** (2026-10-25, ideas added 2026-10-26; no code changes decided, "keep everything as it is for now")
- **Reference**: `design/2026-10-25_refs_across_spaces_note.md` (hub: index of all related documents in §0, ideas in §7)
- **Finding**: refs (`ref.v.value`, `ref.box.x`, `ref.zig.pN`) are values in the target's space, not positions; only `toLocal()` crosses spaces, and it maps only an element's frame (`x`, `y`, `tx`, `ty`, `rotate`, `scalex`, `scaley`, `skewx`, `zoom`), not points inside it.
- **Works today**: shared space; track one point via `dx` / `dy` + `toLocal(ref, 'tx')`; anchors (`pxl-group` or a drawn / hidden dot) in the shape's space; phantom groups as spatial variables; sizes and angles by composition (`ref.c.r * toLocal(ref.c, 'zoom')`).
- **Possible later**: `toLocal(ref.el, 'x', px, py)` point form; `toLocal(ref.zig, 'pN')` sugar (relative mode); lazy evaluated `ref.zig.points`; list-expression rule for `points="ref.zig.points"` with a quote-aware parser (could reuse `pxl.splitStringLiterals` from §34).
- **Docs**: `ref.<id>.pN` stays internal; teach the patterns in the walkthrough's `toLocal` section.
- **Ideas 2026-10-26** (note §7): point names `xN` / `yN` counted from 1 like `<pxl-line>` (§7.1); `toLocal` maps the whole point even when asked for one coordinate (§7.2); one-argument syntax `toLocal(ref.zig.x3)` via a compiler rewrite (§7.3, preferred); the reader-line rule with example (§7.4); "always hit the point" by letting the attribute decide the space, about 40 lines, scoped (§7.5); flip-the-roles workaround (§7.6); other frameworks (§7.7); over-engineering check, next step is a plan with one real use case (§7.8).
- **Older ideas**: mapping raw points such as the mouse into a group (`design/archive/local_coordinates_implementation_plan.md`, never implemented; continued as the point form in the note).

## 28. `space` Attribute: Draw an Element in Another Element's Space
- **Status**: 🟡 **Proposed** (2026-10-30)
- **Reference**: `design/2026-10-30_space_attribute_plan.md`
- **Idea**: `space="ref.A"` makes A's frame (its global matrix, incl. `dx` / `dy`) the element's parent space: exact overlays without the toLocal clone rule, points inside the target (corners) as elements, labels attached to moving shapes. Drawing via one extra relative transform in `applyTransformState`; hit testing needs no change.
- **Open**: name (`space` / `frame`), origin (drawing origin / pivot), scope (shapes and groups / also layers), hidden target.

## 29. Two-Phase Frame: Evaluate Everything, Then Draw
- **Status**: 💬 **Discussion** (idea 2026-10-30, no plan yet)
- **Problem**: a frame is one walk in DOM order; each element evaluates its animated values inside `render()` (`evaluateAnimations`) and then draws. A reader drawn before its target (toLocal, `space`, plain `ref.*`) sees the target's values from the previous frame: a one-frame lag. Today's rule avoids it: put readers in a layer after their targets.
- **Idea**: split the frame into an update phase (the stage runs `evaluateAnimations` for every element of every layer; reactive refs and toLocal readers settle through the existing broadcasts) and a draw phase (every layer draws with this frame's values). Removes the lag whatever the DOM order. Each value is still evaluated once; the cost is a second walk over the elements.
- **Open**: measure the extra walk (benchmark presets, docs pages); layers whose only animated attributes are compositing skip drawing today (CSS fast path in `Layer.render()`), the update phase must keep that; static layers must stay idle (0 FPS); order of broadcasts during the update phase.
- **Chains of readers** (tested 2026-11-02, `scratch/draw_order_chain_check.html`): reactive readers (`ref.*` / toLocal without `t`) settle through broadcasts, so the update phase fixes chains of any length in any order. Readers whose expression also uses `t` don't subscribe to refs (`pxl.compileAttribute`, `js/engine.js`); they read their source only at their turn in the update phase, so each one before its source in the DOM still adds one frame (today: C reads B reads A in the order C, B, A lags 2 frames). Options: let time-dependent expressions with refs subscribe as well (re-evaluated on the broadcast, a second evaluation for those few), or sort by dependencies before the update phase (needs a rule for cycles).
- **Docs when solved**: delete section 7 "Draw Order" of `docs/mapping.html` (and renumber the sections after it), and drop the draw-order rule from KILOPIXEL.md Coordinate Mapping and the AI guide.
- **Related**: not fixed by always save / restore (§19), which isolates canvas *state*, not *values*; the same render path, though. `design/2026-10-30_space_attribute_plan.md` §3.5, KILOPIXEL.md Coordinate Mapping, "Draw order (one-frame lag)".

## 30. Framework Compatibility (DOM Contract)
- **Status**: 🟡 **Proposed** (2026-10-30)
- **Reference**: `design/2026-10-30_framework_compatibility_plan.md`; prototypes `scratch/frameworks/` (React 19, Vue 3.5; local only)
- **Idea**: target the DOM contract frameworks use (attributes, properties, events, insert / move / remove, style, hydration), not the frameworks. Conformance test page `tests/frameworks.html` without any framework.
- **Phase 1**: observe `id`; DOM events on shapes (`click`, `pointer*`) + `interactive` for delegating frameworks; rename the `on*` handlers (collide with native `onclick` and framework `on*` rules; proposed `pxl-click` …); layer canvas in a shadow root (today `layer.innerHTML = …` silently removes the canvas: nothing is drawn, nothing is logged; confirmed 2026-11-05) and default styles in a stylesheet; bounded expression caches.
- **Phase 2**: attribute properties (numbers without compiling, values set before upgrade). **Phase 3**: `docs/frameworks.html`, optional TypeScript typings.
- **Open**: handler names, scoped names instead of global ids, native vs. synthetic `click` on the stage, cursor for delegated listeners.
- **Related**: §33 (stage sizing) also moves the stage's default styles out of inline styles.

## 31. Isolated Shape Compositing (Fill and Stroke Composite as One)
- **Status**: 🟡 **Proposed** (2026-11-01)
- **Reference**: `design/2026-11-01_isolated_shape_compositing_plan.md`; prototypes `scratch/mask_fill_stroke.html`, `scratch/isolation_bench.html` (local only)
- **Problem**: a shape that draws more than once (fill + stroke, arrowheads, multi-line text, grid major lines or labels) composites each draw call separately. With `mask` 7 of 9 modes are wrong (`source-in` erases the fill, `xor` cuts the stroke into the fill); with `shadowcolor` the stroke casts a shadow onto the shape's own fill (visible in `shadow.html` §1); `filter` and `blend` are affected too.
- **Shadows on arrowheads** (noted 2026-10-15): the shaft (`stroke()`) and the heads (`drawArrows`) are separate calls, so a dark band shows where the shaft enters the head. Overlaps within one path (polyline corners) cast one shadow and are fine. Workaround today: `filter="dropShadow(...)"` on the `<pxl-layer>` instead of `shadowcolor` on the shape (one shadow of the combined silhouette).
- **Idea**: draw such a shape normally into one shared scratch canvas, then composite it onto the layer once with its alpha / mask / blend / filter / shadow. Single-draw shapes keep the direct path.
- **Alternative for shadows only** (noted 2026-10-15): two passes only when a shadow is set: draw all parts with the shadow, then draw them again without the shadow on top, so the shadows end up underneath everything. Doubles the draw calls, but only for shapes with a shadow; doesn't help `mask`, `blend` or `filter`.
- **Measured**: 0.75–0.9 ms per isolated shape with the full scratch canvas, 0.35 ms with the bounding box (DPR 2); direct 0.01 ms.
- **Open**: `alpha` (recommended: not isolated for now), bounding box in step 1 or 2 (recommended: step 2), transform copy without `getTransform()` allocation.
- **Docs**: afterwards `mask.html` shapes get fill + stroke and the standard ghosts; the "Ghosts of fill-only shapes" note in DOCS_STANDARDS.md goes.
- **Related**: build after §19 (always save / restore) and before §14 (`paintorder`); plan §9.

## 33. Stage Sizing: Overridable Defaults and a Zero-Width Warning
- **Status**: 🟡 **Proposed** (2026-11-04, no code changes yet)
- **Reference**: `design/2026-11-04_stage_sizing_plan.md`
- **Problem**: the stage takes `width: 100%` of its parent. In a wrapper that sizes itself to its content (centered flex or grid item, `inline-block`, absolutely positioned card) it gets 0 × 0, draws nothing and logs nothing. Author CSS such as `pxl-stage { width: 600px }` is ignored, because `connectedCallback()` writes `display`, `position` and `width` as inline styles.
- **Idea**: default styles that author CSS can override, and a warning when the stage still has zero width once the page has loaded.

## 34. String Literals in Expressions
- **Status**: 🟡 **Proposed** (2026-11-02; code drafted and checked in Node, implementation postponed)
- **Reference**: `design/2026-11-02_string_literals_in_expressions_plan.md`
- **Problem**: the compiler's regexes also match inside quoted text. `'Press return: ' + ref.score.value` renders nothing (the word "return" stops the auto `return`), `` `ref.angle.value = ${ref.angle.value}` `` shows `ref.angle?.value`, a lone `t` in text makes it animated, and `radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])` fails with a SyntaxError (the CSS `%` sanitizer quotes `80%` inside the string; confirmed 2026-11-05). Escaped quotes (`'It\'s'`) aren't read.
- **Idea**: `pxl.splitStringLiterals` splits an expression into code and literals once at compile time; rewrites and checks only read the code parts. No per-frame cost.
- **Open**: plan §7 (scope of the fix, a `docs/text.html` section on quoting, a snippet convention in DOCS_STANDARDS.md).
- **Related**: `pxl.trackInteractiveRefs` (`js/interaction.js`) also scans the raw string, so `ref.btn.isHovered` inside quoted text registers the shape (an accepted false positive); the splitter could fix that too. §25 could reuse it for a quote-aware `points` parser.

## 35. Log-P-H Diagram & Scale Interface (`mapX` / `mapY`)
- **Status**: 💬 **Discussion** (spec 2026-07-19, never built)
- **Reference**: `design/2026-07-19_logph_diagram_note.md`
- **Idea**: a thermodynamic pressure-enthalpy diagram as a Kilopixel shape, and a general scale interface: `mapX(value)` / `mapY(value)` turn a domain value into a stage coordinate, so other shapes can place markers on data shapes. Related to `<pxl-plot>` (§7).

## 36. Draw Errors: One Bad Value Must Not Break the Layer
- **Status**: 🟡 **Proposed** (Part 2; Part 1 implemented 2026-11-05: stop offsets clamped to 0–1, rect corner radii ≥ 0)
- **Reference**: `design/2026-11-05_draw_errors_plan.md`; prototypes `scratch/gradient_stops/overshoot.html`, `scratch/gradient_stops/try_finally_bench.html` (local only)
- **Problem (left after Part 1)**: canvas calls that still throw (a typo in a gradient color, a gradient on a `NaN` bounding box, an expression failing at runtime, a buggy custom shape) abort the whole frame: later layers and hit testing are skipped. The `ctx.save()` before the shape is never restored, so the layer stays shifted, even after the value is valid again. Hit testing breaks the same way on `pxl.dummyCtx`.
- **Idea (Part 2)**: skip a failing element for that frame with one warning per distinct message and always restore the canvas (`try / catch / finally` in `Shape.render()`, evaluation of groups, layers and variables, and the hit-test draw).
- **Measured**: `try / finally` ≈ 6.5 ns per shape (0.1 % of the frame budget for 2,300 shapes); in the engine within noise.
- **Open**: plan §8 (build Part 2 together with §19, warning frequency, invalid stop color, docs).
