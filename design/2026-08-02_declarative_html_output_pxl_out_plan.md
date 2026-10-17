# Declarative HTML Output Element (`<pxl-out>`)

- **Status**: 🟡 **Revised 2026-10-17, ready for review** (first draft 2026-08-02)
- **Date**: 2026-08-02 (revised 2026-10-17: based on `PxlNode`, Rule A, write-on-change, stage pause / `alwaysrender`, accessibility)
- **Related**: `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A, `static defaults`), `design/2026-10-17_shape_authoring_plan.md` (derived `observedAttributes`), `.agents/TODO.md` §5
- **Target Implementation**: new `js/elements/out.js` (after `variable.js` in `build.js`)

---

## 1. Goal

Kilopixel scenes are written in HTML without a JavaScript API. Values can flow **into** a scene declaratively (`<pxl-var value="…">`), but showing a live value **outside** a stage (a header, a card, a status bar) currently needs JavaScript (`MutationObserver`, polling, or engine internals).

`<pxl-out>` closes that gap: it shows the result of an expression as normal HTML text and updates it whenever the values it reads change.

```html
<span>FPS: <pxl-out value="ref.main.fps"></pxl-out></span>
<span>Spinner angle: <pxl-out value="round(ref.spinner.rotate % 360)"></pxl-out>°</span>
<p><pxl-out value="`Radius ${ref.R.value} (decay ${ref.decay.value})`"></pxl-out></p>
```

`<pxl-var>` defines a value, `<pxl-out>` shows one: input and output with the same attribute name.

**Why it is worth having:**
- **Completes the declarative model:** no JavaScript needed to display live values.
- **Accessibility:** canvas content is invisible to screen readers and can't be selected or copied. `<pxl-out>` puts live values into real DOM text (current chart value, score, status).
- **Dashboards and status bars** around a stage (FPS, positions, counters).

---

## 2. Naming

- **Tag `<pxl-out>`:** short, pairs with `<pxl-var>` and with HTML's own `<output>` element.
- **Attribute `value`** only. The first draft also accepted `text` as an alias; two names for the same thing contradict the "one clean API" rule (`.agents/AGENTS.md`), so `text` is dropped. The unused `format` attribute from the first draft is dropped as well: formatting is done in the expression (`round()`, template literals, `toFixed()`).

---

## 3. Design

### 3.1 Built on `PxlNode`

The first draft extended `HTMLElement` and re-implemented compiling, subscribing and cleanup. `PxlNode` already provides all of it:

| Needed | Provided by `PxlNode` |
|---|---|
| Compile `value` (static, reactive, template literals) | `attributeChangedCallback` → `pxl.compileAttribute` |
| Bare / removed `value` (Rule A) | `static defaults` + `pxl.resolveEmptyAttribute` |
| Subscribe to `ref.*`, evaluate on change | `variableChangedCallback` → `pxl.evaluateAttributesForVariable` |
| Late arrival (source element connected after `<pxl-out>`) | `pxl.broadcast` on the source's connect |
| Re-subscribe on re-insert, clean up on removal | `connectedCallback` / `disconnectedCallback` |

**Important:** the first draft would now crash. `pxl.compileAttribute` resolves bare / removed values via `element.constructor.defaults[name]`, and a plain `HTMLElement` subclass has no `defaults`, so `<pxl-out value>` or `removeAttribute('value')` would throw. Basing it on `PxlNode` with `static defaults` fixes this by construction.

### 3.2 Implementation

```javascript
// js/elements/out.js — shows the value of an expression as HTML text (outside stages)
class Output extends PxlNode {
  static get observedAttributes() { return ['value']; } // derived from defaults once the shape authoring plan lands
  static defaults = { value: '' };

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (this.attributeExpressions.value?.isTimeDependent) {
      console.warn('[pxl] <pxl-out> only shows ref.* values; time expressions (t, wave(), …) are not evaluated outside a stage.');
    }
    this.writeText();
  }

  connectedCallback() {
    super.connectedCallback(); // evaluates reactive values now that sources can be found
    this.writeText();
  }

  variableChangedCallback(varName) {
    super.variableChangedCallback(varName);
    this.writeText();
  }

  // Inside a layer it would be registered as a child; it draws nothing
  render() {}

  // DOM write only when the text actually changes (sources may broadcast every frame)
  writeText() {
    const value = this.attributeValues.value;
    const text = (value === null || value === undefined) ? '' : String(value);
    if (text !== this._lastText) {
      this.textContent = text;
      this._lastText = text;
    }
  }
}
customElements.define('pxl-out', Output);
```

The class is named `Output`, not `Out`: engine classes are global names (`Shape`, `Line`, …), so a two-letter global would be too generic.

### 3.3 Update Frequency

`<pxl-out>` doesn't calculate anything per frame. It updates when the values it reads are **published**:

| Source | Publishes |
|---|---|
| `<pxl-var>` with a static / reactive value, slider-driven attributes | on change |
| Animated attribute (`ref.spinner.rotate` with `rotate="t * 90"`) | every frame **while its stage renders** |
| `ref.<stage>.fps`, `renderAvg`, `renderMax` | once per second **while the stage renders** |
| `ref.<stage>.mouseX`, `mouseY`, `isHovered` | on pointer events |

**Write-on-change:** an animated source broadcasts every frame. `writeText()` compares strings and only touches the DOM when the text differs. Rounding in the expression (`round(ref.spinner.rotate)`) reduces DOM writes further and makes the output readable.

### 3.4 Paused Stages and `alwaysrender`

Stages pause while scrolled out of view (built-in `IntersectionObserver`). A paused stage publishes nothing, so every `<pxl-out>` reading from it **freezes** at its last value (FPS shows the last measured value, not 0).

Typical case: a sticky header shows a value from a stage further down the page. Fix: `alwaysrender="true"` on that stage. This is the same situation as references between stages (verified 2026-10-17: a shape in stage B reading `ref.*` values animated in stage A freezes while only B renders). The `<pxl-out>` docs must explain it in a callout.

### 3.5 Time Expressions Are Not Supported

`<pxl-out>` is not part of any stage's render loop, so nothing evaluates time-dependent expressions (`value="t"`, `value="wave(2)"`). They would show their value at compile time and never change. `attributeChangedCallback` warns once; the docs state: "`<pxl-out>` shows `ref.*` values".

### 3.6 Accessibility

The text is real DOM text, so screen readers can read it. `<pxl-out>` does **not** set `aria-live` by itself: animated sources update every frame and would flood screen reader announcements. Authors add `aria-live="polite"` where announcements make sense (e.g. a score that changes occasionally).

---

## 4. Decisions & Simplifications

| Topic | Decision | Reason |
|---|---|---|
| Base class | ✅ `PxlNode` | Reuses compile, subscriptions, Rule A, cleanup; the first draft would crash on bare / removed values |
| Attribute | ✅ `value` only | One name; pairs with `<pxl-var>`; no `text` alias, no unused `format` |
| DOM writes | ✅ only when the text changes | Sources may broadcast every frame |
| Time expressions | ❌ not supported, warning | No render loop outside stages; would silently show a frozen value |
| `aria-live` | ❌ not automatic | Would flood screen readers with animated sources |
| Placement inside a layer | ✅ harmless (`render()` no-op) | Not intended, but must not crash the layer |
| Formatting attribute / options | ❌ not now | Expressions already cover it (`round()`, template literals, `toFixed()`) |
| Docs slider readouts via `<pxl-out>` | ⏸️ separate decision | Would remove one line per slider handler, but the docs standard currently prefers explicit native DOM updates |

---

## 5. Performance & GC

- No per-frame work of its own; runs only when a source publishes.
- Per update: one string conversion and one comparison; a DOM write only on actual change.
- Template-literal expressions allocate a new string per evaluation (unavoidable for text output); numeric expressions allocate only in `String(value)`.

---

## 6. Implementation Steps

1. `js/elements/out.js` (§3.2); add it to the file list in `build.js` after `variable.js`.
2. `node build.js`.
3. `.agents/KILOPIXEL.md` — new element reference "Output", note in the Stage reference (`alwaysrender` keeps `<pxl-out>` values updating while the stage is off screen), AI code generation guide entry.
4. Docs page (later): usage, formatting with expressions, the paused-stage callout (§3.4), accessibility note (§3.6).

---

## 7. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | `<pxl-out value="ref.R.value">`, slider changes `R` | text updates immediately |
| 2 | `<pxl-out>` placed **before** the stage in the DOM | shows the value once the source connects (late arrival) |
| 3 | `value="ref.main.fps"` | updates once per second |
| 4 | `value="round(ref.spinner.rotate % 360)"` with `rotate="t * 90"` | updates while the stage renders; DOM writes only when the rounded number changes |
| 5 | Stage scrolled out of view, then `alwaysrender="true"` | value freezes, then keeps updating |
| 6 | Template literal `` value="`R = ${ref.R.value}`" `` | formatted text |
| 7 | `<pxl-out value>` and `removeAttribute('value')` | empty text, no error (Rule A) |
| 8 | `value="wave(2)"` | one console warning, no error |
| 9 | Remove the `<pxl-out>` element, then change the source | no errors, subscription cleaned up |
| 10 | `<pxl-out>` inside a `<pxl-layer>` | layer renders without errors |
| 11 | Static `value="Hello"` | shows "Hello" |
