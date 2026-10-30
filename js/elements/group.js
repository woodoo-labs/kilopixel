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

  // Draws into the parent layer's canvas
  render(ctx, u, t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

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
