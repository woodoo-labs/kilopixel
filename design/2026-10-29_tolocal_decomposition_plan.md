# toLocal Decomposition and the `zoom` Attribute

- **Status**: ✅ **Implemented** (2026-10-30)
- **Date**: 2026-10-29
- **Related**: `design/2026-10-25_refs_across_spaces_note.md` (hub for `toLocal`, §2 and §3), `design/coordinate_mapping_implementation_plan.md` (original property list), `design/2026-10-26_tolocal_fix_plan.md` (reactivity)
- **Target Implementation**: `js/matrix.js` (`pxl.toLocal`), `js/compiler.js` (warning for unknown `toLocal` names); for §5 (`zoom`) also `js/elements/node.js` (`getLocalMatrix`), `js/graphics.js` (`applyContextState`), `js/engine.js` (`isSpatialKey`), `js/elements/shape.js`, `group.js`, `layer.js` (attribute lists, defaults, `hasStateChanges`), and every page that uses `scale="…"`
- **Check** (local only, scratch is git-ignored): `scratch/decompose_check.js` (decompose and rebuild 100,000 random matrices, max error 7·10⁻¹⁴); `scratch/tolocal_bench.js` (cost per toLocal call, §3.5); demo of the current limits: `scratch/tolocal_probe.html` (P4); `examples/test53.html` (four transformed layers, toLocal lines through the rects)

---

## 1. Problem

`toLocal(ref.el, prop)` describes the target's frame in the reader's parent space with the delta matrix `D = Invert(CallerParentGlobal) × TargetGlobal`. The frame properties are read from D's linear part (`d0`–`d3`, columns `(d0, d1)` and `(d2, d3)`):

| Property | Today |
|---|---|
| `rotate` | `atan2(d1, d0)` |
| `scale` / `scalex` | `√(d0² + d1²)` (length of the target's x axis) |
| `scaley` | `√(d2² + d3²)` (length of the target's y axis) |
| skew | not available (any other name returns `0`) |

A 2×2 matrix has four degrees of freedom; these are three values. They describe the target only when its axes are at a right angle and not mirrored in the reader's space. Three cases break that:

| Target | Today (`rotate` / `scalex` / `scaley`) | What a copy with these values looks like |
|---|---|---|
| In a group with `scalex="-1"` (mirrored) | `180 / 1 / 1` | turned upside down instead of mirrored |
| `skewx="30"` | `0 / 1 / 1.15` | an upright rectangle, taller, no skew |
| `rotate="40"` inside a group with `scalex="2"` | `22.8 / 1.66 / 1.50` | a turned rectangle; the target is a parallelogram |

The third case is common: any rotated shape inside a non-uniformly scaled group or layer.

Two more problems sit next to it:

- **`toLocal(…, 'scale')` is `scalex`.** A target with `scaley="2"` only reports `1`, and a target with `scalex="2"` reports `2`, which a reader then applies to both axes.
- **Unknown names fail silently.** `toLocal(…, 'skewy')` or a typo returns `0` without a hint.

Skew was never excluded on purpose: the original property list (`coordinate_mapping_implementation_plan.md`, 2026-07) simply did not include it.

## 2. Use Cases

**Selection outline / ghost copy in another space.** An editor-style page draws a dashed outline around a shape that sits inside a transformed group, from an overlay layer that is not transformed (so the outline is never clipped, faded or blended with the shape's layer):

```html
<pxl-layer>
  <pxl-group x="400" y="300" rotate="t * 20" scalex="1.6">
    <pxl-rect id="part" x="120" rotate="40" w="100" h="50" fill="#f97316"></pxl-rect>
  </pxl-group>
</pxl-layer>

<pxl-layer>
  <!-- Outline: the same frame as the part, in this layer's space -->
  <pxl-rect x="toLocal(ref.part, 'x')" y="toLocal(ref.part, 'y')"
    rotate="toLocal(ref.part, 'rotate')" skewx="toLocal(ref.part, 'skewx')"
    scalex="toLocal(ref.part, 'scalex')" scaley="toLocal(ref.part, 'scaley')"
    dx="ref.part.dx" dy="ref.part.dy"
    w="ref.part.w" h="ref.part.h" stroke="#0ea5e9" strokewidth="2" linedash="[6, 6]">
  </pxl-rect>
</pxl-layer>
```

Today the outline is a rectangle that drifts off the corners of the (parallelogram) part. With this plan it matches the part exactly at every angle.

**Follow the zoom only.** A label or marker in an overlay layer grows with a zoomed target but keeps its own proportions: `zoom="toLocal(ref.planet, 'zoom')"`, or a dot with `r="ref.c.r * toLocal(ref.c, 'zoom')"`. This is the most common case: uniform zooming, set with one value.

Other uses of the exact frame: a shadow or reflection copy in a separate layer, a hit marker that should look exactly like its target, debugging overlays.

## 3. Proposal: the toLocal Properties

Decompose D in Kilopixel's own transform order (`pxl.Matrix.updateLocal`: rotate → scale → skew) with `skewy = 0`. One skew is enough: rotate, scalex, scaley and skewx can express every 2×2 matrix. Together with the position (`tx`, `ty`) these are the six numbers of the matrix: the complete frame. `x` / `y` and `dx` / `dy` split the position into pivot and offset; `zoom` is a summary of the four linear values for the uniform case.

| Property | Formula | Change |
|---|---|---|
| `x`, `y`, `dx`, `dy`, `tx`, `ty` | as today | unchanged |
| `rotate` | `atan2(d1, d0)` | unchanged: direction of the target's x axis |
| `scalex` | `√(d0² + d1²)` | unchanged: length of the target's x axis |
| `scaley` | `(d0·d3 − d1·d2) / scalex` | **changed**: the height perpendicular to the x axis, **signed** (negative = mirrored) |
| `skewx` | `atan((d0·d2 + d1·d3) / scalex²)` in degrees | **new**: lean of the target's y axis |
| `zoom` | `√|d0·d3 − d1·d2|` | **new** (replaces `scale`): the total zoom, see §3.1 |

Derivation: `updateLocal` with `skewy = 0` gives the columns `scalex·(c, s)` and `tan(skewx)·scalex·(c, s) + scaley·(−s, c)`. The first column gives `rotate` and `scalex`. The second column's part along the first column is `tan(skewx)·scalex`, its part perpendicular to it is `scaley`. The perpendicular part is the determinant divided by `scalex`, which keeps the sign of a mirror.

Results for the cases in §1 (checked in `scratch/decompose_check.js`):

| Target | `rotate` / `scalex` / `scaley` / `skewx` / `zoom` |
|---|---|
| Mirrored (`scalex="-1"`) | `180 / 1 / −1 / 0 / 1`: rebuilds the mirror exactly |
| `skewx="30"` | `0 / 1 / 1 / 30 / 1` |
| `rotate="40"` in `scalex="2"` | `22.8 / 1.66 / 1.20 / −28.2 / 1.41` |

### 3.1 `zoom`: Totals, Not Attributes

The determinant is the factor by which the target's frame changes areas in the reader's space; its square root is the uniform zoom with the same area. It treats x and y alike, is always positive (sizes have no mirror), and rotation, skew and mirroring don't change it.

**Exact as long as nothing is stretched.** If every element between the reader and the target (the target included) scales uniformly (with `zoom`, or with `scalex = scaley`), `toLocal(…, 'zoom')` is exactly the product of all those factors. Example: a target with `zoom="2"` in a layer with `zoom="1.5"`, read from an untransformed layer, gives `3`, also with rotation or skew in between. As soon as something in the pipeline is stretched (`scalex ≠ scaley`), it is the average factor (same area): a sensible size, but not a zoom anyone set.

**toLocal returns totals, attributes are parts.** A matrix cannot tell `zoom="2"` from `scalex="2" scaley="2"`, so toLocal cannot return the attribute values themselves. Even in the reader's own space:

| Target (same space as the reader) | `ref.el.zoom` / `toLocal(…, 'zoom')` | `ref.el.scalex` / `toLocal(…, 'scalex')` |
|---|---|---|
| `zoom="2"` | 2 / **2** | 1 / **2** |
| `scalex="2"` | 1 / **1.41** | 2 / **2** |

This is the same kind of difference as `toLocal(…, 'dx')`, which includes the target's own rotation: toLocal says how the target looks from the reader's space, not which attribute caused it.

**Usage rule (docs, not checked by the engine):**

> Zoom with `zoom`, stretch with `scalex` / `scaley`. As long as nothing between the reader and the target is stretched, `toLocal(…, 'zoom')` is the exact total zoom. As soon as something in the pipeline is stretched, read `scalex` and `scaley` instead (they include every zoom). In such a pipeline it is clearer to zoom with `scalex = scaley` as well, so all scaling sits in one place.

| Pipeline | Use |
|---|---|
| only `zoom` | `toLocal(…, 'zoom')`, exact |
| `zoom` and uniform `scalex = scaley` | `toLocal(…, 'zoom')`, also exact |
| somewhere `scalex ≠ scaley` | `toLocal(…, 'scalex')` and `'scaley'`; `'zoom'` is only an average |

Why the engine doesn't warn about mixing: on one element, mixing is a real use case (a pulse on a stretched shape, §5); in the pipeline it can't be checked at compile time (values animate, an ancestor may become uneven later), and a runtime check would need a tolerance for Float32 noise and spam the console during animations. Breaking the rule draws correctly and degrades `toLocal(…, 'zoom')` to an average without jumps.

### 3.2 The Clone Rule

With the four linear values, a reader can take over the target's complete frame. The offset comes from the plain ref, because the reader's own rotate / scale / skew turn it exactly like the target's:

```html
x="toLocal(ref.el, 'x')" y="toLocal(ref.el, 'y')"
rotate="toLocal(ref.el, 'rotate')" skewx="toLocal(ref.el, 'skewx')"
scalex="toLocal(ref.el, 'scalex')" scaley="toLocal(ref.el, 'scaley')"
dx="ref.el.dx" dy="ref.el.dy"
```

Why it is exact: the reader's linear part equals D's linear part, so its translation `x + L·(dx, dy)` is `(d4 − L·(dx, dy)) + L·(dx, dy) = d4`. Reader global = reader parent global × D = target global.

The reader doesn't set `skewy` and keeps `zoom` at `1`. Since `zoom` multiplies (§5), it can be used on purpose: `zoom="1.1"` gives an outline 10 % larger than the target.

### 3.3 Unknown Names Warn

`skewy` is not offered: it is not unique (`skewy="30"` is the same matrix as `rotate="30" scalex="1.155" scaley="0.866" skewx="23.4"`), so it would always be `0`. Users who map attribute by attribute (`skewx` → `skewx`, `skewy` → `skewy`) would get a silently wrong copy. The same goes for the removed `'scale'` and for typos.

The compiler already finds `toLocal(` calls (`pxl.rewriteExpression`, `usesToLocal` in `js/compiler.js`). When the property is a string literal that is not one of `x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scalex`, `scaley`, `skewx`, `zoom`, it warns once per expression:

> toLocal(): 'skewy' is not available. To copy a frame, map rotate, scalex, scaley and skewx (KILOPIXEL.md, Coordinate Mapping).

A property given as a variable is not checked; it returns `0` at runtime as today.

### 3.4 Code (`pxl.toLocal`, `js/matrix.js`)

```js
// Kilopixel's order rotate → scale → skew: rotate, scalex, scaley (negative = mirrored) and skewx
// rebuild any target frame. zoom is the uniform factor with the same area change.
if (prop === 'rotate') return Math.atan2(d[1], d[0]) * 180 / Math.PI;
const det = d[0] * d[3] - d[1] * d[2];
const lenX = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
if (prop === 'scalex') return lenX;
if (prop === 'scaley') return det / lenX;
if (prop === 'skewx')  return Math.atan((d[0] * d[2] + d[1] * d[3]) / (lenX * lenX)) * 180 / Math.PI;
if (prop === 'zoom')   return Math.sqrt(Math.abs(det));
```

About 8 changed lines, placed after the position properties (`x` … `ty`) and `rotate`, so those reads don't compute `det` and `lenX`. No allocations. The compile-time check (§3.3) is a few lines in `js/compiler.js`.

### 3.5 Performance and Allocations (reviewed 2026-10-30)

Every per-frame path this plan touches, checked for work and garbage:

| Path | When it runs | Change | Allocations |
|---|---|---|---|
| `pxl.toLocal` position properties (`x` … `ty`) | each evaluation of a toLocal attribute | none (the new code comes after them) | none |
| `pxl.toLocal` `rotate`, `scalex`, `scaley`, `skewx`, `zoom` | same | `det`, `lenX`, one `sqrt`, `atan` for skewx | none: numbers only; the `{ dx, dy }` destructuring of `attributeValues` creates no object |
| `getLocalMatrix` (`node.js`) | only when the local matrix is dirty | `zoom * scalex` instead of a comparison | none |
| `applyContextState` (`graphics.js`) | each draw of an element with state changes | `zoom * scalex` instead of a comparison | none |
| `hasStateChanges` checks | each draw | `zoom !== 1` instead of `scale !== 1` | none |
| Unknown-name check (§3.3) | compile time only, once per expression string (`pxl.animationCache` shares compiled functions) | regex over the source | at compile time only |

**Measured** (`scratch/tolocal_bench.js`, Node / V8, the toLocal core with Float32Array matrices like the engine, 2·10⁶ iterations after warm-up; the `getGlobalMatrix()` walk is left out, it only compares version numbers while nothing moves):

| Case | Today | Plan |
|---|---|---|
| One position read (`x`, `y`) | 37 ns | 37 ns |
| One frame read (`rotate` … `zoom`) | 41 ns | 43–48 ns |
| Clone rule, per reader and frame | 5 calls, ~200 ns | 6 calls, ~285 ns |
| Heap growth over 10⁷ calls | none (< 0.5 MB noise) | none |

About 580 clone readers fit into 1 % of a 60 fps frame (167 µs). Most of each call is the shared `invert` + `multiply`, not the new properties.

**Rules for the implementation:**

- **No warning at runtime.** `pxl.toLocal` keeps returning `0` for an unknown name without logging; a `console.warn` there would run every frame. The warning lives only in the compiler (§3.3).
- **No per-call objects.** Return plain numbers; no `{ rotate, scalex, … }` result object, no arrays, no template strings in `pxl.toLocal`.

**Not planned (micro-optimization):** each toLocal call repeats `invert` + `multiply`, so the clone rule computes D six times per reader and frame. Caching D per caller and target for one frame would save about 200 ns per clone reader; that is below anything measurable at realistic reader counts, and the cache would need invalidation. Revisit only if a profile shows toLocal in the frame budget.

## 4. Prior Art

| Framework | What it does |
|---|---|
| Konva | `Transform.decompose()` returns x, y, rotation, scaleX, scaleY, skewX and **skewY: 0**, with the same formulas as §3 |
| Fabric.js | `util.qrDecompose()`: angle, scaleX, scaleY, skewX, **skewY: 0** |
| Godot 4 | `Node2D` has `rotation`, `scale` and **one** `skew` |
| CSS | decomposes 2D matrices for animation into translate, rotate, scale and one skew |
| Unity | the world scale is called `lossyScale`: skew cannot be represented |
| PixiJS, Unity, SVG | map points (`toLocal` / `toGlobal`, `TransformPoint`, `matrixTransform`) and copy whole matrices (`setFromMatrix`, `transform="matrix(…)"`) |

Decomposing with one skew is the standard; elements that accept both skews but report only skewx are common (Konva, Fabric). (From memory, not re-checked against current docs.)

## 5. The `zoom` Attribute (replaces `scale`)

**Today:** `scale` sets both axes and replaces `scalex` / `scaley` whenever it is not `1` (`js/elements/node.js` `getLocalMatrix`, `js/graphics.js` `applyContextState`):

```js
const sX = scale !== 1 ? scale : scalex;
const sY = scale !== 1 ? scale : scaley;
```

`1` doubles as "not set", so `scale="2" scalex="3"` ignores `scalex`, `scale="1" scalex="3"` uses it, and an animated `scale` next to `scalex` jumps each time it passes exactly `1`. KILOPIXEL.md therefore says "do not combine `scale` with `scalex` / `scaley`".

**Proposed:** rename `scale` to `zoom` and make it a multiplier:

```js
const sX = zoom * scalex;
const sY = zoom * scaley;
```

| Attributes | Today (`scale`) | Proposed (`zoom`) |
|---|---|---|
| `zoom="2"` | 2 / 2 | 2 / 2 |
| `scalex="3"` | 3 / 1 | 3 / 1 |
| `zoom="2" scalex="1.5"` | 2 / 2 (`scalex` ignored) | 3 / 2 |
| `zoom="1 + 0.1 * wave(1000)" scalex="1.5"` | x jumps at `1` | x = 1.5 × wave value, smooth |

- **Close to the canvas:** `scalex` / `scaley` are the two arguments of `ctx.scale(x, y)` (the canvas has no one-value form). Kilopixel has them as two attributes because one `scale="x, y"` attribute would have to split expressions at commas, which isn't safe. `zoom` is a separate idea on top: a uniform factor for the whole element, not a shortcut for `scale(s, s)`. The name makes the difference visible.
- **For:** no special value, no jump, combining is allowed (a pulse on a stretched shape), the "do not combine" rule disappears, the code is shorter (no comparison), and `toLocal(…, 'zoom')` (§3.1) has a name that doesn't suggest it equals an attribute part.
- **Naming:** CSS has a `zoom` property that also changes layout; on a canvas this doesn't matter. Maps and cameras use "zoom" for the same idea (uniform enlargement). The docs say "zoom multiplies scalex and scaley".
- **Against:** a rename across all pages (pre-release, no compatibility needed). `examples/test48.html` has 3 labels with `scale="-1" scaley="-1"`, meant as a 180° turn so the labels on the left read upright. As multiplier this would be `−1 / 1`, a mirror; fix: `zoom="-1"` alone.
- **Relation to `toLocal`:** none in the math (`toLocal` reads the final matrix). It changes the clone rule (§3.2): the reader keeps `zoom` at `1`, or uses it on purpose.
- **Code:** `observedAttributes` and `defaults` in `shape.js`, `group.js`, `layer.js` (`scale` → `zoom`, default `1`); `getLocalMatrix` (`node.js`) and `applyContextState` (`graphics.js`), 2 lines each; `pxl.isSpatialKey` (`engine.js`); the `hasStateChanges` checks become `zoom !== 1 || scalex !== 1 || scaley !== 1`.
- **Pages:** see §5.1; a mechanical rename, and only `test48` changes behaviour.
- **Separate commit** from the toLocal change (§11).

### 5.1 Pages That Use `scale` (checked 2026-10-30)

All 79 tracked `.html` files were searched (attributes, `setAttribute` calls, `toLocal(…, 'scale')`, prose in docs pages). No page uses `toLocal(…, 'scale')`, and no docs page sets a `scale` attribute.

**`scale="…"` attributes: 190 in 12 files.** Every one except `test48` sets `scale` alone on its element, so `zoom` (a multiplier with `scalex = scaley = 1`) draws exactly the same; the rename is all that's needed.

| File | Count | Use | After the rename |
|---|---|---|---|
| `examples/test01.html` | 1 | pulse `1 + wave(4) * 0.2` | same |
| `examples/test18.html` | 1 | `scale="ref.scale.value"` (slider) | same; the `pxl-var` keeps its id `scale` |
| `examples/test21.html` | 4 | static `1.5`, pulse | same |
| `examples/test22.html` | 1 | static `0.85` | same |
| `examples/test33.html` | 5 | hover / press feedback `isPressed ? 0.95 : …` | same |
| `examples/test34.html` | 2 | static `0.5`, `1.2` (toLocal demo) | same |
| `examples/test36.html` | 1 | pulse | same |
| `examples/test37.html` | 6 | pulse on grid and circle, hover / press on 4 nodes | same; its `scaley="0.417"` orbits are on other elements |
| `examples/test40.html` | 160 | `pow(ref.decay.value, n)`, one per polyline | same |
| `examples/test45.html` | 3 | static `1.4` | same |
| `examples/test48.html` | 3 | `scale="-1" scaley="-1"` on 3 labels (a 180° turn) | **changes**: as multiplier `−1 / 1` is a mirror; write `zoom="-1"` alone |
| `tests/index.html` | 3 | `1.5`, `1.2`, `0.8` on toLocal test layers and a group | same |

**`setAttribute('scale', …)`: 2 calls in `tests/index.html`** (toLocal tests: `tlLayer2` → `1.4`, `tlLayer5a` → `0.7`). Rename to `'zoom'`; same result.

**Prose in docs pages: 4 mentions** of `<code>scale</code>`, all "the point it rotates and scales around":

| Page | Line | Change |
|---|---|---|
| `docs/filter.html` | ~216 | group transforms (`x`, `y`, `rotate`, `scale`) → `zoom` |
| `docs/line.html` | ~372 | "rotates (`rotate`) and scales (`scale`) around" → `zoom` |
| `docs/polyline.html` | ~712 | same sentence → `zoom` |
| `docs/rect.html` | ~451 | anchor sets the origin for scaling (`scale`, `scalex`, `scaley`) → `zoom`, `scalex`, `scaley` |

**Not affected:**

- `ref.scale.value` in `examples/test05.html`, `test06.html`, `test18.html` and `benchmark.html`: a `pxl-var` with the id `scale`, not the attribute.
- `scalex` / `scaley` in `docs/rect.html` (sliders and snippets) and `examples/test37.html`: unchanged attributes.
- `initial-scale` in the viewport meta tag of every docs page.
- `examples/test53.html` (committed after this overview): 4 corner helpers with `scale="ref.rectN.scale"`, renamed to `zoom="ref.rectN.zoom"` during the implementation.

`.agents/KILOPIXEL.md` uses `scale` in two examples (hover / press, lines ~653 and ~1570) and in prose (lines ~193, ~1153, ~1611); see §9.

## 6. Edge Cases

- **Degenerate target** (`scalex = 0` in the chain): `scaley` and `skewx` divide by `0` and return `NaN` or `Infinity`; `zoom` returns `0`. The target is invisible then; the reader is not drawn (`NaN`) or is flat. No guard: it does not throw or freeze (CLAUDE.md "Invalid user values").
- **Value ranges**: `rotate` in (−180, 180], `skewx` in (−90, 90), `scaley` any sign, `zoom` ≥ 0. A continuously turning target wraps from 180 to −180 (unchanged behaviour; visually the same angle).
- **Negative `zoom` attribute**: `zoom="-1"` turns the element by 180° (both axes negative), like `scale="-1"` today. `toLocal(…, 'zoom')` reports `1` (sizes have no sign) and `rotate` reports the turn.
- **Float32 matrices**: values carry Float32 noise (`29.999999` instead of `30`). Harmless for drawing, visible in text readouts. Separate topic: `pxl.Matrix.create()` could return a `Float64Array` (no slower, same code).
- **Reactivity**: unchanged. The new properties are read through the same `toLocal` call, so they update with the target and with the reader's space (`2026-10-26_tolocal_fix_plan.md`).
- **Stroke**: a cloned outline is scaled and skewed like the target, so its stroke is too (a thicker line along a stretched axis). Same as the target; no change planned.

## 7. Alternatives Considered

| Alternative | Why not |
|---|---|
| Keep as is, document the limits | The clone use case (§2) cannot be built at all; mirrors silently come back as a 180° turn. |
| Add `skewx` but keep `scaley` as the y axis length | Inconsistent: with skew present, rotate + scalex + scaley + skewx would not rebuild the target. |
| Decompose with `skewy` instead of `skewx` | Also exact, but then `rotate` is no longer the direction of the target's x axis and `scalex` no longer its length. |
| Offer `skewy` as well | Not unique; any split between skewy and rotate / scale is arbitrary (§3.3). |
| Keep the target's own split when the path in between is uniform (return its `skewx` / `skewy`, otherwise the canonical form) | Matches attribute-by-attribute mapping in the common case, but all values jump when an ancestor becomes slightly uneven (e.g. an animated `scalex` passing `1.01`). |
| `toLocal(…, 'scale')` = `scalex` (today) | Biased towards the x axis; a target stretched in y reports `1`. |
| No total zoom in toLocal at all | Uniform zoom is the most common case; `sqrt(abs(toLocal(…, 'scalex') * toLocal(…, 'scaley')))` is too long for it. |
| Keep `scale`, make it win when set (`scale: null`, `scale ?? scalex`, warning when mixed) | Removes the jump, but forbids zooming a stretched shape, and `toLocal(…, 'scale')` would still differ from `ref.el.scale` under the same name. |
| One `scale="x, y"` attribute (like the CSS `scale` property) | Splitting expressions at commas isn't safe; one attribute per value compiles and reads back separately. |
| Split the total into `zoom · scalex · scaley` so toLocal returns attribute values | Not unique: `zoom="2"` and `scalex="2" scaley="2"` give the same matrix. |
| A `matrix` property returning all six numbers | Attributes take one number each; Kilopixel has no matrix attribute to receive it. |
| Polar decomposition (rotation × symmetric stretch) | Doesn't match Kilopixel's attribute model (no "stretch along an angle" attribute). |

**Later idea, not part of this plan: `space="ref.el"`.** An element drawn in another element's space (its global matrix = the target's global matrix × its own local matrix). It copies a frame exactly without toLocal, needs no decomposition, and would also give any local point of the target (a corner: `space="ref.rect1" x="-50" y="-25"`). Open questions: which point of the target is the origin (drawing origin or pivot), only geometry (not alpha / filter / clip), draw order, cycles, hit testing. Worth its own plan when needed.

## 8. Tests (`tests/index.html`)

1. **Mirror**: target in a group with `scalex="-1"` → `rotate` 180, `scalex` 1, `scaley` −1, `skewx` 0.
2. **Skew**: target with `skewx="30"` → `skewx` 30, `scaley` 1 (within 0.01).
3. **Clone**: a reader using the §3.2 rule on a target with `rotate="40"` and `dx="30"` inside a group with `scalex="2"` and a rotating layer: the reader's global matrix equals the target's global matrix (all six entries within 0.01), sampled while the layer turns.
4. **Uniform**: target in a layer with `rotate="30"` and `zoom="1.5"`: `rotate` 30, and `zoom`, `scalex`, `scaley` all 1.5, `skewx` 0.
5. **Total zoom**: target with `zoom="2"` in a layer with `zoom="1.5"`, read from an untransformed layer → `zoom` 3; the same with `skewx="30"` on the target → still 3; target in a group with `scalex="2" scaley="0.5"` → `zoom` 1.
6. **Zoom multiplies**: `zoom="2" scalex="1.5"` gives a local matrix with scale 3 / 2; an element with `zoom` animating through `1` next to `scalex="3"` has a continuous x scale.
7. **Warnings**: `toLocal(ref.a, 'skewy')`, `toLocal(ref.a, 'scale')` and a typo each warn once at compile time; valid names don't warn.
8. Existing `toLocal` tests and `examples/test34.html`, `test37.html`, `test43.html`, `test48.html` (labels read upright with `zoom="-1"`), `test53.html`, `benchmark.html`, `docs/walkthrough.html` §8 unchanged; console clean.

## 9. Docs

- `.agents/KILOPIXEL.md`:
  - Transform attributes: `zoom` instead of `scale` in every attribute table and default list; "Scale Resolution & Symmetry Guarantee" replaced by the multiplier rule.
  - Coordinate Mapping: property table (`scaley` signed, new `skewx`, `zoom` instead of `scale`), the totals-vs-parts note and the usage rule (§3.1), the clone rule (§3.2), the warning (§3.3), and the property list in the AI guide's "Scope Available in Expressions" (line ~1644).
- Public docs pages and examples: `scale` → `zoom` (list in §5.1); where a page explains transforms, one sentence that `zoom` multiplies `scalex` and `scaley`.
- **Docs sidebar** (`docs/js/layout.js`, section "Transformations"): the entry "Rotate, Scale & Skew" (`transform.html`) becomes two entries, so `zoom` and its multiplier rule get their own page (decided 2026-10-30):

  | Today | New |
  |---|---|
  | Center & Offset (`position.html`) | Center & Offset (`position.html`) |
  | Rotate, Scale & Skew (`transform.html`) | **Zoom & Scale** (`scale.html`) |
  | | **Rotate & Skew** (`transform.html`) |
  | Coordinate Mapping (`mapping.html`) | Coordinate Mapping (`mapping.html`) |

  Neither page exists yet; the sidebar links already point to planned pages. One label "Rotate, Zoom, Scale & Skew" was measured and wraps to two lines (50 px instead of 31 px at the sidebar width of 264 px); both new labels fit on one line.
- `design/2026-10-25_refs_across_spaces_note.md`: §0 table row for this plan; §2 property list; `ref.c.r * toLocal(ref.c, 'scale')` → `'zoom'`.
- `.agents/TODO.md`: the same example (line ~228); entry for this plan, closed when done.
- Public docs for toLocal: nothing yet (no `mapping.html` page exists). The clone rule and the zoom usage rule belong on that page when it is written.

## 10. Decisions

1. **toLocal properties**: `x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scalex`, `scaley` (signed), `skewx` (new), `zoom` (new, √|det|). `scale` is removed. (Decided 2026-10-30.)
2. **`skewy`**: not offered; unknown literal names warn at compile time. (Decided 2026-10-30.)
3. **`zoom` attribute**: replaces `scale`, multiplies `scalex` / `scaley`. Mixing is allowed; the docs recommend not mixing in a pipeline that is read with `toLocal(…, 'zoom')`. (Decided 2026-10-30.)
4. **`space` attribute**: not now (§7).

## 11. Steps

1. Approve this plan.
2. **`zoom`** (own commit): rename in the engine (§5), `node build.js`, update the `pxl.min.js` size (CLAUDE.md rule); rename on all pages; fix `test48`; the docs sidebar (§9); tests 6 and 8; KILOPIXEL.md transform sections. Commit `feat(engine)!: zoom replaces scale and multiplies scalex / scaley`.
3. **toLocal** (own commit): implement §3.4 and the warning (§3.3), build, size; tests 1–5 and 7; KILOPIXEL.md Coordinate Mapping, the refs note, TODO.md. Commit `feat(engine): toLocal skewx, signed scaley, zoom; warn on unknown names`.
4. Review each diff before its commit; all tests pass, console clean.
