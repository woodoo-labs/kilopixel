# Negative Sweep and Arrowheads That Shrink on Short Paths

- **Status**: 🟡 **Proposed** (2026-11-16, direction and head behavior chosen with the prototype; D1–D5 open)
- **Date**: 2026-11-16
- **Related**: `design/done/2026-10-14_unified_arrowhead_geometry_plan.md` (its D9, "insets longer than the path", is replaced by §3.2), `design/archive/2026-09-23_circle_geometry_hardening_and_annular_sector_plan.md` §4.4 (assumed a sweep can swing through zero, `sweep="sin(t) * 90"`), `design/ideas/2026-10-15_arrowcap_arrowjoin_plan.md` (arrowhead look), `design/done/2026-11-15_testing_plan.md` §15 (where this was found), TODO §12 (`docs/arrows.html`, "Rules & Edge Cases")
- **Target Implementation**: `js/graphics.js` (`pxl.arcEndRadians`), `js/elements/shapes/circle.js`, `js/elements/shapes/ellipse.js`, `js/elements/shape.js` (`resolveArrow`), `js/elements/shapes/line.js`, `js/elements/shapes/polyline.js`, `tests/render.html`, `tests/unit.html`, `.agents/KILOPIXEL.md`, `docs/circle.html`, `docs/ellipse.html`, `docs/arrows.html`
- **Prototype**: `design/prototypes/2026-11-16_negative_sweep_arrowheads/index.html` (real `<pxl-circle>` / `<pxl-ellipse>` arcs: today's behavior B and the variants A1 / A2 side by side, animated through zero and at fixed sweeps; `?endOnly` for a single arrowhead; A2 for ellipses by arc length and by `r × |sweep|`). It loads `/dist/pxl.min.js`: column B shows today's behavior only until this plan is built; the engine it was made with is commit `7d12daf` (`git show 7d12daf:dist/pxl.js`)

---

## 1. Today

A negative `sweep`, or a positive one with `anticlockwise`, makes `ctx.arc()` / `ctx.ellipse()` go the long way round: the arc runs from `start` to the end angle in the given direction, and an end "behind" the start is reached after almost a full turn. Measured 2026-11-16 (testing plan §15 and the prototype):

| Markup | Expected by a reader | Drawn |
|---|---|---|
| `pie="true" start="0" sweep="-90"` | a quarter going up | three quarters (all but the upper right) |
| `pie="true" start="0" sweep="90" anticlockwise="true"` | a quarter going up | three quarters (all but the lower right) |
| `sweep="sin(t) * 90"` with a stroke | an arc that shrinks to 0 and grows on the other side | at −1° the arc jumps to 359° |
| `sweep="-20" stroke arrowend="44"` (circle) | a short arc going up with a head | **two floating heads, no arc**: the "too short" check (unified plan D9) compares the heads with `|sweep|` = 20°, the canvas would draw 340°, so the shaft is skipped |
| `sweep="-60"` with arrowheads | a short arc going up | a 300° arc with heads |
| `docs/circle.html` §5, sweep slider at −40 (commit `bdfaa14`) | — | a 320° arc |

Two more problems, also with positive sweeps:

- **Full-size heads on a short arc** overlap each other (a bow tie at both ends, a star with two heads) and flip 180° in one frame when an animated sweep crosses zero; with a single `arrowend` the flip is obvious (prototype, A1).
- **Ellipses, pointed end:** `start` and `sweep` are parameter angles, so near the pointed end of a thin ellipse a sweep covers little curve (130 × 40, 20° from `start="0"`: 16 units). A full-size head (38 long) is longer than the arc and sticks out beside the curve, even for a positive sweep.

## 2. Decided With the Prototype (2026-11-16)

Three ways compared on real engine arcs (prototype):

| | Direction | Heads | Through zero |
|---|---|---|---|
| B (today) | canvas: the long way | full size | jumps to almost a full turn; floating heads |
| A1 | the sign of `sweep` | full size | the short way, but the heads flip 180° in one frame |
| **A2 (chosen)** | the sign of `sweep` | **shrink while the path is shorter than the heads** | the heads shrink to nothing at 0° and grow again pointing the other way: no visible jump |

For ellipses, A2 measures the **arc length along the curve**. `r × |sweep|` with the mean radius was compared and rejected: for a 300 × 20 ellipse at a 20° sweep it is 2.8× too long at the pointed end (heads stick out again) and 0.54× too short on the flat side (heads shrink without need); 130 × 40: 1.82× and 0.67×.

## 3. Design

### 3.1 Direction of an Arc

- **`sweep` is a signed span:** positive = clockwise (the canvas direction, y down), negative = anticlockwise. The arc always covers `|sweep|` degrees (up to a full turn), never the complement.
- **`anticlockwise` mirrors the sweep:** `sweep="90" anticlockwise="true"` is a quarter going anticlockwise; `sweep="-90" anticlockwise="true"` a quarter going clockwise.
- In code: the end angle is `start + s · sweep` with `s = anticlockwise ? −1 : 1`, and the arc is drawn in the direction of the sign of `s · sweep` (the `anticlockwise` argument of `ctx.arc()` / `ctx.ellipse()` becomes `s · sweep < 0`). One place for circle and ellipse: `pxl.arcEndRadians()` returns the end and the direction.
- **`end`** (absolute angle, D1): keeps today's meaning, "from `start` to `end` in the arc's direction" (clockwise unless `anticlockwise`), so `start="0" end="270"` stays three quarters.
- `|sweep| ≥ 360` stays a full turn (`pxl.isFullTurn`, already on the absolute difference).
- Arrowheads: `travel` (`circle.js`, `ellipse.js`) follows the drawn direction instead of `anticlockwise` alone, so the heads point along the arc as it is drawn.

### 3.2 Heads Shrink While the Path Is Shorter Than Them

- **Rule:** with `need` = the sum of the head lengths (`size × cos 30°`) of the heads present (one or two) and `length` = the length of the path as drawn, both heads are scaled by `k = min(1, length / need)`. At `length ≥ need` nothing changes; below it, the heads get smaller with the path and vanish at 0.
- **Replaces D9** of the unified arrowhead plan ("insets longer than the path: skip the shaft, draw the heads full size"): with the heads scaled down, the insets fit the path, so the floating heads of §1 can't happen. The "too short" branches stay as a safety net (float rounding).
- **Where:** each shape knows its path length before it resolves its arrows; `resolveArrow(rec, attrValue, u)` gets a fourth argument `k` (the factor multiplies `size`, so `len`, `inset` and `tipAdvance` follow). `'auto'` sizes (`strokewidth × 3.6`) are scaled the same way.
- **Path length per shape:**

  | Shape | `length` | Cost per frame |
  |---|---|---|
  | `<pxl-circle>` | `r × |Δ angle|` | one multiplication |
  | `<pxl-ellipse>` | chord sum along the arc (§3.3) | up to 8 `cos` / `sin` pairs and `sqrt`, only while short |
  | `<pxl-line>` | the line's length (computed today for the direction) | none |
  | `<pxl-polyline>` | D2 | — |

- **Both arrow styles** (`filled`, `line`) use the same factor.

### 3.3 Ellipse Arc Length

- Sum of chords along the arc, from `start` to the end angle in `n = 8` steps: measured 2026-11-16 against 4,096 steps, the error on arcs shorter than typical heads is at most 0.12 % (130 × 40 and 300 × 20, 20° from either end); 0.16 % at 90°, 1.4 % at 270°, where the heads don't shrink anyway.
- **Early exit:** the sum stops as soon as it exceeds `need`; a long arc costs one or two steps.
- No allocations (a loop over local numbers, like `parameterOffset()`).

## 4. Behavior After the Change

| Markup | Before | After |
|---|---|---|
| `sweep="-90"` (pie) | three quarters | a quarter going up |
| `sweep="90" anticlockwise="true"` (pie) | three quarters | a quarter going up |
| `start="0" end="270"` | three quarters | unchanged |
| `sweep="sin(t) * 90"` with `arrowend` | jumps to 359°; the head flips | shrinks, turns around at 0 invisibly, grows |
| `sweep="-20"` with arrowheads | two floating heads | a 20° arc with small heads |
| `<pxl-line>` whose end passes through its start | full-size heads flip | heads shrink to nothing and turn around |
| an arc or line longer than its heads | — | unchanged |

Pages that rely on a negative sweep drawing the long way: none known (to check in step 1); `docs/circle.html` §5 lets the slider reach −40, which then shows the intended behavior.

## 5. Tests

- `tests/render.html` (testing plan §15, open question there): negative sweep and `anticlockwise` for circle and ellipse (pie quarters), `end` unchanged; arrowheads on short arcs (tip on the arc end, head smaller than full size, no floating head); a line through zero length.
- `tests/unit.html`: `pxl.arcEndRadians()` with sign and `anticlockwise`; the ellipse arc length against a fine chord sum; the scale factor at `length = 0`, `need / 2`, `need`, `2 × need`.
- Continuity: an arc animated through zero (`stage.render(t)` at t just before and after the crossing): the head size goes to 0 from both sides.

## 6. Docs

- `docs/circle.html`, `docs/ellipse.html`: `sweep` text and the API reference ("signed: negative goes anticlockwise"), `anticlockwise` ("mirrors the sweep"); a short example with a negative sweep.
- `docs/arrows.html` "Rules & Edge Cases" (TODO §12): heads shrink on paths shorter than them.
- `.agents/KILOPIXEL.md`: Circle and Ellipse "Drawing Logic", Arrowhead System "Rules & Limits" (replace "If a path is shorter than both insets combined, only the heads are drawn").

## 7. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | `end` with `anticlockwise`: keep "from start to end in the arc's direction" (today) or make `end` also take the short way? | Keep: `end` is an absolute angle, "go until this angle" is its meaning; only `sweep` is a span |
| D2 | Polyline `length` for §3.2: the whole path, or each end's segment for its head? | The whole path (straight segments between the points; for `smooth` the same chords, a close enough estimate): heads shrink only when the whole polyline is shorter than them; a short last segment keeps today's clamp |
| D3 | Shrink threshold: the heads' lengths (as in the prototype) or the insets (where the shaft disappears)? | The heads' lengths: the prototype looked right with it, and it doesn't depend on `linecap` |
| D4 | Build the direction (§3.1) and the shrinking (§3.2) in one change or two? | Two commits, direction first: it changes pies and fills too, the shrinking only arrows |
| D5 | Heads on tight turns (seen in the prototype 2026-11-16, unrelated to the sign of `sweep`): an ellipse 130 × 40 from `start="90"` with `sweep="120"` ends just past the pointed end, where the curve turns on a radius of `ry² / rx` ≈ 12 while the head is 38 long. The head is aimed along the chord over its own length (unified arrowhead plan), so it lies across the tip and the trimmed shaft seems to run under it. Exists today; A2 doesn't change it (the arc is long, the head keeps its size). Options: accept it, or limit the head length to a multiple of the curve's radius at the end (a formula for ellipses), which makes a head shrink and grow as it moves around the tip | Accept it for now: a corner case of ellipses that are thin compared with the head; a size that changes along the tip could look like the jumps A2 removes. Revisit with a prototype row if a real page shows it |

## 8. Steps

1. Search docs and examples for negative sweeps and `anticlockwise` (pages whose look changes).
2. §3.1 direction in `pxl.arcEndRadians()`, `circle.js`, `ellipse.js`; render tests; KILOPIXEL.md and the circle / ellipse docs.
3. §3.2 / §3.3 shrinking in `resolveArrow()` and the four shapes; render and unit tests; measure the ellipse cost against the frame budget (`examples/benchmark.html` or a bench in the prototype folder).
4. `docs/arrows.html` rules section (TODO §12).

## Log

- 2026-11-28: circle and ellipse now share `pxl.ArcShape` (`js/elements/shapes/arc.js`): `drawArc()`, `aimArcArrow()` and `parameterOffset()` live there; this plan's references to `circle.js` / `ellipse.js` describe the old split.
Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-28: `js/graphics.js` is gone (`design/done/2026-11-28_engine_restructure_plan.md` phase 3): transform, compositing and isolation helpers are in `js/compositing.js`, arc angles in `js/elements/shapes/arc.js`, arrow and line dash helpers in `js/elements/shape.js`, the points parser in `js/elements/shapes/polyline.js`; names stay. References to `graphics.js` here describe the old layout.
- 2026-11-22: `design/done/2026-11-20_custom_shapes_plan.md` phase 2 built: the layer scales by the unit once, and the shapes and their helpers (`applyStyle(ctx)`, `applyStrokeState(ctx)`, `createGradient(ctx, value, slot)`, `resolveArrow(rec, value)`, `drawArrows(ctx, a, b)`, `applyTransformState(ctx, values)`) take no `u`; code here with `u` is the old form.
- 2026-11-20: `.agents/KILOPIXEL.md` was split into `.agents/KILOPIXEL.md` (language) and `.agents/ENGINE.md` (engine); section names in this plan refer to the old single file.
- Status line until 2026-11-20: 🟡 **Proposed** (2026-11-16, direction and head behavior chosen with the prototype: the sign of `sweep` is the direction, heads shrink while the path is shorter than them, ellipses measure the arc length; D1–D5 open)
