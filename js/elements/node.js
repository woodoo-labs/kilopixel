pxl.PxlNode = class PxlNode extends HTMLElement {
  // Attribute defaults per class (read-only). Subclasses extend them: { ...Parent.defaults, ... }.
  // Also used to resolve bare / removed attributes (pxl.resolveEmptyAttribute).
  static defaults = {};

  constructor() {
    super();
    // Before any field exists: own properties now were set before the upgrade (pxl.takeOwnProperties)
    const ownKeys = Object.keys(this);
    pxl.defineAccessors(this.constructor);

    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => pxl.setFromRef(this, k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });
    // Drawn origin in the parent space: dx / dy are applied after rotate / scale / skew, so it's the local matrix translation
    Object.defineProperty(this.attributeValues, 'tx', { get: () => this.getLocalMatrix()[4], enumerable: false });
    Object.defineProperty(this.attributeValues, 'ty', { get: () => this.getLocalMatrix()[5], enumerable: false });
    Object.assign(this.attributeExpressions, this.constructor.defaults);
    Object.assign(this.attributeValues, this.constructor.defaults);

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
    this.toLocalAttributeKeys = []; // reactive keys using toLocal(): also depend on this element's own space
    this.isAnimated = false;

    // The children of a layer or group (set there); null for shapes and variables. A field on every node, so the hit
    // walk and the matrix walk read an own property instead of searching HTMLElement's prototype chain for it.
    this.childList = null;

    // Set in connectedCallback
    this.parentLayer = null;
    this.parentContainer = null;
    this.refKey = null;
    // connectedCallback has run: an id that changes from now on is moved in the registry by attributeChangedCallback.
    // During an upgrade the attributes arrive before connectedCallback, which registers the id itself.
    this._isRegistered = false;

    // Own broadcasts from variableChangedCallback() that are still running (see there)
    this._broadcastNesting = 0;

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

    // Scaled filter string, cached per (filter, u) by resolveFilter() (layers and shapes)
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
    if (value === this.attributeExpressions[name]) return;
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
    if (this.refKey) pxl.broadcast(this.refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    if (this._pendingProperties !== null) {
      const pending = this._pendingProperties;
      this._pendingProperties = null;
      pxl.setPendingProperties(this, pending);
    }

    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this._lastParentMatrixVersion = -1; // a new parent's version may equal the old one's
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);

    // Reactive attributes are evaluated now: their refs and toLocal() need the element in the DOM
    const keys = this.reactiveAttributeKeys;
    let matrixDirtied = false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.attributeExpressions[key].call(this, 0);
      if (this.attributeValues[key] !== newVal) {
        this.attributeValues[key] = newVal;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }
    if (matrixDirtied) {
      this.setLocalMatrixDirty();
      this.parentLayer?.invalidate();
    }

    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this.refKey = `ref.${this.id}`;
      // Broadcast arrival so any elements initialized earlier can successfully re-evaluate
      pxl.broadcast(this.refKey);
    }
    this._isRegistered = true;
  }

  disconnectedCallback() {
    this._isRegistered = false;
    if (this.id && pxl.nodes[this.id] === this.attributeValues) {
      delete pxl.nodes[this.id];
    }
    pxl.clearAllVariableSubscriptions(this);
    this.parentContainer?.unregisterChild(this);
  }

  variableChangedCallback(varName) {
    // Chains, diamonds and elements with many inputs are entered one call after the other. A cycle whose values
    // keep changing enters again from inside its own broadcast, one level deeper in every round.
    if (this._broadcastNesting === pxl.MAX_CYCLE_ROUNDS) {
      this.reportError(pxl.CYCLE_MESSAGE);
      return;
    }

    let result;
    try {
      result = pxl.evaluateAttributesForVariable(this, varName);
    } catch (error) {
      // The reader's own error, reported here: the element whose broadcast called this isn't blamed or skipped,
      // and the other readers of that broadcast still update
      this.reportError(error);
      return;
    }

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this.refKey) {
        this._broadcastNesting++;
        pxl.broadcast(this.refKey);
        this._broadcastNesting--;
      }
      this.parentLayer?.invalidate();
    }
  }

  evaluateAnimations(t) {
    let animatedValuesChanged = false;
    let matrixDirtied = false;
    const keys = this.animatedAttributeKeys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.attributeExpressions[key].call(this, t);
      if (this.attributeValues[key] !== newVal) {
        this.attributeValues[key] = newVal;
        animatedValuesChanged = true;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }

    if (matrixDirtied) this.setLocalMatrixDirty();

    if (this.refKey && animatedValuesChanged && pxl._subscriptions[this.refKey]) {
      pxl.broadcast(this.refKey);
    }

    // A layer is its own parentLayer (closest() includes the element). Marking itself dirty here would rule out
    // the CSS-only fast path in Layer.render(); an animated layer keeps the loop running there instead.
    if (this.isAnimated && this.parentLayer !== this) this.parentLayer?.invalidate();

    return animatedValuesChanged;
  }

  // --- Errors ---

  // An element that throws while evaluating or drawing is skipped for this frame instead of breaking the frame.
  // Warns once per distinct message and at most 3 times per element: a message that contains a changing value
  // (an animated negative radius in a custom shape's arc()) would otherwise warn in every frame.
  // An animated element keeps asking for frames: evaluateAnimations() does that at its end, which the error may
  // have skipped, and an error that depends on t can then recover.
  reportError(error) {
    if (this.isAnimated) this.parentLayer?.invalidate();
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

  // Filter string with the helpers' px values scaled by u (layers: CSS filter, shapes: ctx.filter)
  resolveFilter(filter, u) {
    const filterStr = Array.isArray(filter) ? filter.join(' ') : filter;
    if (this._lastFilterRaw !== filterStr || this._lastFilterU !== u) {
      this._lastFilterRaw = filterStr;
      this._lastFilterU = u;
      this._cachedFilterScaled = pxl.scaleResponsiveFilter(filterStr, u);
    }
    return this._cachedFilterScaled;
  }

  // --- Spatial Reactivity ---

  setLocalMatrixDirty() {
    this._isLocalMatrixDirty = true;
    this.broadcastGlobalMatrixChange();
  }

  broadcastGlobalMatrixChange() {
    if (this.childList !== null) {
      const len = this.childList.length;
      const subs = pxl._subscriptions;
      for (let i = 0; i < len; i++) {
        const child = this.childList[i];

        // The child's own space moved: its toLocal() results are stale (design/2026-10-26_tolocal_fix_plan.md).
        // If re-evaluating moves the child, setLocalMatrixDirty() has already walked its subtree.
        let walked = false;
        if (child.toLocalAttributeKeys.length > 0) {
          try {
            walked = (pxl.evaluateToLocalAttributes(child) & 2) !== 0;
          } catch (error) {
            // The reader's own error: the element that moved isn't blamed, and the walk goes on
            child.reportError(error);
          }
        }

        // Broadcast the child if someone is explicitly tracking its global matrix
        if (child.refKey && subs[child.refKey] && subs[child.refKey].length > 0) {
          pxl.broadcast(child.refKey);
        }

        // Walk on: deeper elements may be tracked or read toLocal() too
        if (!walked) child.broadcastGlobalMatrixChange();
      }
    }
  }

  // --- Lazy Matrices ---

  getLocalMatrix() {
    if (this._isLocalMatrixDirty) {
      const v = this.attributeValues;
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

