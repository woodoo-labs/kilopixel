class Line extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { x1, y1, x2, y2, arrowstart, arrowend, arrowstyle, linecap, strokewidth } = this.attributeValues;

    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowStartSize <= 0 && arrowEndSize <= 0) {
      ctx.beginPath();
      ctx.moveTo(x1 * u, y1 * u);
      ctx.lineTo(x2 * u, y2 * u);
      this.applyStyle(ctx, u);
      return;
    }

    let lineStartX = x1 * u;
    let lineStartY = y1 * u;
    let lineEndX = x2 * u;
    let lineEndY = y2 * u;
    
    let arrowStartTipX = lineStartX, arrowStartTipY = lineStartY;
    let arrowEndTipX = lineEndX, arrowEndTipY = lineEndY;
    
    let arrowStartAngle = 0, arrowEndAngle = 0;
    const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

    if (arrowStartSize > 0) {
      arrowStartAngle = Math.atan2(y1 - y2, x1 - x2);
      arrowStartTipX += Math.cos(arrowStartAngle) * swOffset;
      arrowStartTipY += Math.sin(arrowStartAngle) * swOffset;
      if (arrowstyle === 'filled') {
        lineStartX -= Math.cos(arrowStartAngle) * arrowStartSize * u * 0.75;
        lineStartY -= Math.sin(arrowStartAngle) * arrowStartSize * u * 0.75;
      }
    }

    if (arrowEndSize > 0) {
      arrowEndAngle = Math.atan2(y2 - y1, x2 - x1);
      arrowEndTipX += Math.cos(arrowEndAngle) * swOffset;
      arrowEndTipY += Math.sin(arrowEndAngle) * swOffset;
      if (arrowstyle === 'filled') {
        lineEndX -= Math.cos(arrowEndAngle) * arrowEndSize * u * 0.75;
        lineEndY -= Math.sin(arrowEndAngle) * arrowEndSize * u * 0.75;
      }
    }

    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineEndX, lineEndY);
    this.applyStyle(ctx, u);

    if (arrowStartSize > 0) this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    if (arrowEndSize > 0) this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
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
