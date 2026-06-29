class Ellipse extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, pie, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

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
      arrowStartTipX = rx * Math.cos(startRadians) * u;
      arrowStartTipY = ry * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, Math.max(rx, ry));
      const dxStart = -rx * Math.sin(startRadians);
      const dyStart = ry * Math.cos(startRadians);
      const speedStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
      const arrowStartDelta = clampL / (speedStart || 1);
      
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      const basePointX = rx * Math.cos(baseRadians) * u;
      const basePointY = ry * Math.sin(baseRadians) * u;
      
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      arrowEndTipX = rx * Math.cos(endRadians) * u;
      arrowEndTipY = ry * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, Math.max(rx, ry));
      const dxEnd = -rx * Math.sin(endRadians);
      const dyEnd = ry * Math.cos(endRadians);
      const speedEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
      const arrowEndDelta = clampL / (speedEnd || 1);
      
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      const basePointX = rx * Math.cos(baseRadians) * u;
      const basePointY = ry * Math.sin(baseRadians) * u;
      
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * u, ry * u, 0, drawStartRadians, drawEndRadians, isAnti);

    if (irx > 0 || iry > 0) {
      ctx.ellipse(0, 0, irx * u, iry * u, 0, drawEndRadians, drawStartRadians, !isAnti);
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
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
}
customElements.define('pxl-ellipse', Ellipse);
