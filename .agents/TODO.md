# Kilopixel — TODO & Roadmap

Planned work only, one short item each; the plan holds the details. Parked ideas are plans in `design/ideas/` (no item here), implemented plans are in `design/done/`, superseded and dropped ones in `design/archive/`. Workflow: `.claude/CLAUDE.md` → "Plans and TODO"; check: `node tools/check_plans.js`.

- **Status words** (as in the plans): 💬 **Discussion** (ideas, nothing decided) · 🟡 **Proposed** (complete plan, waiting for a decision) · 🟢 **Decided** (agreed, not built yet).
- **Numbers are stable:** other files refer to items as "TODO §46". A removed item leaves a gap; a new item gets the next free number (next: §48).

## 1. SVG Paths and Icons (`<pxl-path>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-09-30_path_element_plan.md`
- SVG path data through the browser's `Path2D`: icons copied from Figma, Lucide or Heroicons, `viewbox` (animated for sprite sheets), non-scaling stroke, 9-point anchor.
- **Next**: bring the code sketches up to date with today's engine.

## 3. One-Shot Animation, Easing, Springs (`tween`, `ease`, `spring`)
- **Status**: 🟡 **Proposed** (`tween`; easing, springs and angle helpers are 💬)
- **Plan**: `design/2026-10-01_tween_animation_plan.md`
- `tween(duration, ease, delay)` runs 0 → 1 once; Penner easings (`ease('back', p)`); springs that smooth reactive changes (`ref.btn.isHovered ? 1.2 : 1`) with state per attribute; `deg()` / `rad()` helpers (attributes use degrees, Math uses radians).
- **Next**: bring the plan up to date with today's engine.

## 5. Values as Page Text (`<pxl-out>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-08-02_declarative_html_output_pxl_out_plan.md`
- An element outside the stage that shows a `ref` value as DOM text (`ref.main.fps`, coordinates) without JavaScript; writes only when the text changes.
- **Note**: it needs readers to see no half-updated values: build it after D1 of the evaluation model (§46).

## 7. Math Plots (`<pxl-plot>`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-09-07_plot_element_plan.md`
- Functions `y = f(x)` and parametric curves, +y up, domains, cached vertices.
- **Open**: a name for the plot's magnification (not `scale`, next to `zoom`, `scalex`, `scaley`); smoothing with the uniform spline of §38 or more steps (plan §10).

## 8. Layer Throttling (`maxfps`) and Per-Layer Metrics
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-12_layer_throttling_plan.md`
- Built: stage-level `<pxl-var>` (part B), the monitor fix (C1). Open: `maxfps` on layers (part A) and `ref.<layer>.fps` (C2).
- **Next**: after step 2 of the evaluation model (§46), which makes part A much simpler.

## 9. Images (`<pxl-image>`)
- **Status**: 💬 **Discussion** (no plan yet)
- PNG, JPEG, WebP and complex SVGs through `ctx.drawImage()`, with `contain` / `cover` fitting and anchors.
- **Notes**: images that arrive late (what to draw before loading, the box before the size is known, one image per `src`, failed loads): `design/done/2026-11-06_text_box_accuracy_plan.md` §7.

## 11. Default Text Alignment
- **Status**: 💬 **Discussion**
- `<pxl-text>` uses the canvas defaults `align="start"`, `baseline="alphabetic"`; the other shapes are centered on `(x, y)`. `center` / `middle` would be consistent but moves every label that relies on the defaults (about 14 px).
- **For now**: keep the canvas defaults. A change is cheapest before the first release.

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
- **Open** (plan §7): the name of the star amount (`indent`), the element name, the default `start` and `sides`.

## 28. Draw in Another Element's Space (`space`)
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-10-30_space_attribute_plan.md`
- `space="ref.A"` makes A's frame the element's parent space: exact overlays and labels on moving shapes without the `toLocal()` clone rule.
- **Open**: the name (`space` / `frame`), the origin, the scope, a hidden target. Pick up together with the parked note `design/ideas/2026-10-25_refs_across_spaces_note.md`.

## 31. Isolated Compositing, Step 2: the Bounding Box
- **Status**: 🟢 **Decided**
- **Plan**: `design/done/2026-11-01_isolated_shape_compositing_plan.md` (step 1 built, plan §10)
- Clear and composite only the shape's device box instead of the whole scratch area: with 100 isolated shapes per frame 35 instead of 26 fps (DPR 2), no difference under about 50. Build it when a page needs it.

## 34. Quoted Text in Expressions: Docs
- **Status**: 💬 **Discussion**
- **Plan**: `design/done/2026-11-02_string_literals_in_expressions_plan.md` (§5, §7)
- **Open**: a `docs/text.html` section on what `text` accepts (plain text, single quotes, backticks, `\n`); a quoting convention for snippets in `docs/DOCS_STANDARDS.md`.

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

## 46. Evaluation Model
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-20_evaluation_model_plan.md` (merges the two-phase frame, reactive propagation and per-frame evaluation plans)
- **Next**: step 2, change-based dirty flags with the keep-alive in the stage: a layer redraws only when a value changed (a `floor(t)` clock once per second). Then a prototype of option B (no broadcasts) and decision D1 between it and option A (ordered broadcasts).
- **Also decided there**: scoped names instead of global ids (D8); B8 of `design/done/2026-10-27_engine_cleanup_inventory_note.md` (the evaluation loops either option rewrites).

## 47. Custom Shapes
- **Status**: 🟡 **Proposed**
- **Plan**: `design/2026-11-20_custom_shapes_plan.md` (replaces shape authoring; the structure cleanup in plan §6 is discussed separately)
- Custom shapes are written like built-in shapes, in a second script after `pxl.min.js`: one template, `static defaults` and `draw(ctx)` in logical units (the engine scales the canvas by `u`, in two phases), the tag defined with `pxl.defineShape()` (D3 decided); booleans from defaults; a public contract.
- **Next**: step 6, the docs (`docs/custom-shapes.html`, KILOPIXEL.md "Custom Shapes"). Steps 2–5 built: the template works (plan sections "Step 2 Built" … "Step 5 Built"). Check phase 1 in Safari. **Open**: D5, D7–D9.
