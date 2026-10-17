# Attribute Defaults & Canvas State Isolation

- **Status**: 🟢 **Rule A implemented 2026-10-17** (20/20 unit tests in `scratch/rule_a/unit.html`; regression: 76 docs / examples pages, 3,682 elements, identical static values old vs. new bundle, no new console errors). Option B stays undecided.
- **Date**: 2026-10-17 (reviewed 2026-10-17: hot loop / GC, edge cases)
- **Related**: `design/2026-10-15_interactive_state_auto_registration_plan.md` (lazy unregister), `.agents/TODO.md` §18
- **Target Implementation**: `js/engine.js` (`pxl.compileAttribute`), `js/elements/node.js`, `js/elements/shape.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/variable.js`, `js/elements/stage.js`, `js/elements/shapes/*.js`
- **Measurement Tools** (local only, scratch is git-ignored): `scratch/save_restore_audit.js`, `scratch/save_restore_bench.html`

---

## 1. Problem

Kilopixel promises that scenes work "100% via standard HTML attributes and native DOM manipulation". Two common HTML operations break that promise today:

1. **Bare attributes** (`<pxl-polyline closed>`, `el.hidden = true`, `el.toggleAttribute('pie')`) arrive as an empty string `''`.
2. **Removed attributes** (`removeAttribute('scale')`, `el.hidden = false`) arrive as `null`.

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

- `hidden` is a **global HTML attribute** with a reflected property: `el.hidden = true` writes `hidden=""`, so the native API doesn't hide Kilopixel shapes today.
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

### 1.4 Impact on Existing Pages

Audit of `docs/` and `examples/` (2026-10-17): no bare attributes, no empty values, no `removeAttribute` / `toggleAttribute` / `.hidden =`. Boolean attributes only use literal `"true"` / `"false"` (plus numeric `smooth` tensions). **Rule A changes nothing visible on existing pages.**

---

## 2. Rule A: Empty or Removed Means Default

### 2.1 The Rule

| Incoming value | Boolean attribute | `<pxl-var>` `value` | Any other attribute |
|---|---|---|---|
| `''` (bare) | `true` (HTML presence rule) | `''` (empty string) | default |
| `null` (removed) | default (`false`) | default (`0`) | default |
| any other string | parsed as today | parsed as today | parsed as today |

Boolean attributes (single source of truth):

```javascript
// js/engine.js
pxl.BOOLEAN_ATTRIBUTES = new Set(['hidden', 'closed', 'smooth', 'pie', 'anticlockwise', 'labels']);
```

- `smooth` accepts a number (tension) as well; bare `smooth` → `true` → tension 1, as today.
- **Why `<pxl-var value="">` stays `''`:** a variable is free-form state. A text input bound to it (`setAttribute('value', input.value)`) must show an empty string when the field is cleared, not `0`. For every other attribute, `''` is not a meaningful value (an empty `font`, `strokewidth` or `fill`), and `text` already defaults to `''`.

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

- The `PxlNode` constructor copies `this.constructor.defaults` into both objects once, replacing the per-class `Object.assign` calls. Subclass constructors keep only their non-default fields (caches, scratch buffers).
- One shared object per class, declared once. All values are primitives, and the object is only ever **read** (copied by the constructor, looked up by Rule A), so no `Object.freeze` is needed.
- Key order stays the same as today (base keys first, subclass keys after), so every instance of a class still gets the same hidden class.
- `Shape.defaults` keeps the runtime states `isHovered` / `isPressed` (they are not observed attributes, so Rule A never resolves them).

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

// Bare boolean = true; bare var value = ''; otherwise the class default.
pxl.resolveEmptyAttribute = function(element, name, newValue) {
  if (newValue === '') {
    if (this.BOOLEAN_ATTRIBUTES.has(name)) return true;
    if (name === 'value') return '';  // only <pxl-var> has a value attribute
  }
  const value = element.constructor.defaults[name];
  return value === undefined ? null : value;
};
```

What the existing code then does for free:
- **Animated / reactive → removed:** the static branch drops the key from `animatedAttributeKeys` / `reactiveAttributeKeys`; `PxlNode.attributeChangedCallback` recomputes `isAnimated`, marks the matrix dirty for spatial keys, broadcasts `ref.<id>` and invalidates the layer. Stale `ref.*` subscriptions clean themselves up on the next broadcast (existing lazy mechanism).
- **Before connect** (`createElement` + `setAttribute`): same path, values are static.
- **`trackInteractiveRefs(newValue, …)`** already ignores non-strings.
- **Polyline `points`** keeps its own path: `''` / `null` already parse to zero points (nothing drawn), which is the correct default. The synthetic `p0…pN` keys are never empty (the parser drops empty coordinates).
- **Defaults that are `null` on purpose** keep their meaning "not set": rect `r1`–`r4` (fall back to `r`), circle / ellipse `end` / `sweep` (full circle), text `direction` / `reveal`.

### 2.4 Strict Boolean Check for Polyline `closed`

Polyline `closed` becomes `closed === true`, like circle and ellipse. All pages use literal `"true"` / `"false"` (§1.4), so nothing changes visibly. `smooth` stays "`false` / `null` = off, `true` = tension 1, number = tension". `hidden` and grid `labels` keep their truthy checks (values are now always booleans, so the check form doesn't matter).

### 2.5 Event Handlers (`on*`)

`Shape.attributeChangedCallback` compiles handler strings directly (not via `compileAttribute`):

- **`null` or `''`** → set the compiled handler to `null`. No compile, no TypeError. (`onclick=""` would compile to an empty function and register the shape for nothing.)
- **No immediate unregister.** A handler may remove its own attribute while `InteractionEngine.process()` is iterating `_hoveredElements` (e.g. a one-shot button: `onclick="…; this.removeAttribute('onclick')"`). Instead, the existing lazy `releaseIfUnused()` unregisters the shape on its next leave / release, because `hasEventHandlers()` is now false. Until then it is hit-tested once per frame for nothing, which is harmless. The hand cursor disappears immediately, because `isClickable()` reads the handlers.
- `pxl.trackInteractiveRefs` is only called for non-empty strings.

### 2.6 Stage (Not a `PxlNode`)

- `alwaysrender`: `true` for `'true'` or `''`, in **both** places (`attributeChangedCallback` and the `connectedCallback` check `getAttribute('alwaysrender') !== 'true'`).
- `ratio`: `''` / `null` → `16 / 9` (update `style.aspectRatio` and `attributeValues.height`).

### 2.7 Out of Scope (Deliberately)

| Case | Today and after Rule A | Why not handled |
|---|---|---|
| Whitespace-only value (`strokewidth=" "`) | `Number(" ")` → `0` | Not produced by frameworks or `hidden` / `toggleAttribute`; a `trim()` would allocate on every compile |
| Invalid values (`miterlimit="abc"`, `linecap="foo"`) | stored as-is, canvas ignores them (may leak) | Validation per attribute type is a separate, larger feature |
| `closed="1"`, `pie="yes"` | not `true` (strict booleans) | Bare or `"true"` / `"false"` only, as everywhere else |
| `<pxl-stage hidden>` | stage stays visible (its inline `display: block` wins over the browser's `[hidden]` rule) | Stage has no `hidden` attribute; hide it with CSS |
| `smooth="0"` | Bézier path with tension 0 (visually straight) | Separate small cleanup |

---

## 3. Option B: Always `save()` / `restore()` per Shape (Undecided, Not Part of This Implementation)

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

After Rule A, measure Option B in the **real engine**: `examples/benchmark.html` and a few animated docs pages, `renderAvg` / `renderMax` with the conditional vs. the unconditional save. Adopt it only if the difference is within noise, for code simplicity.

---

## 4. Decisions & Simplifications

| Topic | Decision | Reason |
|---|---|---|
| Bare boolean attribute | ✅ `true` | Native HTML rule (`<input disabled>`, `el.hidden = true`, `toggleAttribute`) |
| Bare / removed non-boolean attribute | ✅ class default | Matches HTML "removed = default"; no `''` / `null` left in `attributeValues` |
| Bare `<pxl-var>` `value` | ✅ stays `''` | Free-form state; cleared text inputs must give `''`, not `0` |
| Defaults storage | ✅ static inherited `defaults` per class | Lookup by name; one declaration per default; no per-instance literal |
| `Object.freeze` on `defaults` | ❌ not needed | Primitives only, read-only by convention; keeps the code plain |
| Removing an `on*` handler | ✅ clear it, unregister lazily | No array mutation inside `process()`; reuses `releaseIfUnused()` |
| Treat `''` as `true` globally | ❌ rejected | Breaks string attributes (`text=""`, `fill=""`) |
| Whitespace-only / invalid values | ❌ out of scope (§2.7) | Not produced by HTML APIs or frameworks; validation is a separate feature |
| Option B (always save) | ⏸️ measure after Rule A (§3.7) | Correctness comes from Rule A; B is a simplicity trade-off |

---

## 5. Performance & GC (Hot Loop Review)

**Rule A adds nothing to the 60 fps loop.**
- `pxl.compileAttribute` and `Shape.attributeChangedCallback` run only when an attribute changes (parser, `setAttribute`, `removeAttribute`, `ref.x.set(…)`). The render loop only calls already-compiled functions (`evaluateAnimations`) and reads `attributeValues`.
- Even when user code calls `setAttribute` every frame (e.g. slider-driven), the extra cost is two comparisons (`=== null`, `=== ''`) before parsing; `resolveEmptyAttribute` runs only for empty values and allocates nothing (one `Set.has`, one property read).

**Small wins:**
- **Type stability:** numeric attributes can no longer turn into `''` / `null`, so hot reads like `x || y`, `strokewidth * u` and `scale !== 1` keep seeing numbers (no polymorphic values for the JIT).
- **Fewer allocations at creation:** the per-constructor defaults literals (`const defaults = { … }` in every shape constructor) disappear; each instance still gets its own `attributeExpressions` / `attributeValues` copy, as today.
- **Same hidden classes:** key order is unchanged (§2.2).
- **Event handler removal:** no work in `process()`; `releaseIfUnused()` already runs on leave / release.

**Option B** (if ever adopted): +~0.6 µs per shape per frame for shapes that don't save today (§3.3), zero allocations.

---

## 6. Implementation Steps

1. `js/elements/node.js` — constructor copies `this.constructor.defaults` (`PxlNode.defaults = {}`) into `attributeExpressions` / `attributeValues`.
2. `js/elements/shape.js`, `layer.js`, `group.js`, `variable.js`, `shapes/*.js` — replace constructor defaults with `static defaults = { ...Parent.defaults, … }`; keep non-default constructor fields.
3. `js/engine.js` — `pxl.BOOLEAN_ATTRIBUTES`, `pxl.resolveEmptyAttribute()`, call it in `pxl.compileAttribute` before parsing.
4. `js/elements/shape.js` — `on*`: `null` / `''` clear the compiled handler; compile and `trackInteractiveRefs` only for non-empty strings (§2.5).
5. `js/elements/shapes/polyline.js` — `closed === true` (all uses).
6. `js/elements/stage.js` — bare `alwaysrender` in both places; empty / removed `ratio` (§2.6).
7. `node build.js`.
8. `.agents/KILOPIXEL.md` — document Rule A (attribute basics and Common Pitfalls), the boolean list, the `<pxl-var>` exception, handler removal, and the stage cases; the existing pitfall "No Redundant Defensive Fallbacks" becomes true after removals too.
9. Docs: keep explicit `="true"` in examples for readability; mention the bare form once in the element references.

---

## 7. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | `<pxl-polyline closed>` | closed path |
| 2 | `<pxl-circle hidden>`, then `removeAttribute('hidden')` | hidden, then visible |
| 3 | `el.hidden = true` / `el.hidden = false` on a shape, a group and a layer | hides / shows (native property reflection) |
| 4 | `el.toggleAttribute('pie')` twice on a circle with `sweep` | pie wedge, then open arc |
| 5 | `<pxl-polyline smooth>` | smooth, tension 1 (unchanged) |
| 6 | `<pxl-circle id="c" x y r="50">` | drawn at origin; `ref.c.x === 0` (number) |
| 7 | `removeAttribute('scale')` / `('alpha')` on a visible shape | shape stays visible at scale 1 / alpha 1 |
| 8 | `removeAttribute('strokewidth')` | stroke stays, width 1 |
| 9 | Polyline A `miterlimit="1"`, polyline B with `miterlimit` removed, swap DOM order | B always uses 10 |
| 10 | Two texts, remove `align` from the second | second uses `start`, independent of the first |
| 11 | Animated attribute (`rotate="t * 90"`), then `removeAttribute('rotate')` | animation stops, rotate 0, key gone from `animatedAttributeKeys`, `isAnimated` false if it was the only one |
| 12 | Reactive attribute (`r="ref.size.value"`), then removed | default radius, no further updates from `ref.size` |
| 13 | Rect `r="20" r1="0"`, then `removeAttribute('r1')` | top-left corner falls back to `r` (20) |
| 14 | `removeAttribute('onclick')` from outside | no error; clicks do nothing; default cursor; unregistered after the next leave |
| 15 | One-shot button `onclick="ref.n.set('value', ref.n.value + 1); this.removeAttribute('onclick')"`, click twice | counts once; no error during `process()` |
| 16 | `onclick=""` | no handler, shape not registered |
| 17 | Stage: bare `alwaysrender`; `removeAttribute('ratio')` | always renders (also when set before connect); ratio 16 / 9, finite `ref.stage.height` |
| 18 | `closed="1"` on polyline | open (strict booleans) |
| 19 | `<pxl-var value>` / `removeAttribute('value')` | `''` / `0` |
| 20 | Shape created with `document.createElement`, `x` set to `''` before appending | drawn at origin, `ref.<id>.x === 0` |

**Regression:** all `docs/*.html` and `examples/*.html` load without console errors and look unchanged (§1.4).
