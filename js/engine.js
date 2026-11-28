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

// The ten transform attributes of layers, groups and shapes with their defaults, spread into each class's defaults
pxl.TRANSFORM_DEFAULTS = { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0 };

// The keys of pxl.TRANSFORM_DEFAULTS, as comparisons: called for every changed value in the frame
pxl.isSpatialKey = function(key) {
  return key === 'x' || key === 'y' || key === 'dx' || key === 'dy' ||
         key === 'rotate' || key === 'zoom' || key === 'scalex' ||
         key === 'scaley' || key === 'skewx' || key === 'skewy';
};

// '<pxl-rect id="btn">' or '<pxl-rect>': how warnings and errors name an element
pxl.describe = function(element) {
  return `<${element.localName}${element.id ? ` id="${element.id}"` : ''}>`;
};

// The points of a box by name, as proportions of its width and height: rect's anchor and the radii of radial
// gradients (pxl.resolveRadius)
pxl.anchorX = {
  'left': 0, 'right': 1, 'center': 0.5,
  'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1,
  'top': 0.5, 'bottom': 0.5,
  'top-center': 0.5, 'bottom-center': 0.5,
  'left-center': 0, 'right-center': 1,
  'center-top': 0.5, 'center-bottom': 0.5,
  'center-left': 0, 'center-right': 1
};
pxl.anchorY = {
  'top': 0, 'bottom': 1, 'center': 0.5,
  'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1,
  'left': 0.5, 'right': 0.5,
  'top-center': 0, 'bottom-center': 1,
  'left-center': 0.5, 'right-center': 0.5,
  'center-top': 0, 'center-bottom': 1,
  'center-left': 0.5, 'center-right': 0.5
};

// Names available in every expression and handler: Math, colors and utilities (compiler.js), gradients
// (gradient.js), filters (compositing.js). A whitelist without a prototype, so polyfills can't leak in.
pxl.scope = Object.create(null);

// =========================================================================
// Attribute Compilation
// =========================================================================

// Resolves a bare ('') or removed (null) attribute (design/done/2026-10-17_attribute_defaults_and_state_isolation_plan.md):
// an attribute with a boolean default follows the HTML presence rule, so bare (<pxl-polyline closed>) is true;
// a bare <pxl-var> value is '' (a cleared text input); otherwise the class default, also for a custom shape's value
pxl.resolveEmptyAttribute = function(element, name, newValue) {
  const value = element.constructor.defaults[name];
  if (newValue === '') {
    if (typeof value === 'boolean') return true;
    if (name === 'value' && element instanceof pxl.Variable) return '';
  }
  return value === undefined ? null : value;
};

// newValue: an attribute string, or null for a removed attribute
pxl.compileAttribute = function(element, name, newValue) {
  let parsed;
  if (newValue === null || newValue === '') parsed = pxl.resolveEmptyAttribute(element, name, newValue);
  else if (element.constructor.templateAttributes.includes(name)) parsed = pxl.parseTemplate(newValue);
  else parsed = pxl.parseAttributeValue(newValue);
  if (typeof parsed !== 'function') {
    pxl.storeValue(element, name, parsed);
    return;
  }
  element.expressions[name] = parsed;

  if (parsed.isTimeDependent) {
    // Evaluated every frame (evaluateAnimations)
    if (!element.animatedAttributeKeys.includes(name)) element.animatedAttributeKeys.push(name);
    pxl.removeFromArray(element.reactiveAttributeKeys, name);
  } else {
    // Evaluated in the update phase when a source changed (UpdateScheduler.updateReaders()). Functions are only compiled for
    // time or refs, so a reactive function always reads at least one id.
    pxl.removeFromArray(element.animatedAttributeKeys, name);
    if (!element.reactiveAttributeKeys.includes(name)) element.reactiveAttributeKeys.push(name);
    // Not connected yet: connectedCallback evaluates it
    if (element.isConnected) element.values[name] = parsed.call(element, 0);
  }
  pxl.expressionsChanged(element);
};

// A value that needs no compiling, stored as it is: a parsed attribute string, or a property value (number, boolean,
// array, gradient descriptor, …). Arrays are kept by reference and never changed by the engine.
pxl.storeValue = function(element, name, value) {
  const wasExpression = typeof element.expressions[name] === 'function';
  element.expressions[name] = value;
  pxl.removeFromArray(element.animatedAttributeKeys, name);
  pxl.removeFromArray(element.reactiveAttributeKeys, name);
  element.values[name] = value;
  if (wasExpression) pxl.expressionsChanged(element);
};

// An expression was set or removed: the element's sources, its place in its stage's reader list, and the order of
// sources, which holds elements that others read, toLocal() readers and the containers above them (UpdateScheduler.buildOrder())
pxl.expressionsChanged = function(element) {
  if (element.isConnected) element.collectSources();
  if (element.isOrderNode || element.hasToLocal || element.childList !== null || pxl.isRead(element)) {
    pxl._orderVersion++;
  }
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
// attribute named like another HTMLElement property, a class's own getter (Polyline's points).
// A string set as a template attribute's property (Text's text) is text, never code: frameworks bind data to it, and
// compiling data would run it ('${alert(1)}'). The attribute stays a template.
pxl.defineAccessors = function(Class) {
  if (pxl._accessorClasses.has(Class)) return;
  pxl._accessorClasses.add(Class);
  const proto = Class.prototype;
  for (const name of Class.observedAttributes) {
    if (name.includes('-') || name in proto) continue;
    const isTemplate = Class.templateAttributes.includes(name);
    Object.defineProperty(proto, name, {
      get() { return this.values[name]; },
      set(value) {
        if (isTemplate && typeof value === 'string') pxl.setLiteral(this, name, value);
        else this.setValue(name, value === undefined ? null : value);
      },
      configurable: true
    });
  }
};

// A string stored as it is, never parsed or compiled (a template attribute's property)
pxl.setLiteral = function(element, name, value) {
  if (value === element.expressions[name]) return;
  pxl.storeValue(element, name, value);
  element.valueChanged(name);
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
  console.warn(`[pxl] ${pxl.describe(element)} ${name}: a function can't be set as a value; use a number or an expression string`);
};

pxl.setPendingProperties = function(element, pending) {
  for (let i = 0; i < pending.length; i += 2) element[pending[i]] = pending[i + 1];
};
