window.pxl = {};

// =========================================================================
// Generic Utilities
// =========================================================================

// Removes an item by swapping in the last element (order is not kept, no allocation)
pxl.removeFromArray = function(arr, item) {
  const idx = arr.indexOf(item);
  if (idx !== -1) {
    const lastIdx = arr.length - 1;
    if (idx !== lastIdx) arr[idx] = arr[lastIdx];
    arr.length--;
  }
};

pxl.sortByDOMPosition = function(a, b) {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1;
};

pxl.isSpatialKey = function(key) {
  return key === 'x' || key === 'y' || key === 'dx' || key === 'dy' ||
         key === 'rotate' || key === 'scale' || key === 'scalex' ||
         key === 'scaley' || key === 'skewx' || key === 'skewy';
};

// =========================================================================
// Reactivity Engine
// =========================================================================

// Subscribers per ref key: { 'ref.id': [element, …] }
pxl._subscriptions = {};

// Element id → its attributeValues, read by expressions as ref.<id>.<name>
pxl.nodes = {};

pxl.broadcast = function(fullKey) {
  const subs = pxl._subscriptions[fullKey];
  if (subs) {
    // Backwards: a subscriber may unsubscribe itself during the loop
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};

pxl.subscribeToVariable = function(fullKey, element) {
  if (!pxl._subscriptions[fullKey]) pxl._subscriptions[fullKey] = [];
  if (!pxl._subscriptions[fullKey].includes(element)) {
    pxl._subscriptions[fullKey].push(element);
  }
};

pxl.unsubscribeFromVariable = function(fullKey, element) {
  const subs = pxl._subscriptions[fullKey];
  if (!subs) return;

  pxl.removeFromArray(subs, element);
  if (subs.length === 0) delete pxl._subscriptions[fullKey]; // keeps the map small for debugging
};

pxl.clearAllVariableSubscriptions = function(element) {
  // Snapshot of the keys: unsubscribing deletes empty keys while we loop
  const trackedKeys = Object.keys(pxl._subscriptions);
  for (let i = 0; i < trackedKeys.length; i++) {
    pxl.unsubscribeFromVariable(trackedKeys[i], element);
  }
};

// =========================================================================
// Attribute Compilation
// =========================================================================

// Attributes that follow the HTML presence rule: a bare attribute (<pxl-polyline closed>) means true
pxl.BOOLEAN_ATTRIBUTES = new Set(['hidden', 'closed', 'smooth', 'pie', 'anticlockwise', 'labels']);

// Resolves a bare ('') or removed (null) attribute: bare boolean = true, bare <pxl-var> value = '',
// otherwise the class default (design/2026-10-17_attribute_defaults_and_state_isolation_plan.md)
pxl.resolveEmptyAttribute = function(element, name, newValue) {
  if (newValue === '') {
    if (pxl.BOOLEAN_ATTRIBUTES.has(name)) return true;
    if (name === 'value') return ''; // only <pxl-var> has a value attribute
  }
  const value = element.constructor.defaults[name];
  return value === undefined ? null : value;
};

pxl.compileAttribute = function(element, name, newValue) {
  const parsed = (newValue === null || newValue === '')
    ? pxl.resolveEmptyAttribute(element, name, newValue)
    : pxl.parseAttributeValue(newValue);
  element.attributeExpressions[name] = parsed;

  // Register shapes whose isHovered / isPressed is read here. Time-dependent expressions never
  // subscribe to ref.*, so their references are sticky (never lazily unregistered).
  pxl.trackInteractiveRefs(newValue, typeof parsed === 'function' && parsed.isTimeDependent === true);

  if (typeof parsed === 'function') {
    if (parsed.isTimeDependent) {
      // Evaluated every frame (evaluateAnimations)
      if (!element.animatedAttributeKeys.includes(name)) element.animatedAttributeKeys.push(name);
      pxl.removeFromArray(element.reactiveAttributeKeys, name);
      pxl.removeFromArray(element.toLocalAttributeKeys, name);
    } else {
      // Evaluated when a ref.* dependency broadcasts. Functions are only compiled for time or refs,
      // so a reactive function always has variableDependencies.
      pxl.removeFromArray(element.animatedAttributeKeys, name);
      if (!element.reactiveAttributeKeys.includes(name)) element.reactiveAttributeKeys.push(name);

      // toLocal results also depend on the element's own space (re-evaluated by broadcastGlobalMatrixChange)
      if (parsed.usesToLocal) {
        if (!element.toLocalAttributeKeys.includes(name)) element.toLocalAttributeKeys.push(name);
      } else {
        pxl.removeFromArray(element.toLocalAttributeKeys, name);
      }

      const deps = parsed.variableDependencies;
      for (let i = 0; i < deps.length; i++) {
        pxl.subscribeToVariable(deps[i], element);
      }

      // Not connected yet: connectedCallback evaluates it
      if (element.isConnected) {
        element.attributeValues[name] = parsed.call(element, 0);
      }
    }
  } else {
    pxl.removeFromArray(element.animatedAttributeKeys, name);
    pxl.removeFromArray(element.reactiveAttributeKeys, name);
    pxl.removeFromArray(element.toLocalAttributeKeys, name);
    element.attributeValues[name] = parsed;
  }
};

// Re-evaluates toLocal() attributes after the element's own space moved (an ancestor's matrix changed).
// Returns a bitmask: 1 = values changed, 2 = matrix dirtied (setLocalMatrixDirty already walked the subtree).
pxl.evaluateToLocalAttributes = function(element) {
  let result = 0;
  const keys = element.toLocalAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const newVal = element.attributeExpressions[key].call(element, 0);
    if (element.attributeValues[key] !== newVal) {
      element.attributeValues[key] = newVal;
      result |= 1;
      if (pxl.isSpatialKey(key)) result |= 2;
    }
  }

  if (result & 2) element.setLocalMatrixDirty();
  if (result & 1) element.parentLayer?.invalidate();
  return result;
};

// Re-evaluates the reactive attributes that depend on varName.
// Returns a bitmask: 1 = varName is still needed, 2 = values changed.
pxl.evaluateAttributesForVariable = function(element, varName) {
  let result = 0;
  let matrixDirtied = false;
  const keys = element.reactiveAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const fn = element.attributeExpressions[key];

    if (fn.variableDependencies.includes(varName)) {
      result |= 1;
      const newVal = fn.call(element, 0);
      if (element.attributeValues[key] !== newVal) {
        element.attributeValues[key] = newVal;
        result |= 2;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }
  }

  if (matrixDirtied) element.setLocalMatrixDirty();
  return result;
};

pxl.restoreVariableSubscriptions = function(element) {
  const keys = element.reactiveAttributeKeys;
  for (let i = 0; i < keys.length; i++) {
    const deps = element.attributeExpressions[keys[i]].variableDependencies;
    for (let j = 0; j < deps.length; j++) {
      pxl.subscribeToVariable(deps[j], element);
    }
  }
};
