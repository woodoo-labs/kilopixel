# Always `save()` / `restore()` per Shape

- **Status**: 🟢 **Decided 2026-10-17: adopt** (implementation pending; reasoning and revised criterion in §5.4)
- **Date**: 2026-10-17
- **Related**: `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, implemented; this plan was split off from its former §3), `design/2026-10-17_shape_authoring_plan.md` (custom shapes), `.agents/TODO.md` §19
- **Target Implementation**: `js/elements/shape.js` (`render`, `drawArrows`), `js/elements/shapes/grid.js`
- **Measurement Tools** (local only, scratch is git-ignored): `scratch/save_restore_audit.js`, `scratch/save_restore_bench.html`, `scratch/save_restore/measure.html`, `scratch/custom_shape/test.html`

---

## 1. Background

All shapes in a layer share one canvas context, and context settings persist until overwritten. Kilopixel keeps shapes independent with two rules:

1. **Stroke and text state is always set before drawing** (`applyStrokeState()`, `Text.draw()`).
2. **Transforms and compositing are wrapped in `save()` / `restore()`**, but only when a shape has them (`hasStateChanges` in `Shape.render()`).

Rule 1 only works with valid values. Before Rule A, a removed `miterlimit` (`null`) was ignored by the canvas, so the previous shape's value leaked in. Rule A (defaults plan) fixed that: bare and removed attributes now resolve to valid defaults, so there is **no known leak in the built-in shapes today**.

The open question is whether shapes should be isolated **structurally** as well, so that no future code path can leak state into the next shape. Custom shapes (`design/2026-10-17_shape_authoring_plan.md`) make this concrete: their `draw()` is foreign code that may change canvas state without resetting it (§5.2).

---

## 2. Idea

Wrap every shape in `ctx.save()` / `ctx.restore()`, not only shapes with transforms or compositing. Each shape then starts from the layer's clean canvas state, whatever earlier shapes did.

---

## 3. Measurements So Far

### 3.1 How Many Shapes Already Save Today

Static analysis of every shape tag, mirroring `hasStateChanges` (`scratch/save_restore_audit.js`; any expression counts as a state change):

| Scope | Shapes | Already save/restore | Without |
|---|---|---|---|
| `examples/` | 1,589 | 1,092 (69%) | 497 |
| `docs/` | 856 | 578 (68%) | 278 |
| Animated layers (redraw every frame) | 1,294 | 871 (67%) | 423 |
| Static layers (drawn once) | 1,071 | 733 (68%) | 338 |

- **Most common trigger:** `x` / `y` (1,234 / 1,226 shapes). For 1,090 shapes, `x` / `y` are the **only** trigger.
- **Shapes that skip it:** lines (289 of 333), grids (76 of 80), polylines (107 of 284), and circles / rects placed at `0, 0` inside a positioned `<pxl-group>` (290).
- **Other triggers:** `rotate` 393, `scale` 170, `dx` 162, `blend` 89, `alpha` 80, `dy` 30, `filter` 29, `shadowcolor` 15, `scaley` 7, `mask` 3.

### 3.2 Cost of One Pair (Raw Canvas)

Raw canvas benchmark, no Kilopixel engine (`scratch/save_restore_bench.html`): 2,000 filled and stroked circles per frame, median of several rounds, timing includes rasterization (`getImageData` flush). The browser pane may have been in the background, so treat the numbers as indicative.

| Variant | µs per shape |
|---|---|
| Plain draw (absolute coordinates) | ~0.6–0.7 |
| `save()` + `restore()` added, no transform | +0.58 |
| `translate` + undo `translate` | ~1.3 total |
| `save` + `translate` + `restore` | ~2.0 total |

**Estimated impact:** the 423 shapes in animated example layers that skip saving today would add about 0.25 ms per frame **in total**. A page with 100 such shapes adds about 0.06 ms of a 16.7 ms frame budget. A real Kilopixel shape does much more work per frame than the raw benchmark (expression evaluation, transform pipeline, style), so the relative share should be smaller in practice. §5 verifies this.

---

## 4. Trade-offs

### 4.1 What It Would and Wouldn't Do

| | Rule A (implemented) | Always save |
|---|---|---|
| Leaks between shapes from empty / removed values | ✅ values are always valid | ✅ clean state per shape |
| Leaks from future code that changes context state and forgets to reset it | ➖ relies on "always set before use" | ✅ automatic |
| Leaks from invalid values (`miterlimit="abc"`) | ❌ out of scope | ✅ |
| Vanishing shapes, bare booleans, `on*` removal | ✅ | ❌ (not its job) |

### 4.2 What It Would Simplify

- `Shape.render()`: the 15-term `hasStateChanges` check disappears; `applyContextState` already skips neutral values.
- `drawArrows`: the manual `fillStyle` save/reset and the "not restored" `miterLimit` comment (`shape.js`).
- `Grid.draw`: the manual `lineWidth` reset for major lines.
- New features that touch context state (e.g. `paintorder`, TODO §14) can't leak into the next shape.

### 4.3 What It Would Not Change

- Rule 1 (set stroke / text state before drawing) is still needed: state set *inside* a shape's own draw (fill, then stroke, then arrowheads) must still be correct.
- Layers and groups keep their own conditional save.
- Hit testing (`InteractionEngine.process()`) already saves / restores per shape.

### 4.4 Opposite Direction (for Completeness)

For shapes whose only state is `x` / `y` (1,090 shapes), `translate` + undo `translate` measured ~0.6 µs cheaper per shape than `save` + `translate` + `restore`. That would be the speed-oriented alternative. Floating-point drift from undoing translations is negligible but not zero. Not pursued: save / restore is not measurable on real pages (§5.1).

---

## 5. Next Step: Measure in the Real Engine

1. Build a variant of `Shape.render()` that always saves (temporary, in `scratch/`, or behind a local flag that is not committed).
2. Pages: `examples/benchmark.html` plus 2–3 animated docs pages with many shapes without transforms (e.g. `docs/dashes.html` showcase, `docs/walkthrough.html`).
3. For each page and variant: let it run for ~10 s with the browser pane in the foreground, record `renderAvg` / `renderMax` (`ref.<stage>.renderAvg`), repeat 3× and take the median.
4. Optionally a synthetic worst case: 2,000 lines without `x` / `y` in one animated layer.

### Decision Criteria (Original, Revised in §5.4)

| Result | Decision |
|---|---|
| Difference within noise on real pages, worst case < ~5% | ✅ adopt (code simplicity, structural isolation) |
| Measurable on real pages | ❌ keep the conditional save; Rule A already prevents known leaks |

### 5.1 Results (2026-10-17)

Harness: `scratch/save_restore/measure.html` (A = current engine, B = same minified bundle + `scratch/save_restore/always_save.js`, which replaces `Shape.prototype.render` at runtime; no source changes). Every stage forced to `alwaysrender`; metric = total `Stage.render()` time per animation frame across all stages of the page. 2 s warm-up, 5 s measurement, 3 rounds alternating A/B order, median. Browser pane in the foreground, all runs at 60 fps.

| Page | A (ms / frame) | B (ms / frame) | Difference | Spread across rounds |
|---|---|---|---|---|
| `docs/dashes.html` (3 stages) | 0.612 | 0.624 | +0.012 ms (+1.9%) | A 0.59–0.65, B 0.61–0.81 |
| `docs/walkthrough.html` (9 stages) | 0.665 | 0.692 | +0.027 ms (+4.0%) | A 0.66–0.67, B 0.63–1.01 |
| benchmark `polyline-500` | 1.542 | 1.389 | −0.153 ms (−9.9%) | A 1.49–1.66, B 1.14–1.63 |
| benchmark `polyline-2000` | 6.373 | 6.620 | +0.247 ms (+3.9%) | A 6.29–6.89, B 6.08–6.63 |
| benchmark `swarm-1000` | 5.576 | 5.453 | −0.124 ms (−2.2%) | A 5.57–7.95, B 5.37–7.33 |
| benchmark `gradients-100` | 1.553 | 1.274 | −0.279 ms (−18%) | A 1.42–1.64, B 0.94–1.60 |
| benchmark `math-300` | 7.484 | 7.194 | −0.290 ms (−3.9%) | A 6.76–7.55, B 6.26–7.24 |
| **Worst case** `scratch/save_restore/lines.html` (2,000 animated lines, no `x` / `y`) | 3.061 | 4.359 | **+1.298 ms (+42%)** | A 3.00–3.27, B 4.20–4.58 |

**Reading the results:**
- **Real pages: within noise.** Differences go both ways and are smaller than the spread between rounds. Reason: on these pages almost every shape already saves (swarm circles and gradient rects have `x` / `y`, gradient rects also `rotate`), and the polyline presets draw only 2 polylines.
- **Worst case: clearly measurable.** +0.65 µs per shape, matching the raw canvas benchmark (§3.2). For 2,000 bare lines that is +1.3 ms per frame, about 8% of the 16.7 ms frame budget. A bare line costs only ~1.5 µs per frame in the engine, so save / restore adds ~42% to the cheapest kind of shape.
- **Who would pay it:** scenes with many shapes without transforms: lines, polylines and grids with absolute coordinates (charts, diagrams, particle trails), and shapes at `0, 0` inside a positioned group.

**Outcome by the original criteria:** real pages pass (within noise), the worst case fails (+42% instead of < ~5%). §5.2–§5.4 explain why the decision is to adopt anyway.

### 5.2 Custom Shape Leak Test (2026-10-17)

`scratch/custom_shape/test.html`: a user-made `Star` (separate `star.js`, `class Star extends Shape`) and a careless variant `GhostStar` whose `draw()` sets `ctx.globalAlpha = 0.2` and never resets it. Pixel alpha of shapes drawn with full colour (255 = clean):

| Measured shape | Today | Always save |
|---|---|---|
| Star **with** `x` / `y` (saves today), drawn **before** the careless shape in DOM order | **51** | 255 |
| Line after a careless shape inside a positioned group | **51** | 255 |
| Line after a careless shape at layer level (no `x` / `y`) | **51** | 255 |

One careless shape fades the **whole layer**, not only the next shape:
- The layer doesn't reset the canvas state between frames, so the leaked value carries over into the next frame and reaches shapes drawn *before* the careless one.
- `save()` only copies the current state. Shapes that save today copy the already-leaked state.

So the conditional save gives **no protection against foreign code**. With always save, the leak stays inside the careless shape.

### 5.3 Use Cases & Limits

The cost only appears when **all three** hold: the layer is **animated** (static layers draw once), it contains **thousands** of shapes, and those shapes have **no transform** (no `x` / `y`, `rotate`, `alpha`, …).

| Use case | Shapes without save? | Typical count | Extra cost per frame |
|---|---|---|---|
| Hand-written scenes, docs pages | few | tens to hundreds | not measurable (§5.1) |
| Network graphs / diagrams (edges as `<pxl-line>` from node to node) | yes | 50–500 edges | ~0.03–0.3 ms |
| Framework-generated charts (bars, scatter points) | mostly no (`x` / `y`) | 100–1,000 | ~0 |
| Line charts (one polyline per series), grids | one shape each | 1–20 | ~0 |
| Generative art (many lines / polylines with own `wave()` expressions) | often yes | 100–1,000 | ~0.07–0.65 ms |
| Repeated components (positioned groups, shapes at `0, 0` inside) | yes, the inner shapes | tens of groups | small |
| Server-rendered HTML (template loops) | depends | any | usually static → 0 |

- **Many lines don't mean many shapes:** one `<pxl-polyline>` with 2,000 points or one `<pxl-grid>` is a single shape with a single save (benchmark `polyline-2000`: no difference).
- **Thousands of separate animated shapes** are typically generated by a script; at that point an imperative canvas approach fits better than a declarative one. Kilopixel's target is scenes that are read and written as HTML.
- **Slow devices:** measured on a desktop. On low-end phones canvas calls can be several times slower, so the worst case (2,000 bare animated lines) could cost ~5 ms more per frame instead of 1.3 ms. Still within a frame, with less headroom.
- **Mitigations users already have:** one polyline instead of many lines; static parts in their own layer (static layers don't redraw).

### 5.4 Decision (2026-10-17): Adopt

**Revised criterion:** real pages within noise, and the synthetic worst case still renders at 60 fps (2,000 bare animated lines: 4.4 ms per frame with always save).

**Reasoning:**
1. **Simpler engine code:** one rule ("every shape draws in its own clean state") replaces the 15-term `hasStateChanges` list, which has to mirror `applyContextState()` and silently leaks if the two lists drift apart; manual resets in `drawArrows` and `Grid.draw` disappear (§4.2).
2. **Safety for custom shapes:** foreign `draw()` code can't fade or restyle other shapes (§5.2). The custom-shape docs can say: "change any canvas setting you like, it only affects your shape".
3. **The cost is outside the target use:** it only shows with thousands of animated shapes without transforms, which is unusual for a declarative scene, and even then stays within budget (§5.3).

---

## 6. Implementation

```javascript
// Shape.render()
render(ctx, u, t) {
  this.evaluateAnimations(t);
  if (this.attributeValues.hidden) return;
  ctx.save();
  pxl.applyContextState(ctx, u, this.attributeValues, this);
  this.draw(ctx, u, t);   // draw(ctx, u) once the shape authoring plan removes t
  ctx.restore();
}
```

1. `js/elements/shape.js` — `render()` as above; in `drawArrows`, drop the manual `fillStyle` save / reset, the dash re-apply after the chevron stroke, and the "not restored" comment.
2. `js/elements/shapes/grid.js` — drop the manual `lineWidth` reset for major lines.
3. Layers and groups keep their conditional save (one per container per frame, not affected by foreign shape code).
4. `node build.js`.
5. `.agents/KILOPIXEL.md` — Per-Frame Render Pipeline and Shape key methods: every shape draws inside `save()` / `restore()`; rule 1 (set state before use) still applies inside a shape.

### Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | All `docs/*.html` and `examples/*.html` | no console errors, visually unchanged |
| 2 | Arrowheads (filled and line) after a filled shape | arrowhead and following shape colours correct (no `fillStyle` reset needed) |
| 3 | `arrowstyle="line"` with a low `miterlimit`, followed by a polyline with default `miterlimit` | chevron tip sharp, following polyline uses its own miter limit |
| 4 | Grid with `major` followed by a line | line uses its own `strokewidth` |
| 5 | `scratch/custom_shape/test.html` with the real build (no runtime patch) | star and both lines at full alpha (255) |
| 6 | `scratch/save_restore/measure.html` with the real build as A | A and B identical within noise (B's patch becomes a no-op) |
| 7 | Rule A unit tests (`scratch/rule_a/unit.html`) and regression (`scratch/rule_a/regress.html`) | 20 / 20; identical values, no new console errors |
