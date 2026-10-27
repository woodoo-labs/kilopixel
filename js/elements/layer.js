pxl.Layer = class Layer extends pxl.PxlNode {
  static get observedAttributes() {
    return [
      'x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy',
      'alpha', 'blend', 'filter', 'hidden'
    ];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    alpha: 1, blend: 'source-over', filter: 'none', hidden: false
  };

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this.isOrderDirty = false; // children need sorting by DOM position

    this.isDirty = true;
    this.isCanvasEmpty = false;
    this.stage = null;
    this.dpr = 1; // set by the stage

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    // Compositing is CSS on the canvas element; only written when it changes
    this._lastAlpha = null;
    this._lastBlend = null;
    this._lastAppliedFilter = 'none';
    // Written by pxl.resolveFilter
    this._lastFilterRaw = null;
    this._lastFilterU = 0;
    this._cachedFilterScaled = 'none';
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
    this.isOrderDirty = true;
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }

  // Called by the layer itself and by everything inside it
  invalidate() {
    this.isDirty = true;
    // A hidden layer renders once more to clear its canvas, then stays idle
    if (this.attributeExpressions.hidden && this.isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // Called by the stage on every resize (also when the window moves to a screen with another pixel ratio).
  // Setting the canvas size resets the context, so the DPR scale is applied again.
  resize(w, h, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.scale(dpr, dpr);
    this.invalidate();
  }

  render(u, t) {
    if (this.isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this.isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    const { alpha, blend, filter, hidden } = this.attributeValues;

    if (this._lastAlpha !== alpha) {
      this.canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }

    const cssBlend = blend === 'source-over' ? 'normal' : (blend === 'lighter' ? 'plus-lighter' : blend);
    if (this._lastBlend !== cssBlend) {
      this.canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    const filterStr = filter === 'none' ? 'none' : pxl.resolveFilter(this, filter, u);
    if (this._lastAppliedFilter !== filterStr) {
      this.canvas.style.filter = filterStr;
      this._lastAppliedFilter = filterStr;
    }

    // CSS-only fast path: only compositing is animated, so the pixels stay the same
    let transformsAnimated = false;
    let compositingAnimated = false;
    for (let i = 0; i < this.animatedAttributeKeys.length; i++) {
      const k = this.animatedAttributeKeys[i];
      if (pxl.isSpatialKey(k)) transformsAnimated = true;
      if (k === 'alpha' || k === 'blend' || k === 'filter') compositingAnimated = true;
    }

    if (compositingAnimated && !transformsAnimated && !this.isDirty) {
      if (this.isAnimated) this.stage.requestRender();
      return;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.isDirty = false;

    if (hidden) {
      this.isCanvasEmpty = true;
      if (this.isAnimated) this.stage.requestRender();
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
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasTransformChanges) ctx.restore();

    // Heartbeat: an animated layer asks for the next frame (without isDirty, so the CSS-only path stays possible)
    if (this.isAnimated) this.stage.requestRender();
  }
};
customElements.define('pxl-layer', pxl.Layer);