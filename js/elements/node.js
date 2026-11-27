pxl.PxlNode = class PxlNode extends HTMLElement {
  // Attribute defaults per class (read-only). Subclasses extend them: { ...Parent.defaults, ... }.
  // Also used to resolve bare / removed attributes (pxl.resolveEmptyAttribute).
  static defaults = {};

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
    Object.defineProperty(this.values, 'set', { value: (k, v) => pxl.setFromRef(this, k, v), enumerable: false, writable: false });
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
    // source in the stage's order (Stage.buildOrder())
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
    if (keys.length > 0 || this.hasToLocal) this.readerStage?.addReader(this);
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

  // Part 1 of the update phase (Stage.evaluateOrder()), before the walk, which then skips the element's values with
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
    // A source in the stage's order was evaluated before the walk (Stage.evaluateOrder())
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
    console.warn(`[pxl] <${this.localName}${this.id ? ` id="${this.id}"` : ''}> skipped: ${message}${more}`);
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

