pxl.Group = class Group extends pxl.PxlNode {
  static get observedAttributes() {
    return ['x', 'y', 'dx', 'dy', 'rotate', 'zoom', 'scalex', 'scaley', 'skewx', 'skewy', 'hidden'];
  }

  static defaults = { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, hidden: false };

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position
  }

  registerChild(child) {
    if (!this.childList.includes(child)) {
      this.childList.push(child);
      this._isOrderDirty = true;
      this.parentLayer?.invalidate();
    }
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  // Update phase. A failing expression skips the group with its children for this frame (also in the draw phase).
  // A hidden group doesn't evaluate its children: their values that follow t stay as they are until it is shown.
  update(t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
      return;
    }

    if (this.attributeValues.hidden) return;
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].update(t);
    }
  }

  // Draw phase, into the parent layer's canvas
  render(ctx, u, t) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate ||
                            zoom !== 1 || scalex !== 1 || scaley !== 1 ||
                            skewx || skewy;

    if (hasStateChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasStateChanges) ctx.restore();
  }
};
customElements.define('pxl-group', pxl.Group);
