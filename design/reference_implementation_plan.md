# Implementation Plan: Zero-Cost Element Referencing (`ref.`)

This plan introduces the Zero-Cost element referencing registry with extreme 60fps performance optimizations.
*(Note: The declarative `<pxl-var>` component has been deferred for a future update).*

## Proposed Architecture

This implements "Scenario B", heavily optimized for 60fps rendering to eliminate Garbage Collection (GC) thrashing and redundant calculations.

#### [MODIFY] `js/variables.js` 
Add the `pxl.nodes` registry and the broadcast helper.
```javascript
// The zero-cost plain object registry
pxl.nodes = {};

// Clean broadcast helper for reactive updating
pxl.broadcast = function(fullKey) {
  const subs = this._subscriptions[fullKey];
  if (subs) {
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};
```

#### [MODIFY] `js/compiler.js` 
Update the regex to extract `ref.xxx` dependencies. Pass `this.nodes` into the factory function.
```javascript
// New Regex extracts 'v', 's', or 'ref'
const varRegex = /\b([vs]|ref)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

// Pass nodes into the generated function as "ref" and use this.* consistently
const fn = new Function('scope', 'v', 's', 'ref', `...`)(this.scope, this.vars, this.sys, this.nodes);
```

#### [MODIFY] `js/bindings.js` 
> [!IMPORTANT]
> **[OPTIMIZATION 3: Zero-GC Bitmask Return]** The function `evaluateAttributesForVariable` currently returns an object literal `{ isVarStillNeeded, hasChanges }`. If an animated leader broadcasts to a static follower, this allocates 60 new objects per second, thrashing the Garbage Collector. We will rewrite it to return a primitive integer bitmask (`0`, `1`, `2`, `3`) to guarantee 100% zero-allocation evaluation.

```javascript
pxl.evaluateAttributesForVariable = function(element, varName) {
  let result = 0; // Bitmask: 1 = isVarStillNeeded, 2 = hasChanges
  const len = element.reactiveAttributeKeys.length;

  for (let i = 0; i < len; i++) {
    const key = element.reactiveAttributeKeys[i];
    const fn = element.attributeExpressions[key];

    if (fn.variableDependencies?.includes(varName)) {
      result |= 1; // Flag bit 1
      const newVal = fn(0);
      if (element.attributeValues[key] !== newVal) {
        element.attributeValues[key] = newVal;
        result |= 2; // Flag bit 2
      }
    }
  }
  return result; 
};
```

#### [MODIFY] `js/elements/shape.js` (And `group.js`, `layer.js`) 
Wire up the `connectedCallback` and `disconnectedCallback` lifecycle methods to exclusively use standard HTML `id`.
> [!TIP]
> **[OPTIMIZATION 1: Zero-GC Cache]** We cache the string `this._refKey` exactly once to prevent 60,000 string allocations per second inside the `draw()` loop.

```javascript
connectedCallback() {
  // ... existing logic ...
  // Strictly use standard HTML ID for unique identification. No fallback magic.
  if (this.id) {
    pxl.nodes[this.id] = this.attributeValues;
    this._refKey = `ref.${this.id}`; 
  }
}

disconnectedCallback() {
  // ... existing logic ...
  if (this.id && pxl.nodes[this.id] === this.attributeValues) {
    delete pxl.nodes[this.id];
  }
}

// Inside variableChangedCallback, read the new Bitmask from bindings.js
variableChangedCallback(varName) {
  const result = pxl.evaluateAttributesForVariable(this, varName);
  if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
  if ((result & 2) !== 0) this.parentLayer?.invalidate();
}
```

Add the reactive broadcast triggers so sleeping layers wake up precisely when needed.
> [!TIP]
> **[OPTIMIZATION 2: Batched Broadcasts]** We place the broadcast check outside the attribute evaluation loop so an element only whispers to its subscribers *once* per frame, no matter how many attributes animated.

```javascript
// Inside attributeChangedCallback:
if (this._refKey) pxl.broadcast(this._refKey);

// Inside the animated attribute evaluation loop in draw():
if (this.attributeValues[key] !== newVal) {
  this.attributeValues[key] = newVal;
  animatedValuesChanged = true;
}
// After the loop in draw():
if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
  pxl.broadcast(this._refKey);
}
```

## Verification Plan
1. Apply the code changes across the files.
2. Run `node build.js`.
3. Run `test28.html` (the Lerp chasing physics demo) with the new `<pxl-circle id="leader">` and `<pxl-circle x="lerp(ref.leader.x, ...)">` syntax to verify the referencing engine works perfectly at 60fps across layers with ZERO memory allocations.
