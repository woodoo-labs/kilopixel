pxl.PxlNode = class PxlNode extends HTMLElement {
  // Attribute defaults per class (read-only). Subclasses extend them: { ...Parent.defaults, ... }.
  // Also used to resolve bare / removed attributes (pxl.resolveEmptyAttribute).
  static defaults = {};

  constructor() {
    super();
    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
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

    // Set in connectedCallback
    this.parentLayer = null;
    this.parentContainer = null;
    this.refKey = null;

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

    // Scaled filter string, cached per (filter, u) by resolveFilter() (layers and shapes)
    this._lastFilterRaw = null;
    this._lastFilterU = 0;
    this._cachedFilterScaled = 'none';

    // Errors already reported by reportError()
    this._lastError = null;
    this._lastErrorMessage = null;
    this._errorCount = 0;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (pxl.isSpatialKey(name)) {
      this.setLocalMatrixDirty();
    }
    if (this.refKey) pxl.broadcast(this.refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
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
  }

  disconnectedCallback() {
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
    if (this.childList) {
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
};

