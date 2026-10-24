# Unified Arrowhead Geometry Plan (Exact Insets, Zero-GC, Vector API)

- **Status**: 🟢 **Implemented (engine) — docs pending**
- **Date**: 2026-10-14
- **Supersedes**: `design/2026-10-12_centralized_arrowhead_geometry_plan.md`, `design/2026-10-13_simplified_arrowhead_geometry_plan.md`, `design/2026-10-13_arrowhead_linecap_alignment_and_spline_integrity_plan.md` (kept as history)
- **Target Implementation**: `js/elements/shape.js`, `js/elements/shapes/line.js`, `js/elements/shapes/polyline.js`, `js/elements/shapes/circle.js`, `js/elements/shapes/ellipse.js`
- **Validation**: `scratch/arrow_testgrid.html` (new), `docs/arrows.html`, `docs/line.html`, `docs/circle.html`, `docs/ellipse.html`, `examples/test24.html`

---

## 1. Problem Summary

The current code (as of `9a956bd`) has these defects:

| # | Defect | Where |
|---|--------|-------|
| D1 | **Unit mixing**: pixel `sw` is compared with the logical values `size·0.8` and `R`, then passed to `asin` / `speed`. As a result, the pullback and the arrow direction change with the canvas size. | circle, ellipse |
| D2 | **Filled pullback too shallow**: `min(sw + cap, 0.8·S)` leaves only `0.077·sw` of lateral margin for a butt cap. On curves the stroke edge pokes out beside the triangle (see the screenshot of the thick blue arc). | all |
| D3 | **Arrow direction on curves** is the chord over the *pullback* distance, not over the arrowhead's length, so the triangle's base doesn't sit on the curve. | circle, ellipse |
| D4 | **Linecap principle only partly applied**: circle and ellipse never advance the tip by the cap extension. | circle, ellipse |
| D5 | **`line` style join handling** only distinguishes `round` from everything else. `bevel` and `miter` with `miterlimit < 2` get the wrong vertex position. | line, polyline |
| D6 | **`line` style shaft** ends exactly at the chevron's inner corner (`9a956bd`), which can leave an anti-aliasing seam. The cap shape isn't taken into account. | all |
| D7 | **Smoothed polyline**: the end point is moved straight back while the control points stay the same, so the shortened end isn't on the curve. The start (`moveTo` on a pulled-back point) isn't integrated into the spline at all. | polyline |
| D8 | **Leaked stroke state**: when `stroke` is unset, `drawArrow` uses the `strokeStyle` / `lineWidth` left over from the previous shape. | shape |
| D9 | **Insets longer than the path**: circle and ellipse drop the pullback entirely; line and polyline reverse the shaft direction. | all |
| D10 | **Undefined combinations**: arrows together with `pie`, `ir`/`irx`/`iry`, `closed`, or a closed polyline. | circle, ellipse, polyline |
| D11 | **Duplicated math**: four copies of the sizing, cap and inset code, which have already drifted apart. | all |

### What we learned from history
- **The week-old version** (`a5cb956`) used units correctly on curves and had a deep pullback (`0.75·size`), so it was robust against D2. Its only real flaw was **writing the pullback into `flatCache`** before the spline loop ran, which bent the last Catmull-Rom segment.
- The 13 Oct plans fixed the spline bending by **shrinking the pullback**. That treated the symptom, not the cause, and led directly to D2.
- **This plan**: the pullback depth is calculated exactly from the geometry and is deep again. Spline integrity comes from **leaving `flatCache` untouched and trimming the end segments exactly** (de Casteljau on the first and last segment only).

---

## 2. Design Principles

1. **The cap defines where the line ends, and the arrow tip ends at the same spot.** This holds for both styles (`filled` and `line`) and all caps. (Same principle as the 13 Oct plans.)
2. **The arrow is purely the user's choice.** There is no clamping and no minimum size. If `arrowend` is smaller than `strokewidth`, the triangle is narrower than the stroke, and that's intended. The engine only makes sure the shaft ends cleanly at the arrowhead's base (§3.4).
3. **All arrow geometry is in physical pixels** (`·u` applied once, at resolution time). Logical units never enter the trigonometry.
4. **A single source of truth**: one resolver in `Shape` produces scalar distances. Each shape only maps the *distance along its path* onto its own geometry.
5. **Zero allocations per frame**, no `atan2`, and a fixed number of canvas calls (§5).
6. **Continuity**: geometry changes continuously when `arrowstart`/`arrowend`/`strokewidth` are animated. The only exceptions are discrete attribute switches (`linecap`, `linejoin`, `arrowstyle`).

---

## 3. Geometry (all values in px)

### 3.1 Notation

| Symbol | Meaning |
|---|---|
| `W` | `strokewidth · u` |
| `S` | arrow size (wing side length) `· u`; `'auto'` → `3.6 · W` |
| `L` | arrow length (tip to base along the axis) `= S · cos30° = 0.8660·S` |
| `H` | half-width of the arrow base `= S · sin30° = 0.5·S` |
| `P` | the declared end point of the path (e.g. `x2,y2`) |
| `d` | unit direction pointing *out of* the path at the arrow (towards the tip) |
| `capExt` | cap extension: `0` for `butt`, `W/2` for `square` and `round` |

The arrowhead keeps today's shape: a 30° half-angle, size = wing side length.

### 3.2 Arrow tip
```
tip = P + capExt · d                           (both styles: visible tip = cap boundary)
```

### 3.3 `filled`: depth of the shaft end inside the triangle

The **visible** end of the shaft (including its cap) has to fit inside the triangle's 30° wedge. Measured as the depth `D` of the shaft's *path end* behind the tip:

| Cap | Critical geometry | Minimum depth `Dmin` |
|---|---|---|
| `butt` | corners at depth `D`, lateral `W/2` → `D·tan30 ≥ W/2` | `0.8660·W` |
| `square` | corners at depth `D − W/2` | `0.8660·W + 0.5·W = 1.3660·W` |
| `round` | disc of radius `W/2` centred at depth `D` → `D·sin30 ≥ W/2` | `1.0·W` |

These are exact for straight paths. On curves the stroke's outer edge bulges, so we add a curvature margin through a minimum fraction of the arrow length:

```
D = max(Dmin, K_DEPTH · L)        K_DEPTH = 0.6 (constant, tuned with the test grid)
```

With `'auto'` (`S = 3.6·W`, `L = 3.12·W`) this gives `D = 1.87·W`. The lateral margin at that depth is `1.08·W` against a requirement of `0.5·W`, which is ample even on tight arcs.

**Small arrows (Principle 2)**: if the triangle is narrower than the stroke, the shaft can't be hidden inside it. In that case the visible shaft end sits **flush with the arrow's base**: `D = L + capExt` (visible shaft end, including the cap, is on the base line). The triangle then sits on the stroke end like a pointed cap. Its tip still lands on the cap boundary, so the linecap principle holds.

Both cases are combined into **one continuous formula** (no `if`):
```
D = min( max(Dmin, K_DEPTH · L),  L + capExt )
```
- Normal arrows (`Dmin ≤ L`): `max(...) ≤ L ≤ L + capExt`, so `D = max(Dmin, K_DEPTH·L)`.
- Very small arrows: the result is clamped to `L + capExt` (flush with the base).
- In between (`L < Dmin < L + capExt`), `D` moves smoothly from one regime to the other.

**Continuity requirement (Principle 6)**: arrow sizes are often animated (`examples/test24.html` §5: `arrowend="5 + wave(1)*40"` with `strokewidth="6"`, which passes the small-arrow threshold at `S ≈ 6.9` every cycle). `D`, `inset` and `tip` must therefore be **continuous in `S` and `W`**. The `min/max` form guarantees this. A hard `if (Dmin > L)` switch would make the shaft jump by `capExt` (`3px` there) twice per cycle.

**Inset along the path** (distance from `P` back to the shaft's path end):
```
inset = D − capExt
```
This is never negative: the smallest values are `0.866·W` (butt), `0.866·W` (square) and `0.5·W` (round).

### 3.4 `line` (chevron): vertex and shaft end

The chevron's stroke extends forward beyond its path vertex `V` by `joinExt`:

| Join | `joinExt` |
|---|---|
| `miter` (any `miterlimit`; see note below) | `W` |
| `bevel` | `W/2 · sin30 = 0.25·W` |
| `round` | `W/2` |

**Update 2026-10-14 — sharp miter tips:** a 60° miter needs a canvas miter limit of 2 (`1/sin30`). `drawArrows` raises `ctx.miterLimit` to at least 4 (headroom for float rounding) for the chevron stroke only, so a low path `miterlimit` (e.g. to blunt sharp polyline corners) never cuts off the arrow tip. Explicit `linejoin="bevel"` / `"round"` are still respected.

```
V = tip − joinExt · d = P + (capExt − joinExt) · d
```

**The shaft's visible end is placed exactly at `V`** (not at the inner corner of the chevron). At `V` the chevron's stroke fully covers a butt end of half-width `W/2`: the distance to the wing line is `0.433·W < 0.5·W`. A `square` or `round` cap, though, would poke forward through the outer miter edges. So the shaft's *path* ends one `capExt` earlier:
```
shaftEnd = V − capExt · d = P − joinExt · d      →   inset = joinExt
```
That gives a clean result: for the `line` style the inset depends only on the join, and the cap only moves the tip.

The chevron's wings keep using the shape's `linecap` (unchanged behaviour). Chevrons are always drawn solid, never dashed (unchanged).

### 3.5 Summary per arrow end (the output of the resolver)

| Field | `filled` | `line` |
|---|---|---|
| `size` (px) `S` | resolved | resolved |
| `len` (px) `L` | `0.866·S` | `0.866·S` |
| `tipAdvance` | `capExt` | `capExt − joinExt` (path vertex) |
| `inset` | `D − capExt` | `joinExt` |

`tipAdvance` is applied along `d` from `P`. `inset` is applied *along the path* from `P`.

---

## 4. Per-Shape Mapping

Each shape does exactly three things per arrow end:
1. **Trim**: find the shaft's path end at path distance `inset` from `P`.
2. **Direction**: compute the unit vector `d`. On straight paths it's exact. On curves it's the **chord from the curve point at distance `len` back to `P`**, so the triangle's base sits on the curve (fixes D3).
3. **Tip**: `P + tipAdvance · d`, stored for `drawArrows`.

### 4.1 `<pxl-line>`
- `dx = x2 − x1`, `dy = y2 − y1` (in px), `invLen = 1 / sqrt(dx² + dy²)`. **One `sqrt`, no `atan2`, no trig.**
- End: `d = (dx, dy)·invLen`. Start: `d = −(dx, dy)·invLen`.
- Shaft from `P1 − inset1·d1` to `P2 − inset2·d2`.
- **Too short (D9)**: if `inset1 + inset2 ≥ length`, skip the shaft and still draw the arrows.

### 4.2 `<pxl-polyline>`, straight
- `flatCache` is **never mutated**.
- End direction comes from the last segment (normalized, one `sqrt`). The start works the same way.
- The inset only trims the first/last segment: `moveTo(P0 − inset·d0)` and `lineTo(Pn − inset·dn)`.
- **Too short (D9)**: if the inset is ≥ the segment length, clamp it to the segment length (the shaft never reverses). It doesn't walk back across several segments, to keep things simple; the arrow just overlaps.

### 4.3 `<pxl-polyline smooth>`: exact end-segment trimming (fixes D7)
The Catmull-Rom segments are computed exactly as today, from the untouched `flatCache`. Only the **first and last Bézier segment** get special handling (outside the hot loop, so the loop stays branch-free):

1. **Find the parameter** `tI` from the chord estimate `tI = 1 − inset / |p2 − p1|` (clamped to `[0, 1]`). *(Simplified on 2026-10-14: no secant refinement. The inset is short compared with the segment, so the error is sub-pixel.)* *(2026-10-24: the error was not sub-pixel (11.2 px intended → 7.1 px), and with free ends far worse. Replaced by `trimParameter`: 12 bisection steps on the straight distance from the end, `design/2026-10-23_smooth_polyline_spline_plan.md` §5.2. Same for `tL` in step 4.)*
2. **Split with de Casteljau** at `tI` (about 20 multiplications). For the end segment, emit the sub-curve `[0, tI]` as `bezierCurveTo(q0, r0, S)`. For the start segment, `moveTo(S)` followed by `bezierCurveTo(r1, q2, p2)` for the sub-curve `[tI, 1]`.
3. **Polylines with only 2 points** are treated as straight even when `smooth` is set. With clamped end points, the Catmull-Rom curve through 2 points *is* a straight line. This removes the "single segment with both arrows" special case. *(Simplified on 2026-10-14.)*
4. **Direction**: evaluate `B(tL)` with the chord estimate for the distance `len`, then `d = normalize(P − B(tL))`.

The curve that is drawn is **pixel-identical** to the curve without arrows, only shorter. The 13 Oct plan rejected de Casteljau as over-engineering only because it was being used to work around a shallow pullback. With a deep pullback it's the exact and cheap solution: it runs once per arrow per frame, with zero allocations.

### 4.4 `<pxl-circle>`
- `Rpx = safeR · u` (**the fix for D1**: all values in px).
- Trim angle (exact, arc length): `δI = inset / Rpx`. *(2026-10-24: now the straight distance like all arrowheads, `δI = 2·asin(min(inset, 2·Rpx) / (2·Rpx))`; `design/2026-10-23_smooth_polyline_spline_plan.md` §5.4.)*
- Base point for the direction (chord of length `len`): `δL = 2·asin(min(len, 2·Rpx) / (2·Rpx))`. `B = Rpx·(cos(θ ∓ δL), sin(θ ∓ δL))`, `d = normalize(P − B)`.
- `P = Rpx·(cos θ, sin θ)` reuses the same `cos`/`sin`. Per arrow that's one `asin`, 2× cos/sin and one `sqrt`.
- **Too short (D9)**: if `δI_start + δI_end ≥ |sweep|`, skip the arc stroke and still draw the arrows.

### 4.5 `<pxl-ellipse>`
- Same structure as the circle, in px (`rx·u`, `ry·u`).
- Trim parameter: `δ ≈ inset / speed(θ)` with `speed = sqrt((rx·u·sinθ)² + (ry·u·cosθ)²)`, **plus 1 correction step**: measure the actual chord `c` to `P(θ ∓ δ)` and set `δ *= inset / c`. This makes the error negligible even on very eccentric ellipses.
- The base point at distance `len` is found the same way.

### 4.6 Combinations without arrows (D10)
Arrowheads only make sense on **open** strokes. They are ignored (with no setup cost, via the fast path) when:
- circle / ellipse: `pie`, `closed`, `ir > 0` / `irx|iry > 0`
- polyline: `closed`

A full sweep (`360°`) with arrows stays an open arc (as today, `8bbebe8`). This must be documented on `arrows.html` and in `Kilopixel.md`.

---

## 5. Performance & GC (60fps hot loop)

### 5.1 Zero allocations
- **Pre-allocated output records per arrow end**, created once in the constructor of the four arrow shapes only (Rect/Text/Grid stay untouched):
  ```javascript
  this._arrowStart = pxl.createArrowRecord(); // start
  this._arrowEnd = pxl.createArrowRecord();   // end
  ```
  The shared factory (`graphics.js`) initializes every field as a double (`NaN`), so all four shapes share one hidden class and V8 never has to change the field representation later. No `{x, y}` objects are returned, and there are no closures or temporary arrays.
- The resolver **writes into** the record: `this.resolveArrow(rec, attrValue, u)` returns `rec.size > 0` as a boolean.

### 5.2 Less transcendental math
| | Today (per arrow) | New (per arrow) |
|---|---|---|
| line / polyline-straight | `atan2` + `cos` + `sin` + 4 trig in `drawArrow` | **1 `sqrt`** (shared by both ends on a line) |
| circle | `asin` + 4 trig + `atan2` + 4 trig in `drawArrow` | `asin` + 4 trig + 1 `sqrt` |
| `drawArrow` | `cos(t±φ)`, `sin(t±φ)` = 4 trig | **0 trig**: the wings are a rotation by the constants `COS30`/`SIN30`:<br>`w = tip − S·(dx·C30 ∓ dy·S30, dy·C30 ± dx·S30)` |

The constants `pxl.ARROW_COS30 = 0.8660254`, `pxl.ARROW_SIN30 = 0.5` and `pxl.ARROW_K_DEPTH = 0.6` are defined once in `graphics.js`.

### 5.3 Fewer canvas calls (batching)
`drawArrows(ctx, u)` replaces two `drawArrow` calls and draws **both arrows in one path**:
- `filled`: `beginPath` → 2 triangles → **1× `fill()`** (instead of 2). `fillStyle` is swapped once and restored once.
- `line`: `beginPath` → 2 chevrons → **1× `stroke()`**. `setLineDash` is switched off/on at most once.

Hit testing (`pxl.dummyCtx` intercepts `fill`/`stroke`) keeps working without changes, because the arrows are still drawn by `draw()`.

### 5.4 Fast paths and branches
- **Fast path unchanged**: no arrows → the original path code with no arrow math. Also skipped when `stroke` is empty/`none`/`transparent` (fixes D8: arrows inherit the stroke colour, so without a stroke there is nothing to draw, and no leaked state).
- **The Catmull-Rom hot loop stays branch-free**: start and end trimming happen before and after the loop (§4.3).
- `resolveArrow` uses a few string comparisons (`linecap`, `linejoin`, `arrowstyle`) per arrow end and frame. These are interned strings, so it costs nanoseconds. Caching by attribute version would add complexity for no measurable gain, so it's deliberately left out.

### 5.5 Budget
Per arrow end: about 30–60 flops, ≤ 6 transcendental calls (curve shapes) or 1 `sqrt` (straight shapes), 0 bytes allocated, and at most 1 extra `fill`/`stroke` per *shape* (not per arrow). To be verified with a benchmark page (1,000 animated arrows, `renderAvg`) in `scratch/`.

---

## 6. API (`js/elements/shape.js`)

```javascript
// Resolves one arrow end into pixel distances (writes into rec; zero-GC).
// Returns true if this end has an arrowhead.
resolveArrow(rec, attrValue, u) { ... }        // fills size, len, tipAdvance, inset

// Draws both arrowheads in a single path (rec.size === 0 → skipped).
// Expects rec.tipX/tipY/dirX/dirY to be set by the shape.
drawArrows(ctx, u, recA, recB) { ... }
```
- `drawArrow(ctx, u, tipX, tipY, tangent, size, style)` is **removed**. It's internal and only called by the four shapes (to be checked with grep before removing).
- The `'auto'` factor `3.6` lives in exactly one place (`resolveArrow`).
- Attribute behaviour is unchanged: `arrowstart` / `arrowend` (number or `'auto'`), `arrowstyle` (`'filled'` | `'line'`). Values `≤ 0` mean no arrow. **No minimum size** (Principle 2).

---

## 7. Known Limitations / Non-Goals
- On straight polylines, an inset longer than the last segment does not walk back across further vertices (§4.2).
- The dash phase of the shaft shifts by `inset` at the start (the shaft begins later). This could be compensated with `lineDashOffset` if it bothers anyone; not part of this plan.
- Ellipse trimming is approximate (1 correction step), but more than accurate enough at the pixel level. *(2026-10-24: not at the tip of thin ellipses (100 × 10: 11.2 px intended → 3.2 px, the shaft poked out). Replaced by 12 bisection steps on the angle; `design/2026-10-23_smooth_polyline_spline_plan.md` §5.4.)*
- `paintorder` interaction (TODO.md) is out of scope.

---

## 8. Implementation Checklist

- [x] `graphics.js`: constants `ARROW_COS30`, `ARROW_SIN30`, `ARROW_K_DEPTH`.
- [x] `shape.js`: `resolveArrow()`, `drawArrows()`; remove `drawArrow()`.
- [x] `line.js`: vector API, trim, D9 handling.
- [x] `polyline.js`: untouched `flatCache`; straight trim; smooth trim with de Casteljau using the chord estimate (start, end); 2-point polylines drawn straight; ignore arrows when `closed`.
- [x] `circle.js` / `ellipse.js`: all in context units; exact trim angle; chord over `len`; D9; ignore arrows for `pie`/`closed`/`ir`.
- [x] Constructors: `_arrowStart` / `_arrowEnd` records only in the four arrow shapes.
- [x] `node build.js`.
- [x] Regression check: `examples/test24.html` (all 7 sections). **Note**: test24 only covers `<pxl-line>`, so it doesn't catch D1–D3, D7 or D10.
- [x] `scratch/arrow_testgrid.html`: shape × style × cap × join × (`auto`, small arrow `< strokewidth`) × two stage widths; old (`a5cb956`) vs new side by side. It reuses test24's proven patterns:
  - **Ghost reference path**: the same path *without* an arrow, semi-transparent, drawn next to it (test24 §1). The arrow tip has to land exactly on the ghost's cap boundary, marked with dashed guide lines.
  - **Gradient strokes** (`linear(...)` on `stroke`): the arrow takes its colour from the stroke gradient, and vertical lines have a zero-width bounding box (see `2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md`).
  - **Extremes** (test24 §4): huge arrow on a thin stroke, tiny arrow on a thick stroke, two different sizes on one path.
  - **Animated size across the small-arrow threshold** (test24 §5) to check continuity (Principle 6), and rotated/nested transforms (test24 §6).
  - **New**: arcs with small `r` (tight curvature), eccentric ellipses (`rx ≫ ry`, end on the flat and the pointed side), smooth polyline with a short end segment, single-segment smooth polyline with both arrows, and paths shorter than both insets combined (D9).
- [x] `scratch/arrow_bench.html`: 1,000 animated arrows, compare `renderAvg` / `renderMax` with today.
- [ ] Docs: `arrows.html` section 3 (all shapes now advance the tip for the cap), document the open-stroke rule (§4.6), `Kilopixel.md` (element references + `drawArrows`), polyline arrows.
- [x] Mark the 12 Oct / 13 Oct plans as "Superseded by 2026-10-14".
