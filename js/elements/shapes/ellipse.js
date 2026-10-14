class Ellipse extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, pie, closed, anticlockwise, strokewidth, linecap, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const safeRX = Math.max(0, rx);
    const safeRY = Math.max(0, ry);
    const safeIRX = Math.max(0, irx);
    const safeIRY = Math.max(0, iry);

    if (safeRX === 0 && safeRY === 0 && safeIRX === 0 && safeIRY === 0) return;

    const isPie = pie === true;
    const isClosed = closed === true;
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

    const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0, arrowStartDelta = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    const sw = strokewidth * u;
    const capOffset = (linecap !== 'butt') ? (sw * 0.5) : 0;

    if (arrowStartSize > 0 && safeRX > 0 && safeRY > 0) {
      arrowStartTipX = safeRX * Math.cos(startRadians) * u;
      arrowStartTipY = safeRY * Math.sin(startRadians) * u;
      
      const pullbackDist = Math.min(sw + capOffset, arrowStartSize * 0.8);
      const clampL = Math.min(pullbackDist, Math.max(safeRX, safeRY) * 2);
      const dxStart = -safeRX * Math.sin(startRadians);
      const dyStart = safeRY * Math.cos(startRadians);
      const speedStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
      arrowStartDelta = clampL / (speedStart || 1);
      
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      const basePointX = safeRX * Math.cos(baseRadians) * u;
      const basePointY = safeRY * Math.sin(baseRadians) * u;
      
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0, arrowEndDelta = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0 && safeRX > 0 && safeRY > 0) {
      arrowEndTipX = safeRX * Math.cos(endRadians) * u;
      arrowEndTipY = safeRY * Math.sin(endRadians) * u;
      
      const pullbackDist = Math.min(sw + capOffset, arrowEndSize * 0.8);
      const clampL = Math.min(pullbackDist, Math.max(safeRX, safeRY) * 2);
      const dxEnd = -safeRX * Math.sin(endRadians);
      const dyEnd = safeRY * Math.cos(endRadians);
      const speedEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
      arrowEndDelta = clampL / (speedEnd || 1);
      
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      const basePointX = safeRX * Math.cos(baseRadians) * u;
      const basePointY = safeRY * Math.sin(baseRadians) * u;
      
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);
    }

    // Apply arrow arc pullback only if offsets fit within the sweep
    const hasArrowPullback = (arrowStartDelta + arrowEndDelta) < Math.abs(endRadians - startRadians);

    if (hasArrowPullback) {
      if (arrowStartDelta > 0) drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta;
      if (arrowEndDelta > 0)   drawEndRadians   += isAnti ?  arrowEndDelta : -arrowEndDelta;
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.ellipse(0, 0, safeRX * u, safeRY * u, 0, drawStartRadians, drawEndRadians, isAnti);

    if (safeIRX > 0 || safeIRY > 0) {
      if (isFull) {
        ctx.moveTo((safeIRX * u) * Math.cos(drawEndRadians), (safeIRY * u) * Math.sin(drawEndRadians));
      }
      ctx.ellipse(0, 0, safeIRX * u, safeIRY * u, 0, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isPie && !isFull) {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if ((isFull && !hasArrowPullback) || isClosed) {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0 && safeRX > 0 && safeRY > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0 && safeRX > 0 && safeRY > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
}
customElements.define('pxl-ellipse', Ellipse);
