class Polyline extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'points', 'closed', 'smooth', 'mode', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    this.pointCount = 0;
    this.rawParts = []; // Reusable array for parser output
    
    // Highly optimized flat cache and pre-calculated string keys
    this.flatCache = new Float32Array(0); 
    this.pointKeys = [];
    
    const defaults = { closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'points') {
      this.clearPoints();

      pxl.parsePointsIntoArray(newValue, this.rawParts);
      this.pointCount = this.rawParts.length;

      this.flatCache = new Float32Array(this.pointCount);
      this.pointKeys.length = this.pointCount;

      for (let i = 0; i < this.pointCount; i++) {
        const key = `p${i}`;
        this.pointKeys[i] = key;
        pxl.compileAttribute(this, key, this.rawParts[i]);
      }
    } else {
      pxl.compileAttribute(this, name, newValue);
    }

    this.isAnimated = this.animatedAttributeKeys.length > 0;
    this.parentLayer?.invalidate();
  }

  clearPoints() {
    for (let i = 0; i < this.pointCount; i++) {
      const key = this.pointKeys[i];
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      delete this.attributeExpressions[key];
      delete this.attributeValues[key];
    }
    this.pointCount = 0;
  }

  // variableChangedCallback — INHERITED from Shape. No override needed.

  draw(ctx, u, t) {
    if (this.pointCount < 4) return;

    const { closed, smooth, arrowstart, arrowend, arrowstyle, linecap, strokewidth } = this.attributeValues;
    const isSmooth = smooth !== false && smooth !== null;
    const tension = typeof smooth === 'number' ? smooth : 1;

    for (let i = 0; i < this.pointCount; i++) {
      this.flatCache[i] = this.attributeValues[this.pointKeys[i]] * u;
    }

    if (this.attributeValues.mode === 'relative') {
      for (let i = 2; i < this.pointCount; i++) {
        this.flatCache[i] += this.flatCache[i - 2];
      }
    }

    const len = this.pointCount / 2;

    // --- ARROW OFFSET INTERCEPTION ---
    let origLineStartX, origLineStartY, arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0) {
      origLineStartX = this.flatCache[0]; 
      origLineStartY = this.flatCache[1];
      arrowStartTipX = origLineStartX; 
      arrowStartTipY = origLineStartY;

      arrowStartAngle = Math.atan2(this.flatCache[1] - this.flatCache[3], this.flatCache[0] - this.flatCache[2]);
      const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

      arrowStartTipX += Math.cos(arrowStartAngle) * swOffset;
      arrowStartTipY += Math.sin(arrowStartAngle) * swOffset;

      if (arrowstyle === 'filled') {
        this.flatCache[0] -= Math.cos(arrowStartAngle) * arrowStartSize * u * 0.75;
        this.flatCache[1] -= Math.sin(arrowStartAngle) * arrowStartSize * u * 0.75;
      }
    }

    let origLineEndX, origLineEndY, arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      const lastX = this.pointCount - 2;
      const lastY = this.pointCount - 1;
      
      origLineEndX = this.flatCache[lastX]; 
      origLineEndY = this.flatCache[lastY];
      arrowEndTipX = origLineEndX; 
      arrowEndTipY = origLineEndY;

      arrowEndAngle = Math.atan2(this.flatCache[lastY] - this.flatCache[lastY - 2], this.flatCache[lastX] - this.flatCache[lastX - 2]);
      const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

      arrowEndTipX += Math.cos(arrowEndAngle) * swOffset;
      arrowEndTipY += Math.sin(arrowEndAngle) * swOffset;

      if (arrowstyle === 'filled') {
        this.flatCache[lastX] -= Math.cos(arrowEndAngle) * arrowEndSize * u * 0.75;
        this.flatCache[lastY] -= Math.sin(arrowEndAngle) * arrowEndSize * u * 0.75;
      }
    }

    ctx.beginPath();
    ctx.moveTo(this.flatCache[0], this.flatCache[1]);

    if (!isSmooth) {
      for (let i = 1; i < len; i++) {
        ctx.lineTo(this.flatCache[i*2], this.flatCache[i*2+1]);
      }
    } else {
      const loopLen = closed ? len : len - 1;
      
      for (let i = 0; i < loopLen; i++) {
        const i0 = closed ? (i - 1 + len) % len : Math.max(i - 1, 0);
        const i1 = i;
        const i2 = (i + 1) % len;
        const i3 = closed ? (i + 2) % len : Math.min(i + 2, len - 1);

        const p0x = this.flatCache[i0*2], p0y = this.flatCache[i0*2+1];
        const p1x = this.flatCache[i1*2], p1y = this.flatCache[i1*2+1];
        const p2x = this.flatCache[i2*2], p2y = this.flatCache[i2*2+1];
        const p3x = this.flatCache[i3*2], p3y = this.flatCache[i3*2+1];

        const cp1x = p1x + (p2x - p0x) * (tension / 6);
        const cp1y = p1y + (p2y - p0y) * (tension / 6);
        const cp2x = p2x - (p3x - p1x) * (tension / 6);
        const cp2y = p2y - (p3y - p1y) * (tension / 6);

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
      }
    }
    
    if (closed) ctx.closePath();
    this.applyStyle(ctx, u);

    // --- CACHE RESTORE & DRAW ARROWS ---
    if (arrowStartSize > 0) {
      this.flatCache[0] = origLineStartX; 
      this.flatCache[1] = origLineStartY;
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0) {
      this.flatCache[this.pointCount - 2] = origLineEndX; 
      this.flatCache[this.pointCount - 1] = origLineEndY;
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    if (this.pointCount < 4) {
      this.boundingBox.left = 0;
      this.boundingBox.right = 0;
      this.boundingBox.top = 0;
      this.boundingBox.bottom = 0;
      return this.boundingBox;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.attributeValues.mode === 'relative';

    for (let i = 0; i < this.pointCount; i += 2) {
      const px = this.attributeValues[this.pointKeys[i]];
      const py = this.attributeValues[this.pointKeys[i+1]];
      
      if (isRelative && i > 0) {
        currentX += px;
        currentY += py;
      } else {
        currentX = px;
        currentY = py;
      }

      if (currentX < minX) minX = currentX;
      if (currentX > maxX) maxX = currentX;
      if (currentY < minY) minY = currentY;
      if (currentY > maxY) maxY = currentY;
    }
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;
    return this.boundingBox;
  }
}
customElements.define('pxl-polyline', Polyline);
