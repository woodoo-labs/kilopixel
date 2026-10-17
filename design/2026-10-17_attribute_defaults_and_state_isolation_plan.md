# Attribute Defaults & Canvas State Isolation

- **Status**: 🟡 **Proposed** (no code changes yet)
- **Date**: 2026-10-17
- **Related**: `design/2026-08-02_style_inheritance_plan.md` (context state), `.agents/TODO.md` §15 (smooth polyline)
- **Target Implementation**: `js/engine.js` (`pxl.compileAttribute`), `js/elements/node.js`, `js/elements/shape.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/variable.js`, `js/elements/stage.js`, `js/elements/shapes/*.js`
- **Measurement Tools** (local only, scratch is git-ignored): `scratch/save_restore_audit.js`, `scratch/save_restore_bench.html`

---

## 1. Problem

Kilopixel promises that scenes work "100% via standard HTML attributes and native DOM manipulation". Two common HTML operations break that promise today:

1. **Bare attributes** (`<pxl-polyline closed>`) arrive as an empty string `''`.
2. **Removed attributes** (`removeAttribute('scale')`) arrive as `null`.

`pxl.parseAttributeValue` returns both values unchanged (`compiler.js`, first line), so they end up in `attributeValues` as `''` / `null` instead of a meaningful value.

### 1.1 Bare Attributes Are Inconsistent

| Attribute | Bare (`''`) result | Check in the code |
|---|---|---|
| polyline `smooth` | **on** (tension 1) | `smooth !== false && smooth !== null` |
| polyline `closed` | off | truthy |
| circle / ellipse `pie`, `closed`, `anticlockwise` | off | `=== true` |
| `hidden` (shape, group, layer) | off | truthy |
| grid `labels` | off | truthy |
| stage `alwaysrender` | off | `=== 'true'` |

- `hidden` is a **global HTML attribute**: `<pxl-circle hidden>` looks like it should hide the shape, but the shape is drawn.
- `closed="1"` closes a polyline (truthy check) but not a circle (`=== true` check).
- Bare non-boolean attributes are `''`, which only *happens* to behave like `0` in arithmetic. `<pxl-circle x y r="50">` is drawn at the origin, but `ref.circle.x` is `''`, so `ref.circle.x + 10 + 5` is `'105'` (string concatenation), and `ref.circle.tx` is `'0'`.

### 1.2 Removed Attributes Don't Restore Defaults

| Removed | Value | Result |
|---|---|---|
| `scale` | `null` | `ctx.scale(null, null)` → scale 0 → shape **vanishes** |
| `alpha` | `null` | `globalAlpha *= null` → 0 → shape **vanishes** |
| `strokewidth` | `null` | `null > 0` is false → stroke **vanishes** |
| `miterlimit` | `null` | canvas ignores invalid values → value from the previous shape **leaks in** |
| `align`, `baseline` (text) | `null` | same leak: the canvas keeps the previous text shape's setting |
| `font` (text) | `null` | font string becomes `"… 16px null"`: an unknown family, so the browser's fallback font is used |
| `ratio` (stage) | `null` | `aspectRatio = null`, `height = 1000 / null = Infinity` |
| `linedash`, `arrowend`, `x`, `r`, … | `null` | happens to work (`null` acts like the default) |
| `onclick` and other `on*` | `null` | **TypeError**: `null.replace(...)` in `Shape.attributeChangedCallback`; the old handler stays active |

**Who removes attributes:** React, Vue, Lit and Alpine call `removeAttribute` when a bound value becomes `null` / `undefined` (`scale={selected ? 1.2 : undefined}`). Developers delete attributes in DevTools to experiment. In HTML, removing an attribute means "back to the default", so users expect that. The failures are silent (no error, the shape just disappears), which makes them hard to debug.

### 1.3 Why One Shape Can Affect Another

All shapes in a layer share one canvas context. Context settings persist until overwritten. Kilopixel relies on two rules:
1. **Stroke and text state is always set before drawing** (`applyStrokeState()`, `Text.draw()`).
2. **Transforms and compositing are wrapped in `save()` / `restore()`** only when a shape has them (`hasStateChanges` in `Shape.render()`).

Rule 1 only works with **valid** values. Setting `ctx.miterLimit = null` (→ `0`) or `ctx.textAlign = null` is ignored by the canvas, so the previous shape's value stays. The result then depends on DOM order.

---

## 2. Rule A: Empty or Removed Means Default (Required)

### 2.1 The Rule

| Incoming value | Boolean attribute | Any other attribute |
|---|---|---|
| `''` (bare) | `true` (HTML presence rule) | default |
| `null` (removed) | default (`false`) | default |
| any other string | parsed as today | parsed as today |

Boolean attributes (single source of truth):

```javascript
// js/engine.js
pxl.BOOLEAN_ATTRIBUTES = new Set(['hidden', 'closed', 'smooth', 'pie', 'anticlockwise', 'labels']);
```

`smooth` accepts a number (tension) as well; bare `smooth` → `true` → tension 1, as today.

### 2.2 Defaults as One Static Object per Class

Today each constructor writes its defaults into `attributeExpressions` and `attributeValues` (`Object.assign`), so the default of a single attribute can't be looked up later. Move them to a **static, inherited defaults object**:

```javascript
class Shape extends PxlNode {
  static defaults = { x: 0, y: 0, dx: 0, dy: 0, fill: null, stroke: null, strokewidth: 1, /* … */ };
}

class Circle extends Shape {
  static defaults = { ...Shape.defaults, r: 0, ir: 0, start: 0, end: null, sweep: null,
                      pie: false, closed: false, anticlockwise: false,
                      arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
}
```

The `PxlNode` constructor copies `this.constructor.defaults` into both objects once, replacing the per-class `Object.assign` calls. One shared object per class (no per-instance allocation), and each default is declared in exactly one place.

### 2.3 Resolution in `pxl.compileAttribute`

The empty value must be resolved **before** `parseAttributeValue`, because parsing a non-string would go wrong (`Number(true)` → `1`):

```javascript
pxl.compileAttribute = function(element, name, newValue) {
  const parsed = (newValue === null || newValue === '')
    ? this.resolveEmptyAttribute(element, name, newValue)
    : this.parseAttributeValue(newValue);
  // … unchanged: static values take the "Static Primitive" branch,
  //   which also removes the key from animatedAttributeKeys / reactiveAttributeKeys
};

pxl.resolveEmptyAttribute = function(element, name, newValue) {
  if (newValue === '' && this.BOOLEAN_ATTRIBUTES.has(name)) return true;
  const value = element.constructor.defaults?.[name];
  return value === undefined ? null : value;
};
```

- Runs only when an attribute changes, never per frame.
- `trackInteractiveRefs(newValue, …)` already ignores non-strings.
- Polyline `points` keeps its own path: `''` / `null` already parse to zero points (nothing drawn), which is the correct default.

### 2.4 Strict Boolean Checks

With bare attributes resolved to `true`, all boolean checks can use the same strict form as circle and ellipse:

- Polyline: `closed === true` (today truthy). `smooth` stays "`false`/`null` = off, `true` = 1, number = tension".
- `hidden`, grid `labels`: keep the truthy check (values are now always booleans; no behaviour change for `true` / `false`).

### 2.5 Elements Outside the Shared Path

- **`on*` handlers** (`Shape.attributeChangedCallback`): on `null`, clear the compiled handler (`this._compiledOnClick = null`, …) instead of compiling. An element without handlers is then unregistered lazily by the existing rule (auto-registration plan §3.5). Bare `onclick` (`''`) compiles to an empty function, as today.
- **Stage** (not a `PxlNode`): `alwaysrender` → `newValue === 'true' || newValue === ''`; `ratio` → `''` / `null` resolve to `16 / 9` (update `style.aspectRatio` and `attributeValues.height`).
- **Variable**: `value` resolves to `0`. A `<pxl-var>` meant to hold a string must say so explicitly (`value="''"`).

---

## 3. Option B: Always `save()` / `restore()` per Shape (Undecided)

### 3.1 Idea

Wrap every shape in `ctx.save()` / `ctx.restore()`, not only shapes with transforms or compositing. Each shape then starts from a clean canvas state, whatever earlier shapes did.

### 3.2 How Many Shapes Already Save Today

Static analysis of every shape tag, mirroring `hasStateChanges` (`scratch/save_restore_audit.js`; any expression counts as a state change):

| Scope | Shapes | Already save/restore | Without |
|---|---|---|---|
| `examples/` | 1,589 | 1,092 (69%) | 497 |
| `docs/` | 856 | 578 (68%) | 278 |
| Animated layers (redraw every frame) | 1,294 | 871 (67%) | 423 |
| Static layers (drawn once) | 1,071 | 733 (68%) | 338 |

- **Most common trigger:** `x` / `y` (1,234 / 1,226 shapes). For 1,090 shapes, `x` / `y` are the **only** trigger.
- **Shapes that skip it:** lines (289 of 333), grids (76 of 80), polylines (107 of 284), and circles / rects placed at `0, 0` inside a positioned `<pxl-group>` (290).
- **Other triggers:** `rotate` 393, `scale` 170, `dx` 162, `blend` 89, `alpha` 80, `dy` 30, `filter` 29, `shadowcolor` 15, `scaley` 7, `mask` 3.

### 3.3 Cost of One Pair

Raw canvas benchmark, no Kilopixel engine (`scratch/save_restore_bench.html`): 2,000 filled and stroked circles per frame, median of several rounds, timing includes rasterization (`getImageData` flush). The browser pane may have been in the background, so treat the numbers as indicative.

| Variant | µs per shape |
|---|---|
| Plain draw (absolute coordinates) | ~0.6–0.7 |
| `save()` + `restore()` added, no transform | +0.58 |
| `translate` + undo `translate` | ~1.3 total |
| `save` + `translate` + `restore` | ~2.0 total |

**Impact:** the 423 shapes in animated example layers that skip saving today would add about 0.25 ms per frame **in total**. A page with 100 such shapes adds about 0.06 ms of a 16.7 ms frame budget. A real Kilopixel shape does much more work per frame than the raw benchmark (expression evaluation, transform pipeline, style), so the relative share is smaller in practice.

### 3.4 What It Would and Wouldn't Fix

| | Rule A (defaults) | Option B (always save) |
|---|---|---|
| Leaks between shapes (`miterlimit`, text state) | ✅ values are always valid | ✅ clean state per shape |
| Vanishing shapes (`scale`, `alpha`, `strokewidth` = `null`) | ✅ | ❌ `null` still becomes `0` |
| Bare `hidden`, `closed`, … | ✅ | ❌ |
| `on*` removal TypeError | ✅ | ❌ |
| Robustness against future state leaks | ➖ relies on "always set before use" | ✅ automatic |

**Rule A is required either way. Option B is a robustness / simplicity decision, not a correctness fix.**

### 3.5 What Option B Would Simplify

- `Shape.render()`: the 15-term `hasStateChanges` check disappears; `applyContextState` already skips neutral values.
- `drawArrows`: the manual `fillStyle` save/reset and the "not restored" `miterLimit` comment (`shape.js`).
- `Grid.draw`: the manual `lineWidth` reset for major lines.
- New features that touch context state (e.g. `paintorder`, TODO §14) can't leak into the next shape.

What it does **not** change: rule 1 (set stroke / text state before drawing) is still needed, because state set *inside* a shape's own draw (fill, then stroke, then arrowheads) must still be correct. Layers and groups keep their own conditional save.

### 3.6 Opposite Direction (for Completeness)

For shapes whose only state is `x` / `y` (1,090 shapes), `translate` + undo `translate` measured ~0.6 µs cheaper per shape than `save` + `translate` + `restore`. That would be the speed-oriented alternative. Floating-point drift from undoing translations is negligible but not zero.

### 3.7 Recommendation

1. Implement **Rule A** (§2).
2. Then measure Option B in the **real engine**: `examples/benchmark.html` and a few animated docs pages, `renderAvg` / `renderMax` with the conditional vs. the unconditional save. Decide on Option B only if the difference is within noise; favour code simplicity in that case.

---

## 4. Decisions & Simplifications

| Topic | Decision | Reason |
|---|---|---|
| Bare boolean attribute | ✅ `true` | Native HTML rule (`<input disabled>`, `hidden`) |
| Bare / removed non-boolean attribute | ✅ class default | Matches HTML "removed = default"; no `''` / `null` in `attributeValues` |
| Defaults storage | ✅ static inherited `defaults` per class | Lookup by name; one declaration per default; no per-instance allocation |
| `closed="1"`, `pie="yes"` | ❌ not `true` | Strict booleans everywhere (`=== true`); bare or `"true"` only |
| Treat `''` as `true` globally | ❌ rejected | Breaks string attributes (`text=""`, `fill=""`) |
| Option B (always save) | ⏸️ measure first (§3.7) | Correctness comes from Rule A; B is a simplicity trade-off |
| `smooth="0"` (tension 0 still uses the Bézier path) | ⏸️ separate | Visually straight; could become "off" later, out of scope here |

---

## 5. Performance & GC

- Rule A: one comparison per attribute change (`null` / `''`), one `Set.has` and one property lookup only for empty values. Nothing per frame.
- Static `defaults` replace per-constructor object literals: fewer allocations when many shapes are created.
- Option B (if adopted): +~0.6 µs per shape per frame for shapes that don't save today (§3.3), zero allocations.

---

## 6. Implementation Steps

1. `js/elements/node.js` — copy `this.constructor.defaults` into `attributeExpressions` / `attributeValues` in the constructor.
2. `js/elements/shape.js`, `layer.js`, `group.js`, `variable.js`, `shapes/*.js` — replace constructor `Object.assign(…)` defaults with `static defaults = { ...Parent.defaults, … }`.
3. `js/engine.js` — `pxl.BOOLEAN_ATTRIBUTES`, `pxl.resolveEmptyAttribute()`, call it in `pxl.compileAttribute` before parsing.
4. `js/elements/shape.js` — `on*` removal clears the compiled handler (§2.5).
5. `js/elements/shapes/polyline.js` — `closed === true`.
6. `js/elements/stage.js` — bare `alwaysrender`, empty / removed `ratio` (§2.5).
7. `node build.js`.
8. `.agents/KILOPIXEL.md` — document Rule A (attribute basics, Common Pitfalls), the boolean list, and the stage / variable cases.
9. Docs: keep explicit `="true"` in examples for readability; mention the bare form once (e.g. in the Polyline / Circle element reference).
10. Option B: separate measurement and decision (§3.7).

---

## 7. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | `<pxl-polyline closed>` | closed path |
| 2 | `<pxl-circle hidden>`, then `removeAttribute('hidden')` | hidden, then visible |
| 3 | `<pxl-polyline smooth>` | smooth, tension 1 (unchanged) |
| 4 | `<pxl-circle id="c" x y r="50">` | drawn at origin; `ref.c.x === 0` (number) |
| 5 | `removeAttribute('scale')` / `('alpha')` on a visible shape | shape stays visible at scale 1 / alpha 1 |
| 6 | `removeAttribute('strokewidth')` | stroke stays, width 1 |
| 7 | Polyline A `miterlimit="1"`, polyline B with `miterlimit` removed, swap DOM order | B always uses 10 |
| 8 | Two texts, remove `align` from the second | second uses `start`, independent of the first |
| 9 | Animated attribute (`rotate="t * 90"`), then `removeAttribute('rotate')` | animation stops, rotate 0, no stale entry in `animatedAttributeKeys` |
| 10 | Reactive attribute (`r="ref.size.value"`), then removed | default radius, no further updates from `ref.size` |
| 11 | `removeAttribute('onclick')` | no error; clicks do nothing; hand cursor gone after lazy unregister |
| 12 | Stage: bare `alwaysrender`; `removeAttribute('ratio')` | always renders; ratio 16 / 9, finite `ref.stage.height` |
| 13 | `closed="1"` on polyline | open (strict booleans) |
| 14 | `<pxl-var value>` | `ref.v.value === 0` |

**Regression:** all `docs/*.html` and `examples/*.html` load without console errors and look unchanged (they only use explicit values).
