# Explicit `ref.*` Architecture Overhaul

**Date:** June 2026
**Status:** Approved for Execution

## Architectural Philosophy
We are completely eliminating all "magic" context (`v.*`, `s.*`, `sys.*`, `stage.*`). The framework will use a 100% explicit, zero-DOM-traversal, flat ID namespace.

**The Golden Rule:** If you want to reference something in math, give it an HTML `id`.
- User Variables: `<pxl-var id="speed">` ➔ `ref.speed.value`
- Stage Properties: `<pxl-stage id="main">` ➔ `ref.main.mouseX`
- Layer Properties: `<pxl-layer id="bg">` ➔ `ref.bg.fps`
- Shape Properties: `<pxl-circle id="player">` ➔ `ref.player.x`

## Core Mechanics
1. **Registration:** Any element with an `id` registers its `this.attributeValues` into the global plain object `pxl.nodes`.
2. **Compilation:** The compiler regex strictly looks for `\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g`.
3. **Execution:** The closure simply executes against `this.nodes` (passed as `ref`). No Proxies are used. No DOM traversal (`closest()`) is required during the 60fps loop.
4. **Pub-Sub:** Changes broadcast using the explicit key: `pxl.broadcast('ref.main')`.

## Exact File Modifications Required

### 1. `js/engine.js` (The Purge)
- **Delete** `createProxy()` entirely.
- **Delete** the global `pxl.vars` and `pxl.sys` proxy objects.
- The engine now purely routes `pxl.broadcast(fullKey)` using plain array matching.

### 2. `js/compiler.js` (Simplified Parser)
- **Regex Update:** Change `isAnimated` check and `varRegex` to ONLY look for `\bref\.`. Remove all `[vs]\.` logic.
- **Closure Signature:** Remove `v` and `s` arguments. The closure becomes:
  ```javascript
  const fn = new Function('scope', 'ref', `
    const { ${this.scopeKeys} } = scope;
    let t;
    ${this.timeDrivers}
    return function(_t) { t = _t; ${code} };
  `)(this.scope, this.nodes);
  ```

### 3. `js/elements/stage.js` (Stage as a Standard Node)
- **Setup:** Add `this.attributeValues = { mouseX: 500, mouseY: 500, isHovered: false, width: 1000, height: 1000, fps: 0, renderAvg: 0, renderMax: 0 }`.
- **Registration:** In `connectedCallback`, check for an ID.
  ```javascript
  if (this.id) {
    pxl.nodes[this.id] = this.attributeValues;
    this._refKey = `ref.${this.id}`;
    pxl.broadcast(this._refKey);
  }
  ```
- **Updates:** In `handleEvent()` and `resize()`, mutate `this.attributeValues` directly and trigger `if (this._refKey) pxl.broadcast(this._refKey);`.

### 4. `js/monitor.js` (Explicit Performance Tracking)
- **Tracking:** Loop through `pxl.perf.stages`. Update `stage.attributeValues.fps` directly instead of `pxl.sys.fps`.
- **Broadcast:** Trigger `pxl.broadcast(stage._refKey)` if the stage has a `_refKey`.

### 5. `js/elements/variable.js` (The Logic Node)
- **Class:** Create `class Variable extends HTMLElement`.
- **Lifecycle:** Connects to its parent `pxl-layer` or `pxl-group` via `registerChild()`.
- **Render:** Implements `render(ctx, u, t)` but performs NO canvas drawing. It evaluates `this.attributeExpressions['value'](t)`, mutates `this.attributeValues['value']`, and triggers `pxl.broadcast(this._refKey)` on change.

### 6. `build.js`
- Add `'js/elements/variable.js'` to the build array.

---

## Performance & GC Guarantees
- **No Proxies:** Eliminates ES6 proxy overhead. O(1) hashmap lookups for variable resolution.
- **Zero Allocations:** Math evaluations and Pub-Sub broadcasting create zero garbage. Array removals use swap-and-pop.
- **No False Wakes:** Shapes only subscribe to the specific ID they depend on.
- **Graceful Failures:** If an ID is missing, optional chaining (`ref.main?.mouseX`) safely returns `undefined` ➔ `NaN`, bypassing canvas draws without throwing errors.
