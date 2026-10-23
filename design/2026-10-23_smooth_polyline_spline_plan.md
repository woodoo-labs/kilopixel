# Smooth Polyline Spline: Centripetal Catmull-Rom (D3 Style) + Seam Rule

- **Status**: ⚪ **Planned** (2026-10-23, no engine changes yet)
- **Date**: 2026-10-23
- **Related**: `.agents/TODO.md` §15 (spline quality), `design/2026-10-14_unified_arrowhead_geometry_plan.md` (arrow trimming on smooth polylines, §4.3), `design/2026-10-18_polyline_optimization_plan.md` (§5 edge cases #8, #9, #11, #12; §6.2 smooth loop), `design/2026-09-07_plot_element_plan.md` and `design/2026-09-30_path_element_plan.md` (both reuse the polyline spline)
- **Target Implementation**: `js/elements/shapes/polyline.js`, `.agents/KILOPIXEL.md` (Smoothing), `docs/polyline.html` (section 2)
- **Test Page** (local, scratch is git-ignored): `scratch/polyline_shapes/smooth_ends.html`, 17 cases × 6 variants (A–F), opens directly from the file system; `?v=AF` shows only some variants

---

## 1. Goal

`<pxl-polyline smooth>` should look right at its ends and with unevenly spaced points, without changing what `smooth` means:

- **Ends**: the curve must not straighten out before the first / last point.
- **Uneven spacing**: no hooks next to short segments, no run-back past an end point, collinear points stay straight.
- **Paths that end on their first point** (bow tie, figure eight, a `closed` polyline that repeats its first point): smooth across that point, like a closed curve.
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

**Decision: F.**

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
- `smooth="0"` → all handles 0 → straight (as today; the 2026-10-18 plan #11 can still route it to `traceStraight`).
- Negative `smooth` → flipped handles → loops (unchanged, 2026-10-18 plan #12).

### 4.2 Seam rule

After `* u` and relative-mode accumulation, if the first and last point are **exactly equal** (`===` on x and y) and there are at least 4 points, the polyline has a seam:

- Neighbours wrap over the `m = n − 1` distinct points: `P0` gets `Pm−1` as its incoming neighbour, `Pn−1` (= `P0`) gets `P1` as its outgoing neighbour.
- Open polyline with a seam: `m` segments, no `closePath()`. The curve is identical to the closed curve; only line caps differ.
- `closed` polyline that repeats its first point: the duplicate is dropped from the neighbour lookup → no kink at the seam (fixes #6).
- Arrowheads stay allowed on an open polyline with a seam (they are measured from the drawn curve, §5).

**Known side effect**: the rule is a switch. If an animation moves the last point *through* the first point, the curve changes for the frame(s) where both are exactly equal. Small at `smooth="1"`, more visible at high values. Static shapes (the normal case) are not affected. Document it in one sentence.

### 4.3 Loop

One shared neighbour lookup for all three cases (open, closed, seam), so the drawing loop and `loadSegment()` (arrows) can never disagree:

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

## 5. Arrowheads

- Arrow trimming (`loadSegment` + `splitSegment`, arrow plan §4.3) already works on any Bézier segment and measures the arrow direction from the drawn curve. It stays as is.
- `loadSegment(i, …)` must load the **new** control points. It calls the shared handle code (§4.3) instead of its own `tension6` formula.
- `design/arrow_implementation_plan.md` relies on "the end tangent equals the chord to the previous point". That's no longer true. Add a short note there; the current code doesn't depend on it (it measures from the curve).
- With a seam, the start and end arrows sit on the seam point. Allowed, nothing special.

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
| 4 | Duplicate inner point, duplicate end point | no cusp, no tail, no `NaN` |
| 5 | Bow tie open (ends on its start) and `closed` without / with repeated first point | all three draw the same curve |
| 6 | Animated last point passing through the first point | jump only while exactly equal, no exception |
| 7 | Arrowheads on smooth polylines (`arrows.html` cases, short end segments, seam) | head on the curve, pointing along it |
| 8 | Hit testing (`onclick` / hover) on a smooth polyline | hit area follows the new curve |
| 9 | `mode="relative"` + smooth, and a seam produced by relative offsets | seam detected after accumulation |
| 10 | Benchmark: 500 / 2000 points, static and animated, before / after, in the engine | close to §4.3.1 (path building +5 to +15 µs) |
| 11 | Pages in §6 | visual review, screenshots before / after |

## 8. Steps

1. `polyline.js`: shared neighbour lookup and handle code (§4.1–4.3), drawing loop, `loadSegment()`. `node build.js`.
2. Tests §7 (scratch harness, compare against column F; benchmark).
3. `.agents/KILOPIXEL.md` → Smoothing: centripetal Catmull-Rom (D3 `curveCatmullRom`), handle formula, free ends, seam rule, `smooth` as handle multiplier.
4. `design/arrow_implementation_plan.md`: note that the end tangent is no longer the chord. `design/2026-10-18_polyline_optimization_plan.md` §5: #8 and #9 fixed by this plan.
5. Docs: `polyline.html` section 2 (and the later `closed` section: a path that ends on its first point is smoothed across it); review the pages in §6.
6. TODO §15 → implemented.

Estimate: `polyline.js` about +40 / −25 lines.
