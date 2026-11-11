# Polyline `smoothstyle`: Uniform or Centripetal Spline

- **Status**: 🟡 **Proposed** (2026-11-11, decisions D1–D3 open)
- **Date**: 2026-11-11
- **Related**: `design/2026-10-23_smooth_polyline_spline_plan.md` (the centripetal spline, implemented 2026-10-24), `design/2026-09-07_plot_element_plan.md` §10 (`<pxl-plot>` needs the uniform spline and reuses this code, §6)
- **Target Implementation**: `js/elements/shapes/polyline.js`, `tests/index.html`, `.agents/KILOPIXEL.md` (Smoothing), `docs/polyline.html` (new section 5), `docs/walkthrough.html` section 9 (D3)
- **Prototypes**: `design/prototypes/2026-11-11_polyline_smoothstyle/smoothstyle_examples.html` (both splines on 6 candidate examples, plain canvas), `design/prototypes/2026-11-11_polyline_smoothstyle/spline_error.js`, `design/prototypes/2026-11-11_polyline_smoothstyle/spline_uniform_sec9.js`, `design/prototypes/2026-11-11_polyline_smoothstyle/smoothstyle_search.js` (error against the true curve)

---

## 1. Problem

Since 2026-10-24 `smooth` uses a centripetal Catmull-Rom spline. It fixed hooks, run-back and straight ends for points placed by hand, but it is worse for points **sampled at equal steps** of a parameter (a formula, values over time): where such a curve slows down, the samples crowd together and the centripetal spline turns too sharply. The walkthrough's Lissajous curve (section 9) showed pointed and, for curves traced several times, frayed tips; it now needs 120 points to look right.

Largest distance from the drawn curve to the true curve (stage units, stage 1000 wide):

| Curve | Points | Uniform | Centripetal |
|---|---|---|---|
| Walkthrough section 9, worst of all 25 slider settings (1–5 × 1–5) | 60 | **0.7** | 6.9 |
| Same | 120 | **0.0** | 1.6 |
| Figure eight `sin(2v)`, `cos(v)` (docs example, §5) | 20 | **1.4** | 11.8 |

The uniform spline assumes what a sampled curve is: equal parameter steps between points. The centripetal spline assumes steps that grow with the distance between points, which is right for hand-placed points. Neither is better in general, so the user chooses.

## 2. Use Cases

- **Curves from formulas** written as points: math curves, Lissajous figures, spirals (walkthrough section 9).
- **Data at regular times**: sensor values, a recorded mouse path, an audio envelope. With the framework plan (`design/2026-10-30_framework_compatibility_plan.md`), a React or Vue component that builds `points` from an array of samples is the typical case.
- **`<pxl-plot>`** samples at equal steps by definition and needs the uniform spline (§6).

Points placed by hand (paths, arrows, shapes with corners) stay with the default.

## 3. API

```html
<pxl-polyline smooth="true" smoothstyle="uniform" points="…"></pxl-polyline>
```

| Attribute | Values | Default |
|---|---|---|
| `smoothstyle` | `'centripetal'` \| `'uniform'` | `'centripetal'` |

- `smooth` says **how much** the curve bends, `smoothstyle` **how**. Like `arrowstyle` next to `arrowstart` / `arrowend`, it has no effect until its main attribute is on.
- `smooth` as a number scales the handles of both styles.
- Any value other than `'uniform'` draws centripetal (one comparison, no guard).

**D1 (name)**, recommended `smoothstyle`:

| Name | Note |
|---|---|
| **`smoothstyle`** | Pairs with `smooth`, same pattern as `arrowstyle` |
| `spline` | Short, but nothing ties it to `smooth` |
| `smoothmode` | Confusable with `mode` (absolute / relative coordinates) |
| `curve` | Too vague: every smooth shape draws curves |
| `alpha` (D3's name) | Taken: opacity |

The values are the standard names (D3, Paper.js, Wikipedia), so users can look them up; friendlier words would need the same explanation.

## 4. Engine

Only `loadSegment()` changes. It already serves the drawing loop and the arrow trimming, and hit testing traces the same path on `pxl.dummyCtx`, so all three follow automatically.

- **Uniform handles**: at A, `(B − P) · k3 / 2`; at B, `−(Q − A) · k3 / 2` (`k3 = smooth / 3`, so this is the classic `(next − previous) · k / 6`). In the existing variables: `B − P = abx + pax`, `Q − A = bqx + abx`.
- **Free ends**: a missing neighbour gives no handle, as in the centripetal spline. The old uniform spline clamped the ends and straightened out before them (problem #1 of the 2026-10-23 plan); that does not come back.
- **Evenly spaced points give the same curve in both styles** (KILOPIXEL.md, Smoothing). Only uneven spacing differs.
- **D2 (repeated points)**, recommended **corner in both styles**: a zero-length side gets no handle, as today. Then "a point written twice is a corner" (`docs/polyline.html` section 4) holds for both styles and stays one rule. Drawback: in the uniform style the handle jumps from full length to 0 when two animated points meet exactly (the centripetal handle shrinks continuously). Alternative: uniform keeps the handle and a repeated point makes a small cusp, like before 2026-10-24; then section 4 needs "centripetal only".
- **Cost**: the uniform branch needs no `Math.sqrt` for the handles (only the zero-length checks, D2). `const uniform = this.attributeValues.smoothstyle === 'uniform'` once per draw, passed to `traceSmooth()` / `loadSegment()` next to `k3`. No allocations.
- **Attributes**: `smoothstyle` goes next to `smooth` in `observedAttributes` and `defaults` (`smoothstyle: 'centripetal'`).

## 5. Docs

### 5.1 `docs/polyline.html`: new section 5 "Smooth Style"

After "4. Sharp Corners" (the corner rule is explained there); sections 5–10 become 6–11.

**Example**: one stage with two shapes, each with its own `smoothstyle` dropdown in its tab, each starting with the style that suits it:

| Shape | Starts with | Switching shows |
|---|---|---|
| **Arrow**, points placed by hand, a short segment before a long one, `arrowend` | `centripetal` | `uniform`: a hook before the bend, the arrowhead tilts |
| **Figure eight**, 20 points from `sin(2v)` / `cos(v)` at equal steps, `closed` | `uniform` | `centripetal`: the four outer tips turn pointed |

The points of the figure eight are written as rounded numbers. Candidates that showed too little difference: a sine wave (7 points per wave), a damped spring, an ellipse sampled at equal angles.

**Text** (draft):

> `smoothstyle` chooses how the curve bends between the points. The default, `centripetal`, takes the distance between neighbouring points into account: next to a short segment the curve bends less, so it doesn't overshoot or form small hooks. `uniform` treats all points as equal steps along the curve.
>
> Use `centripetal` for points you place yourself, like the arrow: with `uniform`, its short first segment makes a hook and the arrowhead tilts. Use `uniform` for points calculated at equal steps, such as a curve from a formula or values measured at regular times: the figure eight uses 20 points from `sin` and `cos`, and only `uniform` keeps its tips round.

**Callout "Which Style?"**:

> Points placed by hand, arrows and shapes with corners: `centripetal`, the default. Points from a formula or sampled at regular times: `uniform`. On evenly spaced points both give the same curve.

**Element reference**: a `smoothstyle` row next to `smooth`.

### 5.2 Other files

- `.agents/KILOPIXEL.md` → Smoothing: both styles, the uniform handle formula, D2, the attribute tables.
- `docs/walkthrough.html` section 9, **D3**, recommended: `smoothstyle="uniform"` with 60 points (worst 0.7 instead of 1.6 today, half the markup). The frequency sliders stay at 1–5: 60 is divisible by every frequency up to 5, so curves traced several times still hit the same points on every pass. A short sentence or comment can mention why the trace uses `uniform`.

## 6. Reuse in `<pxl-plot>`

`<pxl-plot>` samples `fx` / `fy` at equal steps of `v` and should smooth with the uniform spline (plot plan §10). The code built here is the part it needs:

- `loadSegment()` with the uniform branch, `traceSmooth()`, and the arrow helpers `trimParameter()` / `splitSegment()` work on a flat `Float32Array` of points, which is also how the plot plan stores its samples.
- How the plot gets the code is decided in the plot plan: extend `pxl.Polyline`, or move the spline into a shared helper. A shared helper must follow the underscore rule (`_flatCache`, `_segment` and `_split` are owned by `polyline.js` today), so the points and output arrays would be passed in instead of read from `this`.
- The plot can set the style itself (always uniform) instead of exposing `smoothstyle`.

## 7. Tests (`tests/index.html`)

- Evenly spaced points: both styles give the same control points.
- Uniform, uneven spacing: control points match `(next − previous) · k / 6`.
- Free ends: no handle in both styles.
- Repeated point: corner in both styles (if D2 as recommended).
- Arrowheads on a uniform polyline: the trimmed shaft ends on the same curve (shared `loadSegment()`).
- `smoothstyle` without `smooth`: straight segments.

## 8. Decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | Attribute name | `smoothstyle` (§3) |
| D2 | Repeated point in the uniform style | Corner, as in the centripetal style (§4) |
| D3 | Walkthrough section 9 | `uniform` with 60 points, sliders stay 1–5 (§5.2) |

## 9. Steps

1. Agree on this plan (D1–D3).
2. Engine: `smoothstyle` in `polyline.js`, `node build.js`, update the `~NNKB` sizes, tests in `tests/index.html`.
3. KILOPIXEL.md, `docs/polyline.html` section 5 with the renumbering, walkthrough section 9 (D3).
4. Browser check: polyline page (both shapes, both styles, arrowheads, console), walkthrough section 9, tests.
5. Plan to ✅, TODO item removed; plot plan §10 and TODO §7 point to the shared code.
