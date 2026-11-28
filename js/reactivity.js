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
// stage and listedIn hold the stage, not the scheduler.
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
      if (reader.stage !== this.stage || (reader.reactiveAttributeKeys.length === 0 && !reader.hasToLocal)) {
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
        if (source === node || !source.isOrderNode || source.stage !== this.stage) continue;
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
    if (element.isOrderNode || element.stage !== this.stage) return;
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
          if (fn.usesToLocal && values.$node.stage === this.stage) this.pushContainers(values.$node, list);
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
