class Group extends HTMLElement {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    this.attributeExpressions = { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false };
    this.attributeValues = { ...this.attributeExpressions };

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
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

  registerChild(child) {
    if (!this.childList.includes(child)) {
      this.childList.push(child);
      this.isOrderDirty = true; // Flag that a sort is needed
      this.parentLayer?.invalidate();
    }
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  variableChangedCallback(varName) {
    const result = pxl.evaluateAttributesForVariable(this, varName);

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
    }
  }

  render(ctx, u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }

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

    if (this.attributeValues.hidden) return;

    // Heartbeat logic
    if (this.isAnimated) this.parentLayer?.invalidate();

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
customElements.define('pxl-group', Group);