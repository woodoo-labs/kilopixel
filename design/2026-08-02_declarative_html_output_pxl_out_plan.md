# Declarative HTML Output Component (`<pxl-out>`)

**Date:** 2026-08-02  
**Status:** Design Proposal & Implementation Plan  

---

## 1. Goal Description
Kilopixel's core philosophy is **100% Declarative HTML5 markup with Zero JavaScript API requirements**. Currently, if a user wants to observe a Kilopixel variable, shape attribute, or stage FPS metric in standard HTML *outside* of a `<pxl-stage>`, they must use imperative JavaScript (such as `MutationObserver`, `addEventListener`, or `pxl.subscribeToVariable`).

This plan introduces a new lightweight Custom Web Component — **`<pxl-out>`** — that acts as a declarative DOM bridge. Users can place `<pxl-out value="ref.main.fps"></pxl-out>` anywhere in their HTML (headers, footers, sidebars, cards), and it will reactively bind to Kilopixel's dependency graph, updating its DOM `textContent` automatically with zero polling.

---

## 2. Naming & Semantic Trade-Offs

### Element Tag Name
* **`<pxl-out>` *(Recommended)***: Short, punchy, and pairs naturally with HTML5's native `<output>` tag concept. Immediately tells the reader *"this element outputs data from Kilopixel"*.
* **`<pxl-ref>`**: Emphasizes that it references `ref.*`, but might be confused with an input reference or pointer rather than a visual text output.
* **`<pxl-watch>` / `<pxl-display>`**: Clear intention, but slightly wordier than `<pxl-out>`.

### Attribute Name
* **`value="..."` *(Recommended)***: Creates a perfect symmetrical pair with `<pxl-var>`:
  * `<pxl-var id="R" value="460">` $\rightarrow$ **Input / Define**
  * `<pxl-out value="ref.R.value">` $\rightarrow$ **Output / Display**
  It also aligns with HTML standards where data-holding elements use `value`.
* **`text="..."`**: Matches `<pxl-text text="...">`, but feels slightly awkward when referencing numeric scalar metrics like FPS (`60`) or coordinates (`500`).
* **`from="..."` / `bind="..."`**: Reads like an English sentence (`<pxl-out from="ref.main.fps">`), but introduces a new keyword not used elsewhere in Kilopixel's grammar.

---

## 3. Open Design Questions & Recommendations
1. **Attribute Aliasing**: Should `<pxl-out>` accept **`value="..."`** as its primary attribute while also supporting **`text="..."`** as a fallback alias so that both work seamlessly?  
   * **Recommendation**: Yes, support both `value` and `text`.
2. **Template Literal Formatting**: Should `<pxl-out>` support JS template literal strings natively out-of-the-box for formatting (e.g., `value="`FPS: ${ref.main.fps || 60}`"`)?  
   * **Recommendation**: Yes, because it uses `pxl.compileAttribute`, template literal expressions work automatically.

---

## 4. Complete Engine Implementation (`js/elements/out.js`)

```javascript
// =========================================================================
// Declarative HTML Output Bridge (<pxl-out>)
// =========================================================================

class PxlOut extends HTMLElement {
  constructor() {
    super();
    this.attributeValues = {};
    this.attributeExpressions = {};
    this.reactiveAttributeKeys = [];
    this.animatedAttributeKeys = [];
  }

  static get observedAttributes() {
    return ['value', 'text', 'format'];
  }

  connectedCallback() {
    for (const attr of this.attributes) {
      this.compileAndSubscribe(attr.name, attr.value);
    }
    this.update();
  }

  disconnectedCallback() {
    // Unsubscribe from any variables to prevent memory leaks
    if (this.reactiveAttributeKeys) {
      const len = this.reactiveAttributeKeys.length;
      for (let i = 0; i < len; i++) {
        const key = this.reactiveAttributeKeys[i];
        const deps = this.attributeExpressions[key]?.variableDependencies;
        if (deps) {
          for (const dep of deps) {
            pxl.unsubscribeFromVariable(dep, this);
          }
        }
      }
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.compileAndSubscribe(name, newValue);
      this.update();
    }
  }

  compileAndSubscribe(name, value) {
    if (name === 'value' || name === 'text') {
      pxl.compileAttribute(this, name, value);
    }
  }

  // Called automatically by pxl.broadcast(varName) when a dependency updates
  variableChangedCallback(varName) {
    this.update();
  }

  update() {
    const key = this.hasAttribute('value') ? 'value' : 'text';
    const fn = this.attributeExpressions[key];
    const val = typeof fn === 'function' ? fn.call(this, 0) : this.attributeValues[key];
    this.textContent = val !== undefined && val !== null ? val : '';
  }
}

customElements.define('pxl-out', PxlOut);
```

---

## 5. HTML Usage Examples

### Example A: Live FPS & Stage Performance Monitoring
```html
<div class="status-bar">
  <span>⚡ LIVE FPS: <pxl-out value="ref.main.fps"></pxl-out></span> |
  <span>AVG RENDER: <pxl-out value="ref.main.renderAvg"></pxl-out> ms</span> |
  <span>MAX RENDER: <pxl-out value="ref.main.renderMax"></pxl-out> ms</span>
</div>
```

### Example B: Formatted Template Literal Strings
```html
<div class="info-card">
  <pxl-out value="`Geometry Radius: ${ref.R.value}px (Decay: ${ref.decay.value})`"></pxl-out>
</div>
```

### Example C: Reading Shape Coordinates Outside of the Stage
```html
<div class="tracker">
  <span>Spinner Angle: <pxl-out value="ref.spinner.rotate"></pxl-out>°</span>
</div>
```

---

## 6. Verification Plan

### Automated Tests
* Run `node build.js` to verify that `out.js` bundles into `dist/kilopixel.js` cleanly with zero syntax or packaging errors.

### Manual Verification
* Create an example test page (`examples/test_out.html`) containing:
  1. A `<pxl-stage id="main">` with interactive sliders.
  2. Multiple `<pxl-out>` elements in standard HTML headings and footer cards outside `<pxl-stage>`.
  3. Verify that dragging sliders instantly updates `<pxl-out value="ref.R.value">` and that every second `<pxl-out value="ref.main.fps">` displays the live frame rate without JavaScript polling.
