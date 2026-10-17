# Always `save()` / `restore()` per Shape

- **Status**: ⚪ **Undecided** (measurements in the real engine pending, §5)
- **Date**: 2026-10-17
- **Related**: `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, implemented; this plan was split off from its former §3), `.agents/TODO.md` §19
- **Target Implementation** (if adopted): `js/elements/shape.js` (`render`, `drawArrows`), `js/elements/shapes/grid.js`
- **Measurement Tools** (local only, scratch is git-ignored): `scratch/save_restore_audit.js`, `scratch/save_restore_bench.html`

---

## 1. Background

All shapes in a layer share one canvas context, and context settings persist until overwritten. Kilopixel keeps shapes independent with two rules:

1. **Stroke and text state is always set before drawing** (`applyStrokeState()`, `Text.draw()`).
2. **Transforms and compositing are wrapped in `save()` / `restore()`**, but only when a shape has them (`hasStateChanges` in `Shape.render()`).

Rule 1 only works with valid values. Before Rule A, a removed `miterlimit` (`null`) was ignored by the canvas, so the previous shape's value leaked in. Rule A (defaults plan) fixed that: bare and removed attributes now resolve to valid defaults, so there is **no known leak today**.

The open question is whether shapes should be isolated **structurally** as well, so that no future code path can leak state into the next shape.

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

For shapes whose only state is `x` / `y` (1,090 shapes), `translate` + undo `translate` measured ~0.6 µs cheaper per shape than `save` + `translate` + `restore`. That would be the speed-oriented alternative. Floating-point drift from undoing translations is negligible but not zero. Only worth pursuing if §5 shows that save / restore is a measurable cost.

---

## 5. Next Step: Measure in the Real Engine

1. Build a variant of `Shape.render()` that always saves (temporary, in `scratch/`, or behind a local flag that is not committed).
2. Pages: `examples/benchmark.html` plus 2–3 animated docs pages with many shapes without transforms (e.g. `docs/dashes.html` showcase, `docs/walkthrough.html`).
3. For each page and variant: let it run for ~10 s with the browser pane in the foreground, record `renderAvg` / `renderMax` (`ref.<stage>.renderAvg`), repeat 3× and take the median.
4. Optionally a synthetic worst case: 2,000 lines without `x` / `y` in one animated layer.

### Decision Criteria

| Result | Decision |
|---|---|
| Difference within noise on real pages, worst case < ~5% | ✅ adopt (code simplicity, structural isolation) |
| Measurable on real pages | ❌ keep the conditional save; Rule A already prevents known leaks |

---

## 6. Implementation Sketch (If Adopted)

```javascript
// Shape.render()
render(ctx, u, t) {
  this.evaluateAnimations(t);
  if (this.attributeValues.hidden) return;
  ctx.save();
  pxl.applyContextState(ctx, u, this.attributeValues, this);
  this.draw(ctx, u, t);
  ctx.restore();
}
```

Then remove the manual resets listed in §4.2, run `node build.js`, and update `.agents/KILOPIXEL.md` (Per-Frame Render Pipeline, Shape key methods).

### Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | All `docs/*.html` and `examples/*.html` | no console errors, visually unchanged |
| 2 | Arrowheads (filled and line) after a filled shape | arrowhead and following shape colours correct (no `fillStyle` reset needed) |
| 3 | `arrowstyle="line"` with a low `miterlimit`, followed by a polyline with default `miterlimit` | chevron tip sharp, following polyline uses its own miter limit |
| 4 | Grid with `major` followed by a line | line uses its own `strokewidth` |
