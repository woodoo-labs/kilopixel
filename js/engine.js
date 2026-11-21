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
         key === 'rotate' || key === 'zoom' || key === 'scalex' ||
         key === 'scaley' || key === 'skewx' || key === 'skewy';
};

// =========================================================================
// Reactivity Engine
// =========================================================================

// Subscribers per ref key: { 'ref.id': [element, …] }
pxl._subscriptions = {};

// Element id → its values, read by expressions as ref.<id>.<name>
pxl.nodes = {};

// A ref.* cycle whose values keep changing stops after this many rounds (PxlNode.variableChangedCallback).
// A cycle of n elements nests n × rounds calls, so the limit keeps cycles of up to ~200 elements below the stack limit.
pxl.MAX_CYCLE_ROUNDS = 100;
pxl.CYCLE_MESSAGE = `a ref.* cycle never settles: values still changed after ${pxl.MAX_CYCLE_ROUNDS} rounds`;

pxl.broadcast = function(fullKey) {
  const subs = pxl._subscriptions[fullKey];
  if (subs) {
    // Backwards: a subscriber may unsubscribe itself during the loop
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};

// The keys each element is subscribed to (element → Set), the other side of pxl._subscriptions: removing an
// element then touches only its own keys. Scanning every key for every removed element was quadratic (2,000 shapes
// with 2,000 readers took 380 ms to remove, design/done/2026-10-30_framework_compatibility_plan.md §19.1).
pxl._subscribedKeys = new WeakMap();

pxl.subscribeToVariable = function(fullKey, element) {
  let keys = pxl._subscribedKeys.get(element);
  if (!keys) pxl._subscribedKeys.set(element, keys = new Set());
  if (keys.has(fullKey)) return;
  keys.add(fullKey);
  (pxl._subscriptions[fullKey] ||= []).push(element);
};

pxl.unsubscribeFromVariable = function(fullKey, element) {
  const keys = pxl._subscribedKeys.get(element);
  if (!keys || !keys.delete(fullKey)) return;

  const subs = pxl._subscriptions[fullKey];
  pxl.removeFromArray(subs, element);
  if (subs.length === 0) delete pxl._subscriptions[fullKey]; // keeps the map small for debugging
};

pxl.clearAllVariableSubscriptions = function(element) {
  const keys = pxl._subscribedKeys.get(element);
  if (!keys) return;
  for (const fullKey of keys) {
    const subs = pxl._subscriptions[fullKey];
    pxl.removeFromArray(subs, element);
    if (subs.length === 0) delete pxl._subscriptions[fullKey];
  }
  keys.clear();
};

// An element's id was set, changed or removed after it connected (connectedCallback reads the id once): move its
// registry entry, and tell the readers of both names (readers of the old name now read undefined)
pxl.renameNode = function(element, oldId, newId) {
  if (oldId && pxl.nodes[oldId] === element.values) {
    delete pxl.nodes[oldId];
    pxl.broadcast(`ref.${oldId}`);
  }
  element.refKey = newId ? `ref.${newId}` : null;
  if (newId) {
    pxl.nodes[newId] = element.values;
    pxl.broadcast(element.refKey);
  }
};

// =========================================================================
// Attribute Compilation
// =========================================================================

// Resolves a bare ('') or removed (null) attribute (design/done/2026-10-17_attribute_defaults_and_state_isolation_plan.md):
// an attribute with a boolean default follows the HTML presence rule, so bare (<pxl-polyline closed>) is true;
// a bare <pxl-var> value is ''; otherwise the class default
pxl.resolveEmptyAttribute = function(element, name, newValue) {
  const value = element.constructor.defaults[name];
  if (newValue === '') {
    if (typeof value === 'boolean') return true;
    if (name === 'value') return ''; // only <pxl-var> has a value attribute
  }
  return value === undefined ? null : value;
};

// newValue: an attribute string, or null for a removed attribute
pxl.compileAttribute = function(element, name, newValue) {
  const parsed = (newValue === null || newValue === '')
    ? pxl.resolveEmptyAttribute(element, name, newValue)
    : pxl.parseAttributeValue(newValue);
  if (typeof parsed !== 'function') {
    pxl.storeValue(element, name, parsed);
    return;
  }
  element.expressions[name] = parsed;

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
      element.values[name] = parsed.call(element, 0);
    }
  }
};

// A value that needs no compiling, stored as it is: a parsed attribute string, or a property value (number, boolean,
// array, gradient descriptor, …). Arrays are kept by reference and never changed by the engine.
pxl.storeValue = function(element, name, value) {
  element.expressions[name] = value;
  pxl.removeFromArray(element.animatedAttributeKeys, name);
  pxl.removeFromArray(element.reactiveAttributeKeys, name);
  pxl.removeFromArray(element.toLocalAttributeKeys, name);
  element.values[name] = value;
};

// =========================================================================
// Properties: Every Attribute Is Also a JavaScript Property
// =========================================================================
// design/done/2026-10-30_framework_compatibility_plan.md §6, §24. React 19, Vue, Preact and Svelte set a property when the
// element has one (`name in element`); Angular [x], Lit .x and Solid prop:x always do. A number set as a property is
// stored without parsing or compiling; a string is compiled like the attribute. No reflection to the attribute.

pxl._accessorClasses = new WeakSet();

// Defines a getter / setter for every observed attribute on the class prototype, the first time an instance of the
// class is created, so custom shapes (class Star extends pxl.Shape) get them too. Hyphenated names (pxl-on-*
// handlers) stay attribute-only; names the prototype already has keep theirs: HTMLElement's id and hidden, an
// attribute named like another HTMLElement property, a class's own getter (Text's text, Polyline's points).
pxl.defineAccessors = function(Class) {
  if (pxl._accessorClasses.has(Class)) return;
  pxl._accessorClasses.add(Class);
  const proto = Class.prototype;
  for (const name of Class.observedAttributes) {
    if (name.includes('-') || name in proto) continue;
    Object.defineProperty(proto, name, {
      get() { return this.values[name]; },
      set(value) { this.setValue(name, value === undefined ? null : value); },
      configurable: true
    });
  }
};

// Properties a framework set before the element was upgraded (code splitting, a script loaded late) are own
// properties that hide the accessors. They are removed here and returned as [name, value, …] to be set again later
// (connectedCallback, after the attributes, so a framework value wins over server HTML); null if there are none.
// `keys` was read before the constructor added any field: a property set without a setter in the prototype chain.
pxl.takeOwnProperties = function(element, keys) {
  let pending = null;
  const proto = Object.getPrototypeOf(element);
  for (let i = 0; i < keys.length; i++) {
    const name = keys[i];
    if (!(name in proto)) continue;
    pending ??= [];
    pending.push(name, element[name]);
    delete element[name];
  }
  return pending;
};

// A JavaScript function as a value (x={() => …}) is not supported (yet): warned once per element, the value stays.
// Without the check, compileAttribute() would treat it as a compiled expression and throw in the framework's render.
pxl._functionValueWarnings = new WeakSet();
pxl.warnFunctionValue = function(element, name) {
  if (pxl._functionValueWarnings.has(element)) return;
  pxl._functionValueWarnings.add(element);
  console.warn(`[pxl] <${element.localName}${element.id ? ` id="${element.id}"` : ''}> ${name}: a function can't be set as a value; use a number or an expression string`);
};

pxl.setPendingProperties = function(element, pending) {
  for (let i = 0; i < pending.length; i += 2) element[pending[i]] = pending[i + 1];
};

// ref.<id>.set(name, value), Kilopixel's own setter for handlers: a string is compiled like the attribute (handlers
// are trusted code); any other value goes through the property, so numbers aren't compiled and arrays stay arrays.
// A name the element doesn't have warns once per element type and name (a typo, or a renamed attribute).
pxl._unknownSetNames = new Set();
pxl.setFromRef = function(element, name, value) {
  const isKnown = name in element || name.includes('-');
  if (!isKnown) {
    const key = `${element.localName} ${name}`;
    if (!pxl._unknownSetNames.has(key)) {
      pxl._unknownSetNames.add(key);
      console.warn(`[pxl] <${element.localName}${element.id ? ` id="${element.id}"` : ''}>: set('${name}', …) sets an attribute it doesn't have`);
    }
  }
  if (typeof value === 'string' || !isKnown) element.setAttribute(name, value);
  else element[name] = value;
};

// Re-evaluates toLocal() attributes after the element's own space moved (an ancestor's matrix changed).
// Returns a bitmask: 1 = values changed, 2 = matrix dirtied (setLocalMatrixDirty already walked the subtree).
pxl.evaluateToLocalAttributes = function(element) {
  let result = 0;
  const keys = element.toLocalAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const newVal = element.expressions[key].call(element, 0);
    if (element.values[key] !== newVal) {
      element.values[key] = newVal;
      result |= 1;
      if (pxl.isSpatialKey(key)) result |= 2;
    }
  }

  if (result & 2) element.setLocalMatrixDirty();
  if (result & 1) element.parentLayer?.invalidate();
  return result;
};

// Re-evaluates the reactive attributes that depend on varName.
// Returns a bitmask: 1 = varName is still needed, 2 = values changed, 4 = a changed value changes the pixels (not
// only a layer's compositing, see PxlNode.isCompositingKey()).
pxl.evaluateAttributesForVariable = function(element, varName) {
  let result = 0;
  let matrixDirtied = false;
  const keys = element.reactiveAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const fn = element.expressions[key];

    if (fn.variableDependencies.includes(varName)) {
      result |= 1;
      const newVal = fn.call(element, 0);
      if (element.values[key] !== newVal) {
        element.values[key] = newVal;
        result |= 2;
        if (!element.isCompositingKey(key)) result |= 4;
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
    const deps = element.expressions[keys[i]].variableDependencies;
    for (let j = 0; j < deps.length; j++) {
      pxl.subscribeToVariable(deps[j], element);
    }
  }
};
