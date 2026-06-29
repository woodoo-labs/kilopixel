window.pxl = {};

// =========================================================================
// Generic Utilities
// =========================================================================

pxl.removeFromArray = function(arr, item) {
  const idx = arr.indexOf(item);
  if (idx !== -1) {
    const lastIdx = arr.length - 1;
    if (idx !== lastIdx) arr[idx] = arr[lastIdx];
    arr.length--;
  }
};

// =========================================================================
// Reactivity Engine
// =========================================================================

// Centralized Pub-Sub Bus
pxl._subscriptions = {};

// The zero-cost plain object registry for DOM nodes
pxl.nodes = {};

pxl.broadcast = function(fullKey) {
  const subs = this._subscriptions[fullKey];
  if (subs) {
    // Loop backwards to support safe in-place unsubscribing (Zero-GC)
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};

// Proxies and global system variables have been removed in favor of explicit ref.* architecture

pxl.subscribeToVariable = function(fullKey, element) {
  if (!this._subscriptions[fullKey]) this._subscriptions[fullKey] = [];
  if (!this._subscriptions[fullKey].includes(element)) {
    this._subscriptions[fullKey].push(element);
  }
};

pxl.unsubscribeFromVariable = function(fullKey, element) {
  const subs = this._subscriptions[fullKey];
  if (!subs) return;

  // 1. Zero-GC Array Mutation using helper
  this.removeFromArray(subs, element);

  // 2. Dashboard Safeguard: Delete the key if the array is empty
  if (subs.length === 0) {
    delete this._subscriptions[fullKey];
  }
};

pxl.clearAllVariableSubscriptions = function(element) {
  // 1. Take a static snapshot of the current variables being tracked.
  const trackedKeys = Object.keys(this._subscriptions);
  const len = trackedKeys.length;

  // 2. Safely loop through the snapshot
  for (let i = 0; i < len; i++) {
    this.unsubscribeFromVariable(trackedKeys[i], element);
  }
};
// =========================================================================
// State Update Utilities for Web Components
// =========================================================================
pxl.compileAttribute = function(element, name, newValue) {
  const parsed = this.parseAttributeValue(newValue);
  element.attributeExpressions[name] = parsed;

  if (typeof parsed === 'function') {
    if (parsed.isTimeDependent) {
      // --- 60FPS Time Loop ---
      if (!element.animatedAttributeKeys.includes(name)) element.animatedAttributeKeys.push(name);
      this.removeFromArray(element.reactiveAttributeKeys, name);
    } else {
      // --- Reactive Variable Engine ---
      this.removeFromArray(element.animatedAttributeKeys, name);
      if (!element.reactiveAttributeKeys.includes(name)) element.reactiveAttributeKeys.push(name);

      // Globally subscribe the element to the variables it needs
      const deps = parsed.variableDependencies;
      if (deps) {
        const len = deps.length;
        for (let i = 0; i < len; i++) {
          this.subscribeToVariable(deps[i], element);
        }
      }
      // Force initial evaluation for the first frame
      element.attributeValues[name] = parsed(0);
    }
  } else {
    // --- Static Primitive ---
    this.removeFromArray(element.animatedAttributeKeys, name);
    this.removeFromArray(element.reactiveAttributeKeys, name);
    element.attributeValues[name] = parsed;
  }
};

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

pxl.restoreVariableSubscriptions = function(element) {
  if (!element.reactiveAttributeKeys) return;
  const len = element.reactiveAttributeKeys.length;
  for (let i = 0; i < len; i++) {
    const key = element.reactiveAttributeKeys[i];
    const fn = element.attributeExpressions[key];
    const deps = fn?.variableDependencies;
    if (deps) {
      const depLen = deps.length;
      for (let j = 0; j < depLen; j++) {
        this.subscribeToVariable(deps[j], element);
      }
    }
  }
};
