/** Kilopixel Framework v0.1.0 */
(function() {
if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
if (customElements.get('pxl-stage')) {
  console.warn('[pxl] Kilopixel is already loaded (<pxl-stage> is defined); this second copy is ignored.');
  return;
}
window.pxl = { version: '0.1.0' };

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

// =========================================================================
// Registry and Versions
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
// Raised when a stage's order of sources may have changed (UpdateScheduler.buildOrder())
pxl._orderVersion = 0;

// A cycle without t whose values keep changing stops after this many rounds (UpdateScheduler.evaluateOrder())
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
// only unread values change, and a stage can skip its readers (UpdateScheduler.updateReaders()).
pxl.markChanged = function(element) {
  if (!pxl.isRead(element)) return;
  element.changeVersion = ++pxl._changeCounter;
  pxl.wakeReaders(element.registeredId);
};

// Asks every stage that reads id for a frame. The running stage asks for none: its update phase is still to come,
// or the change came from there (rule R1).
pxl.wakeReaders = function(id) {
  const stages = pxl.stages;
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].scheduler.readsId(id)) stages[i].requestRender();
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
// pxl.UpdateScheduler: the Update Phase of One Stage
// =========================================================================
// Design: design/done/2026-11-20_evaluation_model_plan.md §3.2, §10, §11. The stage owns one (stage.scheduler) and
// calls it twice per frame: evaluateSources() before the walk of its layers, updateReaders() after it. The elements'
// readerStage and listedIn hold the stage, not the scheduler.
pxl.UpdateScheduler = class UpdateScheduler {
  constructor(stage) {
    this.stage = stage;
    // The ids that its readers read (a change of one asks the stage for a frame), the elements with reactive values or
    // toLocal(), and the order of sources (elements that others read, toLocal() readers and the containers above
    // them), with the cycles at the end
    this._idsRead = new Set();
    this._readers = [];
    this._checkedCounter = -1; // pxl._changeCounter at the last pass over the readers
    this._order = [];
    this._cycleStart = 0;
    this._builtOrderVersion = -1;
  }

  // Part 1 of the update phase: the sources in their order, sources before readers wherever they are (also hidden).
  // The order is rebuilt first when pxl._orderVersion changed.
  evaluateSources(t) {
    if (this._builtOrderVersion !== pxl._orderVersion) this.buildOrder();
    this.evaluateOrder(t);
  }

  // The stage left the page, and its elements with it: a stage inserted again builds its order anew
  reset() {
    for (let i = 0; i < this._order.length; i++) this._order[i].isOrderNode = false;
    this._order.length = 0;
    this._cycleStart = 0;
    this._builtOrderVersion = -1;
  }

  // A change of the element with this id asks the stage for a frame (pxl.wakeReaders())
  readsId(id) {
    return this._idsRead.has(id);
  }

  // Called for an element of this stage with reactive values or toLocal() when it connects or its expressions change
  // (PxlNode.collectSources()). The ids are never removed: a stale one only asks for a frame that finds nothing to do.
  addReader(reader) {
    const ids = reader.sourceIds;
    for (let i = 0; i < ids.length; i++) this._idsRead.add(ids[i]);
    if (reader.listedIn !== this.stage) {
      reader.listedIn = this.stage;
      this._readers.push(reader);
    }
  }

  // Part 3 of the update phase: the readers that aren't sources in the order, each evaluated when a source changed.
  // They read only sources evaluated before (in part 1, or elements without expressions), so their order doesn't
  // matter. Removed elements, and elements that are no longer readers, are dropped here: removing an element or an
  // expression touches no list.
  updateReaders() {
    if (this._checkedCounter === pxl._changeCounter) return; // nothing that anyone reads has changed since
    const readers = this._readers;
    let n = 0;
    for (let i = 0; i < readers.length; i++) {
      const reader = readers[i];
      if (reader.readerStage !== this.stage || (reader.reactiveAttributeKeys.length === 0 && !reader.hasToLocal)) {
        if (reader.listedIn === this.stage) reader.listedIn = null;
        continue;
      }
      readers[n++] = reader;
      if (!reader.isOrderNode && reader.isOutOfDate()) reader.updateReactive();
    }
    readers.length = n;
    this._checkedCounter = pxl._changeCounter;
  }

  // The sources of part 1, sorted so that each comes after the sources it reads. Nodes: the elements of this stage
  // that others read and that have expressions; toLocal() readers; and, for a toLocal() reader, the containers above
  // it and above its target that have expressions. Sorted with Kahn's algorithm, starting from DOM order; what is
  // left over is in a cycle or reads one, and goes to the end (_cycleStart). Built only when pxl._orderVersion
  // changed: an element that someone reads connects, leaves, gets an id or new expressions; a toLocal() reader
  // connects; a container's expressions change. Allocates, but only then.
  buildOrder() {
    this._builtOrderVersion = pxl._orderVersion;
    const nodes = this._order;
    for (let i = 0; i < nodes.length; i++) nodes[i].isOrderNode = false;
    nodes.length = 0;

    for (const id of pxl._readIds) {
      const values = pxl.nodes[id];
      if (values !== undefined) this.addOrderNode(values.$node);
    }
    for (let i = 0; i < this._readers.length; i++) {
      if (this._readers[i].hasToLocal) this.addOrderNode(this._readers[i]);
    }
    const sources = new Map();
    for (let i = 0; i < nodes.length; i++) { // grows while containers are added
      const list = this.orderSources(nodes[i]);
      sources.set(nodes[i], list);
      for (let j = 0; j < list.length; j++) this.addOrderNode(list[j]);
    }

    nodes.sort(pxl.sortByDOMPosition);
    const inDegree = new Map();
    const readersOf = new Map();
    for (const node of nodes) {
      inDegree.set(node, 0);
      readersOf.set(node, []);
    }
    for (const node of nodes) {
      for (const source of sources.get(node)) {
        // Left out: self-references (an element sees its own new values through updateReactive()), sources without
        // expressions, and sources in another stage's order, which are read as they are
        if (source === node || !source.isOrderNode || source.readerStage !== this.stage) continue;
        inDegree.set(node, inDegree.get(node) + 1);
        readersOf.get(source).push(node);
      }
    }
    const sorted = nodes.filter((node) => inDegree.get(node) === 0);
    for (let i = 0; i < sorted.length; i++) {
      for (const reader of readersOf.get(sorted[i])) {
        const remaining = inDegree.get(reader) - 1;
        inDegree.set(reader, remaining);
        if (remaining === 0) sorted.push(reader);
      }
    }
    this._cycleStart = sorted.length;
    for (const node of nodes) {
      if (inDegree.get(node) > 0) sorted.push(node);
    }
    for (let i = 0; i < sorted.length; i++) nodes[i] = sorted[i];
  }

  // Only elements of this stage with expressions: a source in another stage, or a stage itself (its pointer and
  // size), is read as it is
  addOrderNode(element) {
    if (element.isOrderNode || element.readerStage !== this.stage) return;
    if (element.animatedAttributeKeys.length + element.reactiveAttributeKeys.length === 0) return;
    element.isOrderNode = true;
    this._order.push(element);
  }

  // The elements that a node's expressions read; for toLocal() also the containers above both elements, whose
  // matrices it reads. Duplicates are fine: buildOrder() counts each edge on both sides.
  orderSources(node) {
    const list = [];
    const lists = [node.animatedAttributeKeys, node.reactiveAttributeKeys];
    for (let k = 0; k < lists.length; k++) {
      const keys = lists[k];
      for (let i = 0; i < keys.length; i++) {
        const fn = node.expressions[keys[i]];
        for (let j = 0; j < fn.sourceIds.length; j++) {
          const values = pxl.nodes[fn.sourceIds[j]];
          if (values === undefined) continue;
          list.push(values.$node);
          if (fn.usesToLocal && values.$node.readerStage === this.stage) this.pushContainers(values.$node, list);
        }
        if (fn.usesToLocal) this.pushContainers(node, list);
      }
    }
    return list;
  }

  pushContainers(element, list) {
    for (let p = element.parentContainer; p !== null; p = p.parentContainer) list.push(p);
  }

  // Part 1 of the update phase. A cycle without t is evaluated again in rounds while its values change, at most
  // pxl.MAX_CYCLE_ROUNDS, so a cycle that settles or converges keeps its values (decision C1 b). The rounds ask for
  // no frame: the stage is rendering.
  evaluateOrder(t) {
    const order = this._order;
    for (let i = 0; i < order.length; i++) order[i].updateAsSource(t);
    if (this._cycleStart === order.length) return;
    for (let round = 1; round < pxl.MAX_CYCLE_ROUNDS; round++) {
      let changed = false;
      for (let i = this._cycleStart; i < order.length; i++) {
        const node = order[i];
        try {
          if (node.evaluateReactive()) changed = true;
        } catch (error) {
          node.reportError(error);
        }
      }
      if (!changed) return;
    }
    order[this._cycleStart].reportError(pxl.CYCLE_MESSAGE);
  }
};

// =========================================================================
// pxl.Matrix: 2D affine matrices [a, b, c, d, tx, ty], written into existing arrays
// =========================================================================

pxl.Matrix = {
  // Float64, like JavaScript numbers: Float32 would turn x="333.3" into 333.29998779296875 in ref.<id>.tx and toLocal()
  create: function() {
    return new Float64Array([1, 0, 0, 1, 0, 0]);
  },

  // Order: Translate(x,y) -> Rotate -> Scale -> Skew -> Translate(dx,dy)
  updateLocal: function(out, x, y, dx, dy, rotate, scalex, scaley, skewx, skewy) {
    if (rotate) {
      const rad = rotate * Math.PI / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      out[0] = c;  out[1] = s;
      out[2] = -s; out[3] = c;
    } else {
      out[0] = 1; out[1] = 0;
      out[2] = 0; out[3] = 1;
    }
    out[4] = x;
    out[5] = y;

    if (scalex !== 1 || scaley !== 1) {
      out[0] *= scalex; out[1] *= scalex;
      out[2] *= scaley; out[3] *= scaley;
    }
    if (skewx || skewy) {
      const sx = Math.tan(skewx * Math.PI / 180);
      const sy = Math.tan(skewy * Math.PI / 180);
      const a0 = out[0], a1 = out[1], a2 = out[2], a3 = out[3];
      out[0] = a0 + a2 * sy;
      out[1] = a1 + a3 * sy;
      out[2] = a0 * sx + a2;
      out[3] = a1 * sx + a3;
    }
    if (dx || dy) {
      out[4] += out[0] * dx + out[2] * dy;
      out[5] += out[1] * dx + out[3] * dy;
    }
    return out;
  },

  multiply: function(out, a, b) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];

    out[0] = a0 * b0 + a2 * b1;
    out[1] = a1 * b0 + a3 * b1;
    out[2] = a0 * b2 + a2 * b3;
    out[3] = a1 * b2 + a3 * b3;
    out[4] = a0 * b4 + a2 * b5 + a4;
    out[5] = a1 * b4 + a3 * b5 + a5;
    return out;
  },

  invert: function(out, a) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    let det = a0 * a3 - a1 * a2;

    if (det === 0) {
      out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0;
      return out;
    }
    det = 1.0 / det;

    out[0] = a3 * det;
    out[1] = -a1 * det;
    out[2] = -a2 * det;
    out[3] = a0 * det;
    out[4] = (a2 * a5 - a3 * a4) * det;
    out[5] = (a1 * a4 - a0 * a5) * det;
    return out;
  }
};

pxl._scratchMatrixA = pxl.Matrix.create();
pxl._scratchMatrixB = pxl.Matrix.create();
pxl._identityMatrix = pxl.Matrix.create();

// toLocal(ref.target, prop) in expressions (the compiler adds the caller): the target's frame
// in the caller's parent space, the space of the caller's own x / y.
pxl.toLocal = function(caller, targetObj, prop) {
  if (!targetObj) return 0; // ref.<id> of an element that isn't connected yet

  const targetNode = targetObj.$node;
  if (!targetNode.getGlobalMatrix) return 0; // pxl-stage: no frame

  const callerParentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;

  // d = inverse(caller parent global) × target global
  pxl.Matrix.invert(pxl._scratchMatrixA, callerParentGlobal);
  const d = pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetNode.getGlobalMatrix());

  // The target's offset (dx, dy) in the caller's space; the translation d[4], d[5] already includes it
  const { dx, dy } = targetNode.values;
  const tdx = d[0] * dx + d[2] * dy;
  const tdy = d[1] * dx + d[3] * dy;

  if (prop === 'x')      return d[4] - tdx;
  if (prop === 'y')      return d[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return d[4];
  if (prop === 'ty')     return d[5];
  // Kilopixel's order rotate → scale → skew: rotate, scalex, scaley (negative = mirrored) and skewx
  // rebuild any target frame. zoom is the uniform factor with the same area change.
  if (prop === 'rotate') return Math.atan2(d[1], d[0]) * 180 / Math.PI;
  const det = d[0] * d[3] - d[1] * d[2];
  const lenX = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  if (prop === 'scalex') return lenX;
  if (prop === 'scaley') return det / lenX;
  if (prop === 'skewx')  return Math.atan((d[0] * d[2] + d[1] * d[3]) / (lenX * lenX)) * 180 / Math.PI;
  if (prop === 'zoom')   return Math.sqrt(Math.abs(det));

  // Unknown names are reported once by the compiler (pxl.checkToLocalProperties), not here in the frame loop
  return 0;
};

pxl.toLocalProperties = ['x', 'y', 'dx', 'dy', 'tx', 'ty', 'rotate', 'scalex', 'scaley', 'skewx', 'zoom'];

// =========================================================================
// Expression Scope & Time Drivers
// =========================================================================

// Math constants and methods, usable in expressions without the Math. prefix.
// Hardcoded whitelist of standard names to prevent polyfill contamination.
for (const prop of [
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2',
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
  'cbrt', 'ceil', 'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor',
  'fround', 'hypot', 'imul', 'log', 'log10', 'log1p', 'log2', 'max',
  'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt',
  'tan', 'tanh', 'trunc'
]) {
  pxl.scope[prop] = Math[prop];
}

pxl.scope.rgb  = (r, g, b) => `rgb(${r},${g},${b})`;
pxl.scope.rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
pxl.scope.hsl  = (h, s, l) => {
  const sf = typeof s === 'number' ? s + '%' : s;
  const lf = typeof l === 'number' ? l + '%' : l;
  return `hsl(${h},${sf},${lf})`;
};
pxl.scope.hsla = (h, s, l, a) => {
  const sf = typeof s === 'number' ? s + '%' : s;
  const lf = typeof l === 'number' ? l + '%' : l;
  return `hsla(${h},${sf},${lf},${a})`;
};

pxl.scope.clamp = (v, low, high) => Math.max(low, Math.min(high, v));
pxl.scope.lerp  = (a, b, alpha) => a + (b - a) * alpha;
pxl.scope.map   = (v, inMin, inMax, outMin, outMax) => (v - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;

// The scope's names, destructured at the top of every compiled function. Built at the first compile: every engine
// file that adds names (this one, gradient.js, compositing.js) has loaded by then, since they all load before the first
// customElements.define(), which may compile (a stage upgraded while the bundle runs compiles its ratio).
pxl._scopeKeys = null;
pxl.scopeKeys = function() {
  if (pxl._scopeKeys === null) pxl._scopeKeys = Object.keys(pxl.scope).join(', ');
  return pxl._scopeKeys;
};

// Time drivers: source code, injected into every compiled expression (they read its `t`)
pxl.drivers = {
  loop:   '(d) => (t % d) / d',
  yoyo:   '(d) => 1 - abs((t % (d * 2)) / d - 1)',
  wave:   '(d) => 0.5 - cos((t / d) * PI * 2) * 0.5',
  bounce: '(d) => abs(sin((t / d) * PI))',
  strobe: '(d) => (t % d < d * 0.5 ? 1 : 0)',
  glide:  '(d) => ((l) => l * l * (3 - 2 * l))((t % d) / d)',
  pulse:  '(d) => pow(sin((t / d) * PI), 6)',
  glitch: '(d) => abs(sin(floor(t / d) * 437.58)) % 1',
  time: `(u) => {
    _d.setTime(Date.now());
    if (u === 'ms') return _d.getMilliseconds();
    if (u === 's') return _d.getSeconds() + _d.getMilliseconds() / 1000;
    if (u === 'm') return _d.getMinutes() + _d.getSeconds() / 60;
    if (u === 'h') return _d.getHours() + _d.getMinutes() / 60;
    if (u === 'day') return _d.getDay();
    if (u === 'date') return _d.getDate();
    if (u === 'month') return _d.getMonth() + 1;
    if (u === 'year') return _d.getFullYear();
    return _d.getTime();
  }`
};

pxl.timeDrivers = Object.entries(pxl.drivers)
  .map(([name, body]) => `const ${name} = ${body};`)
  .join('\n');

pxl.timeDriverRegex = new RegExp(`(^|[^.])\\bt\\b|\\b(${Object.keys(pxl.drivers).join('|')})\\s*\\(`);

// =========================================================================
// Expression Compiler
// =========================================================================

// Compiled functions (time-dependent or reactive), shared by every element using the same string
pxl.animationCache = new Map();

// Results of static expressions, evaluated once
pxl.staticCache = new Map();

// Entries kept per cache. A framework that rebuilds an expression string on every render (`x="${base} + sin(t)"`)
// would otherwise grow the caches without end. Dropping the oldest entry is safe: elements keep their compiled
// function, and the same string only compiles again.
pxl.COMPILE_CACHE_LIMIT = 2000;

pxl.cacheExpression = function(cache, source, value) {
  if (cache.size >= pxl.COMPILE_CACHE_LIMIT) cache.delete(cache.keys().next().value); // Maps keep insertion order
  cache.set(source, value);
};

// Splits an expression into code and string literals, so rewrites and checks can skip quoted text
// (design/done/2026-11-02_string_literals_in_expressions_plan.md). Even indices are code, odd indices are literals with
// their quotes. In a template literal, the code inside ${…} is code again: 'a' + `b${x}c` → ['', "'a'", ' + ', '`b${',
// 'x', '}c`', '']. Regex literals and comments aren't recognized; attribute expressions don't use them.
// Compile time only: it runs once per distinct string, so its allocations don't matter.
pxl.splitStringLiterals = function(str) {
  const parts = [];
  // One entry per open ${…}: the depth of { } inside it, so its own } can be told apart from an object literal's
  const templateDepths = [];
  let start = 0;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const depth = templateDepths.length;
    const endsTemplateCode = char === '}' && depth > 0 && templateDepths[depth - 1] === 0;
    if (char === '\'' || char === '"' || char === '`' || endsTemplateCode) {
      parts.push(str.slice(start, i));
      if (endsTemplateCode) templateDepths.pop();
      const quote = endsTemplateCode ? '`' : char;
      let end = i + 1;
      while (end < str.length && str[end] !== quote) {
        if (str[end] === '\\') end++;
        else if (quote === '`' && str[end] === '$' && str[end + 1] === '{') break;
        end++;
      }
      if (str[end] === '$') {
        end += 2;
        templateDepths.push(0);
      } else {
        end++; // an unterminated string runs to the end
      }
      parts.push(str.slice(i, end));
      start = i = end;
    } else {
      if (depth > 0 && char === '{') templateDepths[depth - 1]++;
      if (depth > 0 && char === '}') templateDepths[depth - 1]--;
      i++;
    }
  }
  parts.push(str.slice(start));
  return parts;
};

// Rewrites shared by attribute expressions and pxl-on-* handlers, applied to code only (quoted text stays as written):
// ref.a.b → ref.a?.b (the referenced element may not be connected yet), only in expressions: handlers assign through
// ref (pxl.handlerRef), and JavaScript can't assign to an optional chain;
// toLocal( → pxl.toLocal(this, (the caller is the element the code belongs to)
pxl.rewriteExpression = function(str, isHandler = false) {
  const parts = pxl.splitStringLiterals(str);
  for (let i = 0; i < parts.length; i += 2) {
    if (!isHandler) parts[i] = parts[i].replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
    parts[i] = parts[i].replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
  }
  return parts.join('');
};

// Warns about toLocal() property names that don't exist (e.g. 'skewy', which isn't unique, or a typo).
// Runs once per expression at compile time; pxl.toLocal itself returns 0 for them without logging,
// because it runs every frame. Names given as variables can't be checked here.
pxl.checkToLocalProperties = function(str) {
  const propRegex = /\btoLocal\([^,]*,\s*(['"])([^'"]*)\1\s*\)/g;
  let match;
  while ((match = propRegex.exec(str)) !== null) {
    if (!pxl.toLocalProperties.includes(match[2])) {
      console.warn(`[pxl] toLocal(): '${match[2]}' is not available. Use one of ${pxl.toLocalProperties.join(', ')}. ` +
        `To copy a frame, map rotate, scalex, scaley and skewx: ${str}`);
    }
  }
};

// Turns a non-empty attribute string into a static value (number, boolean, string)
// or a compiled function. Cheap checks run first; most attributes never reach the compiler.
// CSS hsl() / hsla() with % on saturation and lightness, comma or space syntax: "hsl(200, 50%, 40%)", "hsl(200deg 50% 40% / 0.5)"
pxl.CSS_HSL_REGEX = /^hsla?\(\s*-?[\d.]+(?:deg)?(?:\s*,\s*|\s+)[\d.]+%(?:\s*,\s*|\s+)[\d.]+%(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;
pxl.CSS_COLOR_FUNCTION_REGEX = /^(?:hwb|lab|lch|oklab|oklch|color)\([^()]*\)$/i;

pxl.parseAttributeValue = function(value) {
  const firstChar = value[0];

  // Hex colors: "#ff0000", "#fff"
  if (firstChar === '#') return value;

  // Template literals always compile
  if (firstChar === '`') return pxl.compileExpression(value);

  // Words: "red", "none", "true", "t", "Hello World"
  if ((firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z')) {
    if (/^[a-zA-Z\s]+$/.test(value)) {
      if (value === 't') return pxl.compileExpression(value);
      if (value === 'true') return true;
      if (value === 'false') return false;

      // Math constants: "PI", "E"
      if (Object.prototype.hasOwnProperty.call(pxl.scope, value) && typeof pxl.scope[value] === 'number') {
        return pxl.scope[value];
      }
      return value;
    }

    // Static CSS colors, kept as text: compiling one costs about 90 µs, which a color that changes in every frame
    // (fill={`hsl(${h}, 50%, 50%)`} from framework state) would pay each time, filling the expression cache.
    // "rgba(124, 211, 15, 0.8)"; "hsl(200, 50%, 40%)" with % (Kilopixel's own hsl(200, 50, 40) is an expression);
    // the CSS color functions Kilopixel doesn't define (oklch(), lab(), color(), …), without nested parentheses.
    if (/^(rgb|rgba)\([\d\s.,%]+\)$/i.test(value) || pxl.CSS_HSL_REGEX.test(value) || pxl.CSS_COLOR_FUNCTION_REGEX.test(value)) {
      return value;
    }
  }

  // A single quoted string: "'Hello loop(2) World'"
  if ((firstChar === '\'' || firstChar === '"') && value[value.length - 1] === firstChar) {
    if (value.indexOf(firstChar, 1) === value.length - 1) {
      return value.slice(1, -1);
    }
  }

  // Numbers: "100", "-50", "0.25", ".5"
  const num = Number(value);
  if (!Number.isNaN(num)) return num;

  // Anything that looks like math, time, refs or code: "100 * 2", "loop(2)", "ref.a.x"
  if (/(^|[^.])\bt\b|\bref\.|\btoLocal\(|\(|\[|(?:\d\s*[-+*/%<>=!&|]|[-+*/%<>=!&|]\s*\d)|['"`]\s*\+|\+\s*['"`]/.test(value)) {
    return pxl.compileExpression(value);
  }

  return value;
};

pxl.compileExpression = function(str) {
  if (pxl.staticCache.has(str)) return pxl.staticCache.get(str);
  if (pxl.animationCache.has(str)) return pxl.animationCache.get(str);

  try {
    // The checks below read only the code outside string literals, so words in quoted text don't count
    // ('Press return: ' + …, a lone t, ref.a.b or 80% inside a string)
    const parts = pxl.splitStringLiterals(str);
    let unquoted = '';
    for (let i = 0; i < parts.length; i += 2) {
      // CSS percentages aren't valid JavaScript: hsl(120, 50%, 40%) → hsl(120, '50%', '40%')
      parts[i] = parts[i].replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, '\'$1%\'$2');
      unquoted += parts[i] + ' ';
    }

    const isAnimated = pxl.timeDriverRegex.test(unquoted);
    // toLocal() results also depend on the containers above both elements (UpdateScheduler.buildOrder())
    const usesToLocal = /\btoLocal\(/.test(unquoted);
    if (usesToLocal) pxl.checkToLocalProperties(str); // reads the full string: the property name is a string
    const source = pxl.rewriteExpression(parts.join(''));

    // The ids it reads: the stage evaluates it after them, and when one of them changed
    const sourceIds = [];
    const refRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = refRegex.exec(unquoted)) !== null) {
      if (!sourceIds.includes(match[1])) sourceIds.push(match[1]);
    }
    const hasVars = sourceIds.length > 0;

    // A plain expression gets a return; code with its own return statements is used as written
    const code = /\breturn\b/.test(unquoted) ? source : `return ${source};`;

    if (isAnimated || hasVars) {
      // The outer function runs once (destructures the scope); the returned closure runs per evaluation
      const fn = new Function('scope', 'ref', `
        const { ${pxl.scopeKeys()} } = scope;
        let t;
        const _d = new Date();
        ${pxl.timeDrivers}
        return function(_t) {
          t = _t;
          ${code}
        };
      `)(pxl.scope, pxl.nodes);

      fn.isTimeDependent = isAnimated;
      fn.sourceIds = sourceIds;
      fn.usesToLocal = usesToLocal;
      pxl.addReadIds(sourceIds);

      pxl.cacheExpression(pxl.animationCache, str, fn);
      return fn;
    }

    // Static: evaluated once
    const result = new Function('scope', `
      const { ${pxl.scopeKeys()} } = scope;
      ${code}
    `)(pxl.scope);
    const val = (result !== undefined) ? result : str;
    pxl.cacheExpression(pxl.staticCache, str, val);
    return val;
  } catch (e) {
    pxl.cacheExpression(pxl.staticCache, str, str);
    console.warn(`[pxl] failed to compile expression, used as text instead: ${str}`, e);
    return str;
  }
};

// =========================================================================
// Template Attributes: Text Where Only ${…} Is Code
// =========================================================================
// A template attribute (static templateAttributes: Text's text) is never guessed at like other values: everything is
// text, ${…} is code, and \${ writes a literal ${. The engine splits the value itself instead of wrapping it in
// JavaScript backticks, so backslashes and backticks in the text stay as written.
// Design: design/done/2026-11-27_text_template_plan.md

// Index of the } that closes the code part starting at `from`, or -1. Quoted strings (with their escapes) and nested
// template literals are skipped, so a } or ${ inside them doesn't end the part.
pxl.findTemplateEnd = function(str, from) {
  let depth = 0;
  for (let i = from; i < str.length; i++) {
    const char = str[i];
    if (char === '\'' || char === '"' || char === '`') {
      for (i++; i < str.length && str[i] !== char; i++) {
        if (str[i] === '\\') {
          i++;
        } else if (char === '`' && str[i] === '$' && str[i + 1] === '{') {
          const end = pxl.findTemplateEnd(str, i + 2);
          if (end < 0) return -1;
          i = end;
        }
      }
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
};

// The text itself when it has no code part. Otherwise one compiled function (cached like any expression, animated or
// reactive by its parts): each part in turn, and an undefined, null or NaN part makes the result null, so the text
// draws nothing until every part is defined; else the text with the parts joined in. The text between the parts goes
// into the generated code as JSON string literals, which the expression checks and rewrites skip as quoted text.
pxl.parseTemplate = function(str) {
  const texts = [];
  const codes = [];
  let text = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && str[i + 1] === '$' && str[i + 2] === '{') {
      text += '${';
      i += 3;
    } else if (str[i] === '$' && str[i + 1] === '{') {
      const end = pxl.findTemplateEnd(str, i + 2);
      const code = end < 0 ? '' : str.slice(i + 2, end).trim();
      if (code === '') {
        console.warn(`[pxl] template with ${end < 0 ? 'an unclosed ${' : 'an empty ${}'}, shown as text: ${str}`);
        return str;
      }
      texts.push(text);
      codes.push(code);
      text = '';
      i = end + 1;
    } else {
      text += str[i];
      i++;
    }
  }
  if (codes.length === 0) return text;
  texts.push(text);

  let source = '';
  let joined = JSON.stringify(texts[0]);
  for (let p = 0; p < codes.length; p++) {
    source += `const _p${p} = (${codes[p]});\n` +
      `if (_p${p} === undefined || _p${p} === null || _p${p} !== _p${p}) return null;\n`;
    joined += ` + _p${p} + ${JSON.stringify(texts[p + 1])}`;
  }
  source += `return ${joined};`;
  const compiled = pxl.compileExpression(source);
  // A part that doesn't compile: compileExpression warned and returned its source; the value is shown as written
  return compiled === source ? str : compiled;
};

// =========================================================================
// Gradients
// =========================================================================
// linear(), radial() and conic() in expressions return descriptors (plain objects with isGradient). A shape turns a
// descriptor into a CanvasGradient in its bounding box when it draws: Shape.createGradient(), through one
// pxl.GradientSlot for the fill and one for the stroke.

// Color stops for all gradient types: ['red', 'blue'] (evenly spaced) or [0, 'red', 1, 'blue']
pxl.parseStops = function(colorsArray) {
  const stops = [];
  if (!Array.isArray(colorsArray) || colorsArray.length === 0) return stops;
  if (typeof colorsArray[0] === 'string') {
    const step = 1 / (colorsArray.length - 1 || 1);
    for (let i = 0; i < colorsArray.length; i++) {
      stops.push({ offset: i * step, color: colorsArray[i] });
    }
  } else {
    for (let i = 0; i < colorsArray.length; i += 2) {
      stops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
    }
  }
  return stops;
};

pxl.scope.linear = (direction, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  if (typeof direction === 'number') {
    return { isGradient: true, type: 'linear', angle: direction, stops };
  }
  if (direction) {
    return { isGradient: true, type: 'linear', x1: direction[0], y1: direction[1], x2: direction[2], y2: direction[3], stops };
  }
  return { isGradient: true, type: 'linear', angle: 0, stops };
};

pxl.scope.radial = (config, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  let x0 = 0.5, y0 = 0.5, r0 = 0;
  let x1 = 0.5, y1 = 0.5, r1 = 0.5;

  if (typeof config === 'number') {
    r1 = config;
  } else if (config) {
    const len = config.length;
    if (len === 1) {
      r1 = config[0];
    } else if (len === 3) {
      x0 = config[0]; y0 = config[1]; r1 = config[2];
      x1 = x0; y1 = y0;
    } else if (len >= 6) {
      x0 = config[0]; y0 = config[1]; r0 = config[2];
      x1 = config[3]; y1 = config[4]; r1 = config[5];
    }
  }

  return { isGradient: true, type: 'radial', x0, y0, r0, x1, y1, r1, stops };
};

pxl.scope.conic = (angleOrConfig, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  let startAngle = 0, cx = 0.5, cy = 0.5;
  if (typeof angleOrConfig === 'number') {
    startAngle = angleOrConfig;
  } else if (angleOrConfig) {
    startAngle = angleOrConfig[0] || 0;
    cx = angleOrConfig[1] ?? 0.5;
    cy = angleOrConfig[2] ?? 0.5;
  }
  return { isGradient: true, type: 'conic', startAngle, cx, cy, stops };
};

// Radial gradient radius: a number is a logical length; a string is the distance from the center (x, y)
// to a side, a perimeter point or a CSS keyword of the bounding box (w × h)
pxl.resolveRadius = function(r, x, y, w, h) {
  if (typeof r === 'number') return Math.abs(r);

  // Sides: perpendicular distance
  if (r === 'top')    return Math.abs(y * h);
  if (r === 'bottom') return Math.abs((1 - y) * h);
  if (r === 'left')   return Math.abs(x * w);
  if (r === 'right')  return Math.abs((1 - x) * w);

  // Perimeter points (corners, edge midpoints): straight distance
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w, dy = (y - pxl.anchorY[r]) * h;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // CSS keywords
  const lx = x * w, rx = (1 - x) * w;
  const ty = y * h, by = (1 - y) * h;
  switch (r) {
    case 'closest-side':   return Math.max(0.001, Math.min(lx, rx, ty, by));
    case 'farthest-side':  return Math.max(lx, rx, ty, by);
    case 'closest-corner':
      return Math.max(0.001, Math.min(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by)));
    case 'farthest-corner':
      return Math.max(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by));
    default: return 0;
  }
};

// =========================================================================
// pxl.GradientSlot: the CanvasGradient of a Shape's Fill or Stroke
// =========================================================================
pxl.GradientSlot = class GradientSlot {
  // isStroke: the stroke's slot, whose gradient spans at least the stroke width (build())
  constructor(isStroke) {
    this._isStroke = isStroke;
    // The descriptor, box and stroke width of the last build, its gradient, or its error
    this._config = null;
    this._left = 0;
    this._top = 0;
    this._right = 0;
    this._bottom = 0;
    this._sw = 0;
    this._grad = null;
    this._error = null;
  }

  // The CanvasGradient for a descriptor in box, reused while the descriptor, the box and the stroke width are
  // unchanged. A gradient that fails with these values (a typo in a stop color) fails again: the error is kept, so later
  // frames throw the same object instead of building a new one (Shape.render() catches it, reportError() stays quiet).
  resolve(ctx, descriptor, box, sw) {
    if (this._config === descriptor &&
        this._left === box.left && this._top === box.top &&
        this._right === box.right && this._bottom === box.bottom && this._sw === sw) {
      if (this._error) throw this._error;
      return this._grad;
    }

    this._config = descriptor;
    this._left = box.left;
    this._top = box.top;
    this._right = box.right;
    this._bottom = box.bottom;
    this._sw = sw;
    this._grad = null;
    this._error = null;
    try {
      this._grad = this.build(ctx, descriptor, box, sw);
    } catch (error) {
      this._error = error;
      throw error;
    }
    return this._grad;
  }

  // The CanvasGradient for a descriptor in box; resolve() keeps it
  build(ctx, styleValue, box, sw) {
    // A stroke is at least strokewidth thick: a line's box has a zero side, and a gradient across it would
    // have zero length and paint nothing. For the stroke, each side spans at least strokewidth around the center.
    // (design/done/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md)
    const width = this._isStroke ? Math.max(box.right - box.left, sw) : box.right - box.left;
    const height = this._isStroke ? Math.max(box.bottom - box.top, sw) : box.bottom - box.top;
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const left = cx - width / 2;
    const top = cy - height / 2;

    let grad;

    if (styleValue.type === 'linear') {
      let gx1, gy1, gx2, gy2;

      if (styleValue.angle !== undefined) {
        const rad = styleValue.angle * Math.PI / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
        gx1 = cx - distance * cosRad;
        gy1 = cy - distance * sinRad;
        gx2 = cx + distance * cosRad;
        gy2 = cy + distance * sinRad;
      } else {
        gx1 = left + width * styleValue.x1;
        gy1 = top + height * styleValue.y1;
        gx2 = left + width * styleValue.x2;
        gy2 = top + height * styleValue.y2;
      }

      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const px0 = left + width * styleValue.x0;
      const py0 = top + height * styleValue.y0;
      const px1 = left + width * styleValue.x1;
      const py1 = top + height * styleValue.y1;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = left + width * styleValue.cx;
      const gcy = top + height * styleValue.cy;
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    // Offsets outside 0–1 throw in addColorStop; an animated stop may overshoot, so it parks at the end.
    // NaN (a ref that isn't connected yet) fails both comparisons and becomes 0.
    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
      const offset = stops[i].offset;
      grad.addColorStop(offset > 0 ? (offset < 1 ? offset : 1) : 0, stops[i].color);
    }
    return grad;
  }
};

// =========================================================================
// Canvas State: Transform, Compositing, Filters, Isolation
// =========================================================================
// What a node sets on the canvas before it draws, and the scratch canvas of isolated shapes.

// Whether a transform attribute is away from its default (pxl.TRANSFORM_DEFAULTS): a layer or group without one skips
// the transform, a group also save() / restore(). The same tests as applyTransformState() makes, step by step.
pxl.hasTransform = function(values) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = values;
  return !!(x || y || dx || dy || rotate || zoom !== 1 || scalex !== 1 || scaley !== 1 || skewx || skewy);
};

// Same order as pxl.Matrix.updateLocal: translate(x, y) → rotate → scale → skew → translate(dx, dy). In logical
// units: the layer has scaled the context by u.
pxl.applyTransformState = function(ctx, values) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = values;

  if (x || y) ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);

  const finalScaleX = zoom * scalex;
  const finalScaleY = zoom * scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx, dy);
};

// Scales every px value in the final filter string by the unit u: the helpers' (blur(5) → 'blur(5px)')
// and those written in backticks. JavaScript prints values near 0 in exponent notation (1.2e-15),
// so the number includes an optional exponent; otherwise only '-15px' would be scaled.
pxl.scaleResponsiveFilter = function(filterStr, u) {
  return filterStr.replace(/(-?\d*\.?\d+(?:e[-+]?\d+)?)px/g, (match, val) => (parseFloat(val) * u) + 'px');
};

pxl.applyContextState = function(ctx, u, values, node) {
  pxl.applyTransformState(ctx, values);
  pxl.applyCompositingState(ctx, u, values, node);
};

// Safari's canvas has ctx.filter only behind its "Canvas Filters" feature flag, off by default: a shape's filter is
// then ignored (TODO §49). Checked once per page, at the first shape with a filter; the prototype is asked, because
// assigning ctx.filter where it doesn't exist creates a plain property on that context.
pxl._canvasFilterChecked = false;

pxl.checkCanvasFilter = function(ctx, node) {
  if (pxl._canvasFilterChecked) return;
  pxl._canvasFilterChecked = true;
  if ('filter' in Object.getPrototypeOf(ctx)) return;
  console.warn(`[pxl] ${pxl.describe(node)} has a filter, but this browser's canvas ` +
    'ignores filters on shapes (Safari: only with its "Canvas Filters" feature flag). A filter on a layer works everywhere.');
};

// How a shape's pixels combine with the layer: alpha, mask / blend, filter, shadow. An isolated shape
// (Shape.renderIsolated()) applies it once, when its finished bitmap is drawn onto the layer.
// Canvas shadows and filters ignore the canvas transform, which holds the layer's device pixel ratio: their lengths
// are bitmap pixels, so they are scaled by u and the DPR.
pxl.applyCompositingState = function(ctx, u, values, node) {
  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = values;
  const k = u * node.parentLayer.dpr;

  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }

  if (filter !== 'none') {
    pxl.checkCanvasFilter(ctx, node);
    ctx.filter = node.resolveFilter(filter, k);
  }

  if (shadowcolor) {
    if (shadowcolor === 'none' || shadowcolor === 'transparent') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = shadowcolor;
      ctx.shadowBlur = shadowblur * k;
      ctx.shadowOffsetX = shadowx * k;
      ctx.shadowOffsetY = shadowy * k;
    }
  }
};

// The scratch canvas of isolated shapes (design/done/2026-11-01_isolated_shape_compositing_plan.md §3.2): one for the
// page, created on first use. It only grows, to the largest layer canvas it served, so it never resizes back and
// forth between layers of different sizes. Isolation never nests: groups have no compositing state.
pxl._isolationContext = null;

pxl.getIsolationContext = function(width, height) {
  let ctx = pxl._isolationContext;
  if (ctx === null) {
    ctx = pxl._isolationContext = document.createElement('canvas').getContext('2d');
  }
  const canvas = ctx.canvas;
  if (canvas.width < width) canvas.width = width;
  if (canvas.height < height) canvas.height = height;
  return ctx;
};

// =========================================================================
// Filter Helpers in Expressions
// =========================================================================
// They write the units, so filter="blur(4)" is enough; px values are scaled by pxl.scaleResponsiveFilter().
pxl.scope.blur       = (radius) => `blur(${radius}px)`;
pxl.scope.dropShadow = (x, y, blur, color) => `drop-shadow(${x}px ${y}px ${blur}px ${color || '#000'})`;
pxl.scope.brightness = (val) => `brightness(${val}%)`;
pxl.scope.contrast   = (val) => `contrast(${val}%)`;
pxl.scope.hueRotate  = (deg) => `hue-rotate(${deg}deg)`;
pxl.scope.invert     = (val) => `invert(${val}%)`;
pxl.scope.saturate   = (val) => `saturate(${val}%)`;
pxl.scope.grayscale  = (val) => `grayscale(${val}%)`;
pxl.scope.sepia      = (val) => `sepia(${val}%)`;
pxl.scope.opacity    = (val) => `opacity(${val}%)`;

// =========================================================================
// Handlers: pxl-on-* Attributes Are Listeners
// =========================================================================
// Handler attribute → the DOM event it listens to. Not on…: onclick is the browser's own handler attribute, and
// frameworks treat on… names as their own listeners (design/done/2026-10-30_framework_compatibility_plan.md §4.3).
// A handler is an ordinary listener on its shape or group: the engine only dispatches DOM events.
pxl.HANDLER_EVENTS = {
  'pxl-on-click': 'click', 'pxl-on-enter': 'pointerenter', 'pxl-on-leave': 'pointerleave',
  'pxl-on-down': 'pointerdown', 'pxl-on-up': 'pointerup', 'pxl-on-move': 'pointermove'
};

// The handlers record of a shape or group: one listener (or null) per event type
pxl.createHandlers = function() {
  return { click: null, pointerenter: null, pointerleave: null, pointerdown: null, pointerup: null, pointermove: null };
};

// The ref of handlers: ref.<id> reads the element's values like an expression does, and an assignment
// (ref.counter.value++, ref.box.r += 10) goes through the element's property, so it is tracked and redrawn like
// el.r = 10. Expressions keep pxl.nodes, the plain values: this wrapper never runs in a frame.
// Design: design/done/2026-11-27_handler_assignment_plan.md
pxl.handlerRef = new Proxy(pxl.nodes, {
  get(nodes, id) {
    const values = nodes[id];
    if (values === undefined) return undefined;
    const element = values.$node;
    element.assigningRef ??= new Proxy(values, pxl.ASSIGNING_REF);
    return element.assigningRef;
  }
});

// The element's attributes can be assigned (a Set per class, built on first use); states, readouts (tx, pN, a
// stage's mouseX), id, handler attributes and unknown names warn once per element type and name
pxl._assignableNames = new Map();
pxl._unassignableNames = new Set();
pxl.ASSIGNING_REF = {
  set(values, name, value) {
    const element = values.$node;
    const Class = element.constructor;
    let names = pxl._assignableNames.get(Class);
    if (names === undefined) {
      names = new Set(Class.observedAttributes.filter((key) => key !== 'id' && !key.includes('-')));
      pxl._assignableNames.set(Class, names);
    }
    if (names.has(name)) {
      element[name] = value;
      return true;
    }
    const key = `${element.localName} ${String(name)}`;
    if (!pxl._unassignableNames.has(key)) {
      pxl._unassignableNames.add(key);
      console.warn(`[pxl] ${pxl.describe(element)}: ref.<id>.${String(name)} can't be assigned (not an attribute)`);
    }
    // Not assigned. Handlers are sloppy-mode code, so false fails silently after the warning; true would throw for
    // tx, ty and $node (fixed getters on values: a Proxy may not report them as assigned)
    return false;
  }
};

// Compiles a handler with the expression scope (Math names, colors, …), its own ref (pxl.handlerRef) and `this`
// bound to the element. A handler that throws is logged with its element and attribute; the event's other listeners
// still run.
pxl.compileHandler = function(element, name, source) {
  const handler = new Function('scope', 'ref', `
    const { ${pxl.scopeKeys()} } = scope;
    return function() {
      ${pxl.rewriteExpression(source, true)}
    };
  `)(pxl.scope, pxl.handlerRef);
  return function() {
    try {
      handler.call(element);
    } catch (error) {
      console.error(`[pxl] ${pxl.describe(element)} ${name} failed:`, error);
    }
  };
};

// =========================================================================
// Hit Test Context
// =========================================================================
// 1×1 canvas, used only for its context (hit testing never paints)
pxl.dummyCtx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
pxl._hitX = 0;
pxl._hitY = 0;
pxl._hitResult = false;

// fill() / stroke() test the hit point instead of painting: a shape's own draw() becomes its hit test
pxl.dummyCtx.fill = function() { if (this.isPointInPath(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
pxl.dummyCtx.stroke = function() { if (this.isPointInStroke(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };

// =========================================================================
// DOM Events on Shapes
// =========================================================================
// Fields copied from the browser's event into Kilopixel's events (MouseEvent ignores the pointer fields)
pxl.EVENT_INIT_KEYS = [
  'screenX', 'screenY', 'clientX', 'clientY', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey', 'button', 'buttons',
  'detail', 'movementX', 'movementY', 'pointerId', 'pointerType', 'isPrimary', 'width', 'height', 'pressure',
  'tangentialPressure', 'tiltX', 'tiltY', 'twist'
];

// Boundary events in the browser's order: out, leave, over, enter; the pointer events first, then their mouse
// versions (React onMouseEnter, Vue @mouseenter, Angular (mouseenter) listen to those)
pxl.BOUNDARY_EVENTS = [
  ['pointerout', 'pointerleave', 'pointerover', 'pointerenter'],
  ['mouseout', 'mouseleave', 'mouseover', 'mouseenter']
];

// A shape or group: the nodes that get events and hover / press states. Layers fill the stage and get none.
pxl.isShapeOrGroup = function(node) {
  return node !== null && !(node instanceof pxl.Layer);
};

// =========================================================================
// InteractionEngine: hit testing, hover / press states, DOM events
// =========================================================================
// Every shape is hit-tested, like elements in the DOM (design/done/2026-10-30_framework_compatibility_plan.md §22, §23).
// CSS pointer-events: none takes a shape, or a group or layer with everything inside it, out of hit testing.
// While the pointer rests, the hit test runs at most this often (ms); any pointer event tests at once
pxl.RESTING_HIT_INTERVAL = 100;

pxl.InteractionEngine = class InteractionEngine {
  constructor(stage) {
    this.stage = stage;

    // The innermost hovered and pressed node: a shape, or the group left over when that shape was removed.
    // Its groups up to the layer share the state.
    this._hovered = null;
    this._pressed = null;

    // Click target (plan §23, E7): the nearest shape or group that holds both the press and the release
    this._isPressStarted = false; // a press arrived since the last release
    this._isClickDecided = false; // the release decided the target of the next click
    this._clickTarget = null;
    this._isReleaseListening = false; // window listens for a release outside the stage while a press is held
    this._onWindowRelease = (e) => {
      if (!pxl.InteractionEngine.isSecondary(e) && !e.composedPath().includes(this.stage)) this.cancelPress();
    };

    this._cursor = ''; // written on the layer canvases
    this._isMouseDirty = false;
    this._isMoved = false; // a browser pointermove arrived since the last frame
    this._isOverCanvas = true; // false while the pointer is over HTML content inside a layer
    this._captured = null; // a shape or group that holds pointer capture: the browser sends it its events itself
    this._lastHitTime = -1e9; // performance.now() of the last hit test in process()
    this._moveX = 0; // movementX / Y of the browser's moves since the last Kilopixel move
    this._moveY = 0;
    this._queuedMoveX = 0;
    this._queuedMoveY = 0;

    // Hit test of a press, release or click when it arrives, kept for its position until the pointer moves or a
    // frame runs: one click brings up to five browser events at the same place
    this._cacheX = NaN;
    this._cacheY = NaN;
    this._cacheFrame = -1;
    this._cacheHit = null;

    // Kilopixel's events: collected during a hit test and dispatched after it (listeners may change or remove
    // shapes); the arrays grow once and are reused
    this._queueTypes = [];
    this._queueTargets = [];
    this._queueRelated = [];
    this._queueLength = 0;
    this._isFlushing = false;
    this._native = null; // the browser's last event: copied into Kilopixel's events
    this._dispatching = null; // the event Kilopixel dispatches right now: the stage ignores it when it bubbles past
    this._init = pxl.InteractionEngine.createInit();
    this._x = 0; // position of the last event read by readPosition(), in stage units
    this._y = 0;
  }

  static createInit() {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, relatedTarget: null };
    for (const key of pxl.EVENT_INIT_KEYS) init[key] = undefined;
    return init;
  }

  // Touch points after the first: they get their own press, release and click, but mouseX, hover and isPressed
  // follow the primary pointer. A synthetic event without pointerType counts as primary.
  static isSecondary(e) {
    return e.isPrimary === false && e.pointerType !== '';
  }

  // --- Browser Events ---

  handleEvent(e) {
    if (e === this._dispatching) return; // Kilopixel's own event, bubbling through the stage
    const type = e.type;
    const isSecondary = pxl.InteractionEngine.isSecondary(e);
    // The browser's events over the canvases arrive retargeted to their layer (the canvas is in its shadow root).
    // Any other target is an element inside the stage: a shape that holds pointer capture, shape.click(), HTML
    // content placed in a layer. Those events already have their target and pass unchanged.
    const isFromCanvas = e.target === this.stage || e.target instanceof pxl.Layer;

    switch (type) {
      case 'pointermove':
        if (isSecondary) return;
        this._native = e;
        this._moveX += e.movementX;
        this._moveY += e.movementY;
        this._cacheFrame = -1;
        this._isOverCanvas = isFromCanvas || this._captured !== null;
        this.setPointer(e, isFromCanvas);
        this._isMouseDirty = true; // any move tests again in the next frame, also without a new position
        this._isMoved = true;
        this.stage.requestRender();
        return;
      case 'pointerenter':
        this.stage.values.isHovered = true;
        this._isMouseDirty = true;
        this.stage.requestRender();
        return;
      case 'pointerleave':
        this.stage.values.isHovered = false;
        this._isMouseDirty = true;
        this.stage.requestRender();
        return;
      case 'pointerout': {
        // The pointer leaves the stage: its shapes and groups get their leave events now, before the browser's
        // pointerout reaches the page (React's order: shape, group, layer), not in the next frame
        const to = e.relatedTarget;
        if (isSecondary || !isFromCanvas || (to !== null && this.stage.contains(to))) return;
        this._native = e;
        this.stage.values.isHovered = false;
        this._isMouseDirty = true;
        this.hover(null);
        this.updateCursor();
        this.flush();
        this.stage.requestRender();
        return;
      }
      case 'gotpointercapture':
        if (!isSecondary && !isFromCanvas) this._captured = e.target;
        return;
      case 'lostpointercapture':
        if (this._captured === e.target) this._captured = null;
        return;
      case 'pointercancel':
        // Touch scrolling cancels the pointer: a release without pxl-on-up and click (E8)
        if (!isSecondary) this.cancelPress();
        return;
    }

    // pointerdown, pointerup, mousedown, mouseup, click, dblclick, contextmenu: hit-tested when they arrive (D4)
    if (!isFromCanvas) {
      if (type === 'pointerup' && !isSecondary) this.cancelPress(); // the release of a captured pointer
      return;
    }
    if (this.stage.unit === 0) return;
    if (isSecondary) {
      const hit = this.hitAt(e);
      if (hit !== null) this.redispatch(e, hit);
      return;
    }
    this._native = e;
    let target;
    if (type === 'pointerdown' || type === 'pointerup') {
      // A tap may come without a move before it: the pointer moves here, and the hover change (enter events)
      // comes before the press, as in the DOM
      if (this.setPointer(e, true)) this.stage.requestRender();
      target = this.hitAt(e);
      this.hover(target);
      this.updateCursor();
      if (type === 'pointerdown') {
        this.press(target);
      } else {
        // E7: a click goes to the nearest shape or group that holds both the press and the release; pressed on one
        // shape and released on another, the browser's click passes to the stage
        this._isClickDecided = this._isPressStarted;
        this._clickTarget = this._isPressStarted ? this.commonNode(this._pressed, target) : null;
        this._isPressStarted = false;
        this.endPress();
      }
      this.flush();
    } else if (type === 'click') {
      // A click without a press on this stage (a synthetic click) goes to the shape under it
      target = this._isClickDecided ? this._clickTarget : this.hitAt(e);
      this._isClickDecided = false;
      this._clickTarget = null;
      this._cacheFrame = -1;
    } else {
      target = this.hitAt(e);
    }
    if (target !== null && target.isConnected) this.redispatch(e, target);
  }

  // Reads the event's position in stage units into this._x / this._y; false while the stage has no size.
  // Over the canvas, offsetX is relative to the stage. Any other target (a captured shape is display: none, its
  // offsetX equals clientX) is measured against the stage's box.
  readPosition(e, isFromCanvas) {
    const unit = this.stage.unit;
    if (unit === 0) return false;
    if (isFromCanvas) {
      this._x = e.offsetX / unit;
      this._y = e.offsetY / unit;
    } else {
      const rect = this.stage.getBoundingClientRect();
      this._x = (e.clientX - rect.left - this.stage.clientLeft) / unit;
      this._y = (e.clientY - rect.top - this.stage.clientTop) / unit;
    }
    return true;
  }

  // Moves the stage's pointer (mouseX / mouseY) to the event; true if it changed
  setPointer(e, isFromCanvas) {
    if (!this.readPosition(e, isFromCanvas)) return false;
    const values = this.stage.values;
    if (values.mouseX === this._x && values.mouseY === this._y) return false;
    values.mouseX = this._x;
    values.mouseY = this._y;
    this._isMouseDirty = true;
    return true;
  }

  // The topmost shape under a press, release or click, at the event's own position
  hitAt(e) {
    this.readPosition(e, true);
    const hit = this._cacheHit;
    if (this._x === this._cacheX && this._y === this._cacheY && this._cacheFrame === pxl._frame &&
        (hit === null || hit.isConnected)) {
      return hit;
    }
    this._cacheX = this._x;
    this._cacheY = this._y;
    this._cacheFrame = pxl._frame;
    this._cacheHit = this.findShapeAt(this._x, this._y);
    return this._cacheHit;
  }

  // --- States ---

  setState(node, key, value) {
    if (node.values[key] === value) return;
    node.values[key] = value;
    pxl.markChanged(node);
  }

  // Sets a state on node and its groups, up to (not including) stop or the layer
  setChain(node, stop, key, value) {
    for (let n = node; pxl.isShapeOrGroup(n) && n !== stop; n = n.parentContainer) this.setState(n, key, value);
  }

  // The nearest shape or group that contains both a and b, or null
  commonNode(a, b) {
    if (a === null || b === null) return null;
    for (let n = a; pxl.isShapeOrGroup(n); n = n.parentContainer) {
      if (n.contains(b)) return n;
    }
    return null;
  }

  // The pointer is now over next (a shape, or null): isHovered on the nodes left and entered, and their boundary
  // events (E6). Moving between shapes of one group leaves and enters nothing on the group. relatedTarget is the
  // node left or entered, or the shape's layer for empty space.
  // Over empty space the layer is the element under the pointer, as in the DOM: moving onto a shape, the layer gets
  // pointerout / mouseout first (relatedTarget: the shape), and moving off it, pointerover / mouseover after the leave
  // events. The browser sends neither (the pointer stays on the same canvas). React needs them: it builds
  // onPointerEnter / onPointerLeave only from the out events and ignores an over event whose relatedTarget is an
  // element it rendered, such as the layer (found with a React 19 page, plan §23.8).
  hover(next) {
    const prev = this._hovered;
    if (prev === next) return;
    this._hovered = next;
    const from = prev !== null ? prev : next.parentLayer;
    const to = next !== null ? next : prev.parentLayer;
    for (let k = 0; k < 2; k++) {
      const types = pxl.BOUNDARY_EVENTS[k], isPointer = k === 0;
      if (prev !== null) {
        this.queue(types[0], prev, to);
        for (let n = prev; pxl.isShapeOrGroup(n) && !(next !== null && n.contains(next)); n = n.parentContainer) {
          if (isPointer) this.setState(n, 'isHovered', false);
          this.queue(types[1], n, to);
        }
      } else {
        this.queue(types[0], from, next); // the layer, left for the shape
      }
      if (next === null) this.queue(types[2], to, prev); // the layer, entered from the shape
      if (next !== null) {
        this.queue(types[2], next, from);
        // Enter events go from the outermost node entered down to the shape: counted first, then filled backwards
        let count = 0;
        for (let n = next; pxl.isShapeOrGroup(n) && !(prev !== null && n.contains(prev)); n = n.parentContainer) count++;
        let i = this._queueLength + count;
        this._queueLength = i;
        for (let n = next; count > 0; count--, n = n.parentContainer) {
          if (isPointer) this.setState(n, 'isHovered', true);
          i--;
          this._queueTypes[i] = types[3];
          this._queueTargets[i] = n;
          this._queueRelated[i] = from;
        }
      }
    }
  }

  // A press starts on target (a shape, or null over empty space): isPressed on it and its groups
  press(target) {
    this.endPress();
    this._isPressStarted = true;
    this._isClickDecided = false;
    if (target === null) return;
    this._pressed = target;
    this.setChain(target, null, 'isPressed', true);
    // A release outside the stage doesn't reach it: window tells. Listening only while a press is held.
    window.addEventListener('pointerup', this._onWindowRelease, true);
    window.addEventListener('pointercancel', this._onWindowRelease, true);
    this._isReleaseListening = true;
  }

  endPress() {
    if (this._pressed !== null) {
      this.setChain(this._pressed, null, 'isPressed', false);
      this._pressed = null;
    }
    if (this._isReleaseListening) {
      window.removeEventListener('pointerup', this._onWindowRelease, true);
      window.removeEventListener('pointercancel', this._onWindowRelease, true);
      this._isReleaseListening = false;
    }
  }

  // Released outside the stage, cancelled or released under pointer capture: no click from Kilopixel
  cancelPress() {
    this.endPress();
    this._isPressStarted = false;
    this._isClickDecided = false;
    this._clickTarget = null;
  }

  // A shape or group that leaves the DOM gives up hover and press. The state passes to its nearest group that is
  // still in the page, which stays hovered or pressed without new enter events.
  releaseElement(el) {
    if (this._hovered !== null && el.contains(this._hovered)) this._hovered = this.release(this._hovered, el, 'isHovered');
    if (this._pressed !== null && el.contains(this._pressed)) this._pressed = this.release(this._pressed, el, 'isPressed');
    if (this._captured !== null && el.contains(this._captured)) this._captured = null;
    if (this._clickTarget !== null && el.contains(this._clickTarget)) this._clickTarget = null;
  }

  release(node, removed, key) {
    const parent = removed.parentContainer;
    this.setChain(node, parent, key, false);
    return pxl.isShapeOrGroup(parent) && parent.isConnected ? parent : null;
  }

  // The stage left the page: every state is cleared, without events (the DOM sends none to removed elements)
  reset() {
    if (this._hovered !== null) this.setChain(this._hovered, null, 'isHovered', false);
    this._hovered = null;
    this.cancelPress();
    this._captured = null;
    this._native = null;
    this._cacheHit = null;
    this._cacheFrame = -1;
    this.updateCursor(); // nothing hovered: removes the cursor from the canvases
    for (let i = 0; i < this._queueLength; i++) {
      this._queueTargets[i] = null;
      this._queueRelated[i] = null;
    }
    this._queueLength = 0;
  }

  // The hovered shape's CSS cursor (inherited from its groups and layer; [pxl-on-click] gives the hand, see
  // pxl.defaultStyles()), read in every hit test, so a class change shows while the pointer rests on the shape.
  // Written on the layer canvases, in their shadow roots, where no framework style binding overwrites it; '' (empty
  // space, or auto) removes it, so page CSS applies.
  updateCursor() {
    let cursor = '';
    if (this._hovered !== null) {
      cursor = this._hovered.cssStyle().cursor;
      if (cursor === 'auto') cursor = '';
    }
    if (cursor === this._cursor) return;
    this._cursor = cursor;
    const layers = this.stage.layers;
    for (let i = 0; i < layers.length; i++) layers[i].setCursor(cursor);
  }

  // --- Dispatch ---

  queue(type, target, related) {
    const i = this._queueLength++;
    this._queueTypes[i] = type;
    this._queueTargets[i] = target;
    this._queueRelated[i] = related;
  }

  // Dispatches the queued events. A listener that causes more events (a hover change, a dispatch on the canvas)
  // adds them to the queue, and this loop dispatches them too.
  flush() {
    if (this._isFlushing) return;
    this._isFlushing = true;
    for (let i = 0; i < this._queueLength; i++) {
      this.dispatch(this._queueTypes[i], this._queueTargets[i], this._queueRelated[i], this._native, null);
      this._queueTargets[i] = null; // no references kept to elements that may be removed
      this._queueRelated[i] = null;
    }
    this._queueLength = 0;
    this._isFlushing = false;
  }

  // Stops the browser's event at the stage and dispatches the same event on target instead: every listener sees one
  // event, with the shape as target (D4). preventDefault() on Kilopixel's event is passed on to the browser's.
  redispatch(e, target) {
    e.stopPropagation();
    if (!this.dispatch(e.type, target, null, e, e.constructor)) e.preventDefault();
  }

  // One new event object per dispatch, as the browser does: event fields are read-only, and frameworks and user
  // code may keep the object. The init object is reused. Returns false if a listener called preventDefault().
  dispatch(type, target, related, source, EventClass) {
    const init = this._init;
    if (source !== null) {
      const keys = pxl.EVENT_INIT_KEYS;
      for (let i = 0; i < keys.length; i++) init[keys[i]] = source[keys[i]];
    }
    if (type === 'pointermove' || type === 'mousemove') {
      // The browser's moves since the last frame, summed: drag code that adds up movementX loses nothing
      init.movementX = this._queuedMoveX;
      init.movementY = this._queuedMoveY;
    }
    // Enter and leave don't bubble and can't be cancelled; every other type does both
    const bubbles = type !== 'pointerenter' && type !== 'pointerleave' && type !== 'mouseenter' && type !== 'mouseleave';
    init.bubbles = bubbles;
    init.cancelable = bubbles;
    init.relatedTarget = related;
    if (EventClass === null) EventClass = type.charCodeAt(0) === 112 ? PointerEvent : MouseEvent; // 'p'ointer…
    const event = new EventClass(type, init);
    init.relatedTarget = null;
    const previous = this._dispatching;
    this._dispatching = event;
    const result = target.dispatchEvent(event); // a listener that throws is reported by the browser
    this._dispatching = previous;
    return result;
  }

  // --- Hit Testing ---

  // The topmost shape under the point (x, y) in stage units, or null. Walks the layers and their children in reverse
  // drawing order, so no list of shapes has to be kept or sorted; hidden layers and groups are skipped with
  // everything inside them. Uses the values of the last update: the picture on screen.
  findShapeAt(x, y) {
    pxl._hitX = x * this.stage.unit;
    pxl._hitY = y * this.stage.unit;
    const layers = this.stage.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.values.hidden) continue;
      // A layer is a real box on the page: CSS can hide it (display, visibility). Few layers, so reading them costs
      // little. Its pointer-events is not checked here: the shapes inherit it, and a shape with pointer-events: auto
      // inside a layer with none is hit, as in the DOM. Shapes are only read when they could be hit.
      const css = layer.cssStyle();
      if (css.display === 'none' || css.visibility === 'hidden') continue;
      const hit = this.findShapeIn(layer, x, y);
      if (hit) return hit;
    }
    return null;
  }

  findShapeIn(container, x, y) {
    const children = container.childList;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.values.hidden) continue;
      if (child.childList !== null) {
        // A group (also a layer nested in a layer, which the engine doesn't really support)
        const hit = this.findShapeIn(child, x, y);
        if (hit) return hit;
      } else if (child.draw && this.hitsShape(child, x, y)) {
        return child;
      }
    }
    return null;
  }

  // The box check first (cheap, rules out almost every shape), then the shape's CSS pointer-events (inherited from
  // its groups and layer), then the exact test: the shape's own drawing on pxl.dummyCtx, with its global matrix.
  // A shape that throws here is not hit; the dummy context is restored either way.
  // save() / restore() only around the exact test: about 1 µs per pair, which every shape would pay otherwise.
  hitsShape(shape, x, y) {
    try {
      if (!shape.mayContainPoint(x, y) || shape.cssStyle().pointerEvents === 'none') return false;
    } catch (error) {
      shape.reportError(error); // a custom getBoundingBox() that throws
      return false;
    }
    const ctx = pxl.dummyCtx;
    pxl._hitResult = false;
    ctx.save();
    try {
      // In logical units, like the layer: the global matrix scaled by u
      const m = shape.getGlobalMatrix(), u = this.stage.unit;
      ctx.setTransform(m[0] * u, m[1] * u, m[2] * u, m[3] * u, m[4] * u, m[5] * u);
      ctx.beginPath();
      // Shapes that can't express their hit area as a path (e.g. text) provide hitTest()
      if (shape.hitTest) shape.hitTest(ctx);
      else shape.draw(ctx);
    } catch (error) {
      shape.reportError(error);
      return false;
    } finally {
      ctx.restore();
    }
    return pxl._hitResult;
  }

  // --- Frame ---

  // Start of every frame (Stage.render()): the stage's pointer values, the hit test, hover states with their
  // boundary events, and one move event on the shape under a moving pointer. Presses, releases and clicks are
  // handled when they arrive (handleEvent()). Touches no layer: only readers of a changed state redraw.
  process() {
    const values = this.stage.values;
    const isPointerChanged = this._isMouseDirty;
    if (isPointerChanged) {
      pxl.markChanged(this.stage);
      this._isMouseDirty = false;
    }

    if (!values.isHovered || !this._isOverCanvas) {
      this.hover(null);
      this.updateCursor();
    } else {
      // A resting pointer is tested again at most every RESTING_HIT_INTERVAL ms: shapes may move under it, but a page
      // with many animated shapes shouldn't pay the walk in every frame (0.4–1 ms per 1,000 shapes, measured with
      // design/prototypes/2026-10-30_framework_compatibility/hit_walk_bench.html)
      const now = performance.now();
      if (isPointerChanged || now - this._lastHitTime >= pxl.RESTING_HIT_INTERVAL) {
        this._lastHitTime = now;
        this.hover(this.findShapeAt(values.mouseX, values.mouseY));
        this.updateCursor();
      }
    }

    // One move per frame on the shape under the pointer, like the browser's own frame-aligned moves. While a shape
    // holds pointer capture, the browser sends the moves to it itself.
    if (this._isMoved) {
      if (this._hovered !== null && this._captured === null) {
        this._queuedMoveX = this._moveX;
        this._queuedMoveY = this._moveY;
        this.queue('pointermove', this._hovered, null);
        this.queue('mousemove', this._hovered, null);
      }
      this._moveX = 0;
      this._moveY = 0;
      this._isMoved = false;
    }
    this.flush();
  }
};

// =========================================================================
// Performance Monitor
// =========================================================================

// The timer that publishes fps, renderAvg and renderMax of every stage once per second (Stage.publishMetrics()).
// Its own timer, not the frame loop: an idle page publishes 0 instead of keeping the last values. Runs while any stage
// is connected (pxl.stages, stage.js).
pxl.perf = {
  _timer: 0,
  _lastPublish: 0,

  // On every stage connect; starts the timer for the first one
  start: function() {
    if (pxl.perf._timer) return;
    pxl.perf._lastPublish = performance.now();
    pxl.perf._timer = setInterval(pxl.perf.publish, 1000);
  },

  // After the last stage left
  stop: function() {
    if (!pxl.perf._timer) return;
    clearInterval(pxl.perf._timer);
    pxl.perf._timer = 0;
  },

  publish: function() {
    // Divided by the real interval: timers in background tabs or after a long frame fire late
    const now = performance.now();
    const seconds = (now - pxl.perf._lastPublish) / 1000;
    pxl.perf._lastPublish = now;
    for (let i = 0; i < pxl.stages.length; i++) pxl.stages[i].publishMetrics(seconds);
  }
};

// Frame number, counted by every Stage.render(): per-frame state (_failedFrame, a layer's update frame) is stored as
// the frame it belongs to, so it never needs a reset
pxl._frame = 0;

// Every connected stage, in no particular order: a stage joins on connect and leaves on disconnect. Read by
// pxl.wakeReaders(), pxl.fontsArrived() and pxl.perf's timer.
pxl.stages = [];

// Default styles of stages, variables and shapes, in a cascade layer so that any page CSS wins over them, also CSS in
// the page's own cascade layers: the <style> goes first, and the layer declared first ranks lowest.
// :state(fallback): see Stage.markFallbackWidth().
// Shapes and groups draw on the canvas, not as elements: content written inside them (<pxl-text>{label}</pxl-text>
// in JSX) would otherwise appear as page text through the layer's <slot>. Content placed directly in a layer
// (accessible text, buttons) stays visible. The shape tags come from pxl.defineShape(), built-in and custom alike.
// The grid is out of hit testing: it covers the whole stage and would catch the pointer between its lines
// (design/done/2026-10-30_framework_compatibility_plan.md §23, E4). A page can set pointer-events: auto on it.
// Click and press handlers show the hand, like the browser's own rule for links (E1); the shapes inside a group
// inherit it. The cursor is otherwise only CSS: a framework listener gets the hand from cursor: pointer.
pxl.defaultStyles = function() {
  return `@layer pxl {
  pxl-stage { display: block; position: relative; width: 100%; }
  pxl-stage:state(fallback) { contain: inline-size; contain-intrinsic-inline-size: 300px; min-width: 0; }
  ${['pxl-var', 'pxl-group', ...pxl._shapeTags].join(', ')} { display: none; }
  pxl-grid { pointer-events: none; }
  [pxl-on-click], [pxl-on-down], [pxl-on-up] { cursor: pointer; }
}`;
};

// The tags defined by pxl.defineShape(), and every <style data-pxl> written so far
pxl._shapeTags = [];
pxl._styleElements = [];

// Once per document, and once per shadow root that holds a stage (document styles don't reach into it)
pxl.addDefaultStyles = function(root) {
  if (root.querySelector('style[data-pxl]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-pxl', '');
  style.textContent = pxl.defaultStyles();
  (root === document ? document.head : root).prepend(style);
  pxl._styleElements.push(style);
};

// A shape tag defined later (a custom shape's script) is hidden in every style written so far, too
pxl.hideShapeTag = function(tag) {
  pxl._shapeTags.push(tag);
  const text = pxl.defaultStyles();
  for (let i = 0; i < pxl._styleElements.length; i++) pxl._styleElements[i].textContent = text;
};

pxl.addDefaultStyles(document);

pxl.Stage = class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio', 'alwaysrender', 'id']; }

  // Browser events handled by the stage's InteractionEngine (its handleEvent). The second list is handled in the
  // capture phase, when the event arrives: over a shape, the browser's event is stopped there and dispatched on the
  // shape instead (design/done/2026-10-30_framework_compatibility_plan.md §4.1, D4).
  static POINTER_EVENTS = ['pointermove', 'pointerenter', 'pointerleave', 'gotpointercapture', 'lostpointercapture'];
  static ARRIVING_EVENTS = [
    'pointerdown', 'pointerup', 'pointercancel', 'pointerout', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'
  ];

  constructor() {
    super();
    // Before any field exists: own properties now were set before the upgrade (pxl.takeOwnProperties)
    const ownKeys = Object.keys(this);
    this.layers = [];
    this._variables = []; // stage-level <pxl-var>: inside the stage, outside every layer
    this._isOrderDirty = false;
    this._isUpdatePending = false;
    this._isRendering = false; // render() is running: it asks for the next frame itself when it ends
    this._isSizePending = true;
    this._isVisible = true;
    this.unit = 0;
    this._dpr = 1;
    this._resizeObserver = null;
    this._intersectionObserver = null;
    this._parsedRatio = 16 / 9;
    this._internals = null; // ElementInternals, attached when the stage first needs the fallback width
    this.registeredId = null; // the id under which pxl.nodes holds the values (pxl.registerNode())
    this._isRegistered = false; // connectedCallback has run: id changes from now on move the registry entry
    this.changeVersion = 0; // a source like any element: its pointer, size and monitor values (pxl.markChanged())

    // The update phase: the order of sources and the readers (pxl.UpdateScheduler, reactivity.js)
    this.scheduler = new pxl.UpdateScheduler(this);

    // Published as ref.<id>.* once per second (publishMetrics()); renderAvg / renderMax are strings with 2 decimals
    this.values = {
      mouseX: 500, mouseY: 500, isHovered: false, width: 1000, height: 1000 / this._parsedRatio,
      fps: 0, renderAvg: '0.00', renderMax: '0.00'
    };
    Object.defineProperty(this.values, '$node', { value: this, enumerable: false, writable: false });
    this.assigningRef = null; // what ref.<id> returns in handlers (pxl.handlerRef), created on first use

    // Properties set before the upgrade, applied in connectedCallback: [name, value, …] or null
    this._pendingProperties = ownKeys.length === 0 ? null : pxl.takeOwnProperties(this, ownKeys);

    // Frames, their total and longest time (ms) since the last publishMetrics()
    this._perfFrames = 0;
    this._perfAccumulated = 0;
    this._perfMax = 0;

    this._frameCallback = (t) => {
      this._isUpdatePending = false;
      this.render(t / 1000);
    };

    this.interaction = new pxl.InteractionEngine(this);
  }

  // Properties for frameworks (design/done/2026-10-30_framework_compatibility_plan.md §24). Unlike the other elements', they
  // write the attribute: a stage has two, set rarely, and the attribute path parses them. false, null and undefined
  // remove the attribute.
  get ratio() {
    return this._parsedRatio;
  }

  set ratio(value) {
    this.reflectAttribute('ratio', value);
  }

  get alwaysrender() {
    return this.isAlwaysRender();
  }

  set alwaysrender(value) {
    this.reflectAttribute('alwaysrender', value);
  }

  reflectAttribute(name, value) {
    if (value === false || value === null || value === undefined) this.removeAttribute(name);
    else this.setAttribute(name, value === true ? '' : String(value));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'id') {
      if (this._isRegistered) pxl.renameNode(this, oldValue, newValue);
    } else if (name === 'ratio') {
      // Bare or removed ratio falls back to the default 16 / 9
      this._parsedRatio = (newValue === null || newValue === '') ? 16 / 9 : pxl.parseAttributeValue(newValue);
      this.style.aspectRatio = this._parsedRatio;
      this.values.height = 1000 / this._parsedRatio;
      pxl.markChanged(this);
    } else if (name === 'alwaysrender') {
      if (this.isAlwaysRender()) {
        this._intersectionObserver?.disconnect();
        this._intersectionObserver = null;
        this._isVisible = true;
        this.requestRender();
      } else if (this.isConnected) {
        this.observeVisibility();
      }
    }
  }

  connectedCallback() {
    if (this._pendingProperties !== null) {
      const pending = this._pendingProperties;
      this._pendingProperties = null;
      pxl.setPendingProperties(this, pending);
    }
    this._isVisible = true;
    if (this.id) pxl.registerNode(this, this.id);
    this._isRegistered = true;

    // display, position and width come from pxl.defaultStyles(); the aspect ratio stays inline, because the
    // coordinate system depends on it
    const root = this.getRootNode();
    if (root instanceof ShadowRoot) pxl.addDefaultStyles(root);
    this.style.aspectRatio = this._parsedRatio;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    try {
      this._resizeObserver.observe(this, { box: 'device-pixel-content-box' });
    } catch (e) {
      this._resizeObserver.observe(this, { box: 'content-box' }); // Safari: no device-pixel-content-box
    }

    for (const type of pxl.Stage.POINTER_EVENTS) this.addEventListener(type, this.interaction);
    for (const type of pxl.Stage.ARRIVING_EVENTS) this.addEventListener(type, this.interaction, true);
    if (!pxl.stages.includes(this)) pxl.stages.push(this);
    pxl.perf.start();

    if (!this.isAlwaysRender()) this.observeVisibility();

    // A ResizeObserver needn't report an element that stays 0 × 0, so the width is also checked once here
    requestAnimationFrame(() => {
      if (this.isConnected && this.clientWidth === 0) this.markFallbackWidth();
    });
  }

  disconnectedCallback() {
    this._isRegistered = false;
    const id = this.registeredId;
    if (id !== null && pxl.nodes[id] === this.values) pxl.unregisterNode(id);
    this.registeredId = null;
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = null;
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
    this._isUpdatePending = false;
    this.interaction.reset(); // before the layers are dropped: it removes the cursor from their canvases
    this.layers = [];
    this._variables = [];
    this.scheduler.reset(); // its elements left with it: a stage inserted again builds its order anew

    for (const type of pxl.Stage.POINTER_EVENTS) this.removeEventListener(type, this.interaction);
    for (const type of pxl.Stage.ARRIVING_EVENTS) this.removeEventListener(type, this.interaction, true);
    pxl.removeFromArray(pxl.stages, this);
    if (pxl.stages.length === 0) pxl.perf.stop();

    // Checked again in the new place
    this._internals?.states.delete('fallback');
  }

  // A stage that is laid out but 0 px wide sits in a parent that sizes itself to its content (a centered flex or grid
  // item, inline-block, an absolute card): its layers are absolutely positioned and give it no width. The fallback
  // state makes it report 300 px like <canvas>. Only such stages get it: on every stage, that width would also keep
  // the flex and grid containers around a stage from shrinking below it.
  markFallbackWidth() {
    if (this.getClientRects().length === 0) return; // hidden (display: none): checked when it is shown
    try {
      this._internals ??= this.attachInternals();
      this._internals.states.add('fallback');
    } catch (e) {
      // Older browsers have no custom states (or only --dashed names): the stage stays 0 wide, as before
    }
  }

  // Bare attribute or "true": render even when scrolled out of view
  isAlwaysRender() {
    const value = this.getAttribute('alwaysrender');
    return value === 'true' || value === '';
  }

  // Pauses rendering while the stage is out of view
  observeVisibility() {
    if (this._intersectionObserver) return;
    this._intersectionObserver = new IntersectionObserver((entries) => {
      this._isVisible = entries[0].isIntersecting;
      if (this._isVisible) this.requestRender();
    });
    this._intersectionObserver.observe(this);
  }

  registerLayer(layer) {
    if (this.layers.includes(layer)) return;
    this.layers.push(layer);
    this._isOrderDirty = true;
    if (this._isSizePending) return;
    layer.resize(this.clientWidth, this.clientHeight, this._dpr);
    this.requestRender();
  }

  unregisterLayer(layer) {
    pxl.removeFromArray(this.layers, layer);
    this.requestRender();
  }

  registerVariable(variable) {
    if (this._variables.includes(variable)) return;
    this._variables.push(variable);
    this._isOrderDirty = true;
    this.requestRender();
  }

  unregisterVariable(variable) {
    pxl.removeFromArray(this._variables, variable);
  }

  resize() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w === 0) {
      this.markFallbackWidth();
      return;
    }

    this.unit = w / 1000;
    this.values.height = 1000 / this._parsedRatio;
    pxl.markChanged(this);

    this._dpr = window.devicePixelRatio;
    this._isSizePending = false;

    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].resize(w, h, this._dpr);
    }
    this.render(performance.now() / 1000);
  }

  invalidateLayers() {
    for (let i = 0; i < this.layers.length; i++) this.layers[i].invalidate();
  }

  // A change during a frame (the pointer and handlers at its start, the update phase) is drawn in that
  // frame: render() asks for the next one only when something is still animated or dirty at its end
  requestRender() {
    if (!this._isVisible || this._isSizePending || this._isUpdatePending || this._isRendering) return;
    this._isUpdatePending = true;
    requestAnimationFrame(this._frameCallback);
  }

  // Two phases: everything is evaluated first (update), then the layers draw. A reader drawn before its target then
  // sees the target's value of this frame, whatever the DOM order.
  render(t) {
    const start = performance.now();
    pxl._frame++;
    this._isRendering = true;
    try {
      this.runFrame(t);
    } finally {
      this._isRendering = false; // whatever happened, the stage must be able to ask for frames again
    }
    if (this.needsNextFrame()) this.requestRender();

    const ms = performance.now() - start;
    this._perfAccumulated += ms;
    if (ms > this._perfMax) this._perfMax = ms;
    this._perfFrames++;
  }

  // Called once per second by pxl.perf's timer: publishes fps, renderAvg and renderMax (ref.<id>.*) and starts counting
  // anew. seconds is the real time since the last publish: timers in background tabs or after a long frame fire late.
  publishMetrics(seconds) {
    const values = this.values;
    const frames = this._perfFrames;
    values.fps = seconds > 0 ? Math.round(frames / seconds) : 0;
    values.renderAvg = (frames > 0 ? this._perfAccumulated / frames : 0).toFixed(2);
    values.renderMax = this._perfMax.toFixed(2);
    pxl.markChanged(this);
    this._perfFrames = 0;
    this._perfAccumulated = 0;
    this._perfMax = 0;
  }

  runFrame(t) {
    // Pointer first: mark the stage's pointer values changed, hit-test against the picture on screen, update the
    // hover / press states and run the handlers. Their readers are then drawn in this frame, not the next one
    // (design/done/2026-11-17_pointer_frame_order_plan.md).
    this.interaction.process();

    if (this._isOrderDirty) {
      this.layers.sort(pxl.sortByDOMPosition);
      this._variables.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    // Update phase, part 1: the sources in their order, sources before readers wherever they are (also hidden)
    this.scheduler.evaluateSources(t);

    // Part 2, the walk: every other expression with t. Stage-level variables, then the layers that changed or have
    // animated content (the clock must notice the next second).
    for (let i = 0; i < this._variables.length; i++) {
      this._variables[i].update(t);
    }
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.isDirty || layer.hasAnimatedContent) layer.update(t);
    }

    // Part 3: the reactive values that nobody reads, when a source changed
    this.scheduler.updateReaders();

    // Draw phase: only layers whose pixels are out of date, or whose CSS changed
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.needsRender()) layer.render(this.unit);
    }
  }

  // The keep-alive (design/done/2026-11-20_evaluation_model_plan.md, step 2): the next frame while anything is animated,
  // or a layer is still dirty (one whose update failed keeps its request)
  needsNextFrame() {
    for (let i = 0; i < this._variables.length; i++) {
      if (this._variables[i].isAnimated) return true;
    }
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.hasAnimatedContent || layer.isDirty) return true;
    }
    return false;
  }
};

customElements.define('pxl-stage', pxl.Stage);

pxl.PxlNode = class PxlNode extends HTMLElement {
  // Attribute defaults per class (read-only). Subclasses extend them: { ...Parent.defaults, ... }.
  // Also used to resolve bare / removed attributes (pxl.resolveEmptyAttribute).
  static defaults = {};
  // Attributes read as templates (pxl.parseTemplate): text where only ${…} is code. Text has ['text']; custom shapes
  // may list their own text attributes.
  static templateAttributes = [];

  // Every key of defaults is an attribute. The browser reads this once, at define time, with this = the class being
  // defined, so one getter serves every subclass, custom shapes included.
  static get observedAttributes() {
    return [...Object.keys(this.defaults), 'id'];
  }

  constructor() {
    super();
    // Before any field exists: own properties now were set before the upgrade (pxl.takeOwnProperties)
    const ownKeys = Object.keys(this);
    pxl.defineAccessors(this.constructor);

    this.expressions = {};
    this.values = {};
    Object.defineProperty(this.values, '$node', { value: this, enumerable: false, writable: false });
    // Drawn origin in the parent space: dx / dy are applied after rotate / scale / skew, so it's the local matrix translation
    Object.defineProperty(this.values, 'tx', { get: () => this.getLocalMatrix()[4], enumerable: false });
    Object.defineProperty(this.values, 'ty', { get: () => this.getLocalMatrix()[5], enumerable: false });
    Object.assign(this.expressions, this.constructor.defaults);
    Object.assign(this.values, this.constructor.defaults);

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
    this.isAnimated = false;

    // Versions (pxl._changeCounter): the count at this element's last change that someone reads, and at the last
    // evaluation of its reactive values. A source with a newer version makes them out of date (isOutOfDate()).
    this.changeVersion = 0;
    this._seenVersion = 0;
    // The ids the reactive values read, and whether any expression uses toLocal(); collected when the expressions
    // change (collectSources()), so the check per frame touches one array instead of every expression
    this.sourceIds = [];
    this.hasToLocal = false;
    // Frame in which evaluateAnimations() last ran: a source in the stage's order is evaluated before the walk,
    // which then skips it
    this._evaluatedFrame = -1;
    // The stage whose update phase evaluates the element (null while not connected). Written by the stage: the stage
    // whose reader list holds the element (it drops removed readers in its next pass), and whether the element is a
    // source in the stage's order (UpdateScheduler.buildOrder())
    this.readerStage = null;
    this.listedIn = null;
    this.isOrderNode = false;

    // The children of a layer or group (set there); null for shapes and variables. A field on every node, so the hit
    // walk and the matrix walk read an own property instead of searching HTMLElement's prototype chain for it.
    this.childList = null;

    // Set in connectedCallback
    this.parentLayer = null;
    this.parentContainer = null;
    this.registeredId = null; // the id under which pxl.nodes holds the values (pxl.registerNode())
    this.assigningRef = null; // what ref.<id> returns in handlers (pxl.handlerRef), created on first use
    // connectedCallback has run: an id that changes from now on is moved in the registry by attributeChangedCallback.
    // During an upgrade the attributes arrive before connectedCallback, which registers the id itself.
    this._isRegistered = false;

    // Frame (pxl._frame) in which the update phase failed for this element: the draw phase of that frame skips it.
    // A frame number needs no reset, unlike a boolean.
    this._failedFrame = -1;

    // Matrices are recomputed lazily: a version counter per matrix tells children when to recompute theirs
    this._localMatrix = pxl.Matrix.create();
    this._globalMatrix = pxl.Matrix.create();
    this._isLocalMatrixDirty = true;
    this._localMatrixVersion = 0;
    this._lastLocalMatrixVersion = -1;
    this._globalMatrixVersion = 0;
    this._lastParentMatrixVersion = -1;
    // Inverse of the global matrix for hit testing, created on first use: most elements are never hit-tested
    this._inverseMatrix = null;
    this._inverseMatrixVersion = -1;

    // The element's computed CSS (pointer-events, cursor), created on first use; the browser keeps it up to date
    this._cssStyle = null;

    // Scaled filter string, cached per (filter, scale) by resolveFilter() (layers and shapes)
    this._lastFilterRaw = null;
    this._lastFilterU = 0;
    this._cachedFilterScaled = 'none';

    // Errors already reported by reportError()
    this._lastError = null;
    this._lastErrorMessage = null;
    this._errorCount = 0;

    // Properties set before the upgrade, applied in connectedCallback: [name, value, …] or null
    this._pendingProperties = ownKeys.length === 0 ? null : pxl.takeOwnProperties(this, ownKeys);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    // id is observed for the registry (frameworks such as Angular or Alpine set it after insertion), not drawn
    if (name === 'id') {
      if (this._isRegistered) pxl.renameNode(this, oldValue, newValue);
      return;
    }
    // pxl-on-* handlers (shapes and groups observe them) are listeners, not values
    if (pxl.HANDLER_EVENTS[name] !== undefined) {
      this.setHandler(name, newValue);
      return;
    }
    this.setValue(name, newValue);
  }

  // --- Values ---

  // One path for attributes and properties (the accessors of pxl.defineAccessors()). A string is compiled like an
  // attribute (null: removed, the default); any other value is stored as it is, without parsing or compiling.
  // The same parsed value again changes nothing: frameworks and hydration set unchanged values again.
  setValue(name, value) {
    if (value === this.expressions[name]) return;
    if (typeof value === 'function') {
      pxl.warnFunctionValue(this, name);
      return;
    }
    if (value === null || typeof value === 'string') pxl.compileAttribute(this, name, value);
    else pxl.storeValue(this, name, value);
    this.valueChanged(name);
  }

  // After a value changed: the animation state, the matrix, readers and the layer
  valueChanged(name) {
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (pxl.isSpatialKey(name)) this.setLocalMatrixDirty();
    pxl.markChanged(this);
    if (this.affectsPixels(name)) {
      this.parentLayer?.invalidate();
    } else {
      this.compositingChanged();
      // Nothing to redraw, but an animated value must be evaluated in the next frames (a hidden shape, a variable)
      if (this.isAnimated) this.parentLayer?.wake();
    }
  }

  // Whether a changed value changes the pixels of the layer. A hidden element draws nothing, so only its hidden
  // counts; it is still evaluated, so ref.* to it stays current. A layer (its alpha, blend and filter are CSS on its
  // canvas) and a variable (its readers redraw their own layers) override it.
  affectsPixels(key) {
    return key === 'hidden' || !this.values.hidden;
  }

  // A changed value that leaves the pixels as they are but needs new CSS: only a layer has such values
  compositingChanged() {}

  connectedCallback() {
    if (this._pendingProperties !== null) {
      const pending = this._pendingProperties;
      this._pendingProperties = null;
      pxl.setPendingProperties(this, pending);
    }

    this.parentLayer = this.closest('pxl-layer');
    // No parent element directly in a shadow root (a Lit or web component template): then there is no container
    const parent = this.parentElement;
    this.parentContainer = parent === null ? null : parent.closest('pxl-group, pxl-layer');
    this._lastParentMatrixVersion = -1; // a new parent's version may equal the old one's
    this.parentContainer?.registerChild(this);
    this.readerStage = this.closest('pxl-stage');

    // Reactive attributes are evaluated now: their refs and toLocal() need the element in the DOM. Not counted as a
    // change: the element isn't registered yet, and registering it below tells its readers.
    this.evaluateReactive();
    this.collectSources();
    if (this.hasToLocal) pxl._orderVersion++; // a toLocal() reader is a source in its stage's order
    if (this.id) pxl.registerNode(this, this.id);
    this._isRegistered = true;
  }

  disconnectedCallback() {
    this._isRegistered = false;
    const id = this.registeredId;
    if (id !== null && pxl.nodes[id] === this.values) pxl.unregisterNode(id);
    this.registeredId = null;
    if (this.isOrderNode) pxl._orderVersion++;
    this.readerStage = null;
    this.parentContainer?.unregisterChild(this);
  }

  // --- Reactive Values ---
  // Design: design/done/2026-11-20_evaluation_model_plan.md

  // Called on connect and when an expression changes (pxl.expressionsChanged()): collects the ids the reactive values
  // read, and puts the element in its stage's reader list when it has reactive values or uses toLocal()
  collectSources() {
    const ids = this.sourceIds;
    ids.length = 0;
    const keys = this.reactiveAttributeKeys;
    for (let i = 0; i < keys.length; i++) {
      const sources = this.expressions[keys[i]].sourceIds;
      for (let j = 0; j < sources.length; j++) {
        if (!ids.includes(sources[j])) ids.push(sources[j]);
      }
    }
    this.hasToLocal = this.anyUsesToLocal(keys) || this.anyUsesToLocal(this.animatedAttributeKeys);
    if (keys.length > 0 || this.hasToLocal) this.readerStage?.scheduler.addReader(this);
  }

  anyUsesToLocal(keys) {
    for (let i = 0; i < keys.length; i++) {
      if (this.expressions[keys[i]].usesToLocal) return true;
    }
    return false;
  }

  // Whether a source changed since the reactive values were last evaluated. toLocal() results also depend on the
  // containers above both elements, so they are evaluated in every frame that runs.
  isOutOfDate() {
    if (this.hasToLocal) return true;
    const seen = this._seenVersion;
    if (pxl._registryVersion > seen) return true;
    const ids = this.sourceIds;
    for (let i = 0; i < ids.length; i++) {
      const values = pxl.nodes[ids[i]];
      if (values !== undefined && values.$node.changeVersion > seen) return true;
    }
    return false;
  }

  // Evaluates the reactive values; returns whether one changed
  evaluateReactive() {
    let changed = false;
    let pixelsChanged = false;
    let matrixDirtied = false;
    const keys = this.reactiveAttributeKeys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.expressions[key].call(this, 0);
      if (this.values[key] !== newVal) {
        this.values[key] = newVal;
        changed = true;
        if (this.affectsPixels(key)) pixelsChanged = true;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }
    this._seenVersion = pxl._changeCounter;
    if (!changed) return false;

    if (matrixDirtied) this.setLocalMatrixDirty();
    pxl.markChanged(this);
    if (pixelsChanged) this.parentLayer?.invalidate();
    else this.compositingChanged();
    return true;
  }

  // Update phase. An element that reads itself sees its own new values in the same frame: one more round when a
  // value changed.
  updateReactive() {
    try {
      if (this.evaluateReactive() && this.readsItself()) this.evaluateReactive();
    } catch (error) {
      this._seenVersion = pxl._changeCounter; // tried again when a source changes
      this.reportError(error);
    }
  }

  readsItself() {
    return this.registeredId !== null && this.sourceIds.includes(this.registeredId);
  }

  // Part 1 of the update phase (UpdateScheduler.evaluateOrder()), before the walk, which then skips the element's values with
  // t. A failed evaluation skips the element in both phases, as in the walk.
  updateAsSource(t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
      return;
    }
    if (this.isOutOfDate()) this.updateReactive();
  }

  evaluateAnimations(t) {
    // Keeps the stage's frame loop running while anything in the layer is animated (a layer is its own parentLayer),
    // also when the evaluation below fails: an error that depends on t may go away
    if (this.isAnimated) this.parentLayer?.markAnimated();
    // A source in the stage's order was evaluated before the walk (UpdateScheduler.evaluateOrder())
    if (this._evaluatedFrame === pxl._frame) return false;
    this._evaluatedFrame = pxl._frame;

    let animatedValuesChanged = false;
    let pixelsChanged = false;
    let matrixDirtied = false;
    const keys = this.animatedAttributeKeys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.expressions[key].call(this, t);
      if (this.values[key] !== newVal) {
        this.values[key] = newVal;
        animatedValuesChanged = true;
        if (this.affectsPixels(key)) pixelsChanged = true;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }

    if (matrixDirtied) this.setLocalMatrixDirty();

    if (animatedValuesChanged) pxl.markChanged(this);

    // Only a value that changed redraws the layer: a clock showing floor(t) redraws once per second, a finished
    // clamp() animation not at all (design/done/2026-11-20_evaluation_model_plan.md, step 2)
    if (pixelsChanged) this.parentLayer?.invalidate();
    else if (animatedValuesChanged) this.compositingChanged();

    return animatedValuesChanged;
  }

  // --- Errors ---

  // An element that throws while evaluating or drawing is skipped for this frame instead of breaking the frame.
  // Warns once per distinct message and at most 3 times per element: a message that contains a changing value
  // (an animated negative radius in a custom shape's arc()) would otherwise warn in every frame.
  // An animated element keeps the frames coming (evaluateAnimations() marks it before evaluating), so an error that
  // depends on t can recover.
  reportError(error) {
    // The same error object again (a gradient that failed before): nothing new to report or allocate
    if (error === this._lastError) return;
    this._lastError = error;
    const message = String(error);
    if (message === this._lastErrorMessage || this._errorCount === 3) return;
    this._lastErrorMessage = message;
    this._errorCount++;
    const more = this._errorCount === 3 ? ' (further errors of this element are not shown)' : '';
    console.warn(`[pxl] ${pxl.describe(this)} skipped: ${message}${more}`);
  }

  // --- Handlers ---

  // A pxl-on-* attribute becomes a listener for its DOM event (pxl.HANDLER_EVENTS), so it runs in the DOM's order
  // with framework listeners and bubbles from shapes to their groups. Removed or empty: no listener.
  // Only shapes and groups observe these attributes; they keep the listeners in this.handlers.
  setHandler(name, source) {
    const type = pxl.HANDLER_EVENTS[name];
    if (this.handlers[type] !== null) this.removeEventListener(type, this.handlers[type]);
    this.handlers[type] = source ? pxl.compileHandler(this, name, source) : null;
    if (this.handlers[type] !== null) this.addEventListener(type, this.handlers[type]);
  }

  // Filter string with the helpers' px values scaled: by u for a layer's CSS filter (CSS pixels), by u × DPR for a
  // shape's ctx.filter (bitmap pixels)
  resolveFilter(filter, u) {
    const filterStr = Array.isArray(filter) ? filter.join(' ') : filter;
    if (this._lastFilterRaw !== filterStr || this._lastFilterU !== u) {
      this._lastFilterRaw = filterStr;
      this._lastFilterU = u;
      this._cachedFilterScaled = pxl.scaleResponsiveFilter(filterStr, u);
    }
    return this._cachedFilterScaled;
  }

  // --- Matrix ---

  // Read lazily: getGlobalMatrix() of the element and of everything inside notices the new version. toLocal()
  // readers need no notice: they are evaluated in every frame that runs (isOutOfDate()).
  setLocalMatrixDirty() {
    this._isLocalMatrixDirty = true;
  }

  // --- Lazy Matrices ---

  getLocalMatrix() {
    if (this._isLocalMatrixDirty) {
      const v = this.values;
      const sX = v.zoom * v.scalex;
      const sY = v.zoom * v.scaley;
      pxl.Matrix.updateLocal(this._localMatrix, v.x, v.y, v.dx, v.dy, v.rotate, sX, sY, v.skewx, v.skewy);
      this._isLocalMatrixDirty = false;
      this._localMatrixVersion++;
    }
    return this._localMatrix;
  }

  getGlobalMatrix() {
    const local = this.getLocalMatrix();
    let isDirty = this._lastLocalMatrixVersion !== this._localMatrixVersion;
    this._lastLocalMatrixVersion = this._localMatrixVersion;

    if (this.parentContainer) {
      const parentGlobal = this.parentContainer.getGlobalMatrix(); // updates the parent's version first
      const parentVersion = this.parentContainer._globalMatrixVersion;
      if (this._lastParentMatrixVersion !== parentVersion) {
        this._lastParentMatrixVersion = parentVersion;
        isDirty = true;
      }
      if (isDirty) pxl.Matrix.multiply(this._globalMatrix, parentGlobal, local);
    } else if (isDirty) {
      this._globalMatrix.set(local);
    }

    if (isDirty) this._globalMatrixVersion++;
    return this._globalMatrix;
  }

  // Maps stage coordinates into the element's own space (hit testing). Inverted again only when the global matrix
  // changed; a singular matrix (zoom 0) gives the identity, and the exact hit test then finds nothing.
  getInverseGlobalMatrix() {
    const global = this.getGlobalMatrix();
    if (this._inverseMatrix === null) this._inverseMatrix = pxl.Matrix.create();
    if (this._inverseMatrixVersion !== this._globalMatrixVersion) {
      pxl.Matrix.invert(this._inverseMatrix, global);
      this._inverseMatrixVersion = this._globalMatrixVersion;
    }
    return this._inverseMatrix;
  }

  // --- CSS ---

  // The live computed style, kept per element: getComputedStyle() returns a new object on every call. Reading a
  // property costs about 1 µs, so the engine reads it only where needed (hit testing: layers and candidate shapes).
  cssStyle() {
    if (this._cssStyle === null) this._cssStyle = getComputedStyle(this);
    return this._cssStyle;
  }
};


// Nested layers already warned about (Layer.connectedCallback())
pxl._nestedLayerWarnings = new WeakSet();

pxl.Layer = class Layer extends pxl.PxlNode {
  static defaults = { ...pxl.TRANSFORM_DEFAULTS, alpha: 1, blend: 'source-over', filter: 'none', hidden: false };

  // :host styles have the lowest priority, so page CSS on pxl-layer wins
  static STYLES = ':host { display: block; position: absolute; inset: 0; } ' +
                  'canvas { display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; }';

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position

    // Pixels out of date: something in the layer changed since its last draw
    this.isDirty = true;
    this._isCanvasEmpty = false;

    // Something in the layer was animated in its last update (markAnimated()): the stage walks it in the next frame
    // and keeps its frame loop running. Recomputed in every update, never counted (elements come and go).
    this._animatedFrame = -1;
    this.hasAnimatedContent = false;
    this.stage = null;
    this.dpr = 1; // set by the stage; isolated shapes read it (Shape.renderIsolated())

    // The canvas lives in the layer's shadow root: replacing the layer's children (innerHTML, htmx, frameworks)
    // can't remove it, and the light DOM holds only what the page wrote. The slot shows the light-DOM children;
    // shapes draw nothing as elements, but text or buttons placed in a layer for accessibility need it.
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    const style = document.createElement('style');
    style.textContent = pxl.Layer.STYLES;
    this.attachShadow({ mode: 'open' }).append(style, this._canvas, document.createElement('slot'));

    // Compositing is CSS on the canvas element; only written when it changes
    this._lastAlpha = null;
    this._lastBlend = null;
    this._lastAppliedFilter = 'none';
    this._isCompositingDirty = false; // alpha, blend or filter changed from outside: new CSS, same pixels
  }

  connectedCallback() {
    // Layers don't nest: a layer's content shows through its <slot>, above its canvas, so a nested layer's canvas
    // covers the outer one's (an opaque background in it hides everything). Warned once per element.
    const outer = this.parentElement === null ? null : this.parentElement.closest('pxl-layer');
    if (outer !== null && !pxl._nestedLayerWarnings.has(this)) {
      pxl._nestedLayerWarnings.add(this);
      console.warn(`[pxl] ${pxl.describe(this)} is inside another layer, ${pxl.describe(outer)}: layers don't nest, and ` +
        'its canvas covers the outer one. Place it next to the other layer (layers stack in DOM order).');
    }
    this.stage = this.closest('pxl-stage');
    this.stage?.registerLayer(this);

    super.connectedCallback();
    this.invalidate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.unregisterLayer(this);
    this.stage = null;
    this.isDirty = false;
  }

  // Called once per connect (PxlNode.connectedCallback); no includes() check, which made inserting n children quadratic
  registerChild(child) {
    this.childList.push(child);
    this._isOrderDirty = true;
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }

  // Called by the layer itself and by everything inside it
  invalidate() {
    this.isDirty = true;
    // A hidden layer renders once more to clear its canvas, then stays idle. The current value, not the expression:
    // a reactive hidden is a function, which would keep the layer idle after it turned false.
    if (this.values.hidden && this._isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // alpha, blend and filter are CSS on the canvas: render() writes the new CSS and keeps the pixels (the CSS-only
  // path), whether they are animated or set from outside (a property, setAttribute(), a ref)
  affectsPixels(key) {
    return key !== 'alpha' && key !== 'blend' && key !== 'filter';
  }

  compositingChanged() {
    this._isCompositingDirty = true;
    this.stage?.requestRender();
  }

  // Called by every animated element inside while it is evaluated (PxlNode.evaluateAnimations()), the layer included
  markAnimated() {
    this._animatedFrame = pxl._frame;
  }

  // An element inside became animated without a change to draw (a hidden shape, a variable): the stage walks the
  // layer in the next frame, whose update then finds it animated
  wake() {
    this.hasAnimatedContent = true;
    this.stage?.requestRender();
  }

  // The cursor over this layer's canvas (InteractionEngine.updateCursor()). On the canvas in the shadow root, so
  // the page's and frameworks' styles on the layer and stage are never overwritten; '' removes it.
  setCursor(cursor) {
    this._canvas.style.cursor = cursor;
  }

  // Called by the stage on every resize (also when the window moves to a screen with another pixel ratio).
  // Setting the canvas size resets the context, so the DPR scale is applied again.
  resize(w, h, dpr) {
    this.dpr = dpr;
    this._canvas.width = Math.floor(w * dpr);
    this._canvas.height = Math.floor(h * dpr);
    this._ctx.scale(dpr, dpr);
    this.invalidate();
  }

  // Update phase: evaluates the layer and its children. A value that changes the pixels makes the layer dirty
  // (evaluateAnimations()); every animated element marks it, so the stage keeps it in the next frame.
  update(t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    // A failing expression skips the layer with its children for this frame; it keeps its previous pixels and
    // stays dirty, so the stage tries again in the next frame
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
    }

    // A hidden layer doesn't evaluate its children: their values that follow t stay as they are until it is shown
    if (this._failedFrame !== pxl._frame && !this.values.hidden) {
      for (let i = 0; i < this.childList.length; i++) {
        this.childList[i].update(t);
      }
    }
    this.hasAnimatedContent = this._animatedFrame === pxl._frame;
  }

  // Draw in this frame: pixels out of date (also by a reader evaluated after this layer's update, in part 3 of the
  // update phase: its values are already set), or new compositing CSS to write
  needsRender() {
    return this.isDirty || this._isCompositingDirty;
  }

  // Draw phase
  render(u) {
    if (this._failedFrame === pxl._frame) return;

    const { alpha, blend, filter, hidden } = this.values;

    if (this._lastAlpha !== alpha) {
      this._canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }

    const cssBlend = blend === 'source-over' ? 'normal' : (blend === 'lighter' ? 'plus-lighter' : blend);
    if (this._lastBlend !== cssBlend) {
      this._canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    const filterStr = filter === 'none' ? 'none' : this.resolveFilter(filter, u);
    if (this._lastAppliedFilter !== filterStr) {
      this._canvas.style.filter = filterStr;
      this._lastAppliedFilter = filterStr;
    }
    this._isCompositingDirty = false;

    // CSS-only path: only compositing changed (or nothing), so the pixels stay the same
    if (!this.isDirty) return;
    this.isDirty = false;

    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width / this.dpr, this._canvas.height / this.dpr);

    if (hidden) {
      this._isCanvasEmpty = true;
      return;
    }

    this._isCanvasEmpty = false;

    // Everything inside draws in logical units: the one scale by u for the whole layer
    // (design/done/2026-11-20_custom_shapes_plan.md §5.3, phase 2). u goes on for shadows and filters only.
    ctx.save();
    ctx.scale(u, u);
    if (pxl.hasTransform(this.values)) pxl.applyTransformState(ctx, this.values);
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u);
    }
    ctx.restore();
  }
};
customElements.define('pxl-layer', pxl.Layer);
pxl.Group = class Group extends pxl.PxlNode {
  // The pxl-on-* handlers are attributes without a value, so they aren't in defaults
  static get observedAttributes() {
    return [...super.observedAttributes, ...Object.keys(pxl.HANDLER_EVENTS)];
  }

  static defaults = { ...pxl.TRANSFORM_DEFAULTS, hidden: false };

  constructor() {
    super();
    // Runtime state written by the interaction engine: true while a shape inside the group is hovered or pressed,
    // like :hover on a parent. Values (ref.<id>.isHovered), but not attributes
    this.values.isHovered = false;
    this.values.isPressed = false;

    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position
    this.stage = null; // set in connectedCallback
    // pxl-on-* listeners by DOM event type (PxlNode.setHandler()): events from the shapes inside bubble up to them
    this.handlers = pxl.createHandlers();
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.releaseElement(this);
  }

  // Called once per connect (PxlNode.connectedCallback); no includes() check, which made inserting n children quadratic
  registerChild(child) {
    this.childList.push(child);
    this._isOrderDirty = true;
    this.parentLayer?.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  // Update phase. A failing expression skips the group with its children for this frame (also in the draw phase).
  // A hidden group doesn't evaluate its children: their values that follow t stay as they are until it is shown.
  update(t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
      return;
    }

    // Also when it failed as a source in part 1 of the update phase (PxlNode.updateAsSource())
    if (this._failedFrame === pxl._frame || this.values.hidden) return;
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].update(t);
    }
  }

  // Draw phase, into the parent layer's canvas
  render(ctx, u) {
    if (this._failedFrame === pxl._frame || this.values.hidden) return;

    const hasTransform = pxl.hasTransform(this.values);
    if (hasTransform) {
      ctx.save();
      pxl.applyTransformState(ctx, this.values);
    }
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u);
    }
    if (hasTransform) ctx.restore();
  }
};
customElements.define('pxl-group', pxl.Group);

// =========================================================================
// Arrowhead Geometry (design/done/2026-10-14_unified_arrowhead_geometry_plan.md)
// =========================================================================
pxl.ARROW_COS30 = Math.cos(Math.PI / 6); // arrowhead half-angle is 30°
pxl.ARROW_SIN30 = 0.5;
pxl.ARROW_K_DEPTH = 0.6;                 // min shaft depth inside a filled head, as fraction of head length

// Side length of an arrowhead in logical units for an arrowstart / arrowend value: 'auto' is 3.6 × strokewidth;
// 0 (also for a negative or invalid value) means no arrowhead
pxl.arrowSize = function(value, strokewidth) {
  const size = value === 'auto' ? strokewidth * 3.6 : value;
  return size > 0 ? size : 0;
};

// Per-arrow-end record, allocated once per shape and reused every frame. All fields start as doubles
// so V8 keeps one stable hidden class for every arrow shape.
pxl.createArrowRecord = function() {
  return { size: NaN, len: NaN, tipAdvance: NaN, inset: NaN, tipX: NaN, tipY: NaN, dirX: NaN, dirY: NaN };
};

// =========================================================================
// Line Dash
// =========================================================================
pxl._emptyDash = [];

// Solid line: null (default), 'none' or 0
pxl.hasLineDash = function(linedash) {
  return !!linedash && linedash !== 'none' && linedash !== '0';
};

// =========================================================================
// pxl.Shape
// =========================================================================
pxl.Shape = class Shape extends pxl.PxlNode {
  // The pxl-on-* handlers are attributes without a value, so they aren't in defaults
  static get observedAttributes() {
    return [...super.observedAttributes, ...Object.keys(pxl.HANDLER_EVENTS)];
  }

  static defaults = {
    ...pxl.TRANSFORM_DEFAULTS,
    fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0,
    alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false
  };

  constructor() {
    super();
    // Runtime state written by the interaction engine, read as ref.<id>.isHovered: values, but not attributes
    this.values.isHovered = false;
    this.values.isPressed = false;

    this.stage = null; // set in connectedCallback

    // Reused by getBoundingBox() every frame
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };

    // The CanvasGradients of the fill ([0]) and the stroke ([1]), each reused while nothing changed (createGradient())
    this._gradients = [new pxl.GradientSlot(false), new pxl.GradientSlot(true)];

    // A dash written as one number, as the array setLineDash() needs (applyLineDash())
    this._singleDash = [0];

    // pxl-on-* listeners by DOM event type (PxlNode.setHandler())
    this.handlers = pxl.createHandlers();
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.releaseElement(this);
  }

  // Update phase. A hidden shape still evaluates, so ref.* to it stays current.
  update(t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
    }
  }

  // Draw phase. Every shape draws in its own canvas state: whatever it changes or throws, the next shape starts clean.
  // draw() works in logical units (design/done/2026-11-20_custom_shapes_plan.md §5.3): the layer has scaled the
  // context by u, so every length is written as the attribute gives it. u is only passed on for what ignores the
  // transform: shadows and canvas filters (applyCompositingState()). draw() gets no time: time-dependent values are
  // evaluated in update(), so the hit test sees what is drawn.
  render(ctx, u) {
    if (this._failedFrame === pxl._frame || this.values.hidden) return;
    if (this.needsIsolation()) {
      this.renderIsolated(ctx, u);
      return;
    }
    ctx.save();
    try {
      pxl.applyContextState(ctx, u, this.values, this);
      this.draw(ctx);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  }

  // --- Isolated Compositing ---
  // (design/done/2026-11-01_isolated_shape_compositing_plan.md)
  // The canvas composites every draw call on its own, so a shape that draws more than once (fill and stroke,
  // arrowheads, text lines) would mask, blend, filter or shadow its own earlier parts. Such a shape draws into the
  // scratch canvas instead, which then goes onto the layer once, with the shape's compositing state.

  // State that acts on the whole shape. alpha is left out: fades are common and isolating them costs a frame time
  // the per-call result hardly shows (plan §6.1).
  hasCompositingState() {
    const { mask, blend, filter, shadowcolor } = this.values;
    return mask !== 'none' || blend !== 'source-over' || filter !== 'none' ||
           (!!shadowcolor && shadowcolor !== 'none' && shadowcolor !== 'transparent');
  }

  needsIsolation() {
    return this.hasCompositingState() && this.drawsMoreThanOnce();
  }

  // The built-in shapes answer from the values they draw with. A custom shape's draw() is unknown, so it counts as
  // drawing more than once; one that draws once can override this or needsIsolation() (plan §3.5).
  drawsMoreThanOnce() {
    return true;
  }

  // The rule of the path shapes: a fill and a stroke, or arrowheads (one more call in drawArrows())
  fillsAndStrokesOrHasArrows() {
    return (this.hasFill() && this.isStroked()) || this.hasArrowheads();
  }

  // Only lines, polylines, circles and ellipses have arrowstart
  hasArrowheads() {
    const { arrowstart, arrowend, strokewidth } = this.values;
    return arrowstart !== undefined && this.isStroked() &&
           (pxl.arrowSize(arrowstart, strokewidth) > 0 || pxl.arrowSize(arrowend, strokewidth) > 0);
  }

  // Draws with the shape's global matrix (the same pixels as the layer's transform chain, plan §3.4) into the scratch
  // canvas, only within the shape's device box, then composites that box with an identity transform: canvas shadows
  // and filters ignore the transform, so offsets and blur sizes stay as on the direct path, and they may reach beyond
  // the box. Masks that erase outside the drawn image (destination-in, copy, …) still do: the canvas treats the area
  // outside it as transparent. The GPU work then depends on the shape's size, not the layer's: a shadow is a blur over
  // what is composited (design/done/2026-11-26_isolation_box_plan.md). The scratch canvas is never cleared as a whole:
  // a shape composites only its own box, which it cleared first.
  renderIsolated(ctx, u) {
    const canvas = ctx.canvas, w = canvas.width, h = canvas.height, k = u * this.parentLayer.dpr;
    const scratch = pxl.getIsolationContext(w, h);
    const m = this.getGlobalMatrix(); // in logical units: scaled by u like the layer
    let left = 0, top = 0, right = w, bottom = h;
    scratch.save();
    try {
      // Inside save() / restore(), so state set here (a text's font) doesn't reach the next isolated shape
      if (!this.prepare(scratch)) return;
      if (this.hasBoxBeforeDraw()) {
        // The hit box, padded like for hit testing, through the global matrix: the four corners unrolled (no
        // allocation), rounded outwards with one more device pixel for antialiasing, clamped to the canvas
        const box = this.getHitBox(), pad = this.hitPadding();
        const l = box.left - pad, r = box.right + pad, t = box.top - pad, b = box.bottom + pad;
        const xl = m[0] * l, xr = m[0] * r, xt = m[2] * t + m[4], xb = m[2] * b + m[4];
        const yl = m[1] * l, yr = m[1] * r, yt = m[3] * t + m[5], yb = m[3] * b + m[5];
        left = Math.max(0, Math.floor(Math.min(xl + xt, xr + xt, xl + xb, xr + xb) * k) - 1);
        right = Math.min(w, Math.ceil(Math.max(xl + xt, xr + xt, xl + xb, xr + xb) * k) + 1);
        top = Math.max(0, Math.floor(Math.min(yl + yt, yr + yt, yl + yb, yr + yb) * k) - 1);
        bottom = Math.min(h, Math.ceil(Math.max(yl + yt, yr + yt, yl + yb, yr + yb) * k) + 1);
        // Empty, NaN or off the canvas: nothing to composite
        if (!(right > left && bottom > top)) return;
      }
      scratch.clearRect(0, 0, right - left, bottom - top);
      scratch.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k - left, m[5] * k - top);
      this.draw(scratch);
    } catch (error) {
      this.reportError(error);
      return;
    } finally {
      scratch.restore();
    }
    const bw = right - left, bh = bottom - top;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      pxl.applyCompositingState(ctx, u, this.values, this);
      ctx.drawImage(scratch.canvas, 0, 0, bw, bh, left, top, bw, bh);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  }

  // Runs on the scratch canvas before an isolated shape's box is computed; false means there is nothing to draw.
  // Text lays out here, so its box (measured in draw() otherwise) is current.
  prepare(ctx) {
    return true;
  }

  // Whether the box is known before drawing. Not for a shape without its own getBoundingBox() (it gets the whole
  // area, as its hit test does) and not for the grid, whose box is the visible area, computed in draw().
  hasBoxBeforeDraw() {
    return !this.needsExactHitTest();
  }

  // Custom shapes override this (gradients are sized to it); without it, gradients collapse to a point and hit
  // testing skips its box check. pxl.defineShape() warns once for such a class.
  getBoundingBox() {
    return this.setBoundingBox(0, 0, 0, 0);
  }

  // Writes the box (in the shape's own units, without the stroke) and returns it: no allocation per frame
  setBoundingBox(left, top, right, bottom) {
    const box = this.boundingBox;
    box.left = left;
    box.top = top;
    box.right = right;
    box.bottom = bottom;
    return box;
  }

  // --- Hit Testing ---
  // (design/done/2026-10-30_framework_compatibility_plan.md §23, E5)

  // Quick test before the exact one: is the point (x, y) in stage units inside the box of what this shape paints?
  // The box is read in every test: a cached box would miss setAttribute('r', …) on a static shape, which doesn't
  // change the matrix. min / max because a rect with a negative w or h is drawn mirrored.
  mayContainPoint(x, y) {
    if (this.needsExactHitTest()) return true;
    const m = this.getInverseGlobalMatrix();
    const lx = m[0] * x + m[2] * y + m[4];
    const ly = m[1] * x + m[3] * y + m[5];
    const box = this.getHitBox();
    const pad = this.hitPadding();
    return lx >= Math.min(box.left, box.right) - pad && lx <= Math.max(box.left, box.right) + pad &&
           ly >= Math.min(box.top, box.bottom) - pad && ly <= Math.max(box.top, box.bottom) + pad;
  }

  // The box that contains the shape's path, in its own units. Usually the bounding box; a shape whose path can leave
  // its bounding box (a smooth polyline's curve) returns a larger one. A NaN box rules the shape out.
  getHitBox() {
    return this.getBoundingBox();
  }

  // A custom shape without its own getBoundingBox() always gets the exact test (the base method returns an empty box
  // silently; pxl.defineShape() warns once for such a class)
  needsExactHitTest() {
    return this.getBoundingBox === pxl.Shape.prototype.getBoundingBox;
  }

  // How far the paint can reach beyond the path's box: half the stroke, a miter join up to miterlimit × half the
  // stroke, the corner of a square cap, arrowheads (only lines, polylines, circles and ellipses have arrowstart)
  hitPadding() {
    if (!this.isStroked()) return 0;
    const { strokewidth, linejoin, miterlimit, linecap, arrowstart, arrowend } = this.values;
    let pad = strokewidth / 2 * (linejoin === 'miter' ? Math.max(1, miterlimit) : 1);
    if (linecap === 'square') pad = Math.max(pad, strokewidth * Math.SQRT1_2);
    if (arrowstart !== undefined) pad += Math.max(pxl.arrowSize(arrowstart, strokewidth), pxl.arrowSize(arrowend, strokewidth));
    return pad;
  }

  // The fill or stroke as a canvas style, for a shape that paints with it in its own way (fillText(), a second
  // path): a color string as it is, a gradient built in the shape's box, null when it isn't set
  paint(ctx, which) {
    return which === 'stroke' ? this.createGradient(ctx, this.values.stroke, 1) : this.createGradient(ctx, this.values.fill, 0);
  }

  // A gradient descriptor becomes a CanvasGradient in the shape's box, through the fill's or the stroke's
  // pxl.GradientSlot; anything else is returned as it is: a color, or null for a fill or stroke that isn't set
  // (paint() is called by custom shapes without hasFill() first; typeof null is 'object'). The test for a descriptor
  // comes first: almost every fill and stroke is a color.
  createGradient(ctx, styleValue, slot) {
    if (styleValue === null || typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }
    return this._gradients[slot].resolve(ctx, styleValue, this.getBoundingBox(), this.values.strokewidth);
  }

  // Sets all stroke-related context state (style, width, caps, joins, dash).
  // Shared by path-based shapes (via applyStyle) and non-path shapes like Text (strokeText).
  applyStrokeState(ctx) {
    const { stroke, strokewidth, linecap, linejoin, miterlimit } = this.values;

    ctx.strokeStyle = this.createGradient(ctx, stroke, 1);

    ctx.lineWidth = strokewidth;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    this.applyLineDash(ctx);
  }

  // The dash pattern as written (setLineDash() copies it): an array, or one number for equal dashes and gaps. Any
  // other value (a string that isn't a pattern) draws solid.
  applyLineDash(ctx) {
    const { linedash, dashoffset } = this.values;
    if (!pxl.hasLineDash(linedash)) {
      ctx.setLineDash(pxl._emptyDash);
      ctx.lineDashOffset = 0;
      return;
    }
    if (typeof linedash === 'number') {
      this._singleDash[0] = linedash;
      ctx.setLineDash(this._singleDash);
    } else {
      ctx.setLineDash(Array.isArray(linedash) ? linedash : pxl._emptyDash);
    }
    ctx.lineDashOffset = dashoffset;
  }

  hasFill() {
    const { fill } = this.values;
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  isStroked() {
    const { stroke, strokewidth } = this.values;
    return !!stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;
  }

  applyStyle(ctx) {
    if (this.hasFill()) {
      ctx.fillStyle = this.createGradient(ctx, this.values.fill, 0);
      ctx.fill();
    }

    if (this.isStroked()) {
      this.applyStrokeState(ctx);
      ctx.stroke();
    }
  }

  // --- Arrowheads ---
  // Geometry: design/done/2026-10-14_unified_arrowhead_geometry_plan.md
  // All distances are logical units, like the path they end.

  // Resolves one arrow end into distances along the path and writes them into the pre-allocated rec.
  // Returns true if this end has an arrowhead.
  resolveArrow(rec, attrValue) {
    const { strokewidth, linecap, linejoin, arrowstyle } = this.values;
    const size = pxl.arrowSize(attrValue, strokewidth);

    if (!(size > 0)) {
      rec.size = 0;
      return false;
    }

    const sw = strokewidth;
    const len = size * pxl.ARROW_COS30;
    const capExt = (linecap === 'butt') ? 0 : sw * 0.5;

    rec.size = size;
    rec.len = len;

    if (arrowstyle === 'line') {
      // How far the stroked chevron corner reaches beyond its path vertex.
      // Miter tips are always sharp: drawArrows lifts a low miterlimit for the chevron.
      const joinExt = (linejoin === 'round') ? sw * 0.5
                    : (linejoin === 'bevel') ? sw * 0.25
                    : sw;
      rec.tipAdvance = capExt - joinExt;
      rec.inset = joinExt;
    } else {
      // Shallowest depth (behind the tip) at which the shaft's visible end fits inside the 30° wedge.
      const minDepth = (linecap === 'butt') ? sw * pxl.ARROW_COS30
                     : (linecap === 'square') ? sw * (pxl.ARROW_COS30 + 0.5)
                     : sw;
      // Heads narrower than the stroke clamp to the base line: continuous in size and strokewidth.
      const depth = Math.min(Math.max(minDepth, pxl.ARROW_K_DEPTH * len), len + capExt);
      rec.tipAdvance = capExt;
      rec.inset = depth - capExt;
    }
    return true;
  }

  // Points rec away from the path end (px, py) along the vector (vx, vy) and places the tip.
  // Returns the length of (vx, vy).
  aimArrow(rec, px, py, vx, vy) {
    const length = Math.sqrt(vx * vx + vy * vy);
    rec.dirX = (length > 0) ? vx / length : 1;
    rec.dirY = (length > 0) ? vy / length : 0;
    rec.tipX = px + rec.dirX * rec.tipAdvance;
    rec.tipY = py + rec.dirY * rec.tipAdvance;
    return length;
  }

  // Draws both arrowheads in one path. Expects stroke state to be applied already.
  // Always the last call of a shape's draw(): it changes the miter limit, the dash and fillStyle without
  // resetting them, and render() restores the state afterwards.
  drawArrows(ctx, recA, recB) {
    const isLine = this.values.arrowstyle === 'line';

    ctx.beginPath();
    if (recA.size > 0) this.traceArrow(ctx, recA, isLine);
    if (recB.size > 0) this.traceArrow(ctx, recB, isLine);

    if (isLine) {
      // A 60° miter needs a limit of 2 (1 / sin 30°); a lower path miterlimit must not blunt the tip.
      // 4 leaves headroom for float rounding.
      if (ctx.miterLimit < 4) ctx.miterLimit = 4;

      // Chevrons are always solid
      if (pxl.hasLineDash(this.values.linedash)) ctx.setLineDash(pxl._emptyDash);
      ctx.stroke();
    } else {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }

  traceArrow(ctx, rec, isLine) {
    const { size, tipX, tipY, dirX, dirY } = rec;
    // Wings: direction rotated by ±30°, pointing back from the tip
    const cx = size * dirX * pxl.ARROW_COS30, cy = size * dirY * pxl.ARROW_COS30;
    const sx = size * dirX * pxl.ARROW_SIN30, sy = size * dirY * pxl.ARROW_SIN30;
    const wing1X = tipX - cx - sy, wing1Y = tipY - cy + sx;
    const wing2X = tipX - cx + sy, wing2Y = tipY - cy - sx;

    if (isLine) {
      ctx.moveTo(wing1X, wing1Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(wing2X, wing2Y);
    } else {
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(wing1X, wing1Y);
      ctx.lineTo(wing2X, wing2Y);
      ctx.closePath();
    }
  }
};

// =========================================================================
// Defining a Shape's Tag
// =========================================================================
// For built-in and custom shapes alike (design/done/2026-11-20_custom_shapes_plan.md §5.5), in a script after pxl.min.js.
// The checks run once per class, here, instead of in every frame; the tag joins the default styles' display: none,
// so content written inside a shape never shows as page text.
// A key named like one of the engine's own lowercase fields or methods is refused: its accessor on the class prototype
// would take the name over (values and expressions make the constructor throw, stage breaks on disconnect). The fields
// are listed here, the methods are found on the prototypes.
pxl.defineShape = function(tag, Class) {
  if (customElements.get(tag)) {
    console.warn(`[pxl] <${tag}> is already defined; this definition is ignored (is the script loaded twice?).`);
    return;
  }
  const name = Class.name || tag;
  const keys = Object.keys(Class.defaults);
  const reserved = keys.filter((key) => ['values', 'expressions', 'stage', 'handlers'].includes(key) ||
    Object.hasOwn(pxl.Shape.prototype, key) || Object.hasOwn(pxl.PxlNode.prototype, key));
  if (reserved.length > 0) {
    console.error(`[pxl] ${name}: ${reserved.map((key) => `"${key}"`).join(', ')} can't be an attribute: the engine uses ` +
      `the name on every shape. <${tag}> is not defined; rename the attribute.`);
    return;
  }
  for (const key of keys) {
    if (key !== key.toLowerCase()) {
      console.warn(`[pxl] ${name}: the attribute "${key}" must be lowercase. HTML lowercases attribute names, so it never arrives.`);
    }
  }
  // Without ...pxl.Shape.defaults the shape has no x, zoom, fill, …: its matrix is NaN, and it draws nothing
  const missing = Object.keys(pxl.Shape.defaults).filter((key) => !(key in Class.defaults));
  if (missing.length > 0) {
    console.warn(`[pxl] ${name}: static defaults has no ${missing.join(', ')}. Start it with ...pxl.Shape.defaults, ` +
      `or <${tag}> has no position, transform or style.`);
  }
  if (typeof Class.prototype.draw !== 'function') console.warn(`[pxl] ${name} has no draw(ctx): <${tag}> draws nothing.`);
  if (Class.prototype.getBoundingBox === pxl.Shape.prototype.getBoundingBox) {
    console.warn(`[pxl] ${name} has no getBoundingBox(): its gradients collapse to a point, and hit testing can't skip it early.`);
  }
  pxl.hideShapeTag(tag);
  customElements.define(tag, Class);
};

// =========================================================================
// pxl.ArcShape: the shared base of circle and ellipse (no tag of its own)
// =========================================================================
// Both draw an elliptical arc and close it in one of their ways: a full turn, a ring (inner radii), a pie (lines to
// the center) or a chord (closed), with arrowheads on an open arc. A circle is the case rx = ry. The radii are
// parameters, never read here from the values: each subclass has its own radius attributes (r, ir or rx, ry, irx, iry).
// End angle in radians: sweep (relative to start) wins over end; neither means a full turn
pxl.arcEndRadians = function(startRadians, end, sweep) {
  if (sweep !== null) return startRadians + sweep * Math.PI / 180;
  if (end !== null) return end * Math.PI / 180;
  return startRadians + Math.PI * 2;
};

pxl.isFullTurn = function(startRadians, endRadians) {
  return Math.abs(endRadians - startRadians) >= Math.PI * 2 - 1e-4;
};

pxl.ArcShape = class ArcShape extends pxl.Shape {
  static defaults = {
    ...pxl.Shape.defaults,
    start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false,
    arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  // The arc with radii rx, ry and the inner radii irx, iry (a ring when either is above 0). Negative radii count as 0.
  drawArc(ctx, rx, ry, irx, iry) {
    const { start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.values;

    const safeRX = Math.max(0, rx);
    const safeRY = Math.max(0, ry);
    const safeIRX = Math.max(0, irx);
    const safeIRY = Math.max(0, iry);

    if (safeRX === 0 && safeRY === 0 && safeIRX === 0 && safeIRY === 0) return;

    const isPie = pie === true;
    const isClosed = closed === true;
    const isAnti = anticlockwise === true;
    const hasInner = safeIRX > 0 || safeIRY > 0;

    const startRadians = start * Math.PI / 180;
    const endRadians = pxl.arcEndRadians(startRadians, end, sweep);
    const isFull = pxl.isFullTurn(startRadians, endRadians);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // Arrowheads (open arcs only)
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = safeRX > 0 && safeRY > 0 && !hasInner && !isPie && !isClosed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimArcArrow(arrowStart, safeRX, safeRY, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimArcArrow(arrowEnd, safeRX, safeRY, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    if (drawShaft) {
      ctx.beginPath();
      this.traceArc(ctx, safeRX, safeRY, drawStartRadians, drawEndRadians, isAnti);

      if (hasInner) {
        if (isFull) {
          ctx.moveTo(safeIRX * Math.cos(drawEndRadians), safeIRY * Math.sin(drawEndRadians));
        }
        this.traceArc(ctx, safeIRX, safeIRY, drawEndRadians, drawStartRadians, !isAnti);
        ctx.closePath();
      } else if (isPie && !isFull) {
        ctx.lineTo(0, 0);
        ctx.closePath();
      } else if ((isFull && !hasArrows) || isClosed) {
        ctx.closePath();
      }

      this.applyStyle(ctx);
    } else {
      this.applyStrokeState(ctx);
    }

    if (hasArrows) this.drawArrows(ctx, arrowStart, arrowEnd);
  }

  // Equal radii draw with arc(): a circle keeps the exact path it always had
  traceArc(ctx, rx, ry, from, to, anticlockwise) {
    if (rx === ry) ctx.arc(0, 0, rx, from, to, anticlockwise);
    else ctx.ellipse(0, 0, rx, ry, 0, from, to, anticlockwise);
  }

  // Aims an arrow at the arc end at parameter `radians`; `inward` (±1) is the parameter direction into the arc.
  // Direction is the chord from the curve point one head length in, back to the end, so the head's base sits on the
  // arc. Returns the inset as a parameter offset (straight distance from the end, like all arrowheads).
  aimArcArrow(rec, radiusX, radiusY, radians, inward) {
    const px = radiusX * Math.cos(radians), py = radiusY * Math.sin(radians);
    const baseRadians = radians + inward * this.parameterOffset(radiusX, radiusY, radians, inward, rec.len);
    this.aimArrow(rec, px, py, px - radiusX * Math.cos(baseRadians), py - radiusY * Math.sin(baseRadians));
    return this.parameterOffset(radiusX, radiusY, radians, inward, rec.inset);
  }

  // Parameter offset (towards `inward`) where the arc is `distance` away from `radians` in a straight line. On a
  // circle the chord gives it exactly; on an ellipse by bisection, since a local estimate fails at the tip of thin
  // ellipses, where the curve turns fast.
  parameterOffset(radiusX, radiusY, radians, inward, distance) {
    if (radiusX === radiusY) return 2 * Math.asin(Math.min(distance, 2 * radiusX) / (2 * radiusX));
    const cos = Math.cos(radians), sin = Math.sin(radians);
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, target = radians + inward * mid;
      const x = radiusX * (Math.cos(target) - cos), y = radiusY * (Math.sin(target) - sin);
      if (x * x + y * y > distance * distance) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }
};

// The arc, ring, pie, chord and arrowheads come from pxl.ArcShape (arc.js); a circle is its case rx = ry
pxl.Circle = class Circle extends pxl.ArcShape {
  // r and ir first, like the attribute tables; spreading ArcShape's defaults again keeps the keys' first place
  static defaults = { ...pxl.Shape.defaults, r: 0, ir: 0, ...pxl.ArcShape.defaults };

  draw(ctx) {
    const { r, ir } = this.values;
    this.drawArc(ctx, r, r, ir, ir);
  }

  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, r);
  }
};
pxl.defineShape('pxl-circle', pxl.Circle);

// The arc, ring, pie, chord and arrowheads come from pxl.ArcShape (arc.js)
pxl.Ellipse = class Ellipse extends pxl.ArcShape {
  // rx, ry, irx and iry first, like the attribute tables; spreading ArcShape's defaults again keeps the keys' first place
  static defaults = { ...pxl.Shape.defaults, rx: 0, ry: 0, irx: 0, iry: 0, ...pxl.ArcShape.defaults };

  draw(ctx) {
    const { rx, ry, irx, iry } = this.values;
    this.drawArc(ctx, rx, ry, irx, iry);
  }

  getBoundingBox() {
    const { rx, ry } = this.values;
    return this.setBoundingBox(-rx, -ry, rx, ry);
  }
};
pxl.defineShape('pxl-ellipse', pxl.Ellipse);

pxl.Rect = class Rect extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };

  constructor() {
    super();
    this._radii = [0, 0, 0, 0]; // reused by roundRect() every frame
  }

  draw(ctx) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.values;

    const startX = -w * pxl.anchorX[anchor];
    const startY = -h * pxl.anchorY[anchor];

    // r is the radius of every corner that has no r1 … r4 of its own
    const baseR = r ?? 0;
    const rad1 = r1 ?? baseR;
    const rad2 = r2 ?? baseR;
    const rad3 = r3 ?? baseR;
    const rad4 = r4 ?? baseR;

    ctx.beginPath();
    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      // roundRect throws on a negative radius (an animated radius can dip below 0); like circle and ellipse, it becomes 0
      this._radii[0] = Math.max(0, rad1);
      this._radii[1] = Math.max(0, rad2);
      this._radii[2] = Math.max(0, rad3);
      this._radii[3] = Math.max(0, rad4);
      ctx.roundRect(startX, startY, w, h, this._radii);
    } else {
      ctx.rect(startX, startY, w, h);
    }
    this.applyStyle(ctx);
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }

  getBoundingBox() {
    const { w, h, anchor } = this.values;
    const ax = pxl.anchorX[anchor];
    const ay = pxl.anchorY[anchor];
    return this.setBoundingBox(-w * ax, -h * ay, w * (1 - ax), h * (1 - ay));
  }
};
pxl.defineShape('pxl-rect', pxl.Rect);

pxl.Line = class Line extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx) {
    const { x1: startX, y1: startY, x2: endX, y2: endY, arrowstart, arrowend } = this.values;

    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const isStroked = this.isStroked();
    const hasStart = isStroked && this.resolveArrow(arrowStart, arrowstart);
    const hasEnd = isStroked && this.resolveArrow(arrowEnd, arrowend);

    if (!hasStart && !hasEnd) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      this.applyStyle(ctx);
      return;
    }

    let length = 0;
    if (hasStart) length = this.aimArrow(arrowStart, startX, startY, startX - endX, startY - endY);
    if (hasEnd)   length = this.aimArrow(arrowEnd, endX, endY, endX - startX, endY - startY);

    const startInset = hasStart ? arrowStart.inset : 0;
    const endInset = hasEnd ? arrowEnd.inset : 0;

    // Shaft is trimmed along the line; skipped if both insets would cross each other
    if (startInset + endInset < length) {
      const dirX = (endX - startX) / length, dirY = (endY - startY) / length;
      ctx.beginPath();
      ctx.moveTo(startX + dirX * startInset, startY + dirY * startInset);
      ctx.lineTo(endX - dirX * endInset, endY - dirY * endInset);
      this.applyStyle(ctx);
    } else {
      this.applyStrokeState(ctx);
    }

    this.drawArrows(ctx, arrowStart, arrowEnd);
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }

  getBoundingBox() {
    const { x1, y1, x2, y2 } = this.values;
    return this.setBoundingBox(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
  }
};
pxl.defineShape('pxl-line', pxl.Line);

// Splits "x,y; x,y; …" into coordinate strings [x0, y0, x1, y1, …]. Commas and semicolons
// inside parentheses belong to the expression: min(a, b) stays one coordinate.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  let start = 0;
  let depth = 0;
  let currentX = null;
  const input = str + ';'; // the last point ends like all others

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      if (char === ',') {
        currentX = input.substring(start, i).trim();
        start = i + 1;
      } else if (char === ';') {
        const currentY = input.substring(start, i).trim();
        if (currentX !== null && currentX !== '' && currentY !== '') {
          targetArray.push(currentX, currentY);
        }
        currentX = null;
        start = i + 1;
      }
    }
  }
};

pxl.Polyline = class Polyline extends pxl.Shape {
  // points has no default: it is stored as one value per coordinate (p0, p1, …, see setPoints())
  static get observedAttributes() {
    return [...super.observedAttributes, 'points'];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._pointCount = 0;
    this._rawParts = []; // parser output, reused

    // Each coordinate is its own attribute p0, p1, … (keys built once per points change);
    // loadPoints() copies their values into flatCache, for draw() and for getHitBox(). Float64 like the
    // matrices: relative mode adds the points up, and Float32 rounding would add up with them.
    this._flatCache = new Float64Array(0);
    this._pointKeys = [];
    this._hitBox = { left: 0, right: 0, top: 0, bottom: 0 }; // a smooth curve's box with its handles

    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();

    // Reused buffers for trimming the first / last spline segment
    this._segment = new Float64Array(8);  // p1, cp1, cp2, p2
    this._split = new Float64Array(10);   // q0, r0, s, r1, q2
  }

  // --- Points ---

  // The property (frameworks): a points string like the attribute, or an array, flat [x0, y0, x1, y1, …] or pairs
  // [[x0, y0], …], each coordinate a number or an expression string. Reading returns the evaluated coordinates,
  // flat, in a new array.
  get points() {
    const out = new Array(this._pointCount);
    for (let i = 0; i < this._pointCount; i++) out[i] = this.values[this._pointKeys[i]];
    return out;
  }

  set points(value) {
    this.setValue('points', value === undefined ? null : value);
  }

  setValue(name, value) {
    if (name === 'points') this.setPoints(value);
    else super.setValue(name, value);
  }

  // Each coordinate is its own value p0, p1, …: a number is stored, a string compiled like an attribute. An array is
  // read in place (copying it would allocate in every update), and with the same number of coordinates the keys and
  // the buffer stay: a chart whose points change in every frame allocates nothing for number coordinates.
  setPoints(value) {
    let count;
    const isArray = Array.isArray(value);
    const isPairs = isArray && Array.isArray(value[0]);
    if (isPairs) {
      count = 0; // up to the first incomplete pair, like an incomplete point in the string
      while (count / 2 < value.length && Array.isArray(value[count / 2]) && value[count / 2].length >= 2) count += 2;
    } else if (isArray) {
      count = value.length - value.length % 2; // an x without its y is dropped
    } else {
      pxl.parsePointsIntoArray(typeof value === 'string' ? value : '', this._rawParts); // null or '': no points
      count = this._rawParts.length;
    }
    if (count !== this._pointCount) this.resizePoints(count);

    const expressions = this.expressions;
    for (let i = 0; i < count; i++) {
      const key = this._pointKeys[i];
      const part = isPairs ? value[i >> 1][i & 1] : isArray ? value[i] : this._rawParts[i];
      if (typeof part === 'string') {
        pxl.compileAttribute(this, key, part);
      } else if (typeof expressions[key] !== 'function') {
        // A number over a value that is no expression: it is in none of the key lists, so it is just written
        expressions[key] = part;
        this.values[key] = part;
      } else {
        pxl.storeValue(this, key, part);
      }
    }

    this.isAnimated = this.animatedAttributeKeys.length > 0;
    // Readers of ref.<id>.pN update like for any other attribute
    pxl.markChanged(this);
    this.parentLayer?.invalidate();
  }

  // Keys beyond the new count go, new ones are added; keys below it keep their value until set again (animated
  // coordinates are only evaluated in the next frame, so ref.<id>.pN readers would see undefined in between)
  resizePoints(count) {
    let removedExpression = false;
    for (let i = count; i < this._pointCount; i++) {
      const key = this._pointKeys[i];
      if (typeof this.expressions[key] === 'function') removedExpression = true;
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      delete this.expressions[key];
      delete this.values[key];
    }
    if (removedExpression) pxl.expressionsChanged(this);
    for (let i = this._pointCount; i < count; i++) this._pointKeys[i] = `p${i}`;
    this._pointKeys.length = count;
    this._flatCache = new Float64Array(count);
    this._pointCount = count;
  }

  draw(ctx) {
    if (this._pointCount < 4) return;

    if (!this.loadPoints()) return;

    const { smooth, arrowstart, arrowend } = this.values;
    const closed = this.values.closed === true;
    const len = this._pointCount / 2;

    // Arrowheads only apply to open strokes
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = !closed && this.isStroked();
    let hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart);
    let hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend);

    // Arrows sit on the first / last point with a distinct neighbour: zero-length end segments are skipped
    let first = 0, last = len - 1;
    if (hasStart || hasEnd) {
      while (first < last && this.isSamePoint(first, first + 1)) first++;
      while (last > first && this.isSamePoint(last, last - 1)) last--;
      if (first === last) {
        hasStart = hasEnd = false;
        first = 0;
        last = len - 1;
      }
    }

    // A smooth curve through only 2 points (with free ends) is a straight line
    const isSmooth = smooth !== false && smooth !== null && last - first > 1;

    if (isSmooth) {
      const k3 = (typeof smooth === 'number' ? smooth : 1) / 3;
      this.traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last);
      this.applyStyle(ctx);
    } else if (this.traceStraight(ctx, closed, hasStart, hasEnd, first, last)) {
      this.applyStyle(ctx);
    } else {
      this.applyStrokeState(ctx);
    }

    if (hasStart || hasEnd) this.drawArrows(ctx, arrowStart, arrowEnd);
  }

  // Fills flatCache with the absolute coordinates. Returns false if a coordinate isn't a finite number
  // (a ref that isn't connected yet, a division by zero): the canvas would drop that vertex or bend a smooth curve,
  // so the polyline draws nothing until all coordinates are valid.
  loadPoints() {
    const pts = this._flatCache;
    let probe = 0;
    for (let i = 0; i < this._pointCount; i++) {
      pts[i] = this.values[this._pointKeys[i]];
      probe += pts[i] * 0;   // 0 for a finite value, NaN for NaN or ±Infinity
    }
    if (probe !== 0) return false;

    if (this.values.mode === 'relative') {
      for (let i = 2; i < this._pointCount; i++) {
        pts[i] += pts[i - 2];
      }
    }
    return true;
  }

  // Draws points first..last. Returns false if the shaft is skipped (single segment shorter than both arrow insets).
  traceStraight(ctx, closed, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const f = first * 2, l = last * 2;
    let startX = pts[f], startY = pts[f + 1];
    let endX = pts[l], endY = pts[l + 1];

    // flatCache is never mutated: only the drawn end points are trimmed, each within its own segment
    let startInset = 0, endInset = 0, firstLength = 0;
    if (hasStart) {
      const a = this._arrowStart;
      firstLength = this.aimArrow(a, startX, startY, startX - pts[f + 2], startY - pts[f + 3]);
      startInset = Math.min(a.inset, firstLength);
      startX -= a.dirX * startInset;
      startY -= a.dirY * startInset;
    }
    if (hasEnd) {
      const b = this._arrowEnd;
      const lastLength = this.aimArrow(b, endX, endY, endX - pts[l - 2], endY - pts[l - 1]);
      endInset = Math.min(b.inset, lastLength);
      endX -= b.dirX * endInset;
      endY -= b.dirY * endInset;
    }
    if (last - first === 1 && hasStart && hasEnd && startInset + endInset >= firstLength) return false;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = f + 2; i < l; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineTo(endX, endY);
    if (closed) ctx.closePath();
    return true;
  }

  // Centripetal Catmull-Rom through points first..last (design/done/2026-10-23_smooth_polyline_spline_plan.md).
  // `k3` is smooth / 3. Arrows imply an open path with >= 2 segments between first and last.
  traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const segment = this._segment, split = this._split;

    let from = first;
    const to = closed ? len : last;     // segments from..to-1

    ctx.beginPath();

    // First segment, trimmed from the front
    if (hasStart) {
      const a = this._arrowStart;
      this.loadSegment(from, len, closed, k3);
      // Direction: chord from the curve point one head length in, back to the start
      this.splitSegment(this.trimParameter(a.len, false));
      this.aimArrow(a, segment[0], segment[1], segment[0] - split[4], segment[1] - split[5]);
      this.splitSegment(this.trimParameter(a.inset, false));
      ctx.moveTo(split[4], split[5]);
      ctx.bezierCurveTo(split[6], split[7], split[8], split[9], segment[6], segment[7]);
      from++;
    } else {
      ctx.moveTo(pts[first * 2], pts[first * 2 + 1]);
    }

    // Hot loop: the same segment loader as the arrow trimming, so both always agree
    const end = hasEnd ? to - 1 : to;
    for (let i = from; i < end; i++) {
      this.loadSegment(i, len, closed, k3);
      ctx.bezierCurveTo(segment[2], segment[3], segment[4], segment[5], segment[6], segment[7]);
    }

    // Last segment, trimmed from the back
    if (hasEnd) {
      const b = this._arrowEnd;
      this.loadSegment(to - 1, len, closed, k3);
      this.splitSegment(this.trimParameter(b.len, true));
      this.aimArrow(b, segment[6], segment[7], segment[6] - split[4], segment[7] - split[5]);
      this.splitSegment(this.trimParameter(b.inset, true));
      ctx.bezierCurveTo(split[0], split[1], split[2], split[3], split[4], split[5]);
    }

    if (closed) ctx.closePath();
  }

  // Loads segment i (point A = i to point B = i + 1) as a cubic Bézier into this._segment.
  // Centripetal handles (D3 curveCatmullRom), scaled by k3 = smooth / 3. On a closed path neighbours wrap around;
  // on an open path a missing neighbour (free end) counts as a zero-length side: no handle.
  loadSegment(i, len, closed, k3) {
    const pts = this._flatCache, segment = this._segment;
    const a = i, b = closed ? (i + 1) % len : i + 1;
    const p = closed ? (a - 1 + len) % len : a - 1;   // neighbour before A
    const q = closed ? (b + 1) % len : b + 1;         // neighbour after B

    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const abx = bx - ax, aby = by - ay;
    const dAB = Math.sqrt(abx * abx + aby * aby), rAB = Math.sqrt(dAB);

    let pax = 0, pay = 0, dPA = 0, bqx = 0, bqy = 0, dBQ = 0;
    if (p >= 0) {
      pax = ax - pts[p * 2]; pay = ay - pts[p * 2 + 1];
      dPA = Math.sqrt(pax * pax + pay * pay);
    }
    if (q < len) {
      bqx = pts[q * 2] - bx; bqy = pts[q * 2 + 1] - by;
      dBQ = Math.sqrt(bqx * bqx + bqy * bqy);
    }
    const rPA = Math.sqrt(dPA), rBQ = Math.sqrt(dBQ);

    // Tangent at A: dPA·AB + dAB·PA; at B: dAB·BQ + dBQ·AB. A zero-length side gets no handle (corner, free end).
    const fa = rPA > 1e-6 ? k3 / (rPA * (rPA + rAB)) : 0;
    const fb = rBQ > 1e-6 ? k3 / (rBQ * (rAB + rBQ)) : 0;

    segment[0] = ax;
    segment[1] = ay;
    segment[2] = ax + (dPA * abx + dAB * pax) * fa;
    segment[3] = ay + (dPA * aby + dAB * pay) * fa;
    segment[4] = bx - (dAB * bqx + dBQ * abx) * fb;
    segment[5] = by - (dAB * bqy + dBQ * aby) * fb;
    segment[6] = bx;
    segment[7] = by;
  }

  // Curve parameter on this._segment where the curve is `dist` away from its start (or end) in a straight line,
  // like all arrowhead trims. Bisection: free ends leave the end point slowly, so a chord estimate trims too little.
  trimParameter(dist, fromEnd) {
    const g = this._segment;
    const ex = fromEnd ? g[6] : g[0], ey = fromEnd ? g[7] : g[1];
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      const x = a * g[0] + b * g[2] + c * g[4] + e * g[6] - ex;
      const y = a * g[1] + b * g[3] + c * g[5] + e * g[7] - ey;
      if ((x * x + y * y > dist * dist) === fromEnd) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }

  // A smooth curve can leave the box of its points, but each Bézier segment stays inside the box of its four control
  // points: the hit box adds the handles (also for smooth > 1 or < 0, and closed paths). Arrow trims only shorten
  // the curve, and arrowheads are in hitPadding(). From the current values, like getBoundingBox(), so a shape
  // changed with setAttribute() is hit at its new place.
  getHitBox() {
    const smooth = this.values.smooth;
    if (smooth === false || smooth === null || this._pointCount < 6) return this.getBoundingBox();

    const box = this._hitBox;
    if (!this.loadPoints()) {
      box.left = box.right = box.top = box.bottom = NaN; // draws nothing, so nothing to hit
      return box;
    }
    const pts = this._flatCache, segment = this._segment;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this._pointCount; i += 2) {
      if (pts[i] < minX) minX = pts[i];
      if (pts[i] > maxX) maxX = pts[i];
      if (pts[i + 1] < minY) minY = pts[i + 1];
      if (pts[i + 1] > maxY) maxY = pts[i + 1];
    }
    const len = this._pointCount / 2, closed = this.values.closed === true;
    const k3 = (typeof smooth === 'number' ? smooth : 1) / 3;
    const count = closed ? len : len - 1;
    for (let i = 0; i < count; i++) {
      this.loadSegment(i, len, closed, k3);
      for (let j = 2; j < 6; j += 2) {
        if (segment[j] < minX) minX = segment[j];
        if (segment[j] > maxX) maxX = segment[j];
        if (segment[j + 1] < minY) minY = segment[j + 1];
        if (segment[j + 1] > maxY) maxY = segment[j + 1];
      }
    }
    box.left = minX;
    box.right = maxX;
    box.top = minY;
    box.bottom = maxY;
    return box;
  }

  // Points closer than 0.01 px count as the same (zero-length end segments for arrows)
  isSamePoint(i, j) {
    const pts = this._flatCache;
    return Math.abs(pts[i * 2] - pts[j * 2]) < 0.01 && Math.abs(pts[i * 2 + 1] - pts[j * 2 + 1]) < 0.01;
  }

  // de Casteljau split of this._segment at t. Left part: p1, q0, r0, s. Right part: s, r1, q2, p2.
  splitSegment(t) {
    const g = this._segment, out = this._split;
    const q0x = g[0] + (g[2] - g[0]) * t, q0y = g[1] + (g[3] - g[1]) * t;
    const q1x = g[2] + (g[4] - g[2]) * t, q1y = g[3] + (g[5] - g[3]) * t;
    const q2x = g[4] + (g[6] - g[4]) * t, q2y = g[5] + (g[7] - g[5]) * t;
    const r0x = q0x + (q1x - q0x) * t,    r0y = q0y + (q1y - q0y) * t;
    const r1x = q1x + (q2x - q1x) * t,    r1y = q1y + (q2y - q1y) * t;

    out[0] = q0x; out[1] = q0y;
    out[2] = r0x; out[3] = r0y;
    out[4] = r0x + (r1x - r0x) * t;
    out[5] = r0y + (r1y - r0y) * t;
    out[6] = r1x; out[7] = r1y;
    out[8] = q2x; out[9] = q2y;
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }

  getBoundingBox() {
    if (this._pointCount < 4) return this.setBoundingBox(0, 0, 0, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.values.mode === 'relative';

    for (let i = 0; i < this._pointCount; i += 2) {
      const px = this.values[this._pointKeys[i]];
      const py = this.values[this._pointKeys[i + 1]];

      if (isRelative && i > 0) {
        currentX += px;
        currentY += py;
      } else {
        currentX = px;
        currentY = py;
      }

      if (currentX < minX) minX = currentX;
      if (currentX > maxX) maxX = currentX;
      if (currentY < minY) minY = currentY;
      if (currentY > maxY) maxY = currentY;
    }
    return this.setBoundingBox(minX, minY, maxX, maxY);
  }
};
pxl.defineShape('pxl-polyline', pxl.Polyline);

// Raised when web fonts arrive. The font string doesn't change then, so each text compares this number instead.
pxl._fontGeneration = 0;

pxl.Text = class Text extends pxl.Shape {
  static defaults = {
    ...pxl.Shape.defaults,
    text: '', size: 16, font: 'sans-serif', align: 'center',
    baseline: 'middle', weight: 'normal', fontstyle: 'normal',
    maxwidth: 0, direction: null, width: 0, lineheight: 1.2,
    letterspacing: 0, reveal: null
  };

  // The text attribute is a template: text where only ${…} is code (pxl.parseTemplate). Its property is literal.
  static templateAttributes = ['text'];

  constructor() {
    super();
    this._cachedFontString = '';
    this._lastSize = 0;
    this._lastFont = '';
    this._lastWeight = '';
    this._lastStyle = '';
    this._lastText = '';
    this._lastAlign = '';
    this._lastBaseline = '';
    this._lastWidth = 0;
    this._lastLineheight = 0;
    this._lastLetterspacing = 0;
    this._lastDirection = null;
    this._lastMaxwidth = 0;
    this._lastFontGeneration = 0;
    this._cachedLetterSpacingString = '0px';
    this._lines = [];
    this._totalChars = 0;
    this._startY = 0;
    this._hasInk = false; // true only if the last draw() painted something (used by hitTest)
  }

  // Sets the context's text state and brings the three caches up to date, each rebuilt only when its inputs change:
  // font string → line layout → bounding box. Returns false when there is no text to draw. draw() calls it first; an
  // isolated text calls it before drawing too (prepare()), so its box is current when the engine needs it.
  layout(ctx) {
    const {
      text, size, font, align, baseline, weight, fontstyle, maxwidth,
      direction, width, lineheight, letterspacing
    } = this.values;

    // null / undefined: a ref that isn't connected yet
    if (text === null || text === undefined || text === '') return false;

    // --- 1. Font string ---
    let tier1Dirty = false;
    if (
      this._lastSize !== size ||
      this._lastFont !== font ||
      this._lastWeight !== weight ||
      this._lastStyle !== fontstyle ||
      this._lastLetterspacing !== letterspacing ||
      this._lastFontGeneration !== pxl._fontGeneration
    ) {
      tier1Dirty = true;
      this._cachedFontString = `${fontstyle} ${weight} ${size}px ${font}`;
      this._cachedLetterSpacingString = letterspacing + 'px';

      this._lastSize = size;
      this._lastFont = font;
      this._lastWeight = weight;
      this._lastStyle = fontstyle;
      this._lastLetterspacing = letterspacing;
      this._lastFontGeneration = pxl._fontGeneration;
    }

    // Context state is set every time: measuring and drawing both depend on it
    ctx.font = this._cachedFontString;
    ctx.letterSpacing = this._cachedLetterSpacingString;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.direction = direction || 'inherit';

    // --- 2. Line layout (word wrap when width > 0) ---
    let tier2Dirty = false;
    if (tier1Dirty || this._lastText !== text || this._lastWidth !== width) {
      tier2Dirty = true;

      const textStr = String(text).replace(/\\n/g, '\n');
      this._lines = [];

      if (width > 0) {
        const paragraphs = textStr.split('\n');
        for (let p = 0; p < paragraphs.length; p++) {
          const words = paragraphs[p].split(' ');
          let currentLine = words[0] || '';

          for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            if (ctx.measureText(testLine).width > width) {
              this._lines.push(currentLine);
              currentLine = words[i];
            } else {
              currentLine = testLine;
            }
          }
          this._lines.push(currentLine);
        }
      } else {
        this._lines = textStr.split('\n');
      }

      // reveal counts characters of the whole text
      this._totalChars = textStr.length;

      this._lastText = text;
      this._lastWidth = width;
    }

    // --- 3. Bounding box and first baseline ---
    if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline ||
        this._lastLineheight !== lineheight || this._lastDirection !== direction ||
        this._lastMaxwidth !== maxwidth) {
      let maxLeft = 0;
      let maxRight = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (let i = 0; i < this._lines.length; i++) {
        const metrics = ctx.measureText(this._lines[i]);
        // measureText() ignores maxWidth: a line wider than maxwidth is squeezed around its anchor, so both sides scale
        const squeeze = maxwidth > 0 ? Math.min(1, maxwidth / metrics.width) : 1;
        const left = metrics.actualBoundingBoxLeft * squeeze;
        const right = metrics.actualBoundingBoxRight * squeeze;
        if (left > maxLeft) maxLeft = left;
        if (right > maxRight) maxRight = right;
        if (i === 0) maxAscent = metrics.actualBoundingBoxAscent;
        if (i === this._lines.length - 1) maxDescent = metrics.actualBoundingBoxDescent;
      }

      this.boundingBox.left = -maxLeft;
      this.boundingBox.right = maxRight;

      const totalBlockHeight = Math.max(0, this._lines.length - 1) * size * lineheight;

      let startY = 0;
      if (baseline === 'middle') {
        startY = -totalBlockHeight / 2;
      } else if (baseline === 'bottom' || baseline === 'alphabetic' || baseline === 'ideographic') {
        startY = -totalBlockHeight;
      }

      this.boundingBox.top = startY - maxAscent;
      this.boundingBox.bottom = startY + totalBlockHeight + maxDescent;
      this._startY = startY;

      this._lastAlign = align;
      this._lastBaseline = baseline;
      this._lastLineheight = lineheight;
      this._lastDirection = direction;
      this._lastMaxwidth = maxwidth;
    }
    return true;
  }

  // The box of an isolated text comes from its layout, done on the scratch canvas before the box is needed
  prepare(ctx) {
    return this.layout(ctx);
  }

  draw(ctx) {
    this._hasInk = false;
    if (!this.layout(ctx)) return;
    const { size, maxwidth, lineheight, reveal } = this.values;

    // Typewriter reveal: 0 = nothing, 1 = everything
    let charsRemaining = Infinity;
    if (reveal !== null && reveal >= 0) {
      charsRemaining = Math.floor(reveal * (this._totalChars + 1));
      if (charsRemaining <= 0) return;
    }

    const hasFill = this.hasFill();
    const hasStroke = this.isStroked();
    if (!hasFill && !hasStroke) return;

    if (hasFill) ctx.fillStyle = this.createGradient(ctx, this.values.fill, 0);
    if (hasStroke) this.applyStrokeState(ctx);

    this._hasInk = true;

    const pxWidth = maxwidth > 0 ? maxwidth : undefined;
    for (let i = 0; i < this._lines.length; i++) {
      if (charsRemaining <= 0) break;

      let lineStr = this._lines[i];
      if (lineStr.length > charsRemaining) {
        lineStr = lineStr.substring(0, charsRemaining);
      }

      const yOffset = this._startY + (i * size * lineheight);

      if (hasFill) {
        if (pxWidth) ctx.fillText(lineStr, 0, yOffset, pxWidth);
        else ctx.fillText(lineStr, 0, yOffset);
      }

      if (hasStroke) {
        if (pxWidth) ctx.strokeText(lineStr, 0, yOffset, pxWidth);
        else ctx.strokeText(lineStr, 0, yOffset);
      }

      charsRemaining -= (this._lines[i].length + 1); // +1 accounts for wrapped space/newline
    }
  }

  // Fill and stroke, or more than one line (one call per line). Decided from the attributes: the line count is only
  // known after the layout in draw(). A wrap width counts even if the text fits on one line.
  drawsMoreThanOnce() {
    const { text, width } = this.values;
    return (this.hasFill() && this.isStroked()) || width > 0 ||
           (typeof text === 'string' && (text.includes('\n') || text.includes('\\n')));
  }

  getBoundingBox() {
    return this.boundingBox;
  }

  // Glyphs can't be turned into a path, so the hit area is the bounding box from the last draw()
  hitTest(ctx) {
    if (!this._hasInk) return; // nothing visible: empty text, reveal hides all, no fill and no stroke

    const b = this.boundingBox;
    const pad = this.isStroked() ? this.values.strokewidth / 2 : 0;
    ctx.rect(b.left - pad, b.top - pad, b.right - b.left + 2 * pad, b.bottom - b.top + 2 * pad);
    ctx.fill(); // intercepted on pxl.dummyCtx (isPointInPath)
  }
};
pxl.defineShape('pxl-text', pxl.Text);

// =========================================================================
// Late Web Fonts
// =========================================================================
// Text measured before its web font arrived keeps the fallback font's widths until it is measured again. Safari sends
// no loadingdone, and drops the listeners of document.fonts unless a reference keeps the object alive; "loading" on a
// kept reference, then ready, works in Safari, Chrome and Firefox (design/done/2026-11-22_late_web_fonts_plan.md).
pxl._fonts = document.fonts;

// All layers, because a custom shape can draw text too. Hidden or off-screen stages catch up when they next render.
pxl.fontsArrived = function() {
  pxl._fontGeneration++;
  for (let i = 0; i < pxl.stages.length; i++) pxl.stages[i].invalidateLayers();
};

// ready is a new promise for each batch, so read inside the handler it waits for the fonts that start loading now
pxl._fonts.addEventListener('loading', () => pxl._fonts.ready.then(pxl.fontsArrived));
// Fonts that started loading before the engine ran (page text in <head>): their loading event came before the listener
pxl._fonts.ready.then(pxl.fontsArrived);

pxl.Grid = class Grid extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, step: 50, major: 0, labels: false, labelsize: 12 };

  draw(ctx) {
    const { step, major, labels, labelsize, strokewidth } = this.values;
    if (step <= 0) return; // the line loops would never end

    // Visible area: the four stage corners mapped into the grid's own space
    const m = pxl.Matrix.invert(pxl._scratchMatrixA, this.getGlobalMatrix());
    const w = this.stage.values.width, h = this.stage.values.height;
    const x0 = m[4], y0 = m[5];                                       // (0, 0)
    const x1 = m[0] * w + m[4], y1 = m[1] * w + m[5];                 // (w, 0)
    const x2 = m[2] * h + m[4], y2 = m[3] * h + m[5];                 // (0, h)
    const x3 = m[0] * w + m[2] * h + m[4], y3 = m[1] * w + m[3] * h + m[5]; // (w, h)
    let minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
    let minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);

    // The visible area is the bounding box (gradients span what is visible)
    this.setBoundingBox(minX, minY, maxX, maxY);

    // One extra step on every side, then snapped to the grid
    minX -= step; maxX += step;
    minY -= step; maxY += step;
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // Minor lines
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (major > 0 && Math.round(x / step) % major === 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      if (major > 0 && Math.round(y / step) % major === 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    this.applyStyle(ctx);

    // Major lines: every major-th line, twice as thick. Only with a stroke: applyStyle() set the stroke state, without
    // it the canvas would draw them in its default black.
    const isStroked = this.isStroked();
    if (major > 0 && isStroked) {
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        if (Math.round(x / step) % major !== 0) continue;
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += step) {
        if (Math.round(y / step) % major !== 0) continue;
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }

      // Not reset: the labels below only fill, and render() restores the state
      ctx.lineWidth = strokewidth * 2;
      ctx.stroke();
    }

    // Coordinates at the major intersections, in the fill color (or the stroke color without fill; neither: no labels)
    const hasFill = this.hasFill();
    if (labels && major > 0 && (hasFill || isStroked)) {
      ctx.fillStyle = hasFill ? this.createGradient(ctx, this.values.fill, 0) : ctx.strokeStyle;
      ctx.font = `${labelsize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0px';

      const majorStep = step * major;
      const startMajorX = Math.floor(minX / majorStep) * majorStep;
      const endMajorX = Math.ceil(maxX / majorStep) * majorStep;
      const startMajorY = Math.floor(minY / majorStep) * majorStep;
      const endMajorY = Math.ceil(maxY / majorStep) * majorStep;

      for (let x = startMajorX; x <= endMajorX; x += majorStep) {
        for (let y = startMajorY; y <= endMajorY; y += majorStep) {
          ctx.fillText(`${x},${y}`, x, y);
        }
      }
    }
  }

  // Major lines are a second stroke (and bring the labels); a fill and a stroke are two calls too
  drawsMoreThanOnce() {
    return this.values.major > 0 || (this.hasFill() && this.isStroked());
  }

  // Set in draw(): the visible area
  getBoundingBox() {
    return this.boundingBox;
  }

  // Its box is known only in draw(), and it is the visible area anyway: an isolated grid uses the whole layer
  hasBoxBeforeDraw() {
    return false;
  }
};
pxl.defineShape('pxl-grid', pxl.Grid);

pxl.Variable = class Variable extends pxl.PxlNode {
  static defaults = { value: 0 };

  constructor() {
    super();
    // Set only for a stage-level variable (inside a stage, outside every layer): the stage evaluates it
    this.stage = null;
  }

  // display: none comes from pxl.defaultStyles()
  connectedCallback() {
    super.connectedCallback();
    if (!this.parentLayer) {
      this.stage = this.closest('pxl-stage');
      this.stage?.registerVariable(this);
    }
  }

  disconnectedCallback() {
    this.stage?.unregisterVariable(this);
    this.stage = null;
    super.disconnectedCallback();
  }

  // A variable draws nothing: its readers redraw their own layers when their values change
  affectsPixels() {
    return false;
  }

  // From the attribute and the property (el.value = 5)
  valueChanged(name) {
    super.valueChanged(name);
    // No layer to invalidate: the stage starts its loop when the value becomes animated
    this.stage?.requestRender();
  }

  // Update phase. A failing expression keeps the previous value for this frame.
  update(t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this.reportError(error);
    }
  }

  // Draw phase: a variable draws nothing (it is in its layer's or group's childList like a shape)
  render() {}
};
customElements.define('pxl-var', pxl.Variable);

})();
