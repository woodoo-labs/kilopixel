# Precise Implementation Plan: Zero-GC Declarative Events

This document contains the exact architectural blueprint and code modifications required to implement `onclick`, `onhover`, and `onleave` within the framework's strict performance constraints. It serves as the single source of truth for the implementation.

---

## Architecture Summary
1. **No Canvas GC**: Hit testing relies on a single, global 1x1 `<canvas>` context (`pxl.dummyCtx`) stored in `engine.js`.
2. **No Array/Closure GC**: `stage.js` manages hit testing entirely with pre-allocated flat arrays (`this._hitStack`, `this._hoveredElements`). No closures or anonymous functions are created during the `render` loop.
3. **No DOM Querying**: `<pxl-stage>` maintains an actively sorted array of `_interactiveElements`. Shapes push themselves into this array when their event attributes are parsed.
4. **Pre-compiled Handlers**: Event strings (e.g., `onclick="radius=50"`) are wrapped in a `new Function().bind(this)` exactly once during `attributeChangedCallback`.
5. **Ultra-Clean Syntax (`.set()`)**: A protected `.set()` method is injected into every element's `attributeValues` object, allowing developers to write hyper-clean event logic like `onhover="ref.shape1.set('fill', 'red')"`.
6. **Strict State Management**: The framework strictly relies on `static get observedAttributes()`. Developers must use `<pxl-var>` for custom state storage to ensure reactivity; arbitrary unobserved attributes will not evaluate in the `ref.*` math engine.

---

## 1. Engine & Dummy Context (`js/engine.js`)
We will append the global context and state variables to the bottom of the engine file. The `fill` and `stroke` interceptors are defined once and simply read from the `pxl._hit*` variables.

**Code to Add:**
```javascript
// =========================================================================
// Declarative Event System (Dummy Context)
// =========================================================================
const dummyCanvas = document.createElement('canvas');
dummyCanvas.width = 1;
dummyCanvas.height = 1;
pxl.dummyCtx = dummyCanvas.getContext('2d');
pxl._hitX = 0;
pxl._hitY = 0;
pxl._hitResult = false;

// Global interceptors - these never trigger GC!
pxl.dummyCtx.fill = function() { if (this.isPointInPath(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
pxl.dummyCtx.stroke = function() { if (this.isPointInStroke(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
```

---

## 2. The `.set()` Syntactic Sugar (All Base Elements)
To support the hyper-clean syntax `ref.shape1.set('fill', 'red')`, we will attach a protected closure directly to the `attributeValues` object in the constructors of `Layer`, `Group`, `Shape`, `Stage`, and `Variable`. 
Because it uses `defineProperty`, it is hidden from iterations and cannot be accidentally overwritten if a user defines an attribute named `set`.

**Code Change in `constructor()` of all 5 Base Elements:**
```javascript
Object.defineProperty(this.attributeValues, 'set', {
  value: (key, value) => this.setAttribute(key, value),
  enumerable: false,
  writable: false
});
```

---

## 3. Shape Event Registration (`js/elements/shape.js`)
Shapes must recognize the new attributes, compile them immediately, and register themselves with the stage's interactive registry.

**Code Changes:**
1. Update `observedAttributes` in `Shape` base class to include `'onclick'`, `'onhover'`, `'onleave'`.
2. In `constructor`: Initialize `this._compiledOnClick`, `this._compiledOnHover`, `this._compiledOnLeave` to `null`.
3. In `connectedCallback`: Define `this.stage = this.parentLayer?.stage;` to gain access to the root stage.
4. In `disconnectedCallback`: Safely unregister from `this.stage._interactiveElements`.
5. Intercept event attributes in `attributeChangedCallback` before they hit `pxl.compileAttribute`:

```javascript
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    // --- NEW EVENT INTERCEPTION ---
    if (name === 'onclick' || name === 'onhover' || name === 'onleave') {
      let sanitizedStr = newValue.replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
      const compiled = new Function('scope', 'ref', \`
        const { \${pxl.scopeKeys} } = scope;
        return function() { 
          \${sanitizedStr} 
        };
      \`)(pxl.scope, pxl.nodes).bind(this);

      if (name === 'onclick') this._compiledOnClick = compiled;
      if (name === 'onhover') this._compiledOnHover = compiled;
      if (name === 'onleave') this._compiledOnLeave = compiled;
      
      if (this.stage && !this.stage._interactiveElements.includes(this)) {
        this.stage._interactiveElements.push(this);
        this.stage.isInteractiveOrderDirty = true; // Flag for DOM sorting!
      }
      return;
    }
    // ------------------------------

    pxl.compileAttribute(this, name, newValue);
    // ... rest of method ...
  }
```

---

## 4. Stage Hit-Testing Loop (`js/elements/stage.js`)
The stage manages the pre-allocated stacks and runs the actual geometry intersections safely at the end of every render cycle.

**Code Changes:**
1. In `constructor`: 
   - `this._interactiveElements = [];`
   - `this.isInteractiveOrderDirty = false;`
   - `this._hoveredElements = [];` (Zero-GC replacement for Set)
   - `this._hitStack = new Array(50);` (Pre-allocated DOM-walk array)
   - `this._lastClick = false;`
2. Add `click` listener in `connectedCallback`, and route it through `handleEvent(e)` by simply setting `this._lastClick = true; this.requestRender();`.
3. Call `this.processHitTesting()` at the very end of `render(t)` (just before performance telemetry), and reset `this._lastClick = false`.

**New Method (`processHitTesting`):**
```javascript
  processHitTesting() {
    const elements = this._interactiveElements;
    const len = elements.length;
    if (len === 0) return;

    if (this.isInteractiveOrderDirty) {
      elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1);
      this.isInteractiveOrderDirty = false;
    }

    const ctx = pxl.dummyCtx;
    pxl._hitX = this.attributeValues.mouseX; // Logical coordinates
    pxl._hitY = this.attributeValues.mouseY;

    let hitEl = null;

    // 1. Find topmost hit
    for (let i = len - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el.draw) continue;
      
      let curr = el;
      let isHidden = false;
      let stackLen = 0;

      while (curr && curr !== this) {
        if (curr.attributeValues) {
          if (curr.attributeValues.hidden) {
            isHidden = true;
            break; // Parent is hidden, skip entirely
          }
          this._hitStack[stackLen++] = curr;
        }
        curr = curr.parentElement;
      }

      if (isHidden) continue;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Apply transformations top-down
      for (let j = stackLen - 1; j >= 0; j--) {
        pxl.applyContextState(ctx, this.unit, this._hitStack[j].attributeValues);
      }

      pxl._hitResult = false;
      ctx.beginPath();
      el.draw(ctx, this.unit, 0);
      ctx.restore();

      if (pxl._hitResult) {
        hitEl = el;
        break; // Topmost element found!
      }
    }

    // 2. Process Leaves (Zero-GC diffing)
    for (let i = this._hoveredElements.length - 1; i >= 0; i--) {
      const prevHovered = this._hoveredElements[i];
      if (prevHovered !== hitEl) {
        if (prevHovered._compiledOnLeave) prevHovered._compiledOnLeave();
        pxl.removeFromArray(this._hoveredElements, prevHovered);
      }
    }

    // 3. Process Hovers
    if (hitEl && !this._hoveredElements.includes(hitEl)) {
      this._hoveredElements.push(hitEl);
      if (hitEl._compiledOnHover) hitEl._compiledOnHover();
    }

    // 4. Update Cursor
    this.style.cursor = hitEl ? 'pointer' : 'default';

    // 5. Process Clicks
    if (this._lastClick && hitEl && hitEl._compiledOnClick) {
      hitEl._compiledOnClick();
    }
  }
```
