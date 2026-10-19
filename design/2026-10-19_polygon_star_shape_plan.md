# Regular Polygon & Star Shape (`<pxl-polygon>`)

- **Status**: 🟡 **Proposed** (no code changes yet; open decisions in §7)
- **Date**: 2026-10-19
- **Related**: `design/2026-10-17_shape_authoring_plan.md` (custom shape template, the Star example), `design/2026-10-18_polyline_optimization_plan.md` (closed polylines), `.agents/TODO.md` §23
- **Target Implementation**: `js/elements/shapes/polygon.js` (new), `build.js`, `docs/polygon.html` (new), `docs/js/layout.js`, `.agents/KILOPIXEL.md`
- **Prototypes** (local): `scratch/regular_polygon/test.html` (absolute `ir`), `scratch/regular_polygon/relative.html` (relative star amount, §3)

---

## 1. Goal

One shape for **regular polygons and stars**, defined by a few numbers instead of a list of points:

```html
<pxl-polygon x="300" y="300" sides="6" r="100" fill="#f97316"></pxl-polygon>            <!-- hexagon -->
<pxl-polygon x="600" y="300" sides="5" r="100" indent="0.5" fill="#3b82f6"></pxl-polygon> <!-- star -->
```

(`indent` is a placeholder name, see §7.)

**Not in scope:** arbitrary polygons (triangles with free corners, arrows, outlines). Those are a `<pxl-polyline closed="true">`. The sidebar's "Polygon" placeholder link was removed on 2026-10-19 and comes back with this shape's docs page.

---

## 2. Geometry (Findings from the Prototypes)

A regular polygon with `sides = n` has `n` corners at radius `r`, evenly spaced. A **star** adds `n` more corners, exactly halfway between them, at an inner radius `ir`. The outline alternates `r`, `ir`, `r`, `ir`, …

1. **Every shape has n-fold symmetry and equal sides.** Turned by `360° / n` it looks the same. All `2n` sides have the same length, but the angles alternate (mathematically an *isotoxal polygon*). That's why some results don't look "regular" at first (e.g. `sides="3"` with `ir` slightly larger than `r` looks like a shield or a cube outline).
2. **Edge-midpoint rule.** A polygon edge passes its midpoint at distance `r · cos(180° / n)`:
   - `ir` smaller → **star** (the inner corners point inward)
   - `ir` equal → the **plain polygon** (inner corners lie on the edges)
   - `ir` larger → the in-between corners **bulge outward** (seal / badge shapes)

   | sides | Edge midpoint (× r) |
   |---|---|
   | 3 | 0.50 |
   | 4 | 0.71 |
   | 5 | 0.81 |
   | 6 | 0.87 |
   | 8 | 0.92 |
3. **Special values** (absolute `ir`): `ir = 0` gives spokes (no area, only the stroke is visible); `ir = r` gives a regular polygon with `2n` corners. So "no star" can be neither `0` nor `r`.
4. **`ir` larger than `r`** creates no new shapes: it's the same shape **turned by half a step** (`180° / n`): upside down for odd `n`, a small turn for even `n` (45° for 4, 30° for 6). `start` or `rotate` gives the same result.
5. **One absolute `ir` looks different per `sides`.** `r="70" ir="35"` is a flat triangle (exactly the edge midpoint) but a spiky 8-pointed star.

---

## 3. API: Absolute vs. Relative Inner Corners

| | A: absolute `ir` (like `<pxl-circle>`) | B: relative amount from the edge (recommended) |
|---|---|---|
| Example | `sides="5" r="100" ir="38"` | `sides="5" r="100" indent="0.5"` |
| Formula | inner radius = `ir` | inner radius = `r · cos(180° / n) · (1 − indent)` |
| Same value, different `sides` | looks very different (§2.5) | looks similar (`relative.html`) |
| "No star" default | needs `null` (not set) | simply `0` |
| `r` animated | the star's proportions change | only the size changes |
| Polygon → star morph | from a `sides`-dependent value | `indent` from `0` to `1` |
| Bulges (seal shapes) | `ir` above the edge midpoint | negative values |
| Consistency | matches `<pxl-circle>` `r` / `ir` | new attribute and concept |

**Recommendation: B.** Meaning of the values, the same for every number of sides:

| `indent` | Shape |
|---|---|
| `0` (default) | plain polygon |
| `0.25` … `0.75` | star, steadily pointier |
| `1` | spokes (inner corners at the center) |
| negative | in-between corners pushed outward; at `1 − 1 / cos(180° / n)` a regular polygon with `2n` corners |

**Classic star proportions** (lines connecting every *m*-th corner, `{n/m}`) for the docs:

| Star | `indent` |
|---|---|
| 5 points (pentagram `{5/2}`) | 0.528 |
| 6 points (hexagram `{6/2}`) | 0.333 |
| 8 points (octagram `{8/3}`) | 0.414 |

General: `indent = 1 − cos(πm/n) / (cos(π(m−1)/n) · cos(π/n))`.

---

## 4. Attributes

| Attribute | Default | Description |
|---|---|---|
| `sides` | `5` (open, §7) | number of corners (tips of a star). Rounded down; below 3 → nothing drawn |
| `r` | `0` | outer radius (corners / tips), like `<pxl-circle>` |
| `indent` | `0` | star amount, §3 (name open, §7) |
| `start` | `-90` (open, §7) | angle of the first corner in degrees, measured like `<pxl-circle>` (`0°` = 3 o'clock). `-90` points the first corner up |

Plus all shape attributes (fill, stroke, gradients, dashes, joins, transforms, compositing, events). No arrowheads (the shape is always closed).

---

## 5. Drawing

```javascript
pxl.Polygon = class Polygon extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'sides', 'r', 'indent', 'start']; }

  static defaults = { ...pxl.Shape.defaults, sides: 5, r: 0, indent: 0, start: -90 };

  draw(ctx, u, t) {
    const { r, indent, start } = this.attributeValues;
    const sides = Math.floor(this.attributeValues.sides);
    if (!(sides >= 3) || !(r > 0)) return;

    const outer = r * u;
    const inner = outer * Math.cos(Math.PI / sides) * (1 - Math.min(indent, 1));
    const isStar = indent !== 0; // a plain polygon skips the in-between corners (they'd lie on its edges)
    const count = isStar ? sides * 2 : sides;
    const step = Math.PI * 2 / count;
    const startRadians = start * Math.PI / 180;

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const radius = (isStar && (i & 1)) ? inner : outer;
      const angle = startRadians + i * step;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { r, indent } = this.attributeValues;
    // Negative indent can push the in-between corners beyond r
    const sides = Math.floor(this.attributeValues.sides);
    const inner = r * Math.cos(Math.PI / sides) * (1 - indent);
    const extent = Math.max(r, inner);
    this.boundingBox.left = -extent;
    this.boundingBox.right = extent;
    this.boundingBox.top = -extent;
    this.boundingBox.bottom = extent;
    return this.boundingBox;
  }
};
customElements.define('pxl-polygon', pxl.Polygon);
```

(Sketch: final code follows the shape-authoring plan if it lands first: no `observedAttributes`, `draw(ctx, u)`.)

**Notes:**
- **Plain polygon draws `n` corners, not `2n`:** with `indent = 0` the inner corners would lie exactly on the edges. Skipping them keeps the path minimal and avoids extra (straight) join points for `linejoin` and dashes.
- **Performance:** `2n` `cos` / `sin` per draw (10 for a pentagon, 16 for an 8-pointed star). No allocations. No vertex cache: per the polyline measurements (`design/2026-10-18_polyline_optimization_plan.md` §2.3) this is far below anything measurable; a cache would add code without benefit.
- **Bounding box:** the circle around the shape, like `<pxl-circle>`, using the larger of the two radii. Gradients stay centered when the shape rotates or `sides` / `indent` animate, instead of jumping with a tight box.
- **Hit testing:** automatic (the dummy context runs `draw()`).
- **Dashes:** start at the first corner (`start`).

---

## 6. Edge Cases

| # | Case | Behavior |
|---|---|---|
| 1 | `sides` below 3, `NaN`, not set to a number | nothing drawn |
| 2 | `sides="5.7"` or animated `sides` | rounded down (steps between shapes) |
| 3 | Very large `sides` (e.g. 200) | close to a circle; no upper limit |
| 4 | `r` ≤ 0 | nothing drawn |
| 5 | `indent="1"` | spokes: the fill has no area, only the stroke is visible |
| 6 | `indent` above 1 | clamped to 1: the inner corners would cross the center and make a self-intersecting shape |
| 7 | negative `indent` | allowed: bulges, at `1 − 1 / cos(180° / n)` a regular `2n`-gon, below that the in-between corners become the tips (the shape turned by half a step, §2.4) |
| 8 | very pointy tips with `linejoin="miter"` | the tip is bevelled once it exceeds `miterlimit` (default 10), like any polyline corner; docs mention `miterlimit` / `linejoin` |
| 9 | bare `indent` (`<pxl-polygon indent>`) | Rule A: class default `0` → plain polygon. A name that sounds like a switch (`star`) would make this surprising (§7) |
| 10 | `sides="4"` with the default `start` | a diamond; a square needs `start="-45"` (§7) |

---

## 7. Decisions

| Topic | Decision | Reason |
|---|---|---|
| One shape for polygons and stars | ✅ | a star is a polygon with in-between corners; shared attributes, morphing between them |
| Arbitrary polygons | ❌ here, use `<pxl-polyline closed="true">` | already works |
| Relative amount (§3 B) instead of absolute `ir` | ✅ recommended | same meaning for every `sides`, default `0`, scales with `r` |
| **Name of the star amount** | ❓ open: `indent` (proposal), `depth`, `pinch` | avoid `star` (reads like a switch, §6 #9) and `ir` (absolute on `<pxl-circle>`) |
| **Element name** | ❓ open: `<pxl-polygon>` (proposal) or `<pxl-star>` | "polygon" covers both; the sidebar already had "Polygon" |
| **Default `start`** | ❓ open: `-90` (first corner up, proposal) or `0` (like `<pxl-circle>`, first corner at 3 o'clock) | `-90` gives the expected upright triangle and star; side effect: `sides="4"` is a diamond |
| **Default `sides`** | ❓ open: `5` (proposal), `6` or `3` | a sensible shape as soon as `r` is set |
| `indent` above 1 | ✅ clamp to 1 | self-intersecting shapes aren't useful and fill unpredictably |
| Absolute inner radius as an extra attribute | ⏸️ only if requested | exact sizes rarely matter for stars; the docs table covers classic proportions |
| Rounded corners | ⏸️ later | `linejoin="round"` covers simple cases |
| Crossed star outlines (pentagram with inner lines) | ❌ | a polyline through every second corner |

---

## 8. Docs Page (`docs/polygon.html`, Outline)

1. **Sides & Radius**: triangle / hexagon; sliders `sides`, `r`.
2. **Stars**: `indent` slider on a 5- and an 8-sided shape; callout with the value table (§3) and classic proportions.
3. **Orientation**: `start` vs. `rotate`; callout "a square is `sides="4" start="-45"`".
4. **Seals & Badges**: negative `indent`.
5. **Animation**: polygon → star morph (`indent="wave(2)"`), stepping `sides`.
6. **Showcase**.
10. **Element Reference**.

Sidebar: "Polygon" link back under Shapes & Paths, after "Polyline".

---

## 9. Implementation Steps

1. Decide the open points in §7.
2. `js/elements/shapes/polygon.js` (§5); `build.js`: add it after `polyline.js`. `node build.js`.
3. Tests (§10).
4. `.agents/KILOPIXEL.md`: element reference (attributes, geometry rules, edge cases), hierarchy diagram, source file table, code generation guide.
5. `docs/polygon.html` (§8), `docs/js/layout.js` sidebar link.

---

## 10. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | `sides` 3 / 4 / 5 / 6 / 8, `indent="0"` | regular polygons, first corner up, `n` path corners |
| 2 | `indent` 0.25 / 0.5 / 0.75 / 1 per `sides` | stars as in `scratch/regular_polygon/relative.html`; `1` = spokes |
| 3 | negative `indent`, including `1 − 1 / cos(180° / n)` | bulges; exact regular `2n`-gon at that value |
| 4 | `indent="2"` | same as `1` (clamped) |
| 5 | `sides` "2", "abc", "5.7"; `r="0"` | nothing / nothing / 5 corners / nothing |
| 6 | Classic proportions (§3 table) | tips line up with lines through every *m*-th corner |
| 7 | Linear and radial gradient fill while rotating and animating `indent` | gradient centered, no jumps |
| 8 | Hover / `onclick` on a star | hit only inside the star outline, not between the tips |
| 9 | Bare / removed `indent`, `sides`, `start` | class defaults (Rule A) |
| 10 | Regression: all docs / examples pages | unchanged (new element only) |
