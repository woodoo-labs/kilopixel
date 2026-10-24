# Smooth Polyline Spline: Centripetal Catmull-Rom (D3 Style)

- **Status**: 🟢 **Implemented** (2026-10-24; deviation from §4.3: one shared `loadSegment()` per segment instead of an inline rolling loop, §4.3.3). **The seam rule (§4.2) was implemented and removed again the same day**: round or sharp is decided by the points alone, `closed` only adds the closing segment (§4.2).
- **Date**: 2026-10-23
- **Related**: `.agents/TODO.md` §15 (spline quality), `design/2026-10-14_unified_arrowhead_geometry_plan.md` (arrow trimming on smooth polylines, §4.3), `design/2026-10-18_polyline_optimization_plan.md` (§5 edge cases #8, #9, #11, #12; §6.2 smooth loop), `design/2026-09-07_plot_element_plan.md` and `design/2026-09-30_path_element_plan.md` (both reuse the polyline spline)
- **Target Implementation**: `js/elements/shapes/polyline.js`, `js/elements/shapes/circle.js` and `ellipse.js` (arrow trim, §5.4), `.agents/KILOPIXEL.md` (Smoothing, Arrowheads), `docs/polyline.html` (section 2)
- **Test Pages** (local, scratch is git-ignored): `scratch/polyline_shapes/smooth_ends.html` (17 cases × 6 variants A–F, opens directly from the file system; `?v=AF` shows only some variants), `smooth_bench.html` (loop benchmark, §4.3.1), `arrow_trim.html` (polyline arrow trimming, §5.2), `ellipse_arrows.html` (ellipse arrows, real engine, §5.4; needs the dev server)

---

## 1. Goal

`<pxl-polyline smooth>` should look right at its ends and with unevenly spaced points, without changing what `smooth` means:

- **Ends**: the curve must not straighten out before the first / last point.
- **Uneven spacing**: no hooks next to short segments, no run-back past an end point, collinear points stay straight.
- ~~**Paths that end on their first point** (bow tie, figure eight, a `closed` polyline that repeats its first point): smooth across that point, like a closed curve.~~ Dropped on 2026-10-24 (§4.2): such a path has a corner at its start; smooth loops use `closed`.
- `smooth="1"` stays the default, `0` stays straight, higher values bend further out.

## 2. Today

Uniform Catmull-Rom with clamped ends (the missing neighbour of an end point is the end point itself):

```
cp1 = P1 + (P2 − P0) · k/6        cp2 = P2 − (P3 − P1) · k/6        k = smooth
```

Known problems (TODO §15, plan 2026-10-18 §5):

| # | Input | Today |
|---|---|---|
| 1 | Any open smooth polyline | the end direction is forced onto the chord to the next point: the curve straightens out before the end (zig-zag in `polyline.html` section 2, wave in `arrows.html` section 1) |
| 2 | Short first / last segment | hook at the end |
| 3 | Collinear, unevenly spaced points (`20,110; 40,110; 280,110`) | the curve runs back past the start point (visible with round caps or arrowheads) |
| 4 | Duplicate point (#8 of the 2026-10-18 plan) | cusp / tail past the point |
| 4b | Duplicate first / last point + arrowhead (#7 of the 2026-10-18 plan) | the head points right |
| 5 | Open path that ends on its first point (bow tie) | the two arms at that point don't match the rest of the curve |
| 6 | `closed` polyline that repeats its first point (#9 of the 2026-10-18 plan) | kink at the seam |

## 3. Variants Compared (2026-10-23)

All variants were drawn with the same Bézier code in `scratch/polyline_shapes/smooth_ends.html`. Column A at `k = 1` is today's engine.

| Variant | What | Result |
|---|---|---|
| A | today: uniform, clamped ends | straight ends, hooks and run-back with uneven spacing |
| B | uniform, natural ends (zero curvature at the end) | good on evenly spaced points at `k = 1`; overshoots at `k ≥ 1.7`, hooks and run-back with uneven spacing (as found on 2026-10-15) |
| C | centripetal, natural ends | fixes uneven spacing; wobbly at `k = 2` (the natural end handle is scaled by `k` and overshoots) |
| **D** | **centripetal, end handle on the end point** (D3 `curveCatmullRom`, default `alpha = 0.5`) | clean in every case except #5: the bow tie at `k = 1.7` gets a dent next to its coinciding ends |
| E | Konva `Line` tension: distance-weighted handles, quadratic first / last segment | nearly as good as D, slightly lumpy where a short segment meets a long one |
| **F** | **D + seam rule** | clean in every case, including the bow tie |

How other libraries handle the ends: D3 `curveCardinal` and Chart.js clamp (like today); D3 `curveCatmullRom` puts the end handle on the end point (D); Konva draws quadratic end segments (E); Paper.js offers `'catmull-rom'` (centripetal by default), `'geometric'` and `'continuous'`.

Not considered: **global splines** (D3 `curveNatural`, Paper.js `'continuous'`): moving one point changes the whole curve, animated points need a solve over all points per frame, no tension. **Monotone** (Chart.js, D3 `curveMonotoneX`): data running left to right only. **B-splines** (D3 `curveBasis`): don't pass through the points. **p5.js `curveVertex`**: the user supplies extra end control points.

**Decision: F.** *(2026-10-24: changed to **D**. The seam rule was removed, §4.2. The bow tie's dent is avoided by writing it with 6 points and `closed`.)*

## 4. The Spline

### 4.1 Handles per point

For point `Pj` with incoming segment `Δin = Pj − Pj−1` (length `dIn`) and outgoing segment `Δout = Pj+1 − Pj` (length `dOut`), and `aIn = √dIn`, `aOut = √dOut` (centripetal, alpha 0.5):

```
T     = dIn · Δout + dOut · Δin                 tangent direction at Pj
hOut  =  k · T / (3 · aIn  · (aIn + aOut))      handle towards Pj+1   (cp1 of segment j → j+1 = Pj + hOut)
hIn   = −k · T / (3 · aOut · (aIn + aOut))      handle towards Pj−1   (cp2 of segment j−1 → j = Pj + hIn)
```

- At `k = 1` this is exactly D3's `curveCatmullRom` (the Yuksel / Barry-Goldman Bézier form, rewritten as handles).
- **Evenly spaced points give today's curve**: with `dIn = dOut = d` the handles are `±(Pj+1 − Pj−1) · k/6`. Only ends and uneven spacing change.
- Both handles are parallel (no kink). Their lengths have the ratio `aOut : aIn`: the handle on the side of the shorter segment is shorter, which removes the hooks.
- **Degenerate side** (`aIn < ε` or `aOut < ε`, ε ≈ 1e-6 px): that side's handle is 0 (D3 does the same). A missing neighbour counts as a zero-length segment, so **free ends get no handle** without a special case: the curve leaves the end point towards the next control point.
- **Duplicate points make a corner.** At a repeated point both neighbouring handles are 0, so the curve arrives and leaves without a handle: a sharp corner instead of today's cusp or small loop. This is a feature and gets documented ("repeat a point to get a corner in a smooth polyline"). It is continuous: as two points move together, the handles shrink with the square root of the gap (measured: gap 10 → handle 18, 1 → 6.8, 0.1 → 2.3, 0.001 → 0.23), so there is no jump when they meet. All points identical → a single point, no `NaN`.
- **Scale**: the handles scale with the points (checked at ×3), so the shape doesn't change when the stage resizes. The curve is computed in the polyline's local space, before `rotate` / `scale` / group transforms.
- **Non-finite point**: breaks the same 4 neighbouring segments as today (canvas skips calls with `NaN`); the 2026-10-18 plan (#4) handles it separately.
- `smooth="0"` → all handles 0 → straight (as today; the 2026-10-18 plan #11 can still route it to `traceStraight`).
- Negative `smooth` → flipped handles → loops (unchanged, 2026-10-18 plan #12).

### 4.2 Seam rule (removed 2026-10-24)

**Removed.** Without it the rules are consistent: `smooth` rounds every point, **a point written twice is a corner**, and ending on the start counts as writing the start twice. `closed` only adds the closing segment; it never decides round or sharp:

| Points | `closed="false"` | `closed="true"` |
|---|---|---|
| `A; B; C; D` (each point once) | open curve, free ends | **round** loop |
| `A; B; C; D; A` (ends on the start) | loop, **sharp** at A (free ends meet) | loop, **sharp** at A (A repeated) |

With the seam, the repeated start/end pair was an exception to "a repeated point is a corner". Removing it also drops the 0.01 px tolerance for relative mode and the switch while an end point is animated onto the start. Drawback: point lists that repeat the first point at the end out of habit (SVG point lists, GeoJSON rings) get a corner there; the docs say to drop the last point and use `closed`. Only `docs/polyline.html` relied on the seam (sections 2 and 4); no other page or example did (scan of 77 pages, 2026-10-24).

The bow tie example therefore uses 6 points and `closed` wherever it is smoothed. The original seam rule, as implemented on 2026-10-24 and kept for reference:

After `* u` and relative-mode accumulation, if the first and last point are **less than 0.01 px apart** (`|Δx| < 0.01 && |Δy| < 0.01`) and there are at least 4 points, the polyline has a seam.

Exact equality is not enough: in `mode="relative"` the offsets are scaled by `u` and summed in the `Float32Array`, so the last point can miss the first by rounding, depending on the stage size (measured: offsets `100,0; 50,80; -150,-80` at `u = 1.37` end at y = 410.99997 instead of 411; a square at `u = 0.984` misses by 0.00001). The seam would switch on and off while resizing. 0.01 px is invisible.

With a seam:

- Neighbours wrap over the `m = n − 1` distinct points: `P0` gets `Pm−1` as its incoming neighbour, `Pn−1` (= `P0`) gets `P1` as its outgoing neighbour.
- Open polyline with a seam: `m` segments, no `closePath()`. The curve is identical to the closed curve; only line caps differ.
- `closed` polyline that repeats its first point: the duplicate is dropped from the neighbour lookup → no kink at the seam (fixes #6).
- Arrowheads stay allowed on an open polyline with a seam (they are measured from the drawn curve, §5).
- **A sharp point at the seam** is still possible: repeat the start point at the end (`…; 650,400; 750,300; 750,300`). The repeated point makes a corner (§4.1).

**Known side effect**: the rule is a switch. If an animation moves the last point *through* the first point, the curve changes for the frame(s) where both are within 0.01 px. Small at `smooth="1"`, more visible at high values. Static shapes (the normal case) are not affected. Document it in one sentence.

### 4.3 Loop

One shared neighbour lookup for all three cases (open, closed, seam), so the drawing loop and `loadSegment()` (arrows) can never disagree. *(Since the seam was removed: `wrap = closed`, `m = n`; `loadSegment(i, len, closed, k3)`.)*

```
wrap  = closed || seam
m     = seam ? n − 1 : n          // distinct points used for neighbours
count = closed ? m : n − 1         // segments to draw
prev(i) = wrap ? (i − 1 + m) % m : i − 1   (missing → zero-length side)
next(i) = wrap ? (i + 1) % m     : i + 1   (missing → zero-length side)
```

- **Rolling distances**: segment `i → i+1` needs `dIn` of `Pi`, the segment itself and `dOut` of `Pi+1`. Carry the previous segment's length and root into the next iteration: **one new length per segment = 2 `Math.sqrt` per segment** (length and its root), no arrays, zero allocations.
- The `aIn < ε` guards are ternaries in the loop body. They are taken only at free ends and duplicate points, so they predict well. The "branch-free hot loop" claim of the arrow plan (§4.3 there) is relaxed to "no branches except the two degenerate-side ternaries".
- Today the loop has no `sqrt` at all. The planned loop adds 2 `sqrt` + ~20 multiplications per segment.

#### 4.3.1 Measured (2026-10-23, `scratch/polyline_shapes/smooth_bench.html`)

Sketch of the planned loop (rolling distances, seam lookup) against today's loop, both reading a `Float32Array` like `flatCache`; verified against the reference formula (max difference 3·10⁻¹⁴). Chromium (browser pane), µs per frame, best of 3:

| Points | Math only (today → planned) | Path building, `beginPath` + `bezierCurveTo` (today → planned) |
|---|---|---|
| 50 | 0.5 → 1.0 | 1.6 → 2.5 (+0.9) |
| 500 | 3.9 → 8.3 | 17 → 23 (+5.5) |
| 2000 | 15.6 → 32.6 | 68 → 82 (+14) |

- The math alone is about **2× slower**. Path building, which includes the canvas calls the engine makes anyway, is 1.2–1.6× slower: **+5.5 µs for 500 points, +14 µs for 2000 points** of a 16 700 µs frame (0.03 % / 0.08 %).
- **Stroking dominates.** 50 points: 454 vs 460 µs per frame (same within noise). 500 extremely dense, unevenly spaced points (≈ 2 px apart): 7.5 vs 8.1 ms. That gap is ~100× larger than the path-building gap, so it comes from rasterizing a *different curve* (centripetal reshapes uneven spacing), not from the new code. On evenly spaced points the curves are the same.
- Point coordinates are already evaluated and copied into `flatCache` every frame (`draw()`), so the extra math is small next to the per-frame work that exists today.

#### 4.3.2 GC and hot-loop rules

- **Zero allocations**: only local numbers (rolling `dIn` / `aIn` / handle of the previous point); no arrays, objects or closures per frame. The seam test is 2 comparisons per frame.
- **No function call per segment**: the neighbour lookup and the handle code are inlined in the loop. `loadSegment()` (arrows, once per arrow per frame) may call a shared helper; it computes 3 lengths = 6 `sqrt` per arrow.
- **Branches**: the two degenerate-side ternaries (`a > ε ? … : 0`) and the next-neighbour test. Move the last segment (and, with a seam, the wrap) out of the loop like the 2026-10-18 plan §6.2, so the inner loop needs no `%` and no end test.
- **Static polylines** (the common case) could cache the handles until a point changes, removing the extra cost entirely. That belongs to the geometry cache of the 2026-10-18 plan (phase 2), not to this plan: +5.5 µs for 500 points doesn't justify it on its own.

#### 4.3.3 As implemented (2026-10-24)

The drawing loop calls the same `loadSegment(i, len, m, wrap, k3)` as the arrow trimming, instead of an inline loop with rolling distances. Drawing and trimming can't disagree, and the spline math exists once. Cost: 3 lengths per segment (6 `sqrt`) instead of 1 (2 `sqrt`).

Measured in the engine (`scratch/polyline_shapes/engine_bench.html`, previous build vs. new build, `draw()` with path building only, µs per frame):

| Points | Before | After |
|---|---|---|
| 50 | 3.8 | 5.2 (+1.4) |
| 50 + both arrows | 5.4 | 6.9 (+1.5) |
| 500 | 37.7 | 48.3 (+10.7, 0.06 % of a frame) |
| 2000 | 151 | 201 (+50, 0.3 % of a frame) |

With stroking, the differences disappear in the rasterization time (50 points: 462 vs 467 µs). The inline rolling loop would save about half of the extra cost; switch only if a real scene needs it.

## 5. Arrowheads

### 5.1 What stays

- `splitSegment()` (de Casteljau), the arrow direction measured from the drawn curve (`aimArrow` from the curve point one head length in) and the drawing of the trimmed segment stay as they are (arrow plan §4.3).
- `loadSegment(i, …)` must load the **new** control points. It calls the shared handle code (§4.3) instead of its own `tension6` formula, and no longer needs to return the chord length.
- `design/arrow_implementation_plan.md` relies on "the end tangent equals the chord to the previous point". That's no longer true. Add a short note there; the current code doesn't depend on it.
- With a seam, the start and end arrows sit on the seam point. Allowed, nothing special.

### 5.2 Distance trim (`trimParameter`)

Today the curve parameter for the shaft end and the arrow base comes from the chord estimate `t = 1 − inset / chord`. That assumes the curve moves at a steady speed along the segment. **D's free ends start without a handle**, so the curve leaves the end point slowly and the estimate trims far too little: the shaft pokes out of the head (`scratch/polyline_shapes/arrow_trim.html`, filled head, butt cap):

| Case | Today | D + chord estimate | D + distance trim |
|---|---|---|---|
| `arrows.html` wave, strokewidth 6 (intended 11.2 px) | 7.1 | **2.4** | 11.2 |
| same, strokewidth 12 (22.4 px) | 16.9 | **9.0** | 22.5 |
| zig-zag, strokewidth 4 (7.5 px) | 4.3 | **1.0** | 7.5 |
| short last segment, strokewidth 6 (11.2 px) | 10.0 | 5.6 | 11.2 |

Today's estimate is also short (the arrow plan's "sub-pixel" claim doesn't hold), but the shaft end stays inside the head. With D it doesn't.

**Fix**: find `t` where the curve is exactly the wanted distance from the end point, with 12 bisection steps on the loaded segment (resolution 1/4096 of the segment):

```js
// t on this._segment where the curve is `dist` away from its start (or end)
trimParameter(dist, fromEnd) {
  const g = this._segment;
  const ex = fromEnd ? g[6] : g[0], ey = fromEnd ? g[7] : g[1];
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    const x = a * g[0] + b * g[2] + c * g[4] + e * g[6] - ex;
    const y = a * g[1] + b * g[3] + c * g[5] + e * g[7] - ey;
    if ((x * x + y * y > dist * dist) === fromEnd) lo = t; else hi = t;
  }
  return (lo + hi) / 2;
}
```

- Used for both the head length (direction) and the inset (shaft end), at the start and at the end: 4 calls per frame for two arrows.
- **Cost**: ~100 ns per call → **~0.4 µs per frame** for two arrows. Only polylines with arrowheads, outside the hot loop, no allocations.
- A segment shorter than the distance gives `t = 0` (end) / `1` (start): the whole segment is trimmed, as today (clamp, D9 of the arrow plan).
- On a strongly curved end segment (hairpin) the distance to the end isn't monotonic; bisection then finds *a* point at the right distance, not necessarily the first one along the curve. Acceptable: today's estimate is worse there.
- Replaces the two chord estimates per end in `traceSmooth` (+15 / −4 lines). Straight polylines keep their exact straight trim (`traceStraight`).

### 5.3 Zero-length end segments (2026-10-18 plan #7)

If the first (or last) two points are identical, the end segment has length 0: today the arrowhead falls back to pointing right (`aimArrow` gets a zero vector), and with the distance trim the shaft would not be trimmed at all.

**Fix**: arrows walk inward past zero-length end segments (length < 0.01 px, the same tolerance as the seam). The first segment with a length carries the start arrow; the skipped segments are not drawn (they are a single point). Straight polylines do the same in `traceStraight`. If every segment has length 0, no arrowheads are drawn. This replaces the "small fix" listed in the 2026-10-18 plan.

### 5.4 One trim definition for all arrowheads

The head is a straight triangle, so the shaft is hidden when its end lies the inset behind the tip **in a straight line**. All shapes with arrowheads use this definition, for both the head base (direction, `len`) and the shaft end (`inset`):

| Shape | Today | Change |
|---|---|---|
| `<pxl-line>` | straight distance along the line (exact) | none |
| `<pxl-circle>` | head base: straight distance via `asin` (exact); shaft end: arc length `inset / radius` (slightly short on small circles: a 22.4 px inset on a 15 px circle ends at 20.4 px) | shaft end via the same formula as the base: `2 · asin(min(inset, 2r) / (2r))` (1 line in `aimArcArrow`) |
| `<pxl-ellipse>` | `parameterOffset`: speed estimate + one chord correction. Exact on round ellipses, **far off at the tip of thin ellipses** | 12 bisection steps on the angle (below) |
| `<pxl-polyline smooth>` | chord estimate | `trimParameter` (§5.2) |

**Ellipse** (`scratch/polyline_shapes/ellipse_arrows.html`, real engine plus a test subclass `<pxl-ellipse-fixed>`): with the arrow at the tip (`start="0"`), strokewidth 6, the shaft end lands far too close to the tip:

| Ellipse | Intended 7.5 px | 11.2 px | 22.4 px | Visible |
|---|---|---|---|---|
| 300 × 60 | ok | 11.0 | 20.1 | — |
| 300 × 30 | 6.0 | **7.2** | **8.6** | head turned too steeply, a wing sticks out |
| 100 × 10 | **2.9** | **3.2** | **5.6** | shaft pokes out past the tip |

Near the tip the curve turns fast, so one correction step isn't enough. The bisection version (tested in the subclass) puts the head straight on the line and covers the shaft:

```js
// Angle offset from `radians` (towards `inward`) where the arc is `distance` away in a straight line
parameterOffset(radiusX, radiusY, radians, inward, distance) {
  const cx = Math.cos(radians), sy = Math.sin(radians);
  let lo = 0, hi = Math.PI;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2, target = radians + inward * mid;
    const x = radiusX * (Math.cos(target) - cx), y = radiusY * (Math.sin(target) - sy);
    if (x * x + y * y > distance * distance) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
```

- Same body size as today (±10 lines). 2 calls per arrow, ~12 `cos`/`sin` pairs each: well under 1 µs per frame. No allocations.
- From any point, the straight distance grows with the angle at least up to the opposite side of a round ellipse; from the tip of an ellipse it grows all the way to the opposite tip (`d²` has a positive derivative on `(0, π)`). Elsewhere the bisection still finds a point at the right distance.
- A distance larger than the ellipse can reach returns `π`; the existing "skip the arc if both insets cross" check then hides the shaft, as today.
- **No shared helper** with the polyline: one loop evaluates a Bézier, the other an angle. A shared function would need a callback (a call per step, or a closure per frame). Two small loops with the same structure (12 steps, same comment) are simpler.

## 6. Visual Changes

Every smooth polyline with free ends or uneven spacing changes shape near those places; evenly spaced inner parts are identical.

| Page | Smooth polylines | Check |
|---|---|---|
| `docs/arrows.html` | 1 | end wave + arrowhead; prose about the end direction |
| `docs/dashes.html` | 8 | dash positions along the curve shift slightly |
| `docs/linear.html` | 1 | |
| `docs/walkthrough.html` | 1 | |
| `docs/polyline.html` | 2 (section 2) | re-check the prose ("at `1` the zig-zag becomes a wave, at about `1.7` the lobes become almost round") and the slider range |
| `examples/test09`, `test25`, `test37`, `test50` | 9, 3, 3, 32 | visual check |

## 7. Tests

| # | Test | Expected |
|---|---|---|
| 1 | All 17 cases of `smooth_ends.html`, engine vs. column F (render both, compare pixels) | identical within anti-aliasing |
| 2 | Evenly spaced inner segments, `k = 0.5, 1, 2` | identical to today |
| 3 | `smooth="0"` | straight |
| 4 | Duplicate inner point, duplicate end point, all points identical | corner at the duplicate (no cusp, no tail), no `NaN` |
| 4b | Two points moving together (animated gap 10 → 0) | handles shrink smoothly, no jump when they meet |
| 5 | Bow tie open (ends on its start) and `closed` without / with repeated first point | all three draw the same curve |
| 5b | Seam with a repeated start point at the end | sharp point at the seam |
| 6 | Animated last point passing through the first point | change only while within 0.01 px, no exception |
| 7 | Arrowheads on smooth polylines (`arrows.html` cases, `arrow_trim.html` cases, short end segments, seam), strokewidth 4 / 6 / 12, filled and `line` style | shaft ends at the intended inset (±0.1 px), never past the head; head on the curve, pointing along it |
| 7b | Duplicate first / last point + arrowheads, straight and smooth | head points along the line (walks inward), no arrow if all points are identical |
| 7c | Ellipse arrows at the tip: 300 × 200, 300 × 60, 300 × 30, 100 × 10, strokewidth 4 / 6 / 12, both ends, `anticlockwise` | shaft ends at the intended inset within the bisection resolution (`rx · π / 8192`, 0.12 px for rx = 300), head straight on the line; round ellipses unchanged |
| 7d | Circle arrows on small circles (r 15–30) with large heads | shaft end at the intended straight distance |
| 8 | Hit testing (`onclick` / hover) on a smooth polyline | hit area follows the new curve |
| 9 | `mode="relative"` + smooth, a seam produced by relative offsets, stage resized (several `u`) | seam detected after accumulation at every size |
| 10 | Benchmark: 500 / 2000 points, static and animated, before / after, in the engine | close to §4.3.1 (path building +5 to +15 µs) |
| 11 | Pages in §6 | visual review, screenshots before / after |

## 8. Steps

1. `polyline.js`: shared neighbour lookup and handle code (§4.1–4.3), seam test with 0.01 px tolerance (§4.2), drawing loop, `loadSegment()`. `node build.js`.
2. `polyline.js`: `trimParameter()` replaces the chord estimates in `traceSmooth` (§5.2); arrows walk inward past zero-length end segments in `traceSmooth` and `traceStraight` (§5.3). `circle.js`: shaft end via `asin`; `ellipse.js`: `parameterOffset` via bisection (§5.4). `node build.js`.
3. Tests §7 (scratch harness, compare against column F and `arrow_trim.html`; benchmark).
4. `.agents/KILOPIXEL.md` → Smoothing: centripetal Catmull-Rom (D3 `curveCatmullRom`), handle formula, free ends, duplicate points as corners, seam rule, `smooth` as handle multiplier. Arrowheads: distance trim.
5. `design/arrow_implementation_plan.md`: the end tangent is no longer the chord. `design/2026-10-14_unified_arrowhead_geometry_plan.md`: §4.3 chord estimate replaced by the distance trim; §4.4 circle trim angle is the straight distance (`asin`), not the arc length; ellipse trim by bisection; one trim definition for all shapes (§5.4 here). `design/2026-10-18_polyline_optimization_plan.md` §5: #7, #8 and #9 fixed by this plan.
6. Docs: `polyline.html` section 2 (and the later sections: a repeated point makes a corner; a path that ends on its first point is smoothed across it); review the pages in §6.
7. TODO §15 → implemented; TODO §22: remove the arrowhead "small fix" (done here).

Estimate: `polyline.js` about +60 / −30 lines (spline +40 / −25, distance trim +15 / −4, walking inward ≈ +6); `circle.js` 1 line; `ellipse.js` ±10 lines.
