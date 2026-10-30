# Refs Across Coordinate Spaces (Points, Variables, `toLocal`)

- **Status**: ⚪ **Living note: open ideas, no decisions yet** (started 2026-10-25, ideas added 2026-10-26). This is the hub for refs, points and `toLocal`; start here.
- **Context**: polyline docs (section 8 and the planned Element Reference). Question: should `ref.<id>.pN` be documented, and how do readers attach to a polyline point from another layer?
- **TODO**: `.agents/TODO.md` §25
- **Related**: `design/2026-10-26_tolocal_fix_plan.md` (implemented 2026-10-26): `toLocal` readers now also update when their own space moves. Any point form (§5.1, §5.2, §7) builds on that reactivity.

## 0. Related Documents

All documents on this topic, oldest first. Older plans are kept unchanged as history; each points back here.

| Document | Date | Content | Status |
|---|---|---|---|
| `design/reference_implementation_plan.md` | 2026-07 | The `ref.*` registry (`pxl.nodes`, broadcast) | ✅ Implemented (history) |
| `design/variable_implementation_plan.md` | 2026-07 | Explicit `ref.*` everywhere, `<pxl-var>`, flat ID namespace | ✅ Implemented (history) |
| `design/local_coordinates_implementation_plan.md` | 2026-07 | Map **raw** global points (e.g. the mouse) into a group: `toLocal(ref.main.mouseX, ref.main.mouseY, 'x')` | ⚪ **Never implemented**: an open idea, related to the point form (§5.1) |
| `design/coordinate_mapping_implementation_plan.md` | 2026-07 | The original `toLocal` (`x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scale*`), `ref.<id>.tx` / `ty` getters, lowercase attribute names | ✅ Implemented |
| `design/2026-10-18_polyline_optimization_plan.md` §2.3.4 | 2026-10-18 | `ref.<id>.pN` readers update when `points` is replaced | ✅ Implemented |
| **This note** | 2026-10-25 | Refs are values, not positions; patterns that work today; possible additions | ⚪ Open ideas |
| `design/2026-10-26_tolocal_fix_plan.md` | 2026-10-26 | Readers update when their **own** space moves | ✅ Implemented |
| `design/2026-10-29_tolocal_decomposition_plan.md` | 2026-10-29 | Frame decomposition (`skewx`, signed `scaley`, `zoom`), warning for unknown names; the `scale` attribute becomes `zoom` (multiplier) | ✅ Implemented |

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
- **Properties** (same for every target): `x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scalex`, `scaley` (signed), `skewx`, `zoom` (since 2026-10-30, `design/2026-10-29_tolocal_decomposition_plan.md`). Anything else returns 0, and a literal unknown name warns at compile time.
- All of them describe the element's **frame** (origin, rotation, scale, skew), never the geometry inside it (`r`, `w`, `x2`, points).
- A single number can't be mapped: rotation mixes x and y, so mapping needs a full (x, y) pair.

## 3. Three Kinds of Values

| Kind | Examples | Mapping across spaces |
|---|---|---|
| Positions | `x`/`y`, `x1`/`y1`, polyline points | full affine map, only as a pair |
| Sizes | `r`, `w`, `h`, `strokewidth` | scale only; no single answer under non-uniform scale or skew |
| Angles | `rotate`, circle `start` / `end` | rotations add; distorted under skew / non-uniform scale |

Sizes and angles already work by **composition** (uniform zoom):

```html
r="ref.c.r * toLocal(ref.c, 'zoom')"
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
   - *2026-10-26*: superseded by the `xN` / `yN` naming idea in §7.1 if that is adopted (`toLocal(ref.zig, 'x3')` instead of `'p4'`).
3. **`ref.zig.points`** (evaluated list): a non-enumerable lazy getter on `attributeValues` that rebuilds `"x,y; x,y; …"` from `p0…pN` only when read and when a coordinate changed (cached string otherwise). Consistent with other refs (evaluated values, not source). The source string stays available via `getAttribute('points')`.
4. **List-expression rule for `points`** (needed to copy with `points="ref.zig.points"`): a `points` value without a top-level comma is one expression that returns a list; evaluate it, re-parse only when the string changed (identity check). Valid written lists always contain a comma, so existing pages are unaffected. The parser (`pxl.parsePointsIntoArray`) tracks parentheses but not quotes; make it quote-aware so `ref.zig.points + '; 900,300'` works without extra parentheses. Copies hold numbers (fed on every change) and need the same `mode` as the source.

## 6. Decisions So Far

- No engine changes for now (2026-10-25).
- `ref.<id>.pN` stays internal and undocumented.
- The patterns in §4 cover the real use cases today. When docs get there, teach them in the walkthrough's `toLocal` section (between Variables §7 and Cross-Space Projection §8): "refs are values in the target's space; when a value is a place, give it an element; use `toLocal()` to read it from another space."
- Revisit §5 when a real example needs a point inside a transformed shape (most likely first: §5.1 point form, then §5.2 `'pN'` sugar).

## 7. Ideas 2026-10-26 (Not Decided)

Collected in a discussion on 2026-10-26. Decision for now: **keep everything as it is**. Nothing below is implemented.

### 7.1 Point Names `xN` / `yN` Instead of `pN`

- Polyline points readable as `ref.zig.x3` / `ref.zig.y3` (point 3), counting from 1 like `<pxl-line>`'s `x1` / `y1` / `x2` / `y2`.
- A 2-point polyline's `x1`…`y2` would then mean exactly what they mean on a line.
- Same names mapped across spaces: `toLocal(ref.zig, 'x3')`, `toLocal(ref.arm, 'x2')` (line end). The same `toLocal` code path serves lines and polylines.
- Cost: rename the internal point keys (`pN` → `xN` / `yN`) in `polyline.js` and a few internal places; update this note, `.agents/KILOPIXEL.md` and the docs. `pN` is internal and pre-release, so renaming costs nothing for users.
- Unknown names (`x99`) or shapes without points return `undefined`: the reader is not drawn (same rule as a removed point).

### 7.2 One Value Is Enough: `toLocal` Maps the Whole Point

Question: "Can `toLocal` map only `x3`?" Answer: it reads the partner itself.
- One number alone cannot be mapped (rotation mixes x and y). But `toLocal(ref.zig, 'x3')` gets the polyline, so it reads `x3` **and** `y3` (and in relative mode sums the offsets), maps the whole point through every transform (own `x` / `y` / `rotate` / `scale` / skew / `dx` / `dy`, all groups and layers, back into the reader's space) and returns only the x part. `'y3'` does the same and returns the y part.
- This is how `toLocal(ref.box, 'x')` already works (whole origin mapped, x returned). Two calls for x and y map the point twice: a few multiplications, no special API needed.

### 7.3 One-Argument Syntax: `toLocal(ref.zig.x3)`

- In plain JavaScript this cannot work: the argument is evaluated first, so `toLocal` would only receive a number (no element, no partner coordinate). That is why today's form is `toLocal(ref.box, 'x')`.
- Kilopixel expressions are rewritten anyway (`ref.a.b` → `ref.a?.b`, `toLocal(` → `pxl.toLocal(this, `). One more rewrite in `compileExpression` (about 3 lines) would turn exactly `toLocal(ref.<id>.<name>)` into `pxl.toLocal(this, ref.<id>, '<name>')`. Reactivity is unchanged (the expression still contains `ref.<id>`). The rewrite must allow the `?.` the injector adds before it.
- Rule for users: **wrap the ref in `toLocal(...)`**. Every name `toLocal` understands is also a readable ref property:

  | Same space | Any space |
  |---|---|
  | `x="ref.box.x"` | `x="toLocal(ref.box.x)"` |
  | `x="ref.box.tx"` | `x="toLocal(ref.box.tx)"` |
  | `rotate="ref.box.rotate"` | `rotate="toLocal(ref.box.rotate)"` |
  | `x="ref.zig.x3"` | `x="toLocal(ref.zig.x3)"` |
  | `x2="ref.arm.x2"` | `x2="toLocal(ref.arm.x2)"` |

- Only exactly `ref.<id>.<name>` works; anything else (`toLocal(ref.zig.x3 + 10)`, `toLocal(n)`) should produce a clear compile-time warning, not a silent 0.
- Pre-release: document only the one-argument form; the two-argument call stays as what the rewrite produces. Walkthrough §8 and `.agents/KILOPIXEL.md` would switch.
- Preferred so far (easier to learn, reads as "the local version of `ref.zig.x3`").

### 7.4 Which Space a Result Is For (The Reader-Line Rule)

`toLocal` returns numbers for the **reader's parent space**: where the reader's `x` / `y` live. Attributes measured inside the shape (line `x1`…`y2`, polyline points) live one level deeper, in the shape's own space after its own `x` / `y` / `rotate` / `scale`.

Example (`scratch/tolocal_reader_lines.html`, local only): a circle `sun` in layer A; layer B moved to `(250, 450)` and rotated 20°; three lines in layer B, all with `x2="toLocal(ref.sun, 'x')" y2="toLocal(ref.sun, 'y')"`, plus a ring with `x` / `y` = `toLocal(…)`:

| Reader in layer B | Own attributes | Result |
|---|---|---|
| Green line | none | ends exactly on the circle (own space = layer B's space) |
| Blue line | `x="150"` | parallel, 150 too far along layer B's x axis: misses |
| Purple line | `rotate="30"` | turned 30° around its center: misses |
| Ring | `x` / `y` = `toLocal` | sits on the circle |

The walkthrough §8 line works because it has no own `x`, `y` or `rotate`, like the green line. Related demo `scratch/tolocal_numbers.html`: the same screen spot has different numbers in each space; `toLocal` keeps the place, not the numbers.

### 7.5 "Always Hit the Point": The Attribute Decides the Space

Goal: a reference to a point always lands exactly on that point, whatever transforms the reader has.

- Idea: `toLocal` knows which attribute it is computing and maps into **that attribute's space**: `x` / `y` → parent space (as today); line ends and polyline points → the shape's own space (one more matrix step). Green, blue and purple in §7.4 would all hit.
- Mechanism: the engine evaluates attributes in about five places (`evaluateAnimations`, `evaluateAttributesForVariable`, `connectedCallback`, `compileAttribute`, `evaluateToLocalAttributes`); before each call it notes the current attribute (one variable write) and `toLocal` reads it.
- Order and reactivity: frame attributes (`x`, `y`, `rotate`, …) are evaluated before geometry attributes; a change of the shape's **own** transform re-evaluates its geometry `toLocal` attributes (the same mechanism as the 2026-10-26 fix, one level further).
- Estimate: about 40 lines plus docs.
- Limits, not worth covering: polyline `mode="relative"` (each point is an offset; would need the previous point's absolute position), `dx` / `dy` (yet another space: rotated, not yet shifted), sizes and angles under non-uniform scale or skew (no single right answer, §3).
- Scoped version if ever built: `x` / `y`, line ends, absolute polyline points; designed together with §7.1 and §7.3, since all three change `pxl.toLocal` and the compiler.

### 7.6 Workaround: Flip the Roles

Before the 2026-10-26 fix, and still useful as a pattern: let the element in the **still** space read the element in the **moving** space (the target side has always been tracked). Tested: a circle in a still layer with `x` / `y` = `toLocal(ref.ring, …)` stays inside a ring that turns with its rotating layer. Only possible when the follower may live in the still space (not for a pointer inside a rotating head, a gripper inside an arm group, or the walkthrough line when its own layer moves).

### 7.7 How Other Frameworks Do It

- **Imperative, one fixed space**: Flash `globalToLocal` / `localToGlobal`, PixiJS `toLocal` / `toGlobal`, Godot `to_local` / `to_global`, Three.js `worldToLocal` / `localToWorld`, Unity `InverseTransformPoint` / `TransformPoint`. You pass a point and get it back in the object's **own** space (where its children live); you choose which object to call it on. Kilopixel's `toLocal` effectively calls it on the reader's **parent**, which suits `x` / `y`.
- **SVG**: no declarative cross-space references; computed with JavaScript (`getScreenCTM()` and its inverse).
- **TikZ (LaTeX)**: named points like `(nodeA.east)` are referenced across scopes with transforms and lines simply hit them: closest to §7.5, but static, not live.
- A **declarative, live** reference that always hits the point would be unusual: a strength, not a copy.

### 7.8 Over-Engineering?

- **The goal (§7.5) is not over-engineering**: it removes the hardest rule to explain (§7.4: "only if your own center is `(0, 0)` without rotation") and replaces it with "refer to a point, hit the point". Pre-release is the cheapest time to set what `toLocal` means.
- **Over-engineering would be** covering everything (§7.5 limits) without a use case.
- **Before building**: write a design plan with **one real use case** (a connector line between two rotating groups, or a robot arm whose gripper follows a target), then decide.
