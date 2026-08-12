class PxlNode extends HTMLElement {
  constructor() {
    super();
    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, 'tx', { get: () => this.attributeValues.x + this.attributeValues.dx, enumerable: false });
    Object.defineProperty(this.attributeValues, 'ty', { get: () => this.attributeValues.y + this.attributeValues.dy, enumerable: false });

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
    this.isAnimated = false;
    
    // Zero-GC Lazy Matrix Tracking
    this.localMatrix = null;
    this.globalMatrix = null;
    this._isLocalMatrixDirty = false;
    this._globalMatrixVersion = 0;
    this._parentMatrixVersion = -1;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (pxl.isSpatialKey(name)) {
      this.setLocalMatrixDirty();
    }
    if (this._refKey) pxl.broadcast(this._refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);

    // ZERO-GC FIX: Initial evaluation of reactive attributes now that we have a spatial context
    const keys = this.reactiveAttributeKeys;
    if (keys) {
      const numKeys = keys.length;
      if (numKeys > 0) {
        for (let i = 0; i < numKeys; i++) {
          const key = keys[i];
          const newVal = this.attributeExpressions[key].call(this, 0);
          
          if (this.attributeValues[key] !== newVal) {
            this.attributeValues[key] = newVal;
            if (pxl.isSpatialKey(key)) {
              this.setLocalMatrixDirty();
            }
          }
        }
        if (this._isLocalMatrixDirty) {
          this.parentLayer?.invalidate();
        }
      }
    }

    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      // Broadcast arrival so any elements initialized earlier can successfully re-evaluate
      pxl.broadcast(this._refKey);
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
    const result = pxl.evaluateAttributesForVariable(this, varName);

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
    }
  }

  evaluateAnimations(t) {
    let animatedValuesChanged = false;
    let matrixDirtied = false;
    const animLen = this.animatedAttributeKeys.length;
    if (animLen > 0) {
      for (let i = 0; i < animLen; i++) {
        const key = this.animatedAttributeKeys[i];
        const newVal = this.attributeExpressions[key].call(this, t);
        if (this.attributeValues[key] !== newVal) {
          this.attributeValues[key] = newVal;
          animatedValuesChanged = true;
          
          if (pxl.isSpatialKey(key)) {
            matrixDirtied = true;
          }
        }
      }
    }
    
    if (matrixDirtied) {
      this.setLocalMatrixDirty();
    }
    
    if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
      pxl.broadcast(this._refKey);
    }

    if (this.isAnimated) this.parentLayer?.invalidate();
    
    return animatedValuesChanged;
  }

  // --- Spatial Reactivity Cascade ---
  
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
        
        // Broadcast the child if someone is explicitly tracking its global matrix
        if (child._refKey && subs[child._refKey] && subs[child._refKey].length > 0) {
          pxl.broadcast(child._refKey);
        }
        
        // Recursively push the matrix dirty flag down the DOM tree (zero-cost if no tracked children)
        if (typeof child.broadcastGlobalMatrixChange === 'function') {
          child.broadcastGlobalMatrixChange();
        }
      }
    }
  }

  // --- Lazy Matrix Tracking Getters ---

  getLocalMatrix() {
    if (!this.localMatrix) this.localMatrix = pxl.Matrix.create();
    
    if (this._isLocalMatrixDirty || !this._localMatrixVersion) {
      const v = this.attributeValues;
      const sX = v.scale !== 1 ? v.scale : v.scalex;
      const sY = v.scale !== 1 ? v.scale : v.scaley;
      
      pxl.Matrix.updateLocal(this.localMatrix, v.x, v.y, v.dx, v.dy, v.rotate, sX, sY, v.skewx, v.skewy);
      this._isLocalMatrixDirty = false;
      this._localMatrixVersion = (this._localMatrixVersion || 0) + 1; 
    }
    return this.localMatrix;
  }

  getGlobalMatrix() {
    if (!this.globalMatrix) this.globalMatrix = pxl.Matrix.create();

    this.getLocalMatrix(); // ensure local is clean

    let isDirty = false;

    if (this._lastLocalMatrixVersion !== this._localMatrixVersion) {
      this._lastLocalMatrixVersion = this._localMatrixVersion;
      isDirty = true;
    }

    if (this.parentContainer) {
      const parentGlobal = this.parentContainer.getGlobalMatrix(); // recursively updates parent!
      const parentVersion = this.parentContainer._globalMatrixVersion;

      if (this._lastParentMatrixVersion !== parentVersion) {
        this._lastParentMatrixVersion = parentVersion;
        isDirty = true;
      }

      if (isDirty) {
        pxl.Matrix.multiply(this.globalMatrix, parentGlobal, this.localMatrix);
        this._globalMatrixVersion = (this._globalMatrixVersion || 0) + 1;
      }
    } else {
      if (isDirty) {
        this.globalMatrix.set(this.localMatrix); 
        this._globalMatrixVersion = (this._globalMatrixVersion || 0) + 1;
      }
    }

    if (!this._globalMatrixVersion) this._globalMatrixVersion = 1;

    return this.globalMatrix;
  }
}

window.PxlNode = PxlNode;
