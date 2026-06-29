class Layer extends HTMLElement {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    this.attributeExpressions = { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false };
    this.attributeValues = { ...this.attributeExpressions };

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];

    this.isDirty = true;
    this.isCanvasEmpty = false;
    this.stage = null;
    this.dpr = 1; // Overwritten by stage

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display: block; position: absolute; inset: 0;';
    this.ctx = this.canvas.getContext('2d');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (this._refKey) pxl.broadcast(this._refKey);
    this.invalidate();
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';

    if (!this.contains(this.canvas)) this.appendChild(this.canvas);
    this.stage = this.closest('pxl-stage');
    this.stage?.registerLayer(this);
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
    this.stage?.unregisterLayer(this);
    this.stage = null;
    this.isDirty = false;
  }

  registerChild(child) {
    if (this.childList.includes(child)) return;
    this.childList.push(child);
    this.isOrderDirty = true; // Flag that a sort is needed
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }

  variableChangedCallback(varName) {
    const result = pxl.evaluateAttributesForVariable(this, varName);

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this.invalidate();
    }
  }

  // called by layer and shapes
  invalidate() {
    this.isDirty = true;
    // If layer is hidden but not empty -> request render.
    if (this.attributeExpressions.hidden && this.isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // triggered by stage's resizeObserver
  resize(w, h, dpr) {
    // What if browser window is moved to different screen?
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.scale(dpr, dpr);
    this.invalidate();
  }

  render(u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }
    
    // Evaluates layer-level animations
    let animatedValuesChanged = false;
    const animLen = this.animatedAttributeKeys.length;
    if (animLen > 0) {
      for (let i = 0; i < animLen; i++) {
        const key = this.animatedAttributeKeys[i];
        const newVal = this.attributeExpressions[key](t);
        if (this.attributeValues[key] !== newVal) {
          this.attributeValues[key] = newVal;
          animatedValuesChanged = true;
        }
      }
    }
    
    if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
      pxl.broadcast(this._refKey);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.isDirty = false;

    // Heartbeat: If this layer has OWN animated properties, keep the stage loop alive
    if (animLen > 0) this.invalidate();

    if (this.attributeValues.hidden) {
      this.isCanvasEmpty = true;
      return;
    }

    this.isCanvasEmpty = false;
    
    const { x, y, dx, dy, rotate, scale, scaleX, scaleY, skewX, skewY, alpha, blend, filter } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scaleX !== 1 || scaleY !== 1 || 
                            skewX || skewY || 
                            alpha !== 1 || blend !== 'source-over' || filter !== 'none';

    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues);
    }
    const len = this.childList.length;
    for (let i = 0; i < len; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasStateChanges) ctx.restore();
  }
}
customElements.define('pxl-layer', Layer);