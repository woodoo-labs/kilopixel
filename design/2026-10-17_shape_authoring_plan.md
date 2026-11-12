# Shape Authoring: Derived Attributes, Class Fields & Custom Animation

- **Status**: 🟡 **Proposed** (2026-11-07, brought up to date with the engine, §0; no code changes yet)
- **Date**: 2026-10-17
- **Related**: `design/2026-10-17_bundle_scope_plan.md` (`pxl.Shape`, implemented), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, introduced `static defaults`), `design/2026-11-07_safe_shape_render_plan.md` (state isolation and error handling for foreign code, implemented), `design/2026-10-30_framework_compatibility_plan.md` (proposes renaming the `on*` handlers, §0), `design/2026-10-27_engine_cleanup_inventory_note.md` (code style, §0), `.agents/TODO.md` §20
- **Target Implementation**: `js/elements/node.js`, `js/elements/shape.js`, `js/elements/shapes/*.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/interaction.js`
- **Prototype**: `design/prototypes/2026-10-17_shape_authoring/star.js`, `design/prototypes/2026-10-17_shape_authoring/star_test.html` (updated 2026-11-12 for `_ctx` / `_dpr`; all checks pass with today's engine, both lines after the careless star stay at full alpha)

---

## 0. Changes Since 2026-10-17 (checked 2026-11-07)

Nothing in this plan was built. The engine changed around it:

| Change | Effect on this plan |
|---|---|
| Bundle scope plan implemented: every class lives on `pxl` (`pxl.Shape`, `pxl.Line = class Line extends pxl.Shape`) | The template in §1 works as written; code examples now use the namespace form (§3.1) |
| Always save / restore and draw errors implemented (`design/2026-11-07_safe_shape_render_plan.md`) | A careless or failing custom shape can't affect the rest of the layer any more. §7 step 8 (the "Custom Shapes" docs page) is no longer blocked by it. New rule for custom shapes: `drawArrows()` is the last call of `draw()` |
| Code style decided 2026-10-27 (`CLAUDE.md`, "Fields in the constructor"): every field an object will ever have is set in its constructor | **Conflicts with §3.2** (class fields instead of constructors). Open: decide which one applies before implementing §3.2 |
| `_` marks ownership (2026-10-28): `pointCount` → `_pointCount`, `flatCache` → `_flatCache`, and so on; compiled handlers moved into a `handlers` object; `Shape.HANDLER_EVENTS` maps each `on*` attribute to its event | Field names in §3.2 updated; §3.1 can take the handler names from `Shape.HANDLER_EVENTS` |
| `build.js` refuses top-level `const` / `let` / `class` / `function` | §3.1's former `const EVENT_ATTRIBUTES` replaced (§3.1) |
| Framework compatibility plan (`design/2026-10-30_framework_compatibility_plan.md`, TODO §30) proposes renaming the `on*` handlers (they collide with the browser's native `onclick` and framework rules) | The names `Shape` appends in §3.1 may change. Open: order of §20 and §30 |
| `CLAUDE.md`: "Kilopixel has no JavaScript API for users" | Public custom shapes would make `attributeValues`, `applyStyle()`, `boundingBox`, `drawArrows()` and `reportError()` a user API. Open: product decision, needed before the "Custom Shapes" docs page, not for §3.1 / §3.3 |

**Still true** (checked 2026-11-07): the attribute lists in §2 (comparison in the built engine), no `draw()` uses `t` as time (§3.3), `pxl.compileAttribute(element, name, value)` has the signature §4 uses. §4 pattern B itself was not run again.

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

One list of attributes (`defaults`), no `observedAttributes`, no constructor, no Kilopixel-specific registration. User shapes extend `pxl.Shape`, exactly like the built-in shapes (`pxl.Line = class Line extends pxl.Shape`; all classes live on the `pxl` namespace, see `design/2026-10-17_bundle_scope_plan.md`), so the built-ins are the template. Everything else is inherited: expressions, animation, `ref.*`, Rule A, transforms, styling, gradients, hit testing, events, and (since 2026-11-07) a clean canvas state per shape and caught errors.

**Prototype result (2026-10-17):** the same `Star` (with today's extra `observedAttributes` line) already works with the current engine, loaded as a separate file: drawing, gradient fill, `rotate="t * 30"`, reactive `points="ref.pts.value"`, Rule A defaults for its own attributes, hit testing and `onclick`. No engine change was needed; this plan only removes the boilerplate.

---

## 2. Today's Boilerplate

| What a shape writes today | Why it is redundant |
|---|---|
| `static get observedAttributes()` listing its attributes | The same names are already the keys of `static defaults` |
| A constructor that only calls `super()` and sets fields | Class fields (`_radii = [0, 0, 0, 0];`) do the same without `super()` |
| `draw(ctx, u, t)` | No shape uses `t`; animation is evaluated before `draw()` |

Comparing `observedAttributes` with `Object.keys(defaults)` for every class in the current bundle (checked again in the built engine on 2026-11-07, unchanged):

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
pxl.PxlNode = class PxlNode extends HTMLElement {
  static defaults = {};
  static get observedAttributes() { return Object.keys(this.defaults); }
};

// shape.js: the handler names come from the existing map (event attribute → key in this.handlers)
pxl.Shape = class Shape extends pxl.PxlNode {
  static get observedAttributes() { return [...super.observedAttributes, ...Object.keys(pxl.Shape.HANDLER_EVENTS)]; }
};
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

**Open (§0):** this section conflicts with the code style rule "Fields in the constructor" (decided 2026-10-27, after this plan). One of the two has to give way before §3.2 is implemented; §3.1 and §3.3 don't depend on it.

Per-instance fields move from constructors into class fields. They run right after `super()` returns, once per instance, exactly like the constructor version (each instance still gets its own arrays and records, so zero-allocation drawing is unchanged).

| Class | Today | After |
|---|---|---|
| Circle, Ellipse, Line | constructor: `_arrowStart`, `_arrowEnd` | 2 field lines, no constructor |
| Rect | constructor: `_radii` | 1 field line, no constructor |
| Polyline | constructor: `_pointCount`, `_rawParts`, `_flatCache`, `_pointKeys`, `_arrowStart`, `_arrowEnd`, `_segment`, `_split` | field lines, no constructor |
| Text | constructor: 20 cache fields (`_cachedFontString` … `_hasInk`, including `_lastMaxwidth` and `_lastFontGeneration` since 2026-11-06) | field lines, no constructor |
| Shape | constructor: `stage`, `boundingBox`, `_gradCache`, `_lastDash`, `_lastDashU`, `_scaledDash`, `handlers` | fields; constructor keeps only the two runtime states (§3.1) |
| Group | constructor: `childList`, `_isOrderDirty` | 2 field lines, no constructor |
| Layer | constructor: lists, flags, `<canvas>` creation and styling | **keeps its constructor**: DOM setup reads more clearly there |
| Variable, Grid | none | none |

**Rule:** fields are initialized **after** the parent constructors. `PxlNode` / `Shape` constructors must not use subclass fields (they don't today). `attributeChangedCallback` and `connectedCallback` only run after construction, so fields are always ready there.

### 3.3 `draw(ctx, u)` Without `t`

No `draw()` uses `t` (the only other `t` in a shape file is Polyline's Bézier parameter in `trimParameter()` and `splitSegment(t)`; checked again 2026-11-07). Time-dependent attributes are evaluated in `evaluateAnimations(t)` before `draw()`, which only reads `attributeValues`.

Keeping `t` in the signature invites a bug: **hit testing calls `draw()` with `t = 0`** (`interaction.js`), so a shape using `t` inside `draw()` would be clickable where it was at time 0, not where it is on screen. Removing the parameter documents the rule:

> `draw()` only reads `attributeValues`. Time belongs in attribute expressions.

Changes: the 7 shape signatures, `Shape.render()` (`this.draw(ctx, u)`, inside its `try` since 2026-11-07), `InteractionEngine.process()` (`el.draw(ctx, this.stage.unit)`, inside its `try`). `Text.hitTest(ctx, u)` already has no `t`.

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

Verified 2026-10-17 (frames driven by hand; not run again after the 2026-11-07 render changes, which don't touch this path; an error in such an expression is now reported under the shape instead of breaking the frame): `running` unset → `impeller` 0, 0; `running="true"` at t = 1 / 1.5 / 2 s → 180 / 270 / 360; `speed="90"` → 90 / 180; `removeAttribute('running')` → 0. Hit testing and `ref.pump.impeller` see the real angle.

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
| Class fields | ✅ everywhere except Layer (2026-10-17; conflicts with the code style rule of 2026-10-27, open, §0) | No `super()` boilerplate; Layer's DOM setup stays readable in a constructor |
| `draw(ctx, u)` | ✅ remove `t` | Documents "draw only reads values"; avoids hit-testing bugs |
| `pxl.Shape` | ✅ done (bundle scope plan, implemented) | All engine classes live on the `pxl` namespace; global class names break user scripts (`design/2026-10-17_bundle_scope_plan.md`) |
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
8. Later: a docs page "Custom Shapes" with the Star template. Always save / restore and error handling, which it needed, are built (2026-11-07). Still open before it: whether custom shapes become a public API (§0), and the `on*` handler names (TODO §30).

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
| 8 | Rule A unit tests (`design/prototypes/2026-10-17_shape_authoring/rule_a_unit.html`) | 20 / 20 still pass |

**Regression:** `design/prototypes/2026-10-17_shape_authoring/rule_a_regress.html` (old vs. new bundle on all docs / examples pages): expected differences only in key order (`isHovered` / `isPressed`) and the new Polyline `points` key; no new console errors.
