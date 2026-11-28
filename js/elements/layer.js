pxl.Layer = class Layer extends pxl.PxlNode {
  static defaults = { ...pxl.TRANSFORM_DEFAULTS, alpha: 1, blend: 'source-over', filter: 'none', hidden: false };

  // :host styles have the lowest priority, so page CSS on pxl-layer wins
  static STYLES = ':host { display: block; position: absolute; inset: 0; } ' +
                  'canvas { display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; }';

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position

    // Pixels out of date: something in the layer changed since its last draw
    this.isDirty = true;
    this._isCanvasEmpty = false;

    // Something in the layer was animated in its last update (markAnimated()): the stage walks it in the next frame
    // and keeps its frame loop running. Recomputed in every update, never counted (elements come and go).
    this._animatedFrame = -1;
    this.hasAnimatedContent = false;
    this.stage = null;
    this.dpr = 1; // set by the stage; isolated shapes read it (Shape.renderIsolated())

    // The canvas lives in the layer's shadow root: replacing the layer's children (innerHTML, htmx, frameworks)
    // can't remove it, and the light DOM holds only what the page wrote. The slot shows the light-DOM children;
    // shapes draw nothing as elements, but text or buttons placed in a layer for accessibility need it.
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    const style = document.createElement('style');
    style.textContent = pxl.Layer.STYLES;
    this.attachShadow({ mode: 'open' }).append(style, this._canvas, document.createElement('slot'));

    // Compositing is CSS on the canvas element; only written when it changes
    this._lastAlpha = null;
    this._lastBlend = null;
    this._lastAppliedFilter = 'none';
    this._isCompositingDirty = false; // alpha, blend or filter changed from outside: new CSS, same pixels
  }

  connectedCallback() {
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

  // Called once per connect (PxlNode.connectedCallback); no includes() check, which made inserting n children quadratic
  registerChild(child) {
    this.childList.push(child);
    this._isOrderDirty = true;
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }

  // Called by the layer itself and by everything inside it
  invalidate() {
    this.isDirty = true;
    // A hidden layer renders once more to clear its canvas, then stays idle. The current value, not the expression:
    // a reactive hidden is a function, which would keep the layer idle after it turned false.
    if (this.values.hidden && this._isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // alpha, blend and filter are CSS on the canvas: render() writes the new CSS and keeps the pixels (the CSS-only
  // path), whether they are animated or set from outside (a property, setAttribute(), a ref)
  affectsPixels(key) {
    return key !== 'alpha' && key !== 'blend' && key !== 'filter';
  }

  compositingChanged() {
    this._isCompositingDirty = true;
    this.stage?.requestRender();
  }

  // Called by every animated element inside while it is evaluated (PxlNode.evaluateAnimations()), the layer included
  markAnimated() {
    this._animatedFrame = pxl._frame;
  }

  // An element inside became animated without a change to draw (a hidden shape, a variable): the stage walks the
  // layer in the next frame, whose update then finds it animated
  wake() {
    this.hasAnimatedContent = true;
    this.stage?.requestRender();
  }

  // The cursor over this layer's canvas (InteractionEngine.updateCursor()). On the canvas in the shadow root, so
  // the page's and frameworks' styles on the layer and stage are never overwritten; '' removes it.
  setCursor(cursor) {
    this._canvas.style.cursor = cursor;
  }

  // Called by the stage on every resize (also when the window moves to a screen with another pixel ratio).
  // Setting the canvas size resets the context, so the DPR scale is applied again.
  resize(w, h, dpr) {
    this.dpr = dpr;
    this._canvas.width = Math.floor(w * dpr);
    this._canvas.height = Math.floor(h * dpr);
    this._ctx.scale(dpr, dpr);
    this.invalidate();
  }

  // Update phase: evaluates the layer and its children. A value that changes the pixels makes the layer dirty
  // (evaluateAnimations()); every animated element marks it, so the stage keeps it in the next frame.
  update(t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    // A failing expression skips the layer with its children for this frame; it keeps its previous pixels and
    // stays dirty, so the stage tries again in the next frame
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
    }

    // A hidden layer doesn't evaluate its children: their values that follow t stay as they are until it is shown
    if (this._failedFrame !== pxl._frame && !this.values.hidden) {
      for (let i = 0; i < this.childList.length; i++) {
        this.childList[i].update(t);
      }
    }
    this.hasAnimatedContent = this._animatedFrame === pxl._frame;
  }

  // Draw in this frame: pixels out of date (also by a reader evaluated after this layer's update, in part 3 of the
  // update phase: its values are already set), or new compositing CSS to write
  needsRender() {
    return this.isDirty || this._isCompositingDirty;
  }

  // Draw phase
  render(u) {
    if (this._failedFrame === pxl._frame) return;

    const { alpha, blend, filter, hidden } = this.values;

    if (this._lastAlpha !== alpha) {
      this._canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }

    const cssBlend = blend === 'source-over' ? 'normal' : (blend === 'lighter' ? 'plus-lighter' : blend);
    if (this._lastBlend !== cssBlend) {
      this._canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    const filterStr = filter === 'none' ? 'none' : this.resolveFilter(filter, u);
    if (this._lastAppliedFilter !== filterStr) {
      this._canvas.style.filter = filterStr;
      this._lastAppliedFilter = filterStr;
    }
    this._isCompositingDirty = false;

    // CSS-only path: only compositing changed (or nothing), so the pixels stay the same
    if (!this.isDirty) return;
    this.isDirty = false;

    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width / this.dpr, this._canvas.height / this.dpr);

    if (hidden) {
      this._isCanvasEmpty = true;
      return;
    }

    this._isCanvasEmpty = false;

    const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = this.values;
    const hasTransformChanges = x || y || dx || dy || rotate ||
                                zoom !== 1 || scalex !== 1 || scaley !== 1 ||
                                skewx || skewy;

    // Everything inside draws in logical units: the one scale by u for the whole layer
    // (design/done/2026-11-20_custom_shapes_plan.md §5.3, phase 2). u goes on for shadows and filters only.
    ctx.save();
    ctx.scale(u, u);
    if (hasTransformChanges) pxl.applyTransformState(ctx, this.values);
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u);
    }
    ctx.restore();
  }
};
customElements.define('pxl-layer', pxl.Layer);