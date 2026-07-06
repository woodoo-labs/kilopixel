class Group extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false });
    Object.assign(this.attributeValues, this.attributeExpressions);
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

  render(ctx, u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

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