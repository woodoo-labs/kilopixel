# Polyline Optimization: Points Parser, Point Storage & Edge Cases

- **Status**: ⚪ **Backlog** (2026-10-19: measured gains are small, §2.3; the `ref.<id>.pN` fix is implemented, §2.3.4; priorities below)
- **Date**: 2026-10-18
- **Related**: `design/performance-analysis.md` (Issue #6, point key lookup), `design/2026-10-17_shape_authoring_plan.md` (Polyline `points: ''`, class fields, `draw(ctx, u)`), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A), `design/2026-10-14_unified_arrowhead_geometry_plan.md` (arrow trimming), `design/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md` (TODO §13), `.agents/TODO.md` §15 (spline quality)
- **Target Implementation**: `js/graphics.js` (parser), `js/elements/shapes/polyline.js`, `.agents/KILOPIXEL.md`
- **Test Scripts** (local): `scratch/points_parser_cases.js` (today's parser), `scratch/points_parser_sketch.js` (§3.3 sketch)

---

## 1. Goal

`<pxl-polyline>` should cost **nothing per frame for coordinates that don't change**, and only a plain numeric loop for coordinates that do. Malformed or temporarily invalid points must never break the render loop and must never fail silently in a confusing way.

Three phases, each usable on its own:

| Phase | What | Files | Per-frame effect |
|---|---|---|---|
| 1 | Points parser: warnings for malformed input | `graphics.js` | none (runs when `points` changes) |
| 2 | Point storage: numeric arrays, geometry cache, edge cases | `polyline.js` | large (see §4) |
| 3 | Further optimizations, **only if measurements after phase 2 ask for them** | `polyline.js`, `compiler.js` | depends |

### Priorities (2026-10-19)

All existing docs and examples work. Nothing here blocks the polyline docs page.

| Task | Real bug? | Effort | Priority |
|---|---|---|---|
| `setAttribute('points', …)` updates `ref.<id>.pN` readers | ✅ | 1 line + key handling | ✅ **done** (2026-10-19) |
| Arrowhead points right when the first or last two points are identical (§5 #7) | ✅ visual, rare input | ~10 lines | ✅ **done** (2026-10-24, smooth spline plan §5.3) |
| All X (or all Y) non-finite + gradient → exception in `createGradient` (§5 #5) | ✅ very rare | ~3 lines guard | low: fix when touched |
| Phase 1: warnings for typos in `points` (§3) | no, developer experience | ~30 lines | low |
| Phase 2: point storage (§4) | no | large, touches reactivity | deferred: ≈ 8 µs per frame for 500 points |
| Phase 3 (§6) | no | large | deferred |

---

## 2. Today

### 2.1 Data Flow

```
points="0,0; 100,wave(2)*50"
  → pxl.parsePointsIntoArray()           splits into "0", "0", "100", "wave(2)*50"
  → pxl.compileAttribute(this, 'p0', …)  one hidden attribute per coordinate
      attributeExpressions.p0 / attributeValues.p0
      animatedAttributeKeys / reactiveAttributeKeys get 'p3'
  → every frame:
      evaluateAnimations(t)   p3 = fn.call(this, t), string-keyed write, isSpatialKey('p3')
      draw()                  flatCache[i] = attributeValues[pointKeys[i]] * u   (all coordinates)
                              relative mode: prefix sum over flatCache
      getBoundingBox()        reads all coordinates again (per gradient slot)
```

### 2.2 Per-Frame Cost

Per redraw of the layer (an animated layer redraws every frame, so a **static** polyline in it pays this too), for `n` coordinate values (`n = 2 × points`):

| Step | Static points | Animated points |
|---|---|---|
| `evaluateAnimations` | — | `n` calls, `n` string-keyed writes, up to 10 string compares each (`isSpatialKey`) |
| `draw`: refill `flatCache` | `n` string-keyed reads | same |
| relative mode prefix sum | `n` adds | same |
| `getBoundingBox` (only with a gradient) | `n` string-keyed reads per gradient slot (fill + stroke = 2×) | same |
| hit testing (interactive polyline, pointer over stage) | `draw()` again: `n` reads | same |
| path building (`lineTo` / `bezierCurveTo`) | unavoidable | unavoidable |

There are **no allocations per frame** today. The cost is the string-keyed property access, repeated even when nothing changed.

### 2.3 Hidden Costs Outside the Hot Loop

1. **Dictionary mode — not relevant in practice (corrected 2026-10-19).** `delete` does switch an object to dictionary (hash table) mode, but V8 already does that for any `attributeValues` with **10 or more points** (too many added properties; checked with `%HasFastProperties`). `scratch/polyline_lookup_bench.js` shows no measurable difference between the two modes.
2. **More hidden classes.** Polylines with different point counts get different `attributeValues` shapes. With several shape types on a page the shared property reads in `Shape` code are likely megamorphic anyway, so the effect is uncertain.
3. **`ref.poly.pN` is readable.** Kept on purpose since 2026-10-19 and noted in `.agents/KILOPIXEL.md` (internal, not in the public docs, which recommend `<pxl-var>`). Any storage change must keep it.
4. ~~A points change sends no `ref.<id>` broadcast.~~ **Fixed 2026-10-19**: `polyline.js` broadcasts after a points change, and `clearPoints(count)` only deletes keys beyond the new count, so readers never see `undefined` for a coordinate that still exists.

**Measured cost of the per-frame lookups** (`scratch/polyline_lookup_bench.js`, JavaScript only, Node / V8): 100 points ≈ 1.3 µs, 500 points ≈ 8 µs, 2000 points ≈ 44 µs per frame, i.e. 0.01–0.3 % of the 16.7 ms frame budget. Phase 2 brings this to ≈ 0.1 / 0.7 / 2.7 µs. **Phase 2 is a micro-optimization** for typical point counts.
5. **Reallocation on every points change.** `new Float32Array(n)` and new `p${i}` key strings, even if the count is unchanged. Matters when JavaScript sets `points` often (slider, live data).

### 2.4 Parser Behavior (from `scratch/points_parser_cases.js`)

| Input | Result |
|---|---|
| `min(50, t * 10)`, `ref.*`, ternaries, newlines, trailing `;` | ✅ correct |
| `0,0; 100; 200,0` (missing y) | ⚠️ point dropped silently |
| `0,0,5` (three values) | ⚠️ silently becomes `(0, 5)` |
| `0,0; 100,50,; 200,0` (trailing comma) | ⚠️ point dropped silently |
| unbalanced `(` / `)` | ⚠️ all following points dropped silently |

The real problem is **typos that fail without a message**. All `points` values in docs and examples parse correctly today (only `()`, `ref.*`, function calls and ternaries are used).

Not a real use case (no change planned): commas or `;` inside strings, `[ ]` lists or `{ }` code blocks within a coordinate. These split wrongly today and will keep doing so. Parentheses already protect commas, so a list still works when wrapped: `([100, 200, 300][i])`.

---

## 3. Phase 1 — Points Parser

### 3.1 Rules

1. **Parentheses only**, as today: `,` and `;` inside `( )` don't split. No tracking of `[ ]`, `{ }` or strings (§2.4: no real use case).
2. **Empty or `null`** (bare / removed attribute) → no points, no warning. No more accidental `"null;"`.
3. **Unbalanced parentheses** → **no points at all** + one `console.warn` with the full string. After a missing or extra `)` the split positions are unreliable, so half a shape would be misleading.
4. **Point error** (one value, three values, an empty value like `100,` or `,50`) → **that point is skipped** + one `console.warn`. The error is local; the other points are reliable.
5. **Whitespace-only segments** (trailing `;`, blank lines) are ignored without a warning.
6. The parser returns whether the input was clean; the **polyline** writes the warning (it knows the element). Warning format follows `shape.js`: `[pxl] Warning: …`.

### 3.2 Coordinates Are Expressions

A coordinate is a single **expression**: numbers, math, function calls, `ref.*`, ternaries (`t < 1 ? 0 : 50`). Statement code (`if (t < 1) return 0; return 50`) can't work, because `;` separates points. Anything containing a comma outside a function call needs parentheses. The polyline docs page states this.

### 3.3 Sketch

```javascript
// Returns false if the input was malformed (the caller warns). Runs only when `points` changes.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  if (!str) return true;

  const len = str.length;
  let depth = 0, start = 0, x = null, extra = false, clean = true;

  for (let i = 0; i <= len; i++) {
    const ch = i < len ? str[i] : ';'; // virtual terminator, no string concatenation
    if (ch === '(') depth++;
    else if (ch === ')') { if (--depth < 0) break; }
    else if (depth === 0 && ch === ',') {
      if (x === null) x = str.substring(start, i).trim();
      else extra = true;
      start = i + 1;
    } else if (depth === 0 && ch === ';') {
      const y = str.substring(start, i).trim();
      if (x !== null && x !== '' && y !== '' && !extra) targetArray.push(x, y);
      else if (x !== null || y !== '') clean = false; // malformed point: skipped
      x = null; extra = false; start = i + 1;
    }
  }

  if (depth !== 0) { // unbalanced parentheses: reject everything
    targetArray.length = 0;
    return false;
  }
  return clean;
};
```

Verified with `scratch/points_parser_sketch.js`: all docs / examples patterns parse as today; missing y, three values, trailing comma and empty x warn and skip that point; unbalanced `(` / `)` warn and reject all points; empty and `null` give no points without a warning.

### 3.4 Cost

Same O(length) scan as today, only when `points` changes. test05 / benchmark (`500 × ~110` characters) stay well under a millisecond. No effect on the frame loop.

---

## 4. Phase 2 — Point Storage

### 4.1 Idea

Coordinates leave `attributeValues`. The polyline keeps them in its own **numeric arrays**, evaluates only animated coordinates per frame, and rebuilds its geometry only when something changed.

| Field | Type | Content |
|---|---|---|
| `_exprs` | `Array` | per coordinate: a number, or a compiled function |
| `_values` | `Float64Array(n)` | evaluated logical values, as written (relative or absolute) |
| `_abs` | `Float64Array(n)` | logical absolute coordinates (relative mode resolved) |
| `flatCache` | `Float64Array(n)` | `_abs × u`, read by the path code |
| `_animIdx` | `Array` of int | coordinate indices with time-dependent functions |
| `_reactIdx` | `Array` of int | coordinate indices with `ref.*` functions (no `t`) |
| `_valuesDirty` | boolean | a value changed since the last geometry pass |
| `_cacheMode`, `_cacheU` | | `mode` and `u` of the current geometry |
| `_isFinite` | boolean | all `_abs` values are finite |
| `boundingBox` | (existing) | now computed in the geometry pass, logical units |

`Float64Array` instead of today's `Float32Array`: no float32 rounding in the relative-mode prefix sum, same type as `_segment` / `_split`. Memory is irrelevant (`3 × 8 × n` bytes).

### 4.2 Two-Pass Geometry Cache

```
pass A (logical, when _valuesDirty or mode changed):
    _abs = _values (+ prefix sum in relative mode)
    min / max for the bounding box
    finite check
pass B (scale, when pass A ran or u changed):
    flatCache = _abs × u
```

- **Static polyline:** both passes run once. Afterwards a redraw only builds the path. Hit testing (`draw()` on the dummy context) and `getBoundingBox()` hit the cache.
- **Animated polyline:** `evaluateAnimations` writes `_values` for `_animIdx` only and sets `_valuesDirty`; both passes run once per frame (`2n` multiply/add, no property lookups).
- `getBoundingBox()` only needs pass A (no `u`), so it can be called before `draw()`.
- `mode` and `u` are **compared** instead of flagged, because `mode` can itself be animated or reactive (`mode="ref.m.value"`) without going through `attributeChangedCallback`.
- Finite check without a branch per value: `probe += value * 0` is `0` for finite values and `NaN` for `NaN` / `±Infinity`. `_isFinite = probe === 0` after the loop.

### 4.3 Engine Dependencies (What Must Be Replicated)

Taking coordinates out of `compileAttribute` means the polyline must do itself what the engine did for it. This is the critical part of the plan:

| Engine behavior | Where | Polyline must… |
|---|---|---|
| Parse + classify (number / time function / reactive function) | `pxl.compileAttribute` → `pxl.parseAttributeValue` | call `pxl.parseAttributeValue(part)` and sort into `_animIdx` / `_reactIdx` |
| Register `isHovered` / `isPressed` readers (`sticky` for time-dependent) | `pxl.trackInteractiveRefs` in `compileAttribute` | call `pxl.trackInteractiveRefs(part, isTimeDependent)` per coordinate |
| Subscribe reactive functions to `ref.*` | `compileAttribute` | `pxl.subscribeToVariable(dep, this)` per dependency |
| Evaluate reactive functions only when connected | `compileAttribute`, `PxlNode.connectedCallback` | same in `setPoints()` and `connectedCallback()` |
| Restore subscriptions after a DOM move | `pxl.restoreVariableSubscriptions` (only scans `reactiveAttributeKeys`) | re-subscribe point dependencies in `connectedCallback()` |
| Drop subscriptions on disconnect | `pxl.clearAllVariableSubscriptions` (all keys) | nothing: already covers point subscriptions |
| Self-cleaning unsubscribe (bit 1 of the bitmask) | `PxlNode.variableChangedCallback` | override it: combine the attribute result **and** the point result, or the polyline gets unsubscribed from a variable its points still need |
| **`isAnimated = animatedAttributeKeys.length > 0`** | `PxlNode.attributeChangedCallback` | **re-apply `|| _animIdx.length > 0` after every `super` call**, or changing e.g. `stroke` on an animated polyline stops its animation |
| Layer heartbeat | `evaluateAnimations` → `if (this.isAnimated) parentLayer.invalidate()` | nothing, as long as `isAnimated` is right |
| `ref.<id>` broadcast on attribute change | `PxlNode.attributeChangedCallback` | keep the broadcast after a `points` change (added 2026-10-19) |
| `ref.<id>.pN` readers (§2.3.3) | `attributeValues.pN` | keep `pN` readable (e.g. mirror `_values` into `attributeValues.pN`), or decide to drop it |

Point value changes (animated or reactive) would need to keep broadcasting `ref.<id>` while `ref.<id>.pN` is supported (today `evaluateAnimations` / `variableChangedCallback` do it, only when someone subscribes).

### 4.4 Sketch

```javascript
pxl.Polyline = class Polyline extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: '', closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'points') {
      if (oldValue === newValue) return;
      this.attributeValues.points = newValue ?? '';  // ref.poly.points returns what was set
      this.setPoints(newValue);
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
      return;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
    // PxlNode resets isAnimated from animatedAttributeKeys only
    if (this._animIdx.length > 0) this.isAnimated = true;
  }

  evaluateAnimations(t) {
    const changed = super.evaluateAnimations(t);
    const idx = this._animIdx, count = idx.length;
    // Hidden polylines skip their points; evaluateAnimations runs again before the next draw
    if (count === 0 || this.attributeValues.hidden) return changed;
    const exprs = this._exprs, values = this._values;
    for (let k = 0; k < count; k++) {
      const i = idx[k];
      values[i] = exprs[i].call(this, t);
    }
    this._valuesDirty = true;
    return changed;
  }

  variableChangedCallback(varName) {
    const result = pxl.evaluateAttributesForVariable(this, varName);
    const points = this.evaluatePointsForVariable(varName); // same bitmask: 1 = needed, 2 = changed
    if (((result | points) & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0 && this._refKey) pxl.broadcast(this._refKey);
    if (((result | points) & 2) !== 0) this.parentLayer?.invalidate();
  }

  draw(ctx, u) {
    this.updateGeometry(u);
    if (this.pointCount < 4 || !this._isFinite) return;
    // … unchanged path code, reading this.flatCache
  }
};
```

`setPoints(str)`: parse (phase 1), warn if not clean, resize the buffers **only if the count changed** (otherwise reuse them), fill `_exprs` / `_values` / `_animIdx` / `_reactIdx`, subscribe, set `isAnimated`, `_valuesDirty = true`. Old subscriptions are not removed eagerly: the next broadcast of an unused variable unsubscribes the polyline (self-cleaning bitmask, now correct thanks to the override).

Values that aren't numbers become numbers on write: strings → `NaN` (caught by the finite check), `true` / `false` → `1` / `0` (same as today's `* u`).

### 4.5 Per-Frame Cost After Phase 2

| Step | Static points | Animated points |
|---|---|---|
| `evaluateAnimations` (points) | — | `k` calls into a `Float64Array` (`k` = animated coordinates) |
| geometry pass A + B | — (cache hit) | `2n` numeric ops |
| `getBoundingBox` | cache hit | cache hit (computed in pass A) |
| hit testing | cache hit, path only | cache hit, path only |
| path building | unchanged | unchanged |

Plus: `attributeValues` keeps one stable hidden class and never drops to dictionary mode. Still zero allocations per frame.

---

## 5. Edge Cases

Behavior spec for phase 1 + 2. "Today" is verified in code or with the test script.

| # | Case | Today | Planned |
|---|---|---|---|
| 1 | Fewer than 2 points (0 or 1) | nothing drawn, box 0 | same |
| 2 | `points` removed or bare | works by accident (`"null;"` has no comma) | explicit: no points, `ref.poly.points === ''` |
| 3 | Malformed string (§2.4) | silent loss or wrong points | §3.1: rejected or point skipped, one warning |
| 4 | Non-finite coordinate: failed compile, non-numeric string, `ref.x.value` before `x` connects (`undefined`), division by zero | canvas silently drops that vertex; smooth: neighbouring segments vanish | **polyline not drawn and not hittable** until all coordinates are finite; no warning per frame. The `ref` case is transient (fixed when the element connects) |
| 5 | All X (or all Y) non-finite **and** a gradient fill/stroke | bounding box `±Infinity` → gradient arguments `NaN` → `createLinearGradient` etc. **throw** (WebIDL `double`). The exception leaves `stage.render()`: later shapes in the layer, later layers, hit testing and perf telemetry stop updating | can't happen: `draw()` returns before `applyStyle` |
| 6 | Expression that throws at runtime (`ref.a.value.b` with `value` undefined) | exception in `evaluateAnimations` | unchanged — engine-wide issue for all attributes, out of scope |
| 7 | Two identical consecutive end points + arrowhead | straight: `aimArrow` gets a zero vector → falls back to direction `(1, 0)`, head points right; smooth: chord 0 → `len / chord = Infinity` → whole first segment trimmed, same wrong direction | straight: walk inward to the first distinct point for the direction; if all points are identical, no arrowheads. Smooth: direction from the first distinct point, no trim on a zero-length end segment. Verify visually |
| 8 | Duplicate points inside a **smooth** polyline | Catmull-Rom makes a cusp / small loop | ✅ 2026-10-24: a duplicate point makes a corner (smooth spline plan §4.1); document it as a feature |
| 9 | `closed` polyline that repeats its first point at the end | straight: harmless; smooth: kink at the seam | ✅ 2026-10-24: seam rule, smoothed across the repeated point (smooth spline plan §4.2) |
| 10 | 2 points + `smooth` | drawn straight | same |
| 11 | `smooth="0"` | Bézier path with control points on the end points (= straight, but via the smooth code and its trim) | treat as straight (`traceStraight`): same picture, exact straight arrow trim, cheaper |
| 12 | Negative `smooth` | loops (control points flipped) | unchanged, user's choice; document |
| 13 | `mode` animated or reactive | works (refilled every frame) | works (compared in pass A) |
| 14 | `mode="relative"` + `closed` | closes to the first (absolute) point | same; document |
| 15 | Arrowheads on `closed` | ignored | same |
| 16 | Arrow inset longer than the first/last segment (> 2 points) | inset clamped to that segment; head may overlap the next segment | same (documented in arrows plan) |
| 17 | All points identical / flat polyline + linear gradient at 90° | zero-size gradient paints nothing | unchanged, TODO §13 |
| 18 | `points` changed every frame by JavaScript | reparse + recompile + reallocate + `delete` (dictionary mode) | reparse + recompile; buffers reused if the count is unchanged; no `delete` |
| 19 | Many distinct expression strings over time (streamed `points` with embedded numbers) | `pxl.staticCache` / `pxl.animationCache` grow without limit | unchanged — engine-wide compiler cache issue, out of scope; plain numbers never reach the cache |
| 20 | `points` set before the element connects; polyline moved to another layer | works via `compileAttribute` / `restoreVariableSubscriptions` | works via `setPoints` / `connectedCallback` override (§4.3) |
| 21 | Animated points + `hidden` | all coordinates evaluated every frame | point evaluation skipped while hidden |
| 22 | Same `points` string on two polylines (benchmark `nebula` + `glow`) | compiled functions shared via the compiler cache, separate values | same |
| 23 | Resize / DPR change | refilled every frame anyway | pass B reruns (`u` compared) |
| 24 | Polyline inside rotated / scaled groups | transforms on the context | unchanged |
| 25 | Changing another attribute (e.g. `stroke`) on an animated polyline | animation continues (points are in `animatedAttributeKeys`) | must continue: `isAnimated` re-applied after `super` (§4.3) — regression test |

---

## 6. Phase 3 — Only If Measured

Each item needs a measurement after phase 2 showing that it matters (benchmark `polyline-500` / `polyline-2000`, Chrome DevTools profile). Not part of the first implementation.

### 6.1 Batch-Compiled Points

Today every animated coordinate is its own compiled function: 1000 functions for benchmark `polyline-500` (two polylines). `exprs[i].call(this, t)` is a megamorphic call site that can't inline anything. Alternative: compile all animated coordinates of one polyline into **one** function:

```javascript
function(_t, out) { t = _t; out[1] = (…); out[3] = (…); … }
```

- **Needs** a compiler split: `pxl.analyzeExpression(str)` (sanitize, optional chaining, `toLocal` rewrite, time / `ref` detection) separate from building the function. Touches `compiler.js`.
- **V8 limit**: very large functions are not optimized (bytecode size limit), so a 2000-coordinate body could end up *slower*. Chunk into functions of ~64–256 coordinates; measure the chunk size.
- **Error isolation**: one bad coordinate breaks the whole chunk → fall back to per-coordinate compilation (today's path, with its warnings).
- Coordinates containing `return` stay individual.
- Cache key: the generated code string (identical points strings still share).

### 6.2 Smooth Loop

The Catmull-Rom loop computes `%` and clamps per segment and branches on `closed` inside the loop. Split into open / closed loops and handle the first and last segments outside the loop, so the inner loop uses plain `i - 1` … `i + 2`. Small gain; measure first.

### 6.3 Partial Updates

Absolute mode with a few animated coordinates among many static ones: update only `flatCache[i]` for `_animIdx`; compute the bounding box lazily (only when a gradient asks). Relative mode always needs the full prefix sum.

### 6.4 `Path2D` Cache for Static Polylines

Build the path once per (`u`, points, `smooth`, `closed`, arrows) and reuse it. **Cross-cutting**: `applyStyle()` uses the current path (`ctx.fill()` / `ctx.stroke()`), and hit testing intercepts exactly those argument-less calls on the dummy context (`interaction.js`). A `Path2D` needs `fill(path)` / `isPointInPath(path, …)` in both places, and it applies to every shape. Belongs to the engine-wide `// TODO Cache Paths?` in `shape.js`, not to this plan.

---

## 7. Test Plan

| # | Test | Expected |
|---|---|---|
| 1 | `scratch/points_parser_cases.js`: all cases of §2.4 + §3.1 | new results as specified, warnings only where specified |
| 2 | Every `points` value in `docs/` and `examples/` (harvested by script), old vs. new parser | identical output |
| 3 | Visual regression: all docs / examples pages with polylines (`caps`, `dashes`, `linear`, `arrows`, test03, test05, test25, test40, test50, benchmark), old vs. new bundle | identical (tiny antialiasing differences allowed from float32 → float64) |
| 4 | Reactive points via `<pxl-var>` (test40 pattern), variable changed by slider | polyline follows; unused variables get unsubscribed |
| 5 | Polyline moved to another layer (`appendChild`) | reactive points still update |
| 6 | Animated polyline, then `setAttribute('stroke', …)` | animation continues (§5 #25) |
| 7 | `hidden` toggled on an animated polyline | no evaluation while hidden, correct position when shown |
| 8 | `mode` switched by a `<pxl-var>` | geometry updates |
| 9 | Coordinate `ref.missing.value`, then the element is added | not drawn, then drawn; no exception |
| 10 | All coordinates `NaN` + gradient stroke | no exception, other layers keep rendering |
| 11 | Duplicate end points + arrowheads (straight and smooth) | head points along the line |
| 12 | `onclick` / hover on a polyline (straight, smooth, with arrows) | unchanged hit area |
| 13 | `ref.poly.points` after `setAttribute('points', …)`; `Object.keys(ref.poly)` | returns the string; no `p0…pN` keys |
| 14 | `docs/caps.html` slider dragged many times | no dictionary mode (DevTools heap snapshot: `attributeValues` has fast properties) |
| 15 | Performance: benchmark `polyline-500` / `polyline-2000` (`renderAvg`), plus a static 500-point polyline in an animated layer | before / after numbers recorded in this file |

---

## 8. Decisions

| Topic | Decision | Reason |
|---|---|---|
| Coordinates out of `attributeValues` | ⏸️ | removes string lookups, but measured gain is small (§2.3) and `ref.poly.pN` must stay readable |
| Keep `p0…pN`, only cache `flatCache` with a dirty flag | ❌ | keeps `delete` / dictionary mode and string-keyed writes in `evaluateAnimations` |
| Replicate engine behavior in Polyline (§4.3) instead of generalizing `compileAttribute` | ✅ for now | Polyline is the only multi-value attribute. If a second one appears (`<pxl-path>`, plot), extract a shared "value channel" helper then |
| Parser stays parentheses-only (no `[ ]`, `{ }`, strings) | ✅ | no real use case in coordinates; parentheses already protect commas |
| Unbalanced parentheses → reject all points; point error → skip the point | ✅ | split positions after a missing / extra `)` are unreliable |
| Non-finite coordinate → polyline not drawn | ✅ | predictable, one multiply-add per value, prevents the gradient exception |
| `Float64Array` for `flatCache` | ✅ | exact relative-mode sums, one array type |
| Statement code in coordinates | ❌ | `;` separates points; document ternaries |
| Batch compilation, smooth loop, partial updates | ⏸️ phase 3 | only with measurements |
| `Path2D` caching | ⏸️ separate engine-wide plan | cross-cuts `applyStyle` and hit testing |

---

## 9. Implementation Steps

1. **Phase 1**: `js/graphics.js` — new `parsePointsIntoArray` (returns clean / not clean). `polyline.js` — warn once per change. Test cases 1–2. `node build.js`.
2. **Phase 2**: `js/elements/shapes/polyline.js` — fields (§4.1), `setPoints`, `attributeChangedCallback` (points, `isAnimated` re-apply), `evaluateAnimations`, `variableChangedCallback`, `evaluatePointsForVariable`, `connectedCallback`, `updateGeometry` (passes A / B), `getBoundingBox` from the cache, finite guard, `smooth="0"` as straight, degenerate end segments for arrows. Remove `clearPoints` and `pointKeys`. `node build.js`.
3. Tests 3–15. Record performance numbers in §7.
4. `.agents/KILOPIXEL.md` — Polyline section (points syntax rules, no `p0…pN`, geometry cache, edge cases), parser line (parentheses-aware, warns on malformed points), Shape defaults list. `design/performance-analysis.md` — mark Issue #6 resolved.
5. Later: the polyline docs page documents the points syntax (expressions, ternaries, `;` and `,`), `closed` without repeating the first point, and duplicate points with `smooth`.
6. Coordinate with the shape-authoring plan: `points: ''` is already in `defaults` here; constructor fields become class fields when that plan lands.
