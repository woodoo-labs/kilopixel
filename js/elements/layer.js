class Layer extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false });
    Object.assign(this.attributeValues, this.attributeExpressions);

    this.isDirty = true;
    this.isCanvasEmpty = false;
    this.stage = null;
    this.dpr = 1; // Overwritten by stage

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';

    if (!this.contains(this.canvas)) this.appendChild(this.canvas);
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
    
    this.evaluateAnimations(t);

    const { alpha, blend, filter, hidden } = this.attributeValues;

    if (this._lastAlpha !== alpha) {
      this.canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }
    
    const cssBlend = blend === 'source-over' ? 'normal' : blend;
    if (this._lastBlend !== cssBlend) {
      this.canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    if (filter !== 'none' && filter !== null && filter !== undefined) {
      const filterStr = pxl.resolveFilter(this, filter, u);
      if (this._lastAppliedFilter !== filterStr) {
        this.canvas.style.filter = filterStr;
        this._lastAppliedFilter = filterStr;
      }
    } else if (this._lastAppliedFilter && this._lastAppliedFilter !== 'none') {
      this.canvas.style.filter = 'none';
      this._lastAppliedFilter = 'none';
    }

    // cssOnly Fast Path Check
    let _transformsAnimated = false;
    let _anyCompositingAnimated = false;
    for (let i = 0; i < this.animatedAttributeKeys.length; i++) {
      const k = this.animatedAttributeKeys[i];
      if (pxl.isSpatialKey(k)) {
        _transformsAnimated = true;
      }
      if (k === 'alpha' || k === 'blend' || k === 'filter') {
        _anyCompositingAnimated = true;
      }
    }

    if (_anyCompositingAnimated && !_transformsAnimated && !this.isDirty) {
      if (this.isAnimated) this.stage?.requestRender();
      return; // Skip canvas clear and child rendering!
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.isDirty = false;

    if (hidden) {
      this.isCanvasEmpty = true;
      if (this.isAnimated) this.stage?.requestRender();
      return;
    }

    this.isCanvasEmpty = false;
    
    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasTransformChanges = x || y || dx || dy || rotate || 
                                scale !== 1 || scalex !== 1 || scaley !== 1 || 
                                skewx || skewy;

    if (hasTransformChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    const len = this.childList.length;
    for (let i = 0; i < len; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasTransformChanges) ctx.restore();

    if (this.isAnimated) this.stage?.requestRender();
  }
}
customElements.define('pxl-layer', Layer);