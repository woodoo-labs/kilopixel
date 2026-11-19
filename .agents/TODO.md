# Kilopixel — TODO & Roadmap

Open work only. Done items are removed: the plan's status line, `.agents/KILOPIXEL.md` and git history keep the record.

- **Status words** (same as in the plans): 💬 **Discussion** (ideas, nothing decided) · 🟡 **Proposed** (complete plan, waiting for a decision) · 🟢 **Decided** (agreed, not built yet). Plans also use ✅ **Implemented**, ⚪ **Superseded by** `<file>` and ⚪ **Dropped** (decided not to do it); those have no TODO item.
- **Numbers are stable:** other files refer to items as "TODO §29". A removed item leaves a gap; a new item gets the next free number (next: §44).
- **Plans:** `design/`; superseded, dropped and outdated plans are in `design/archive/`. Workflow: `.claude/CLAUDE.md` → "Plans and TODO". Check: `node tools/check_plans.js`.

## 1. Native SVG Path2D & Vector Sprites (`<pxl-path>`)
- **Status**: 🟡 **Proposed** (2026-09-30; the plan needs updating to today's engine before implementing)
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
- **Status**: 🟡 **Proposed** (`tween`, 2026-10-01; the plan needs updating to today's engine before implementing); easing, springs and angle helpers: 💬 **Discussion**
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
- **Status**: 🟡 **Proposed** (2026-11-11, notes on sampling and smoothing)
- **Reference**: `design/2026-09-07_plot_element_plan.md`
- **Core Features**:
  - Dedicated shape element for high-performance plotting of functions ($y = f(x)$) and parametric curves ($x = f(v), y = g(v)$).
  - Upward $+Y$ mathematical orientation, 1:1 isotropic scaling, decoupled domain intervals, and pre-allocated `Float32Array` vertex caching.
- **Open**: the plan names the plot's own magnification (pixels per math unit) `scale`. Since 2026-10-30 every element has `zoom`, `scalex` and `scaley`, so a plot attribute `scale` beside them would be confusing; find another name before implementing.
- **Open**: `smooth` should use the uniform spline (closer to sampled curves than the polyline's centripetal one), or a high `steps` default without smoothing; see section 10 of the plan. Test case: walkthrough section 9, which then goes back to frequencies 1–10.
- **Related**: §38 builds the uniform spline into `<pxl-polyline>`; the plot reuses that code.

## 8. Layer FPS Throttling (`maxfps`) & Performance Monitor
- **Status**: 🟡 **Proposed** (2026-11-13, Part B and the monitor bug C1 built; decisions D1–D4, D7–D9 open; D9: build `maxfps` after the two-phase frame, §29)
- **Reference**: `design/2026-11-12_layer_throttling_plan.md` (replaces the two plans of 2026-09-14, now in `design/archive/`)
- **Layer throttling** (plan Part A): a `maxfps` attribute on `<pxl-layer>` throttles secondary layers (e.g. background effects to 12 FPS, clocks to 1 FPS); the gate lives in `Layer.render()`, a skipped layer comes back via rAF (short wait) or a one-shot timer (long wait).
- **Performance monitor** (plan Part C; the idle-freeze bug C1 is fixed): frame counting (only frames in which a layer drew, D4) and per-layer metrics (`ref.<layerId>.fps`, `.renderAvg`, `.renderMax`), both with Part A.

## 9. Raster Bitmaps & Complex SVG Graphics (`<pxl-image>`)
- **Status**: 💬 **Discussion** (no plan yet)
- **Motivation**: Complete the visual asset suite by allowing developers to load raster images (PNG, JPEG, WebP) and complex multi-color SVGs directly into the canvas via native `ctx.drawImage()`, with aspect-ratio fitting (`contain` / `cover`) and anchor transforms.
- **Images arrive late**: first thoughts for the plan are in `design/2026-11-06_text_box_accuracy_plan.md` §7 (what to draw before loading, the box before the size is known, a shared image per `src`, natural size through `ref.*`, failed loads). Unlike fonts, an image reports its own arrival, so it invalidates only its own layer and doesn't use `pxl._fontGeneration`.

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
  - "Rules & Edge Cases" section: small arrowheads (narrower than stroke), open paths only (`pie` / `closed` / rings / closed polylines ignore arrows), no `stroke` → no arrowheads, path shorter than both heads (planned to shrink the heads, §42).
  - Dashed arrows (chevrons stay solid) and animated dashes / arrowheads.

## 14. Shape-Level Paint Order (`paintorder`)
- **Status**: 💬 **Discussion** (decided 2026-10-13: keep current behavior until implemented properly; no plan yet)
- **Visual Comparison**: `design/prototypes/2026-11-01_isolated_shape_compositing/paint_order_text.html` (text; kept with the isolation plan, which `paintorder` builds on)
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
- **Related**: build after §31 (`design/2026-11-01_isolated_shape_compositing_plan.md` §9). Without isolation, `paintorder="stroke"` has the same compositing bug as §31 (with a shadow, the fill's shadow falls onto the stroke drawn before it); with isolation it only swaps two draw calls.

## 20. Shape Authoring (Derived Attributes, Class Fields, Custom Animation)
- **Status**: 🟡 **Proposed** (2026-10-17, no code changes yet)
- **Reference**: `design/2026-10-17_shape_authoring_plan.md`
- **Goal**: writing a shape (built-in or user-made, e.g. a separate `star.js` with `class Star extends pxl.Shape`) needs only `static defaults`, `draw(ctx, u)` and `getBoundingBox()`. A prototype Star already works with today's engine.
- **Changes**: derive `observedAttributes` from `static defaults` (the handler attributes `pxl.HANDLER_EVENTS` appended by `Shape` and `Group`, `isHovered` / `isPressed` moved out of defaults, Polyline `points: ''`, lowercase-key warning); class fields instead of constructors (except Layer); `draw(ctx, u)` without `t` (hit testing calls `draw()` with `t = 0`).
- **Custom animation (note)**: time belongs in attribute expressions. Pattern A: `spin="t * 180"` in the HTML. Pattern B: internal animated value via `pxl.compileAttribute` (internal API, a public helper like `this.animate()` later).
- **Ready for custom shapes** (2026-11-07, `design/2026-11-07_safe_shape_render_plan.md`): every shape draws in its own canvas state and errors are caught, so a careless or failing custom shape can't fade or break the rest of the layer. A custom shape that draws arrowheads must call `drawArrows()` last.

## 22. Polyline Optimization (Parser, Point Storage, Edge Cases)
- **Status**: 🟡 **Proposed** (low priority; measured gains are small)
- **Reference**: `design/2026-10-18_polyline_optimization_plan.md` (priority table at the top)
- **Small fixes, do when touched**: warnings for typos in `points` (missing / extra values, unbalanced parentheses).
- **Deferred**: point storage in numeric arrays (measured ≈ 8 µs per frame for 500 points, a micro-optimization) and the measurement-gated phase 3 items.
- **Note**: `ref.<id>.pN` is internal (`.agents/KILOPIXEL.md`); the public docs recommend a `<pxl-var>` read by both shapes.

## 23. Regular Polygon & Star Shape (`<pxl-polygon>`)
- **Status**: 🟡 **Proposed** (2026-10-19, no code changes yet)
- **Reference**: `design/2026-10-19_polygon_star_shape_plan.md`; prototypes `design/prototypes/2026-10-19_polygon_star_shape/test.html` and `relative.html`
- **Idea**: one shape for regular polygons and stars: `sides`, `r`, a relative star amount (`0` = polygon, `1` = spokes, negative = bulges, same look for every number of sides) and `start`. Arbitrary polygons stay `<pxl-polyline closed="true">`.
- **Open decisions** (plan §7): name of the star amount (`indent` proposed; not `star`, which reads like a switch), element name, default `start` (`-90` = first corner up), default `sides`.
- **Sidebar**: the "Polygon" placeholder link was removed (2026-10-19); it comes back with `docs/polygon.html`.

## 25. Refs Across Coordinate Spaces (`toLocal` Point Form, `ref.<id>.points`)
- **Status**: 💬 **Discussion** (2026-10-25, ideas added 2026-10-26; no code changes decided, "keep everything as it is for now")
- **Reference**: `design/2026-10-25_refs_across_spaces_note.md` (hub: index of all related documents in §0, ideas in §7)
- **Finding**: refs (`ref.v.value`, `ref.box.x`, `ref.zig.pN`) are values in the target's space, not positions; only `toLocal()` crosses spaces, and it maps only an element's frame (`x`, `y`, `tx`, `ty`, `rotate`, `scalex`, `scaley`, `skewx`, `zoom`), not points inside it.
- **Works today**: shared space; track one point via `dx` / `dy` + `toLocal(ref, 'tx')`; anchors (`pxl-group` or a drawn / hidden dot) in the shape's space; phantom groups as spatial variables; sizes and angles by composition (`ref.c.r * toLocal(ref.c, 'zoom')`).
- **Possible later**: `toLocal(ref.el, 'x', px, py)` point form; `toLocal(ref.zig, 'pN')` sugar (relative mode); lazy evaluated `ref.zig.points`; list-expression rule for `points="ref.zig.points"` with a quote-aware parser (could reuse `pxl.splitStringLiterals`, built with §34).
- **Docs**: `ref.<id>.pN` stays internal; teach the patterns in the walkthrough's `toLocal` section.
- **Ideas 2026-10-26** (note §7): point names `xN` / `yN` counted from 1 like `<pxl-line>` (§7.1); `toLocal` maps the whole point even when asked for one coordinate (§7.2); one-argument syntax `toLocal(ref.zig.x3)` via a compiler rewrite (§7.3, preferred); the reader-line rule with example (§7.4); "always hit the point" by letting the attribute decide the space, about 40 lines, scoped (§7.5); flip-the-roles workaround (§7.6); other frameworks (§7.7); over-engineering check, next step is a plan with one real use case (§7.8).
- **Older ideas**: mapping raw points such as the mouse into a group (`design/archive/local_coordinates_implementation_plan.md`, never implemented; continued as the point form in the note).

## 28. `space` Attribute: Draw an Element in Another Element's Space
- **Status**: 🟡 **Proposed** (2026-10-30)
- **Reference**: `design/2026-10-30_space_attribute_plan.md`
- **Idea**: `space="ref.A"` makes A's frame (its global matrix, incl. `dx` / `dy`) the element's parent space: exact overlays without the toLocal clone rule, points inside the target (corners) as elements, labels attached to moving shapes. Drawing via one extra relative transform in `applyTransformState`; hit testing needs no change.
- **Open**: name (`space` / `frame`), origin (drawing origin / pivot), scope (shapes and groups / also layers), hidden target.

## 29. Two-Phase Frame: Evaluate Everything, Then Draw
- **Status**: 💬 **Discussion** (2026-11-18: rules both paths share, plan §9; 2026-11-17: pointer readers fixed, plan §7.4; 2026-11-13: step 1 built; steps 2–4 not decided)
- **Reference**: `design/2026-11-12_two_phase_frame_plan.md` (hub: the plans that depend on it and what changes for each in §6, suggested order in §7)
- **Built (step 1)**: the frame evaluates all layers first, then draws them. Readers drawn before their targets (toLocal, `ref.*` without `t`) no longer lag a frame; no measurable cost. Readers of the pointer and of hover / press states kept the lag until 2026-11-17, when hit testing moved to the start of the frame (`design/2026-11-17_pointer_frame_order_plan.md`).
- **Idea, still open**: change-based dirty flags (step 2): a layer redraws only when a value really changed (a `floor(t)` clock redraws once per second, a finished `clamp()` animation stops redrawing), and the stage, not the drawing, keeps the loop alive.
- **Open**: redraws saved by step 2, hidden subtrees, readers that use `t` and refs (dependency order with a cycle rule recommended, plan §3.1.1), order of broadcasts; plan §4. C1, the rule for cycles without `t` on both paths (plan §9.1).
- **Shared rules** (plan §9, aligned 2026-11-18 with §39, §40 and the pointer frame order plan): no frame request for a change before the running frame's update phase (R1: today a pointer reader adds an empty frame per move, `test.known()` in `tests/index.html`, fixed with step 2); self-reads within an element (R3); which elements are nodes of the order (R4); readers with `t` count as readers (R5); stage-level variables first (R6).
- **Steps**: (1) split evaluation from drawing (built), (2) change-based dirty flags and keep-alive in the stage, (3) `t` readers, hidden subtrees, (4) the dependent plans; plan §7.2.
- **Related**: §40 proposes another way after step 2 (one evaluation per frame for all expressions, no broadcasts); step 2 is the first step of both.

## 30. Framework Compatibility (DOM Contract)
- **Status**: 🟡 **Proposed** (2026-11-19, smoke pages for React, Vue and Tailwind, plan §25; W3 built: every attribute is also a property, plan §24; W1 built: step 3, DOM events on shapes and groups, plan §23.8; 2026-11-18, W1 build plan decided, plan §23; step 1, the handler rename to pxl-on-*, built, plan §23.5; step 2, every shape hit-tested, built, plan §23.7 (a resting pointer is tested every 100 ms); 2026-11-17, steps 1–2 of plan §19.4 built, plan §20 and plan §21; DOM-like event model decided, plan §22; D1, D4, D5, D6, D7, D10, D11 decided; W2 built with the stage sizing plan)
- **Reference**: `design/2026-10-30_framework_compatibility_plan.md`; prototypes `design/prototypes/2026-10-30_framework_compatibility/review_checks.html` (review, 2026-11-15), `design/prototypes/2026-10-30_framework_compatibility/d4_clicks.html` (D4, 2026-11-10), `design/prototypes/2026-10-30_framework_compatibility/hover_hit_every_shape.html` and `design/prototypes/2026-10-30_framework_compatibility/open_points_dom_model.html` (plan §22, 2026-11-17); the React 19 / Vue 3.5 components with `FINDINGS.md` (2026-10-30) in the same folder
- **Event model, decided 2026-11-17** (plan §22, compared with `interactive` in §22.6): every shape is hit-tested for clicks and hover, with a bounding-box pre-check (measured 5–25× faster than testing every path, same results at 900 points); no `interactive`; the cursor is only CSS: the shape's `cursor`, and a default-style rule gives `pxl-on-click` / `-down` / `-up` the hand (since 2026-11-18, plan §23 E1; no listener counts, no `isPressed` rule); CSS `pointer-events: none` lets clicks through and takes a layer or group out of hit testing (read with `getComputedStyle()` for layers and the few box-check candidates, plan §23 E3).
- **W1 built 2026-11-18 / 2026-11-19** (plan §23.5, §23.7, §23.8): `pxl-on-*` handlers (listeners for DOM events, also on groups), every shape hit-tested (walk over the layer tree, box check, CSS `pointer-events`, also `auto` inside a layer with `none`), real DOM events on shapes and groups (pointer and mouse events, `click`, `dblclick`, `contextmenu`, hit-tested when they arrive; `relatedTarget`; pointer capture; multi-touch), group `isHovered` / `isPressed`, the cursor only CSS (on the layer canvases). 66 KB minified, 19.6 KB gzipped. Left for the framework docs (step 5): a note on Angular with zone.js (`runOutsideAngular()`), plan §23.8.
- **Known limits for framework users** (plan §23.6, not part of W1): `:hover` / Tailwind `hover:` never match a shape (docs; maybe a custom state later); `getBoundingClientRect()` of a shape is zero (a way to get a shape's box on the page needs its own plan); no keyboard focus for clickable shapes (accessibility, later); `offsetX` on shape events equals `clientX` (documented in the events tab of the API reference).
- **Review 2026-11-15** (plan §19): measured on the current engine: removing 2,000 shapes with 2,000 readers takes 374–389 ms (quadratic `clearAllVariableSubscriptions()`); an `id` set after insertion is never registered, a renamed one leaves its old entry; a second copy of the script breaks the first; text children of shapes show as HTML; JSX arrays become strings. New: W8 distribution (npm, SSR / double-load guard, typings required), W9 hidden text children, D10 clicks without `interactive`, D11, D12.
- **Order** (plan §19.4): (1) quick fixes, **built 2026-11-16** (plan §20: removal 160× faster, late / renamed / removed `id`, SSR and double-load guard, cache bound, hidden text children), (2) `tests/frameworks.html`, **built 2026-11-17** (plan §21: 16 tests passing, 20 `test.known()` as the acceptance tests of steps 3 and 4), (3) events W1, **built 2026-11-19** (plan §23.5–§23.8), (4) properties W3, **built 2026-11-19** (plan §24: numbers without compiling, arrays kept, values set before the upgrade, literal `text`, CSS colors not compiled), (5) distribution and docs (npm, typings; smoke pages for React, Vue and Tailwind built 2026-11-19, plan §25; next: Angular as an npm app in `frameworks/angular/`, asked before creating it; `docs/frameworks.html`), (6) the evaluation model (§29 / §40) with scoped names D2.
- **Idea**: target the DOM contract frameworks use (attributes, properties, events, insert / move / remove, style, hydration), not the frameworks. Conformance test page `tests/frameworks.html` without any framework.
- **Phase 1** (built 2026-11-16 to 2026-11-19, plan §20, §23.5–§23.8): observe `id`; DOM events on shapes (`click`, `pointer*`) for every shape (no `interactive`, plan §22); rename the `on*` handlers, which collide with native `onclick` and framework `on*` rules (D1: `pxl-on-click`, `pxl-on-enter`, …, attribute-only); bounded expression caches. The layer canvas in a shadow root and the default styles in a stylesheet (W2) are built (2026-11-15, `design/2026-11-04_stage_sizing_plan.md`).
- **Phase 2** (built 2026-11-19, plan §24): attribute properties (numbers without compiling, values set before upgrade). **Phase 3**: `docs/frameworks.html`, optional TypeScript typings.
- **Decided**: D5, D10, D11 the DOM-like event model (2026-11-17, plan §22.3); D1 handler names `pxl-on-click` … (attribute-only); D4 `click` / `pointerdown` / `pointerup` are hit-tested when they arrive, so frameworks see one event per action (prototype `design/prototypes/2026-10-30_framework_compatibility/d4_clicks.html`); D6 `<slot>` in the layer's shadow root and D7 inline `aspect-ratio` (2026-11-14, built with the stage sizing plan).
- **Open**: D2 scoped names instead of global ids (a recommendation in plan §13, not confirmed yet). D3 (no coordinates on events) is built as recommended (plan §23.8); D8 is built for every attribute (plan §24); D9 was replaced by the order of plan §19.4.
- **Found 2026-11-19 (plan §24.2), not part of W1 / W3:** a change of a layer's `alpha`, `blend` or `filter` (property or attribute) redraws all its shapes; only animated compositing values use the CSS-only fast path. A framework that fades a layer in every frame pays a full redraw. Small change in `Layer.render()`.
- **Related**: `design/2026-11-04_stage_sizing_plan.md` (✅ 2026-11-15) built W2 together with overridable stage sizes and a 300 px fallback width.

## 31. Isolated Shape Compositing (Fill and Stroke Composite as One)
- **Status**: 🟡 **Proposed** (2026-11-01)
- **Reference**: `design/2026-11-01_isolated_shape_compositing_plan.md`; prototypes `design/prototypes/2026-11-01_isolated_shape_compositing/mask_fill_stroke.html`, `design/prototypes/2026-11-01_isolated_shape_compositing/isolation_bench.html`
- **Problem**: a shape that draws more than once (fill + stroke, arrowheads, multi-line text, grid major lines or labels) composites each draw call separately. With `mask` 7 of 9 modes are wrong (`source-in` erases the fill, `xor` cuts the stroke into the fill); with `shadowcolor` the stroke casts a shadow onto the shape's own fill (visible in `shadow.html` §1); `filter` and `blend` are affected too.
- **Shadows on arrowheads** (noted 2026-10-15): the shaft (`stroke()`) and the heads (`drawArrows`) are separate calls, so a dark band shows where the shaft enters the head. Overlaps within one path (polyline corners) cast one shadow and are fine. Workaround today: `filter="dropShadow(...)"` on the `<pxl-layer>` instead of `shadowcolor` on the shape (one shadow of the combined silhouette).
- **Idea**: draw such a shape normally into one shared scratch canvas, then composite it onto the layer once with its alpha / mask / blend / filter / shadow. Single-draw shapes keep the direct path.
- **Alternative for shadows only** (noted 2026-10-15): two passes only when a shadow is set: draw all parts with the shadow, then draw them again without the shadow on top, so the shadows end up underneath everything. Doubles the draw calls, but only for shapes with a shadow; doesn't help `mask`, `blend` or `filter`.
- **Measured**: 0.75–0.9 ms per isolated shape with the full scratch canvas, 0.35 ms with the bounding box (DPR 2); direct 0.01 ms.
- **Open**: `alpha` (recommended: not isolated for now), bounding box in step 1 or 2 (recommended: step 2), transform copy without `getTransform()` allocation.
- **Docs**: afterwards `mask.html` shapes get fill + stroke and the standard ghosts; the "Ghosts of fill-only shapes" note in DOCS_STANDARDS.md goes.
- **Related**: builds on always save / restore (`design/2026-11-07_safe_shape_render_plan.md`, built 2026-11-07); build before §14 (`paintorder`); plan §9.

## 34. String Literals in Expressions: Docs Left
- **Status**: 💬 **Discussion** (2026-11-17: the compiler fix is built, plan ✅; only docs ideas are left)
- **Reference**: `design/2026-11-02_string_literals_in_expressions_plan.md` (§5, §7)
- **Built 2026-11-17**: quoted text in expressions is text, not code (`pxl.splitStringLiterals`): `return`, `ref.a.b`, a lone `t` and `%` inside strings no longer change the code. Escapes in a lone quoted string (`'It\'s'`) were left out on purpose (plan §7).
- **Open (docs)**: a `docs/text.html` section on what the `text` attribute accepts (plain text, single quotes, backticks for apostrophes and values, `\n`); a snippet quoting convention in DOCS_STANDARDS.md.
- **Related**: §25 could reuse the splitter for a quote-aware `points` parser.

## 35. Log-P-H Diagram & Scale Interface (`mapX` / `mapY`)
- **Status**: 💬 **Discussion** (spec 2026-07-19, never built)
- **Reference**: `design/2026-07-19_logph_diagram_note.md`
- **Idea**: a thermodynamic pressure-enthalpy diagram as a Kilopixel shape, and a general scale interface: `mapX(value)` / `mapY(value)` turn a domain value into a stage coordinate, so other shapes can place markers on data shapes. Related to `<pxl-plot>` (§7).

## 38. Polyline `smoothstyle`: Uniform or Centripetal Spline
- **Status**: 🟡 **Proposed** (2026-11-11)
- **Reference**: `design/2026-11-11_polyline_smoothstyle_plan.md`
- **Problem**: the centripetal spline (since 2026-10-24) is right for points placed by hand but turns too sharply on points sampled at equal steps (formulas, data over time): walkthrough section 9 needs 120 points; with the uniform spline 60 are more accurate (worst 0.7 instead of 6.9 units).
- **Idea**: `smoothstyle="centripetal"` (default) | `"uniform"`, only `loadSegment()` changes; new `docs/polyline.html` section 5 (hand-placed arrow vs. sampled figure eight).
- **Open**: D1 name, D2 repeated point in the uniform style (corner recommended), D3 walkthrough section 9 back to 60 points.
- **Related**: §7 (`<pxl-plot>` reuses the uniform spline).

## 39. Reactive Propagation in Dependency Order
- **Status**: 💬 **Discussion** (2026-11-13, the cycle crash is fixed; the rest waits for a feature that needs it)
- **Reference**: `design/2026-11-12_reactive_propagation_plan.md`; prototypes in `design/prototypes/2026-11-12_reactive_propagation/`
- **Problem**: `pxl.broadcast()` propagates recursively, depth first. Stacked diamonds evaluate their bottom once per path (1,024 times after ten layers), and a diamond's bottom briefly sees half-updated values (210 before 220). Neither is visible today. A cycle that never settles stops after 100 rounds with a warning (per-element nesting counter, 2026-11-13).
- **Idea**: find every affected reader first, then evaluate each once in dependency order, computed per broadcast over the affected readers only (recommended) or from a lasting graph. Measured cost: about +20 ns per reader, +1 KB minified (plan §5).
- **Open**: when to build it (with `<pxl-out>`, §5, or event handlers that react to every change); D1–D4. The cycle rule is decided together with §29 and §40 (C1, `design/2026-11-12_two_phase_frame_plan.md` §9.1).
- **Related**: §29 (its update phase orders readers with `t`; could share the ordering code); §40 (the alternative: no broadcasts at all; if it is built, this item goes).

## 40. Per-Frame Evaluation in Dependency Order (No Broadcasts)
- **Status**: 🟡 **Proposed** (2026-11-18, aligned with §29 plan §9; 2026-11-15, design and measurements; nothing built)
- **Reference**: `design/2026-11-15_per_frame_evaluation_plan.md`; prototype `design/prototypes/2026-11-15_per_frame_evaluation/pull_bench.html`
- **Problem**: expressions are re-evaluated by three mechanisms (the frame loop for `t`, recursive broadcasts for `ref.*`, a matrix walk for `toLocal`), each with its own bookkeeping; the open problems of §29 and §39 sit where they meet.
- **Idea**: a change only raises a version number and asks for a frame; the frame evaluates what is out of date, sources before readers, then draws the layers in which a value changed. No subscriptions, no `pxl.broadcast()`, one order for expressions with and without `t`.
- **Measured**: about the same cost as broadcasts when a source changes (330–620 ns per reader either way); with a version check 20–25 ns per reader that is up to date; ordering 1,000 nodes takes 0.06 ms. The gain is one mechanism instead of three, not speed.
- **Behavior change**: a reactive value updates in the next frame's update phase, not inside `setAttribute()` (same frame on screen).
- **Open**: D1 this plan or the path of §29 steps 2–3 plus §39 (decide after a prototype patch and a page sweep), D2, D3, D5–D8 (plan §10; D4 moved to C1 of §29, `design/2026-11-12_two_phase_frame_plan.md` §9.1). The riskiest part is a `toLocal` reader that is read by others (plan §3.5). The rules both paths share are in that plan's §9.
- **Steps**: (1) §29 step 2, needed on both paths, (2) prototype as a patch over the engine, page sweep, decide D1, (3) build, (4) update the plans that assume broadcasts.
- **When**: after the framework steps 1–5 of §30 (their conformance tests are the safety net); scoped names (§30 D2) are designed together with D1, because both change how `ref` is resolved (framework plan §19.3).

## 42. Negative Sweep and Arrowheads That Shrink on Short Paths
- **Status**: 🟡 **Proposed** (2026-11-16, direction and head behavior chosen with the prototype; D1–D5 open)
- **Reference**: `design/2026-11-16_negative_sweep_arrowheads_plan.md`; prototype `design/prototypes/2026-11-16_negative_sweep_arrowheads/index.html`
- **Problem**: a negative `sweep` (or `anticlockwise` with a positive one) draws the long way round: `sweep="-90"` fills three quarters, an animated sweep jumps to 359° at −1°, and a short negative sweep with arrowheads draws two floating heads without an arc. Full-size heads on short arcs overlap and flip 180° when a sweep crosses zero; on the pointed end of a thin ellipse they stick out beside the curve.
- **Decided with the prototype (A2)**: the sign of `sweep` is the direction (`anticlockwise` mirrors it); arrowheads shrink while the path is shorter than them, so they vanish at 0 and turn around invisibly; ellipses measure the arc length (8 chords, early exit), not `r × |sweep|`. Replaces D9 of `design/2026-10-14_unified_arrowhead_geometry_plan.md`.
- **Open**: D1 `end` keeps "from start to end in the arc's direction", D2 polyline length (whole path recommended), D3 threshold (head lengths), D4 two commits (direction first), D5 heads on tight turns of thin ellipses (accept for now) (plan §7).
- **Related**: §12 (`docs/arrows.html` rules section); its render tests go into `tests/render.html` (`design/2026-11-15_testing_plan.md`).

## 43. AI Discoverability (`llms.txt`, a Page for AI Use)
- **Status**: 💬 **Discussion** (2026-11-16, idea, no plan yet)
- **Problem**: today's AI models don't know Kilopixel (pre-release, no npm package, little public material); an AI only knows it when the reference is given to it (as `.agents/KILOPIXEL.md` in this repository) or when it finds the docs. Training on public material comes much later, if at all.
- **Ideas**, cheapest first:
  - `docs/llms.txt`: a short plain-text summary for AI tools at the root of the docs site (a growing convention: what Kilopixel is, the main elements and attributes, the rules an AI gets wrong without it, links to the important pages). Published with the docs site on every push. Source: the "AI Code Generation Guide" of KILOPIXEL.md.
  - A docs page "Using Kilopixel with AI" with a prompt to copy ("Use Kilopixel; the reference is at …").
  - With the npm package (§30, W8): README and typings, which AI coding tools read from installed packages.
  - Later: register the docs with documentation indexes for coding assistants.
- **Open**: write `llms.txt` by hand or generate it from KILOPIXEL.md in `build.js` (stays in sync, but the guide must then be written for the public: KILOPIXEL.md also documents internals, e.g. `ref.<id>.pN`); how much of the guide goes public (CLAUDE.md "Public vs. internal").
- **Related**: §30 (W8: npm package and typings); `docs/DOCS_STANDARDS.md` §6 ("simple rules over complete ones" helps AIs as much as people).

