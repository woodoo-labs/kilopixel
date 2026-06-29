class Circle extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'r', 'ir', 'start', 'end', 'sweep', 'pie', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { r: 0, ir: 0, start: 0, end: null, sweep: null, pie: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, pie, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;

    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= Math.PI * 1.99;

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0) {
      arrowStartTipX = r * Math.cos(startRadians) * u;
      arrowStartTipY = r * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, r * 2);
      const arrowStartDelta = 2 * Math.asin(clampL / (2 * r));
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      
      const basePointX = r * Math.cos(baseRadians) * u;
      const basePointY = r * Math.sin(baseRadians) * u;
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      arrowEndTipX = r * Math.cos(endRadians) * u;
      arrowEndTipY = r * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, r * 2);
      const arrowEndDelta = 2 * Math.asin(clampL / (2 * r));
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      
      const basePointX = r * Math.cos(baseRadians) * u;
      const basePointY = r * Math.sin(baseRadians) * u;
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.arc(0, 0, r * u, drawStartRadians, drawEndRadians, isAnti);

    if (ir > 0) {
      ctx.arc(0, 0, ir * u, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isPie && !isFull) {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if (isFull) {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
}
customElements.define('pxl-circle', Circle);
