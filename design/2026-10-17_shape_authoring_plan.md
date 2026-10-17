# Shape Authoring: Derived Attributes, Class Fields & Custom Animation

- **Status**: 🟡 **Proposed** (no code changes yet)
- **Date**: 2026-10-17
- **Related**: `design/2026-10-17_bundle_scope_plan.md` (`pxl.Shape`), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, introduced `static defaults`), `design/2026-10-17_always_save_restore_plan.md` (state isolation for foreign code), `.agents/TODO.md` §20
- **Target Implementation**: `js/elements/node.js`, `js/elements/shape.js`, `js/elements/shapes/*.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/interaction.js`
- **Prototype** (local only, scratch is git-ignored): `scratch/custom_shape/star.js`, `scratch/custom_shape/test.html`

---

## 1. Goal

Writing a shape, built-in or user-made, should be as short as possible:

```javascript
// star.js — loaded after pxl.min.js
class Star extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };

  draw(ctx, u) {
    const { points, r, ir } = this.attributeValues;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = (i % 2 ? ir : r) * u;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
}
customElements.define('pxl-star', Star);
```

One list of attributes (`defaults`), no `observedAttributes`, no constructor, no Kilopixel-specific registration. User shapes extend `pxl.Shape` (the bundle exposes no other global names, see `design/2026-10-17_bundle_scope_plan.md`); built-in shapes inside the bundle keep writing `Shape`. Everything else is inherited: expressions, animation, `ref.*`, Rule A, transforms, styling, gradients, hit testing and events.

**Prototype result (2026-10-17):** the same `Star` (with today's extra `observedAttributes` line) already works with the current engine, loaded as a separate file: drawing, gradient fill, `rotate="t * 30"`, reactive `points="ref.pts.value"`, Rule A defaults for its own attributes, hit testing and `onclick`. No engine change was needed; this plan only removes the boilerplate.

---

## 2. Today's Boilerplate

| What a shape writes today | Why it is redundant |
|---|---|
| `static get observedAttributes()` listing its attributes | The same names are already the keys of `static defaults` |
| A constructor that only calls `super()` and sets fields | Class fields (`_radii = [0, 0, 0, 0];`) do the same without `super()` |
| `draw(ctx, u, t)` | No shape uses `t`; animation is evaluated before `draw()` |

Comparing `observedAttributes` with `Object.keys(defaults)` for every class in the current bundle:

| Class | Observed, not in `defaults` | In `defaults`, not observed |
|---|---|---|
| Layer, Group, Variable | — | — |
| Circle, Ellipse, Rect, Line, Text, Grid | `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove` | `isHovered`, `isPressed` |
| Polyline | the same 6 handlers + `points` | `isHovered`, `isPressed` |

---

## 3. Design

### 3.1 Derived `observedAttributes`

The browser reads `observedAttributes` **once**, in `customElements.define()`. In a static getter, `this` is the class being defined, so one getter serves every subclass:

```javascript
// node.js
class PxlNode extends HTMLElement {
  static defaults = {};
  static get observedAttributes() { return Object.keys(this.defaults); }
}

// shape.js
const EVENT_ATTRIBUTES = ['onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove'];

class Shape extends PxlNode {
  static get observedAttributes() { return [...super.observedAttributes, ...EVENT_ATTRIBUTES]; }
}
```

The three differences from §2 are resolved like this:

1. **Event handlers** have no default value. `Shape` appends them (above). They stay out of `defaults`, so they don't appear in `attributeValues`.
2. **`isHovered` / `isPressed`** are runtime state written by the InteractionEngine, not attributes. They move out of `Shape.defaults` into the `Shape` constructor:
   ```javascript
   constructor() {
     super();
     // Runtime state written by the InteractionEngine (not attributes, so not in defaults)
     this.attributeValues.isHovered = false;
     this.attributeValues.isPressed = false;
   }
   ```
   `attributeExpressions.isHovered` / `.isPressed` disappear; nothing reads them.
3. **Polyline `points`** gets a default, `points: ''`. Polyline's own `attributeChangedCallback` keeps intercepting it (coordinates are compiled into `p0…pN`) and additionally stores the raw string, so `ref.poly.points` returns what was set instead of a stale default:
   ```javascript
   this.attributeValues.points = newValue ?? '';
   ```

**Rule after this change:** every observed attribute of a `PxlNode` has a default, except the `on*` handlers. `Stage` is not a `PxlNode` and keeps its own list (`ratio`, `alwaysrender`).

**Lowercase keys.** HTML lowercases attribute names, so a default key like `impellerSpeed` would never match `<pxl-pump impellerSpeed="…">` (the browser delivers `impellerspeed`). All built-in keys are already lowercase (`strokewidth`, `linecap`). The `PxlNode` getter warns once per class, at `define()` time:

```javascript
static get observedAttributes() {
  const keys = Object.keys(this.defaults);
  for (const k of keys) {
    if (k !== k.toLowerCase()) console.warn(`[pxl] ${this.name}: attribute "${k}" must be lowercase (HTML lowercases attribute names).`);
  }
  return keys;
}
```

### 3.2 Class Fields Instead of Constructors

Per-instance fields move from constructors into class fields. They run right after `super()` returns, once per instance, exactly like the constructor version (each instance still gets its own arrays and records, so zero-allocation drawing is unchanged).

| Class | Today | After |
|---|---|---|
| Circle, Ellipse, Line | constructor: `_arrowStart`, `_arrowEnd` | 2 field lines, no constructor |
| Rect | constructor: `_radii` | 1 field line, no constructor |
| Polyline | constructor: `pointCount`, `rawParts`, `flatCache`, `pointKeys`, arrow records, `_segment`, `_split` | field lines, no constructor |
| Text | constructor: ~15 cache fields | field lines, no constructor |
| Shape | constructor: `boundingBox`, `_gradCache`, `_compiledOn*` | fields; constructor keeps only the two runtime states (§3.1) |
| Group | constructor: `childList`, `isOrderDirty` | 2 field lines, no constructor |
| Layer | constructor: lists, flags, `<canvas>` creation and styling | **keeps its constructor**: DOM setup reads more clearly there |
| Variable, Grid | none | none |

**Rule:** fields are initialized **after** the parent constructors. `PxlNode` / `Shape` constructors must not use subclass fields (they don't today). `attributeChangedCallback` and `connectedCallback` only run after construction, so fields are always ready there.

### 3.3 `draw(ctx, u)` Without `t`

No `draw()` uses `t` (the only `t` in a shape file is Polyline's Bézier parameter in `splitSegment(t)`). Time-dependent attributes are evaluated in `evaluateAnimations(t)` before `draw()`, which only reads `attributeValues`.

Keeping `t` in the signature invites a bug: **hit testing calls `draw()` with `t = 0`** (`interaction.js`), so a shape using `t` inside `draw()` would be clickable where it was at time 0, not where it is on screen. Removing the parameter documents the rule:

> `draw()` only reads `attributeValues`. Time belongs in attribute expressions.

Changes: the 7 shape signatures, `Shape.render()` (`this.draw(ctx, u)`), `InteractionEngine.process()` (`el.draw(ctx, this.stage.unit)`). `Text.hitTest(ctx, u)` already has no `t`.

---

## 4. Custom Animation (Note, Not Part of This Change)

A shape may want its own motion, e.g. a pump with a rotating impeller switched by `running="true"`.

**Why `t` inside `draw()` doesn't work** (even today, while `draw()` still receives it):
1. A layer only redraws every frame if one of its attributes is time-dependent. The engine never looks inside `draw()`, so the pump is drawn once and freezes, unless another animated shape in the same layer happens to keep the layer redrawing.
2. Hit testing uses `t = 0` (§3.3).
3. Other shapes can't follow the motion via `ref.*`.

**Pattern A — time in the HTML (works today, recommended for users):** the shape reads an angle attribute; the page animates it like any built-in attribute.

```html
<pxl-pump x="500" y="300" spin="t * 180"></pxl-pump>
<pxl-pump x="700" y="300" spin="ref.pumpOn.value ? t * 90 : 0"></pxl-pump>
```

**Pattern B — internal animated value (works today, uses internal API):** the shape compiles a hidden expression, the same mechanism Polyline uses for `p0…pN`. `this` inside the expression is the element.

```javascript
constructor() {
  super();
  // Internal animated value (not an HTML attribute), evaluated every frame like rotate="t * 180"
  pxl.compileAttribute(this, 'impeller', 'this.attributeValues.running ? t * this.attributeValues.speed : 0');
  this.isAnimated = true;
}
```

Verified 2026-10-17 (frames driven by hand): `running` unset → `impeller` 0, 0; `running="true"` at t = 1 / 1.5 / 2 s → 180 / 270 / 360; `speed="90"` → 90 / 180; `removeAttribute('running')` → 0. Hit testing and `ref.pump.impeller` see the real angle.

**Open points (later, separate plan):**
- Pattern B relies on internal calls (`pxl.compileAttribute`, `isAnimated`). For a public template, add a small helper, e.g. `this.animate('impeller', '…')`.
- While stopped, the expression still contains `t`, so the layer keeps redrawing every frame. A helper could switch between an animated and a static value.
- Pattern B needs a constructor (it uses `this`), which conflicts with §3.2's "no constructor" template. A helper callable from a static description (e.g. `static animations = { impeller: '…' }`) would avoid that.

---

## 5. Decisions & Simplifications

| Topic | Decision | Reason |
|---|---|---|
| Derive `observedAttributes` from `defaults` | ✅ | One list per shape; a key missing from one of two lists can't happen any more |
| Event handlers in `defaults` | ❌ appended by `Shape` | They have no value; would add six `null` keys to every `attributeValues` |
| `isHovered` / `isPressed` | ✅ out of `defaults`, set in the `Shape` constructor | Runtime state, not attributes |
| Polyline `points` | ✅ default `''`, raw string kept in `attributeValues` | Keeps the rule "every attribute has a default" without an exception |
| Lowercase check | ✅ one `console.warn` per class at `define()` | Silent mismatch is the most likely user mistake; costs nothing per frame |
| Class fields | ✅ everywhere except Layer | No `super()` boilerplate; Layer's DOM setup stays readable in a constructor |
| `draw(ctx, u)` | ✅ remove `t` | Documents "draw only reads values"; avoids hit-testing bugs |
| `pxl.Shape` | ✅ via the bundle scope plan | The bundle will expose only `pxl`; global class names break user scripts (`design/2026-10-17_bundle_scope_plan.md`) |
| `pxl.defineShape()`, `this.animate()` | ⏸️ later | Not needed for the template |
| Hiding `u` from shape authors | ⏸️ later | Possible (scale the context while building the path), but a separate API decision |

---

## 6. Performance & GC

- `observedAttributes` runs once per class at `define()` (one `Object.keys`, one array spread, the lowercase loop). Never per frame.
- Class fields allocate exactly what the constructors allocate today, once per instance.
- Removing `t` from `draw()` changes nothing at runtime.
- Key order of `attributeValues` changes slightly (`isHovered` / `isPressed` after the defaults, Polyline gains `points`), but every instance of a class still gets the same hidden class.

---

## 7. Implementation Steps

1. `js/elements/node.js` — `static get observedAttributes()` from `defaults`, with the lowercase warning.
2. `js/elements/shape.js` — getter appends the event attributes; `isHovered` / `isPressed` out of `defaults` into the constructor; other constructor fields become class fields; `render()` calls `this.draw(ctx, u)`.
3. `js/elements/shapes/*.js`, `group.js`, `layer.js` — remove `observedAttributes` getters; constructors → class fields (not Layer); `draw(ctx, u)`.
4. `js/elements/shapes/polyline.js` — `points: ''` default; store the raw string in the `points` intercept.
5. `js/interaction.js` — `el.draw(ctx, this.stage.unit)`.
6. `node build.js`.
7. `.agents/KILOPIXEL.md` — element reference (observed attributes = default keys), PxlNode section, shape authoring rules (lowercase keys, `draw(ctx, u)` only reads values, class fields), custom animation patterns A / B.
8. Later: a docs page "Custom Shapes" with the Star template (needs the always-save decision first, see related plan).

---

## 8. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | For every built-in class: new `observedAttributes` vs. the old hard-coded lists | identical sets (Polyline: same set, `points` now via `defaults`) |
| 2 | `Star` from §1 (no `observedAttributes`, no constructor) | draws, animates, reacts to `ref.*`, Rule A defaults, hit testing and `onclick` work |
| 3 | Shape with a default key `impellerSpeed` | one console warning at `define()`; no warning for built-ins |
| 4 | `ref.poly.points` after `setAttribute('points', …)` | returns the set string |
| 5 | Two Rects, two Polylines | separate `_radii` / `flatCache` per instance (no shared arrays) |
| 6 | Hover / click on every shape type (incl. text) | unchanged hit testing |
| 7 | Pump with pattern B | animates, toggles with `running`, hit testing follows the impeller |
| 8 | Rule A unit tests (`scratch/rule_a/unit.html`) | 20 / 20 still pass |

**Regression:** `scratch/rule_a/regress.html` (old vs. new bundle on all docs / examples pages): expected differences only in key order (`isHovered` / `isPressed`) and the new Polyline `points` key; no new console errors.
