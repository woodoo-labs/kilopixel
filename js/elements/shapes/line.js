class Line extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2', 'arrowstart', 'arrowend', 'arrowstyle']; }

  static defaults = { ...Shape.defaults, x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { x1, y1, x2, y2, arrowstart, arrowend } = this.attributeValues;
    const startX = x1 * u, startY = y1 * u;
    const endX = x2 * u, endY = y2 * u;

    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const isStroked = this.isStroked();
    const hasStart = isStroked && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = isStroked && this.resolveArrow(arrowEnd, arrowend, u);

    if (!hasStart && !hasEnd) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      this.applyStyle(ctx, u);
      return;
    }

    let length = 0;
    if (hasStart) length = this.aimArrow(arrowStart, startX, startY, startX - endX, startY - endY);
    if (hasEnd)   length = this.aimArrow(arrowEnd, endX, endY, endX - startX, endY - startY);

    const startInset = hasStart ? arrowStart.inset : 0;
    const endInset = hasEnd ? arrowEnd.inset : 0;

    // Shaft is trimmed along the line; skipped if both insets would cross each other
    if (startInset + endInset < length) {
      const dirX = (endX - startX) / length, dirY = (endY - startY) / length;
      ctx.beginPath();
      ctx.moveTo(startX + dirX * startInset, startY + dirY * startInset);
      ctx.lineTo(endX - dirX * endInset, endY - dirY * endInset);
      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  getBoundingBox() {
    const { x1, y1, x2, y2 } = this.attributeValues;
    this.boundingBox.left = Math.min(x1, x2);
    this.boundingBox.right = Math.max(x1, x2);
    this.boundingBox.top = Math.min(y1, y2);
    this.boundingBox.bottom = Math.max(y1, y2);
    return this.boundingBox;
  }
}
customElements.define('pxl-line', Line);
