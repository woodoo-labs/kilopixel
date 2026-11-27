# Kilopixel — TODO & Roadmap

Planned work only, one short item each; the plan holds the details. Parked ideas are plans in `design/ideas/` (no item here), implemented plans are in `design/done/`, superseded and dropped ones in `design/archive/`. Workflow: `.claude/CLAUDE.md` → "Plans and TODO"; check: `node tools/check_plans.js`.

- **Status words** (as in the plans): 💬 **Discussion** (ideas, nothing decided) · 🟡 **Proposed** (complete plan, waiting for a decision) · 🟢 **Decided** (agreed, not built yet).
- **Numbers are stable:** other files refer to items as "TODO §46". A removed item leaves a gap; a new item gets the next free number (next: §53).

## 1. SVG Paths and Icons (`<pxl-path>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-09-30_path_element_plan.md`
- SVG path data through the browser's `Path2D`: icons copied from Figma, Lucide or Heroicons, `viewbox` (animated for sprite sheets), non-scaling stroke, 9-point anchor.
- **Next**: bring the code sketches up to date with today's engine.

## 3. One-Shot Animation, Easing, Springs (`tween`, `ease`, `spring`)
- **Status**: 🟡 **Proposed** (`tween`; easing, springs and angle helpers are 💬)
- **Plan**: `design/2026-10-01_tween_animation_plan.md`
- `tween(duration, ease, delay)` runs 0 → 1 once; Penner easings (`ease('back', p)`); springs that smooth reactive changes (`ref.btn.isHovered ? 1.2 : 1`) with state per attribute; `deg()` / `rad()` helpers (attributes use degrees, Math uses radians).
- **Decided** (release plan R2, `design/2026-11-27_release_0_1_plan.md` §5): reactive values first (`spring()`, `ease()` toward a target that changes, e.g. after a click), `tween()` from load second.
- **Next**: rewrite the plan around that.

## 7. Math Plots (`<pxl-plot>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-09-07_plot_element_plan.md`
- Functions `y = f(x)` and parametric curves, +y up, domains, cached vertices.
- **Open**: a name for the plot's magnification (not `scale`, next to `zoom`, `scalex`, `scaley`); smoothing with the uniform spline of §38 or more steps (plan §10).

## 8. Layer Throttling (`maxfps`) and Per-Layer Metrics
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-12_layer_throttling_plan.md`
- Built: stage-level `<pxl-var>` (part B), the monitor fix (C1). Open: `maxfps` on layers (part A) and `ref.<layer>.fps` (C2).
- **Next**: part A, much simpler since step 2 of the evaluation model (`design/done/2026-11-20_evaluation_model_plan.md`) is built: a skipped layer just stays dirty until its window.

## 9. Images (`<pxl-image>`)
- **Status**: 💬 **Discussion** (no plan yet)
- PNG, JPEG, WebP and complex SVGs through `ctx.drawImage()`, with `contain` / `cover` fitting and anchors.
- **Notes**: images that arrive late (what to draw before loading, the box before the size is known, one image per `src`, failed loads): `design/done/2026-11-06_text_box_accuracy_plan.md` §7.

## 12. Arrowheads Docs Page (`docs/arrows.html`)
- **Status**: 🟢 **Decided** (page in progress)
- **Plan**: `design/done/2026-10-14_unified_arrowhead_geometry_plan.md` (the geometry)
- Done: sections 1–4 (sizing, styles, caps, joins), the cross-links from the shape pages.
- **Open**: a "Rules & Edge Cases" section (small heads, open paths only, no `stroke` means no heads, short paths: §42), dashed and animated arrows.
- **Parked**: rounded corners for filled heads (`arrowjoin`), `design/ideas/2026-10-15_arrowcap_arrowjoin_plan.md`.

## 14. Paint Order (`paintorder`)
- **Status**: 💬 **Discussion** (no plan yet)
- `paintorder="stroke"` like SVG `paint-order`: the stroke under the fill, so only its outer half shows (readable text on busy backgrounds). All path shapes; text draws all strokes, then all fills.
- **Builds on** isolated compositing (built): with it, the order is a swap of two calls in the scratch canvas. Comparison: `design/prototypes/2026-11-01_isolated_shape_compositing/paint_order_text.html`.

## 23. Regular Polygons and Stars (`<pxl-polygon>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-10-19_polygon_star_shape_plan.md`
- One shape for regular polygons and stars: `sides`, `r`, a relative star amount, `start`. Arbitrary polygons stay `<pxl-polyline closed>`.
- **Next**: bring the plan's code to the form of the built-in shapes today (`design/done/2026-11-20_custom_shapes_plan.md`: `static defaults` only, `draw(ctx)` without `u`, `pxl.defineShape()`), then build it as the first shape in that form.
- **Open** (plan §7): the name of the star amount (`indent`), the element name, the default `start` and `sides`.

## 28. Draw in Another Element's Space (`space`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-10-30_space_attribute_plan.md`
- `space="ref.A"` makes A's frame the element's parent space: exact overlays and labels on moving shapes without the `toLocal()` clone rule.
- **Open**: the name (`space` / `frame`), the origin, the scope, a hidden target. Pick up together with the parked note `design/ideas/2026-10-25_refs_across_spaces_note.md`.

## 38. Polyline `smoothstyle`
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-11_polyline_smoothstyle_plan.md`
- `smoothstyle="centripetal"` (default) or `"uniform"`: the uniform spline follows points sampled at equal steps (walkthrough section 9: 60 points instead of 120). `<pxl-plot>` (§7) reuses it.
- **Open**: D1–D3.

## 42. Negative Sweep and Shrinking Arrowheads
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-16_negative_sweep_arrowheads_plan.md`
- The sign of `sweep` is the direction (today `sweep="-90"` draws three quarters); arrowheads shrink on paths shorter than them; ellipses measure the arc length.
- **Open**: D1–D5 (plan §7).

## 43. AI Discoverability (`llms.txt`)
- **Status**: 🟢 **Decided** (one source, no plan yet; build it with the first release)
- `docs/llms-full.txt` generated by `build.js` from `.agents/KILOPIXEL.md`: lines marked internal (e.g. `ref.<id>.pN`) left out, repo links turned into docs links; `tools/check_build.js` checks it is up to date. `docs/llms.txt` is a short hand-written index (what Kilopixel is, links to `llms-full.txt`, installation and element pages). No second hand-written guide.
- **Later**: a "Using Kilopixel with AI" page; README and typings with the npm package (§44).

## 44. Distribution and More Framework Smoke Pages
- **Status**: 🟢 **Decided**
- **Plan**: `design/done/2026-10-30_framework_compatibility_plan.md` (§26.3, §28)
- Smoke pages for Svelte 5 and Lit (Lit also with a stage in a shadow root; `tests/smoke/README.md` "Adding a Framework"); the Angular app in `tests/smoke/angular/` when an Angular user appears or to measure zone.js; the npm package (`exports`, `sideEffects`, typings) together with publishing.

## 45. Shapes as Page Elements: Position, Focus, Accessibility
- **Status**: 💬 **Discussion** (no plan yet)
- `getBoundingClientRect()` of a shape is empty (tooltips need a workaround); clickable shapes get no keyboard focus or roles; CSS `:hover` never matches a shape (a custom state?). Each needs its own plan.
- **Background**: `design/done/2026-10-30_framework_compatibility_plan.md` §23.6, §26.2.

## 49. Shape Filters in Safari
- **Status**: 💬 **Discussion** (no plan yet)
- Safari has `ctx.filter` only behind its "Canvas Filters" feature flag, off by default, so `filter` on a shape draws nothing extra for its visitors; filters on layers are CSS and work. With the flag on, `tests/render.html` passes 56/56 on an iPhone (2026-11-22). `docs/filter.html` says so and points to layer filters; the engine warns once per page when a shape's filter meets a canvas without filters.
- **Next**: decide whether `blur()` and `dropShadow()` on shapes get a fallback in Safari (the canvas shadow, or the layer's filter). Background: `design/done/2026-11-20_custom_shapes_plan.md` §5.3.

## 51. Release 0.1: Scope
- **Status**: 🟢 **Decided**
- **Plan**: `design/2026-11-27_release_0_1_plan.md`
- What 0.1 needs: A decisions that would break pages later (§52 text as a template and centered text, §42, §49, release policy), B features (§3 animation started by events, §1 path, §9 image), C release work (§43, §44, 9 docs pages, §12); D the rest after 0.1.
- **Decided**: R1–R5 (plan §6). **Next**: plans for §52 and §3; decisions for §42 (D1–D5) and §49.

## 52. Text as a Template, Centered by Default
- **Status**: 🟢 **Decided** (no plan of its own yet)
- **Plan**: `design/2026-11-27_release_0_1_plan.md` §4 (analysis, edge cases), R1, R3
- `<pxl-text>` `text` (the attribute) is text where only `${…}` is code; an `undefined` part draws nothing; the property stays literal. Default `align="center"`, `baseline="middle"`, like every other shape. One migration of about 640 labels; the docs section on what `text` accepts (the former items on quoted text in the docs and on default alignment are merged here).
- **Next**: a plan (parser, Rule A, tests, migration script).
