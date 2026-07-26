class PxlNode extends HTMLElement {
  constructor() {
    super();
    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });

    // Zero-GC runtime aliases so lowercase and camelCase access the exact same underlying value
    const aliases = {
      offsetx: 'offsetX', offsety: 'offsetY', pivotx: 'pivotX', pivoty: 'pivotY',
      scalex: 'scaleX', scaley: 'scaleY', skewx: 'skewX', skewy: 'skewY',
      strokewidth: 'strokeWidth', linecap: 'lineCap', linejoin: 'lineJoin',
      miterlimit: 'miterLimit', linedash: 'lineDash', dashoffset: 'dashOffset'
    };
    for (const [lower, camel] of Object.entries(aliases)) {
      Object.defineProperty(this.attributeValues, lower, {
        get: () => this.attributeValues[camel],
        set: (v) => { this.attributeValues[camel] = v; },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(this.attributeExpressions, lower, {
        get: () => this.attributeExpressions[camel],
        set: (v) => { this.attributeExpressions[camel] = v; },
        enumerable: true,
        configurable: true
      });
    }

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
    const attrMap = { 
      offsetx: 'offsetX', offsety: 'offsetY', pivotx: 'pivotX', pivoty: 'pivotY', 
      scalex: 'scaleX', scaley: 'scaleY', skewx: 'skewX', skewy: 'skewY',
      strokewidth: 'strokeWidth', linecap: 'lineCap', linejoin: 'lineJoin', 
      miterlimit: 'miterLimit', linedash: 'lineDash', dashoffset: 'dashOffset',
      onclick: 'onClick', onenter: 'onEnter', onleave: 'onLeave', ondown: 'onDown', onup: 'onUp', onmove: 'onMove'
    };
    name = attrMap[name] || name;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (name === 'x' || name === 'y' || name === 'offsetX' || name === 'offsetY' || name === 'pivotX' || name === 'pivotY' || name === 'rotate' || name === 'scale' || name === 'scaleX' || name === 'scaleY' || name === 'skewX' || name === 'skewY') {
      this._isLocalMatrixDirty = true;
    }
    if (this._refKey) pxl.broadcast(this._refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);

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
    const animLen = this.animatedAttributeKeys.length;
    if (animLen > 0) {
      for (let i = 0; i < animLen; i++) {
        const key = this.animatedAttributeKeys[i];
        const newVal = this.attributeExpressions[key].call(this, t);
        if (this.attributeValues[key] !== newVal) {
          this.attributeValues[key] = newVal;
          animatedValuesChanged = true;
          
          if (key === 'x' || key === 'y' || key === 'offsetX' || key === 'offsetY' || key === 'pivotX' || key === 'pivotY' || key === 'rotate' || key === 'scale' || key === 'scaleX' || key === 'scaleY' || key === 'skewX' || key === 'skewY') {
            this._isLocalMatrixDirty = true;
          }
        }
      }
    }
    
    if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
      pxl.broadcast(this._refKey);
    }

    if (this.isAnimated) this.parentLayer?.invalidate();
    
    return animatedValuesChanged;
  }

  // --- Lazy Matrix Tracking Getters ---

  getLocalMatrix() {
    if (!this.localMatrix) this.localMatrix = pxl.Matrix.create();
    
    if (this._isLocalMatrixDirty || !this._localMatrixVersion) {
      const v = this.attributeValues;
      const scale = v.scale !== undefined ? v.scale : 1;
      const sX = v.scaleX !== null && v.scaleX !== undefined ? v.scaleX : scale;
      const sY = v.scaleY !== null && v.scaleY !== undefined ? v.scaleY : scale;
      
      pxl.Matrix.updateLocal(this.localMatrix, v.x, v.y, v.pivotX, v.pivotY, v.offsetX, v.offsetY, v.rotate, sX, sY, v.skewX, v.skewY);
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
