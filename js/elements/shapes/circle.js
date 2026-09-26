class Circle extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'r', 'ir', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { r: 0, ir: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, pie, closed, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const safeR = Math.max(0, r);
    const safeIR = Math.max(0, ir);

    if (safeR === 0 && safeIR === 0) return;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;
    const isClosed = closed === true;

    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0, arrowStartDelta = 0;
    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0, arrowEndDelta = 0;

    if (arrowStartSize > 0 && safeR > 0) {
      arrowStartTipX = safeR * Math.cos(startRadians) * u;
      arrowStartTipY = safeR * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, safeR * 2);
      arrowStartDelta = 2 * Math.asin(clampL / (2 * safeR));
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      
      const basePointX = safeR * Math.cos(baseRadians) * u;
      const basePointY = safeR * Math.sin(baseRadians) * u;
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);
    }

    if (arrowEndSize > 0 && safeR > 0) {
      arrowEndTipX = safeR * Math.cos(endRadians) * u;
      arrowEndTipY = safeR * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, safeR * 2);
      arrowEndDelta = 2 * Math.asin(clampL / (2 * safeR));
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      
      const basePointX = safeR * Math.cos(baseRadians) * u;
      const basePointY = safeR * Math.sin(baseRadians) * u;
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);
    }

    // Apply filled-arrow arc pullback only if offsets fit within the sweep
    const hasArrowPullback = arrowstyle === 'filled' &&
      (arrowStartDelta + arrowEndDelta) < Math.abs(endRadians - startRadians);

    if (hasArrowPullback) {
      if (arrowStartDelta > 0) drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta;
      if (arrowEndDelta > 0)   drawEndRadians   += isAnti ?  arrowEndDelta : -arrowEndDelta;
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.arc(0, 0, safeR * u, drawStartRadians, drawEndRadians, isAnti);

    if (safeIR > 0) {
      if (isFull) {
        ctx.moveTo((safeIR * u) * Math.cos(drawEndRadians), (safeIR * u) * Math.sin(drawEndRadians));
      }
      ctx.arc(0, 0, safeIR * u, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isPie && !isFull) {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if ((isFull && !hasArrowPullback) || isClosed) {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0 && safeR > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0 && safeR > 0) {
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
