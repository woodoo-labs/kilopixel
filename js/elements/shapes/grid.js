class Grid extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'spacing', 'numbers', 'size', 'font']; }

  constructor() {
    super();
    const defaults = { 
      spacing: 20, 
      numbers: true,
      size: 12,
      font: 'monospace',
      stroke: 'rgba(255, 255, 255, 0.1)',
      strokewidth: 1,
      fill: 'rgba(255, 255, 255, 0.5)'
    };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
    
    // Zero-GC Map cache for numbers to prevent string allocations
    this._textMap = new Map();
    
    // Font cache
    this._lastSize = 0;
    this._lastU = 0;
    this._lastFont = '';
    this._cachedFontString = '';
  }

  connectedCallback() {
    super.connectedCallback();
    // Grid needs the Matrix Tracker to project screen coordinates into local space
    pxl.needsMatrixTracking = true;
  }

  draw(ctx, u, t) {
    const { spacing, numbers, size, font } = this.attributeValues;
    const s = Math.max(1, spacing);

    // 1. Calculate the TOTAL Forward Matrix for the Grid
    pxl.pushMatrix();
    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    if (x || y) pxl.matrixTranslate(x || 0, y || 0);
    if (rotate) pxl.matrixRotate(rotate * Math.PI / 180);
    const finalScaleX = (scalex !== 1 && scalex !== undefined) ? scalex : (scale !== undefined ? scale : 1);
    const finalScaleY = (scaley !== 1 && scaley !== undefined) ? scaley : (scale !== undefined ? scale : 1);
    if (finalScaleX !== 1 || finalScaleY !== 1) pxl.matrixScale(finalScaleX, finalScaleY);
    if (skewx || skewy) pxl.matrixSkew(skewx || 0, skewy || 0);
    if (dx || dy) pxl.matrixTranslate(dx || 0, dy || 0);

    const m = pxl.currentMatrix;
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5];
    
    pxl.popMatrix();

    // 2. Calculate Inverse Matrix
    const det = m0 * m3 - m1 * m2;
    if (det === 0) return; // Scale is 0, mathematically invisible
    
    const invDet = 1 / det;
    const i0 = m3 * invDet;
    const i1 = -m1 * invDet;
    const i2 = -m2 * invDet;
    const i3 = m0 * invDet;
    const i4 = (m2 * m5 - m3 * m4) * invDet;
    const i5 = (m1 * m4 - m0 * m5) * invDet;

    // 3. Project the 4 Screen Corners into Local Space
    const W = 1000;
    const H = this.stage ? this.stage.attributeValues.height : 1000;

    // (0,0)
    const px1 = i4;
    const py1 = i5;
    // (W,0)
    const px2 = i0 * W + i4;
    const py2 = i1 * W + i5;
    // (W,H)
    const px3 = i0 * W + i2 * H + i4;
    const py3 = i1 * W + i3 * H + i5;
    // (0,H)
    const px4 = i2 * H + i4;
    const py4 = i3 * H + i5;

    const minX = Math.min(px1, px2, px3, px4);
    const maxX = Math.max(px1, px2, px3, px4);
    const minY = Math.min(py1, py2, py3, py4);
    const maxY = Math.max(py1, py2, py3, py4);

    // 4. Batch Grid Line Generation
    ctx.beginPath();
    
    const startX = Math.floor(minX / s) * s;
    const endX = Math.ceil(maxX / s) * s;
    for (let vx = startX; vx <= endX; vx += s) {
      ctx.moveTo(vx * u, minY * u);
      ctx.lineTo(vx * u, maxY * u);
    }

    const startY = Math.floor(minY / s) * s;
    const endY = Math.ceil(maxY / s) * s;
    for (let vy = startY; vy <= endY; vy += s) {
      ctx.moveTo(minX * u, vy * u);
      ctx.lineTo(maxX * u, vy * u);
    }

    const fillStyle = this.attributeValues.fill;
    this.attributeValues.fill = null;
    this.applyStyle(ctx, u);
    this.attributeValues.fill = fillStyle;

    // 5. Draw Parametric Sticky Numbers
    if (numbers) {
      if (this._lastSize !== size || this._lastU !== u || this._lastFont !== font) {
        this._lastSize = size;
        this._lastU = u;
        this._lastFont = font;
        this._cachedFontString = `${size * u}px ${font}`;
      }
      ctx.font = this._cachedFontString;
      
      if (fillStyle && fillStyle !== 'none' && fillStyle !== 'transparent') {
        ctx.fillStyle = this.createGradient(ctx, u, fillStyle);
      } else {
        ctx.fillStyle = ctx.strokeStyle || '#ffffff';
      }
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textStep = s < 40 ? s * Math.ceil(40 / s) : s;
      const pad = 20; // 20px physical padding from edges
      const padRight = W - pad;
      const padBottom = H - pad;

      // X-Axis Numbers (y = 0 line)
      for (let xNum = Math.floor(minX / textStep) * textStep; xNum <= endX; xNum += textStep) {
        let str = this._textMap.get(xNum);
        if (str === undefined) {
          str = xNum.toString();
          this._textMap.set(xNum, str);
        }

        const oXAbs = m0 * xNum + m4;
        const oYAbs = m1 * xNum + m5;

        let bestT = 0;
        let isVisible = oXAbs >= pad && oXAbs <= padRight && oYAbs >= pad && oYAbs <= padBottom;

        if (!isVisible) {
          bestT = Infinity;
          let t, check;

          // Left Border
          if (m2 !== 0) {
            t = (pad - oXAbs) / m2;
            check = oYAbs + t * m3;
            if (check >= pad && check <= padBottom && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Right Border
          if (m2 !== 0) {
            t = (padRight - oXAbs) / m2;
            check = oYAbs + t * m3;
            if (check >= pad && check <= padBottom && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Top Border
          if (m3 !== 0) {
            t = (pad - oYAbs) / m3;
            check = oXAbs + t * m2;
            if (check >= pad && check <= padRight && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Bottom Border
          if (m3 !== 0) {
            t = (padBottom - oYAbs) / m3;
            check = oXAbs + t * m2;
            if (check >= pad && check <= padRight && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
        }

        if (bestT !== Infinity) {
          ctx.fillText(str, xNum * u, bestT * u);
        }
      }

      // Y-Axis Numbers (x = 0 line)
      for (let yNum = Math.floor(minY / textStep) * textStep; yNum <= endY; yNum += textStep) {
        if (yNum === 0) continue; // Origin already drawn
        
        let str = this._textMap.get(yNum);
        if (str === undefined) {
          str = yNum.toString();
          this._textMap.set(yNum, str);
        }

        const oXAbs = m2 * yNum + m4;
        const oYAbs = m3 * yNum + m5;

        let bestT = 0;
        let isVisible = oXAbs >= pad && oXAbs <= padRight && oYAbs >= pad && oYAbs <= padBottom;

        if (!isVisible) {
          bestT = Infinity;
          let t, check;

          // Left Border
          if (m0 !== 0) {
            t = (pad - oXAbs) / m0;
            check = oYAbs + t * m1;
            if (check >= pad && check <= padBottom && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Right Border
          if (m0 !== 0) {
            t = (padRight - oXAbs) / m0;
            check = oYAbs + t * m1;
            if (check >= pad && check <= padBottom && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Top Border
          if (m1 !== 0) {
            t = (pad - oYAbs) / m1;
            check = oXAbs + t * m0;
            if (check >= pad && check <= padRight && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
          // Bottom Border
          if (m1 !== 0) {
            t = (padBottom - oYAbs) / m1;
            check = oXAbs + t * m0;
            if (check >= pad && check <= padRight && Math.abs(t) < Math.abs(bestT)) bestT = t;
          }
        }

        if (bestT !== Infinity) {
          ctx.fillText(str, bestT * u, yNum * u);
        }
      }
    }
  }

  getBoundingBox() {
    this.boundingBox.left = -999999;
    this.boundingBox.right = 999999;
    this.boundingBox.top = -999999;
    this.boundingBox.bottom = 999999;
    return this.boundingBox;
  }
}

customElements.define('pxl-grid', Grid);
