# Auto-Registration for `isHovered` / `isPressed`

- **Status**: 📝 **Draft — awaiting approval**
- **Date**: 2026-10-15
- **Related**: `design/2026-10-13_text_hit_testing_plan.md` (§6 side finding → decided: auto-registration)
- **Target Implementation**: `js/engine.js` (`pxl.compileAttribute`), `js/elements/shape.js` (event compile, `connectedCallback`), `js/interaction.js` (unchanged API)
- **Test File**: `examples/test52.html` (remove the `onclick` workaround after implementation)

---

## 1. Problem

`.agents/KILOPIXEL.md` (Interaction System → InteractionEngine Lifecycle) documents:

> Elements with event handlers (`onclick`, `onenter`, etc.) **or that use `isHovered`/`isPressed` in expressions** are registered with `stage.interaction.registerElement(el)`.

**Actual behaviour:** only `on*` handlers register an element (`shape.js`, event compile and `connectedCallback`). An element whose `isHovered` / `isPressed` is only read in expressions is never hit-tested, so the state never becomes `true`:

```html
<!-- Does nothing today: btn is never registered -->
<pxl-rect id="btn" fill="ref.btn.isHovered ? '#ffd400' : '#3296ff'" …></pxl-rect>
```

All examples and `test52.html` work around this with an `onclick` handler.

---

## 2. Why `on*` Registration Does Not Simply Carry Over

- An `on*` attribute sits **on the element itself**, so the element knows it is interactive and registers itself.
- `isHovered` / `isPressed` are read in expressions that can sit **on any element**, so the element to register is the **referenced** one, not the one holding the expression:
  ```html
  <pxl-rect id="btn" …></pxl-rect>
  <pxl-text fill="ref.btn.isHovered ? 'white' : 'grey'" …></pxl-text>  <!-- must register btn -->
  ```
- The referenced element may **not exist yet** when the expression is compiled (DOM order, elements added later).
- The compiler's `variableDependencies` only record the referenced id (`ref.btn`), not the property (`isHovered`).

---

## 3. Design

### 3.1 State List (single source of truth)

```javascript
// js/interaction.js
pxl.INTERACTIVE_STATES = ['isHovered', 'isPressed'];
pxl._interactiveStateRegex = new RegExp(
  `\\bref\\.([a-zA-Z_$][a-zA-Z0-9_$]*)\\??\\.(${pxl.INTERACTIVE_STATES.join('|')})\\b`, 'g'
);
pxl._interactiveIds = new Set(); // ids whose shapes must be hit-tested
pxl._pressableIds = new Set();    // ids whose isPressed is referenced (hand cursor, §3.6)
```

The regex is built from the state list, so adding a state later (e.g. `isDragging`) is a one-line change.

### 3.2 Detection (compile time only)

New helper, called with the **raw attribute string**:

```javascript
pxl.trackInteractiveRefs = function(source) {
  if (typeof source !== 'string' || source.indexOf('.is') === -1) return; // fast bail-out
  const re = pxl._interactiveStateRegex;
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    const id = match[1];
    pxl._interactiveIds.add(id);
    if (match[2] === 'isPressed') pxl._pressableIds.add(id);
    const node = pxl.nodes[id]?.$node;              // element already connected?
    if (node && node.draw && node.stage) node.stage.interaction.registerElement(node);
  }
};
```

Call sites:
1. **`pxl.compileAttribute`** — for every attribute expression (`fill`, `scale`, `text`, …), before parsing.
2. **`Shape.attributeChangedCallback`** — for `on*` handler strings too (e.g. `onclick="if (ref.other.isPressed) …"`), so the rule is complete.

Runs only when an attribute is set or changed — **never per frame**. Expression caching (`animationCache` / `staticCache`) is unaffected because the scan reads the raw string.

### 3.3 Late Arrival

`Shape.connectedCallback`, after the base class has registered the node in `pxl.nodes`:

```javascript
if (this.id && pxl._interactiveIds.has(this.id)) this.stage?.interaction.registerElement(this);
```

Covers elements connected after the expression was compiled, and elements that are removed and re-added (`disconnectedCallback` already unregisters).

### 3.4 Scope

- **Shapes only** (`node.draw` exists): they are the only hit-testable elements.
- **Stage:** `ref.<stageId>.isHovered` already works through the stage's own pointer handling; the stage has no `draw`, so it is ignored.
- **Layers / groups:** no hit area, ignored.
- `registerElement` is idempotent (`includes` check), so double registration via `on*` and expressions is harmless.

### 3.5 Lazy Unregister (reusing the subscription lists)

**Scenario:** an expression stops using the state, e.g. `btn.setAttribute('fill', 'red')` replaces `fill="ref.btn.isHovered ? …"`. Nobody needs `btn`'s states any more, but it is still registered.

**Existing mechanism to build on:** variable subscriptions already clean themselves up lazily (`node.js`, `variableChangedCallback`): when `ref.btn` broadcasts, each subscriber re-evaluates and unsubscribes if none of its expressions depends on `ref.btn` any more.

**New:** whenever the interaction engine broadcasts a state change of a registered element (`isHovered` / `isPressed` changes), it checks right **after** the broadcast:

```javascript
// el has just broadcast its state change (subscribers have re-evaluated / unsubscribed)
if (!el.hasEventHandlers() && !(pxl._subscriptions[el._refKey]?.length)) {
  this.unregisterElement(el);   // nobody needs this element's states any more
}
```

- `hasEventHandlers()` (new small `Shape` helper): any of `_compiledOnClick`, `_compiledOnEnter`, `_compiledOnLeave`, `_compiledOnDown`, `_compiledOnUp`, `_compiledOnMove` is set.
- Run the check only after the element has been removed from `_hoveredElements` in the leave step (no array mutation while iterating).
- **Lazy:** cleanup happens at the next state change (typically the next hover), which is exactly when the stale registration would matter. No reference counting, no extra bookkeeping.
- **Imprecise in the safe direction:** if another element still references `btn` for something else (e.g. `ref.btn.x`), `btn` stays registered. Over-registration is harmless (one extra hit test; no hand cursor thanks to §3.6).
- An element that references its **own** state (`fill="ref.btn.isHovered …"` on `btn`) is subscribed to itself, so it correctly stays registered.
- If an expression using the state is compiled again later, `trackInteractiveRefs` registers the element again.

### 3.6 Cursor Rule: Hand Cursor Only for Clickable Elements

**Today:** every registered element switches the stage cursor to `pointer` on hover (`interaction.js`, `this.stage.style.cursor = hitEl ? 'pointer' : 'default'`). With auto-registration, pure hover elements (colour change on hover, tooltip areas) would show a hand cursor, which suggests "clickable".

**New rule:** show `pointer` only if the hit element is **clickable**:
- it has `onclick`, `ondown` or `onup`, **or**
- its `isPressed` state is referenced somewhere (tracked in a second set `pxl._pressableIds`, filled by `trackInteractiveRefs` when the matched state is `isPressed`).

Pure hover elements (`isHovered`, `onenter`, `onleave`, `onmove` only) keep the default cursor. This also makes any stale registration (§3.5) invisible.

```javascript
// process(), replacing the cursor line
this.stage.style.cursor = (hitEl && hitEl.isClickable()) ? 'pointer' : 'default';
```

`isClickable()` (new small `Shape` helper): `!!(this._compiledOnClick || this._compiledOnDown || this._compiledOnUp) || (this.id && pxl._pressableIds.has(this.id))`.

---

## 4. Decisions & Simplifications

| Topic | Decision | Reason |
|---|---|---|
| Scan `on*` handlers too | ✅ yes | Cheap, makes the rule complete |
| Unregister when an expression stops using the state | ✅ lazily (§3.5) | Reuses the existing self-cleaning subscription lists: after a state broadcast, unregister if no `on*` handler and no subscribers remain. No reference counting. `disconnectedCallback` still unregisters removed elements. |
| Hand cursor | ✅ clickable elements only (§3.6) | A hand cursor on hover-only elements would suggest "clickable" |
| Register every shape with an `id` | ❌ rejected | Simplest, but hit-tests far more elements every frame on large scenes |
| Dynamic ids (`ref[name].isHovered`) | ❌ unsupported | Not detectable by a regex; not used in Kilopixel. Document as a limitation. |
| More states (`isFocused`, `isSelected`, `isDragging`) | ⏸️ not now | No keyboard support; selection is app state (`<pxl-var>`); dragging is a separate feature (skipped for now) |

---

## 5. Performance & GC

- Per attribute change: one `indexOf` bail-out; regex only if `.is` occurs. No per-frame work.
- Hit testing cost grows only by the elements that actually need it (same as with an `on*` handler).
- Zero allocations in the render loop. The `Set` grows only with distinct ids (bounded by the scene).

---

## 6. Implementation Steps

1. `js/interaction.js` — `pxl.INTERACTIVE_STATES`, regex, `pxl._interactiveIds`, `pxl._pressableIds`, `pxl.trackInteractiveRefs()`; lazy unregister after state broadcasts (§3.5); cursor rule (§3.6).
2. `js/engine.js` — call `pxl.trackInteractiveRefs(newValue)` in `pxl.compileAttribute`.
3. `js/elements/shape.js` — call it for `on*` handler strings; late-arrival check in `connectedCallback`; helpers `hasEventHandlers()` and `isClickable()`.
4. `node build.js`.
5. `examples/test52.html` — remove the `onclick` workaround (after text hit testing is done, see related plan).
6. `.agents/KILOPIXEL.md` — lifecycle text is already correct; add cross-element references, the lazy unregister, the cursor rule, and the limitation (dynamic ids).

---

## 7. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | `fill="ref.btn.isHovered ? …"` on `btn` itself, no `on*` | hover changes fill |
| 2 | Expression on another element (`<pxl-text fill="ref.btn.isHovered …">`) | hovering `btn` changes the text |
| 3 | Expression element **before** `btn` in the DOM | works (late arrival) |
| 4 | `btn` added later via JS (`insertAdjacentHTML`) | works |
| 5 | `btn` removed and re-added | works again, no duplicate registration |
| 6 | `isPressed` only (`scale="ref.btn.isPressed ? 0.95 : 1"`) | press feedback works |
| 7 | Reference inside `onclick` of another element | referenced element registered |
| 8 | `ref.main.isHovered` (stage) | unchanged behaviour, no error |
| 9 | Elements without any state reference | not registered (check `_interactiveElements` length) |
| 10 | `test52.html` without `onclick` (after text hit testing) | rect and text both react |
| 11 | Replace `fill="ref.btn.isHovered …"` with `fill="red"`, then hover `btn` once | `btn` unregistered after the hover state change |
| 12 | Same as 11, but another element still uses `ref.btn.x` | `btn` stays registered (safe over-registration) |
| 13 | Hover-only element (`isHovered` / `onenter`, no click handler) | default cursor |
| 14 | Element with `onclick`, or with `isPressed` referenced | hand cursor |

**Regression:** all `docs/*.html` pages load without console errors; interactive docs examples (buttons, hover effects) still work.
