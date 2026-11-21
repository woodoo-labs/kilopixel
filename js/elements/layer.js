pxl.Layer = class Layer extends pxl.PxlNode {
  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    alpha: 1, blend: 'source-over', filter: 'none', hidden: false
  };

  // :host styles have the lowest priority, so page CSS on pxl-layer wins
  static STYLES = ':host { display: block; position: absolute; inset: 0; } ' +
                  'canvas { display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; }';

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position

    this.isDirty = true;
    this._isCanvasEmpty = false;

    // The heartbeat across the two phases (see update())
    this._updateFrame = -1;
    this._wasDirty = false;
    this._keepAlive = false;
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

  // A property, setAttribute() or a ref changed alpha, blend or filter: render() writes the CSS in the next frame and
  // keeps the pixels, like an animated compositing value (the CSS-only path)
  isCompositingKey(key) {
    return key === 'alpha' || key === 'blend' || key === 'filter';
  }

  compositingChanged() {
    this._isCompositingDirty = true;
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

  // Update phase. isDirty carries two things into a frame:
  // - requests from before it (setAttribute(), broadcasts from earlier layers, resize, the first draw): kept in
  //   _wasDirty, because isDirty is cleared now;
  // - the heartbeat: every animated child calls parentLayer.invalidate() while it is evaluated, so after the
  //   children isDirty says "something in here is animated" (_keepAlive), and the layer stays in the next frame.
  update(t) {
    this._updateFrame = pxl._frame;
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    this._wasDirty = this.isDirty;
    this.isDirty = false;
    this._keepAlive = false;

    // A failing expression skips the layer with its children for this frame; it keeps its previous pixels and
    // its request. reportError() keeps an animated layer asking for frames.
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.isDirty = this._wasDirty;
      this.reportError(error);
      return;
    }

    // A hidden layer doesn't evaluate its children: their values that follow t stay as they are until it is shown
    if (!this.values.hidden) {
      for (let i = 0; i < this.childList.length; i++) {
        this.childList[i].update(t);
      }
    }
    this._keepAlive = this.isDirty;
  }

  // Draw in this frame: dirty before the update or since (a later layer's broadcast reaches it after its update;
  // the broadcast has already set its values), animated itself, or new compositing CSS to write
  needsRender() {
    return (this._updateFrame === pxl._frame && this._wasDirty) || this.isDirty || this.isAnimated ||
           this._isCompositingDirty;
  }

  // Draw phase
  render(u) {
    if (this._failedFrame === pxl._frame) return;
    const isUpdated = this._updateFrame === pxl._frame;
    const hasChanged = (isUpdated && this._wasDirty) || this.isDirty;

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

    // CSS-only path: nothing in the layer changed and nothing but compositing is animated (no transform, no hidden),
    // so the pixels stay the same. Also for compositing changed from outside (compositingChanged()).
    let onlyCompositingAnimated = true;
    for (let i = 0; i < this.animatedAttributeKeys.length; i++) {
      if (!this.isCompositingKey(this.animatedAttributeKeys[i])) {
        onlyCompositingAnimated = false;
        break;
      }
    }

    if (onlyCompositingAnimated && !hasChanged) {
      if (this.isAnimated) this.stage.requestRender();
      return;
    }

    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width / this.dpr, this._canvas.height / this.dpr);
    // Drawn with this frame's values: only the heartbeat survives into the next frame
    this.isDirty = isUpdated && this._keepAlive;

    if (hidden) {
      this._isCanvasEmpty = true;
      if (this.isAnimated) this.stage.requestRender();
      return;
    }

    this._isCanvasEmpty = false;

    const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = this.values;
    const hasTransformChanges = x || y || dx || dy || rotate ||
                                zoom !== 1 || scalex !== 1 || scaley !== 1 ||
                                skewx || skewy;

    if (hasTransformChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.values);
    }
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u);
    }
    if (hasTransformChanges) ctx.restore();

    // Heartbeat: an animated layer asks for the next frame (without isDirty, so the CSS-only path stays possible)
    if (this.isAnimated) this.stage.requestRender();
  }
};
customElements.define('pxl-layer', pxl.Layer);