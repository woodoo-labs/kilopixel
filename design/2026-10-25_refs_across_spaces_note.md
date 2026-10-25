# Refs Across Coordinate Spaces (Points, Variables, `toLocal`)

- **Status**: ⚪ **Discussion note** (2026-10-25). No engine changes decided; nothing implemented.
- **Context**: polyline docs (section 8 and the planned Element Reference). Question: should `ref.<id>.pN` be documented, and how do readers attach to a polyline point from another layer?
- **TODO**: `.agents/TODO.md` §25

## 1. Core Finding: Refs Are Values, Not Positions

Every `ref.<id>.<name>` returns the value as the element holds it, in the **element's own space**:

- `ref.v.value` (variable): a plain number. It has no space; a reader uses it in the reader's own parent space.
- `ref.box.x`: the box's `x` attribute, in the box's parent space.
- `ref.line.x2`: the line's end, measured from the line's center (`x`, `y`) and before its `rotate` / `scale`.
- `ref.zig.pN` (internal): a polyline coordinate as written. Point *k* is `p(2k)` (x) and `p(2k+1)` (y). Before relative-mode accumulation and before the polyline's transform.

So a raw ref is only a correct *position* when the reader sits in the same space and the source has no transform (and, for polylines, no relative mode). The `<pxl-var>` pattern taught in the docs has the same limit; it works on our doc stages because the shape and its dots share one untransformed space.

Only `toLocal()` crosses spaces, because only it knows both sides (target global matrix and caller parent matrix).

## 2. What `toLocal` Supports Today

- **Targets**: every `pxl.PxlNode` with a frame: all shapes, `pxl-group`, `pxl-layer`. Not `pxl-stage` (not a PxlNode, returns 0). Not `pxl-var` (a PxlNode, but it observes only `value`; `x` / `y` attributes are ignored, so the matrix is built from `undefined` and the result is `NaN`).
- **Properties** (same for every target): `x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scale` / `scalex`, `scaley`. Anything else returns 0.
- All of them describe the element's **frame** (origin, rotation, scale), never the geometry inside it (`r`, `w`, `x2`, points).
- A single number can't be mapped: rotation mixes x and y, so mapping needs a full (x, y) pair.

## 3. Three Kinds of Values

| Kind | Examples | Mapping across spaces |
|---|---|---|
| Positions | `x`/`y`, `x1`/`y1`, polyline points | full affine map, only as a pair |
| Sizes | `r`, `w`, `h`, `strokewidth` | scale only; no single answer under non-uniform scale or skew |
| Angles | `rotate`, circle `start` / `end` | rotations add; distorted under skew / non-uniform scale |

Sizes and angles already work by **composition** (uniform scale):

```html
r="ref.c.r * toLocal(ref.c, 'scale')"
start="ref.c.start + toLocal(ref.c, 'rotate')"
```

Per-attribute entries like `toLocal(ref.c, 'r')` were rejected: a per-shape table that keeps growing, with arbitrary results under non-uniform scale.

## 4. Patterns That Work Today (No Engine Change)

1. **Shared space**: put the shape and its readers in one group or layer; raw refs and variables are then correct.
2. **Track the tip with `dx` / `dy`**: transform order is translate(`x`, `y`) → rotate → scale → skew → translate(`dx`, `dy`). `x` / `y` is the pivot; `dx` / `dy` pushes the drawing out along the rotated axes; `toLocal(ref, 'tx' | 'ty')` is where the drawing's (0, 0) lands. Write the geometry so the tracked point is (0, 0):

   ```html
   <pxl-line id="hand" rotate="t * 30" dy="-200" y2="200"></pxl-line>   <!-- (0, 0) is the tip -->
   <pxl-circle x="toLocal(ref.hand, 'tx')" y="toLocal(ref.hand, 'ty')" r="10"></pxl-circle>
   ```

   Same for lines and polylines drawn relative to their center (line section 4, polyline section 7). Limit: one point per shape, and only a fixed point of the drawing.
3. **Anchors**: an element in the same space as the shape, placed on the point; readers elsewhere use `toLocal` on the anchor.
   - `pxl-group` is the lightest anchor (no drawing, no click target).
   - A hidden shape works too: `render()` evaluates animations before the `hidden` check (`shape.js`), so it keeps updating its readers.
   - A visible dot that is drawn anyway (like the point dots on the doc stages) is a free anchor.
   - Keep the transform on a parent group shared by shape and anchor, not on the shape itself.
   - With `ref.zig.pN` the anchor even follows inline animated points; docs would use a shared variable while `pN` is internal. Relative mode needs the sum of offsets.
4. **Phantom elements as "spatial variables"**: a `pxl-group` bundles `x`, `y`, `rotate`, `scale` with a place, so `toLocal` can read them from anywhere. Rule of thumb:

   | Value | Use |
   |---|---|
   | A plain number (speed, size, color, step) | `<pxl-var>` |
   | A position, angle or scale, maybe read from another space | a phantom `<pxl-group>` (or a shape drawn anyway) |
   | Elements that should move together | put them inside one group |

   Giving `pxl-var` its own `x` / `y` was rejected: it would be a group holding a number and blur two clear roles. Combine instead: `<pxl-group id="peakAnchor" x="150" y="ref.peak.value">`.

## 5. Possible Engine Additions (Not Decided)

1. **Point form of `toLocal`** (general, all elements): `toLocal(ref.el, 'x' | 'y', px, py)` maps a point given in the element's drawing space (after `dx` / `dy`; (0, 0) lands on `tx` / `ty`). Math: `x = D0·px + D2·py + D4`, `y = D1·px + D3·py + D5` with the existing delta `D = Invert(CallerParentGlobal) × TargetGlobal`. Reactivity unchanged (depends on `ref.el` plus matrix broadcasts).
   ```html
   x="toLocal(ref.hand, 'x', ref.hand.x2, ref.hand.y2)"
   ```
2. **`toLocal(ref.zig, 'pN')`** (polyline sugar): maps coordinate N with its partner (even N → x of point N/2, odd N → y). Adds relative-mode accumulation. Missing point → `undefined` (reader not drawn). About 20 lines in `pxl.toLocal`; parse the index without allocating. Same idea could later cover `pxl-line` (`x1`↔`y1`, `x2`↔`y2`); not needed now.
3. **`ref.zig.points`** (evaluated list): a non-enumerable lazy getter on `attributeValues` that rebuilds `"x,y; x,y; …"` from `p0…pN` only when read and when a coordinate changed (cached string otherwise). Consistent with other refs (evaluated values, not source). The source string stays available via `getAttribute('points')`.
4. **List-expression rule for `points`** (needed to copy with `points="ref.zig.points"`): a `points` value without a top-level comma is one expression that returns a list; evaluate it, re-parse only when the string changed (identity check). Valid written lists always contain a comma, so existing pages are unaffected. The parser (`pxl.parsePointsIntoArray`) tracks parentheses but not quotes; make it quote-aware so `ref.zig.points + '; 900,300'` works without extra parentheses. Copies hold numbers (fed on every change) and need the same `mode` as the source.

## 6. Decisions So Far

- No engine changes for now (2026-10-25).
- `ref.<id>.pN` stays internal and undocumented.
- The patterns in §4 cover the real use cases today. When docs get there, teach them in the walkthrough's `toLocal` section (between Variables §7 and Cross-Space Projection §8): "refs are values in the target's space; when a value is a place, give it an element; use `toLocal()` to read it from another space."
- Revisit §5 when a real example needs a point inside a transformed shape (most likely first: §5.1 point form, then §5.2 `'pN'` sugar).
