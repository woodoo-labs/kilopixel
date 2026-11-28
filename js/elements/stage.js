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

    // The update phase (design/done/2026-11-20_evaluation_model_plan.md): the ids that its readers read (a change
    // of one asks this stage for a frame), the elements with reactive values or toLocal(), and the order of sources
    // (elements that others read, toLocal() readers and the containers above them), with the cycles at the end
    this._idsRead = new Set();
    this._readers = [];
    this._checkedCounter = -1; // pxl._changeCounter at the last pass over the readers
    this._order = [];
    this._cycleStart = 0;
    this._builtOrderVersion = -1;

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
    // Its elements left with it: a stage inserted again builds its order anew
    for (let i = 0; i < this._order.length; i++) this._order[i].isOrderNode = false;
    this._order.length = 0;
    this._cycleStart = 0;
    this._builtOrderVersion = -1;

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
    if (this._builtOrderVersion !== pxl._orderVersion) this.buildOrder();
    this.evaluateOrder(t);

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
    this.updateReaders();

    // Draw phase: only layers whose pixels are out of date, or whose CSS changed
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.needsRender()) layer.render(this.unit);
    }
  }

  // --- Readers and the Order of Sources ---
  // Design: design/done/2026-11-20_evaluation_model_plan.md §3.2, §10, §11

  // A change of the element with this id asks this stage for a frame (pxl.wakeReaders())
  readsId(id) {
    return this._idsRead.has(id);
  }

  // Called for an element of this stage with reactive values or toLocal() when it connects or its expressions change
  // (PxlNode.collectSources()). The ids are never removed: a stale one only asks for a frame that finds nothing to do.
  addReader(reader) {
    const ids = reader.sourceIds;
    for (let i = 0; i < ids.length; i++) this._idsRead.add(ids[i]);
    if (reader.listedIn !== this) {
      reader.listedIn = this;
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
      if (reader.readerStage !== this || (reader.reactiveAttributeKeys.length === 0 && !reader.hasToLocal)) {
        if (reader.listedIn === this) reader.listedIn = null;
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
        if (source === node || !source.isOrderNode || source.readerStage !== this) continue;
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
    if (element.isOrderNode || element.readerStage !== this) return;
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
          if (fn.usesToLocal && values.$node.readerStage === this) this.pushContainers(values.$node, list);
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
  // no frame: this stage is rendering.
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
