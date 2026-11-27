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
// A change doesn't evaluate the element's readers: it raises a version and asks the stages that read the element for
// a frame. Their update phase then evaluates what is out of date, sources before their readers (Stage.runFrame()).
// Design: design/done/2026-11-20_evaluation_model_plan.md.

// Element id → its values, read by expressions as ref.<id>.<name>
pxl.nodes = {};

// Counts the changes of elements that someone reads. Such an element's changeVersion is the count at its last
// change; a reader keeps the count at its last evaluation and is out of date when a source's version is newer.
pxl._changeCounter = 0;
// The count when an element last left the registry: its readers now read undefined
pxl._registryVersion = 0;
// Every id an expression reads (filled by the compiler, never shrinks): only changes of these elements count
pxl._readIds = new Set();
// Raised when a stage's order of sources may have changed (Stage.buildOrder())
pxl._orderVersion = 0;

// A cycle without t whose values keep changing stops after this many rounds (Stage.evaluateOrder())
pxl.MAX_CYCLE_ROUNDS = 100;
pxl.CYCLE_MESSAGE = `a ref.* cycle never settles: values still changed after ${pxl.MAX_CYCLE_ROUNDS} rounds`;

// Called by the compiler for the ids of a new expression. An element with a new id may now be a source of an order.
pxl.addReadIds = function(ids) {
  for (let i = 0; i < ids.length; i++) {
    if (pxl._readIds.has(ids[i])) continue;
    pxl._readIds.add(ids[i]);
    pxl._orderVersion++;
  }
};

pxl.isRead = function(element) {
  return element.registeredId !== null && pxl._readIds.has(element.registeredId);
};

// After a value of element changed. Only an element that someone reads counts, so the counter stays still while
// only unread values change, and a stage can skip its readers (Stage.updateReaders()).
pxl.markChanged = function(element) {
  if (!pxl.isRead(element)) return;
  element.changeVersion = ++pxl._changeCounter;
  pxl.wakeReaders(element.registeredId);
};

// Asks every stage that reads id for a frame. The running stage asks for none: its update phase is still to come,
// or the change came from there (rule R1).
pxl.wakeReaders = function(id) {
  const stages = pxl.perf.stages;
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].readsId(id)) stages[i].requestRender();
  }
};

// An element (or stage) with an id connected, or got an id. Readers written before it pick it up in the next update
// phase; a source that someone reads may be a node of the order.
pxl.registerNode = function(element, id) {
  pxl.nodes[id] = element.values;
  element.registeredId = id;
  pxl.markChanged(element);
  if (pxl.isRead(element)) pxl._orderVersion++;
};

// An element left the registry (removed, or its id changed): its readers now read undefined
pxl.unregisterNode = function(id) {
  delete pxl.nodes[id];
  pxl._registryVersion = ++pxl._changeCounter;
  if (pxl._readIds.has(id)) {
    pxl.wakeReaders(id);
    pxl._orderVersion++;
  }
};

// An element's id was set, changed or removed after it connected (connectedCallback reads the id once). The old
// entry is removed only if it is this element's.
pxl.renameNode = function(element, oldId, newId) {
  if (oldId && pxl.nodes[oldId] === element.values) pxl.unregisterNode(oldId);
  element.registeredId = null;
  if (newId) pxl.registerNode(element, newId);
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
  } else {
    // Evaluated in the update phase when a source changed (Stage.updateReaders()). Functions are only compiled for
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
// sources, which holds elements that others read, toLocal() readers and the containers above them (Stage.buildOrder())
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
