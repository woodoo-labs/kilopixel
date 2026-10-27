pxl.Grid = class Grid extends pxl.Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'step', 'major', 'labels', 'labelsize'];
  }

  static defaults = { ...pxl.Shape.defaults, step: 50, major: 0, labels: false, labelsize: 12 };

  draw(ctx, u, t) {
    const { step, major, labels, labelsize, strokewidth } = this.attributeValues;
    if (step <= 0) return; // the line loops would never end

    // Visible area: the four stage corners mapped into the grid's own space
    const m = pxl.Matrix.invert(pxl._scratchMatrixA, this.getGlobalMatrix());
    const w = this.stage.attributeValues.width, h = this.stage.attributeValues.height;
    const x0 = m[4], y0 = m[5];                                       // (0, 0)
    const x1 = m[0] * w + m[4], y1 = m[1] * w + m[5];                 // (w, 0)
    const x2 = m[2] * h + m[4], y2 = m[3] * h + m[5];                 // (0, h)
    const x3 = m[0] * w + m[2] * h + m[4], y3 = m[1] * w + m[3] * h + m[5]; // (w, h)
    let minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
    let minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);

    // The visible area is the bounding box (gradients span what is visible)
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;

    // One extra step on every side, then snapped to the grid
    minX -= step; maxX += step;
    minY -= step; maxY += step;
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // Minor lines
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (major > 0 && Math.round(x / step) % major === 0) continue;
      ctx.moveTo(x * u, startY * u);
      ctx.lineTo(x * u, endY * u);
    }
    for (let y = startY; y <= endY; y += step) {
      if (major > 0 && Math.round(y / step) % major === 0) continue;
      ctx.moveTo(startX * u, y * u);
      ctx.lineTo(endX * u, y * u);
    }
    this.applyStyle(ctx, u);

    // Major lines: every major-th line, twice as thick
    if (major > 0) {
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        if (Math.round(x / step) % major !== 0) continue;
        ctx.moveTo(x * u, startY * u);
        ctx.lineTo(x * u, endY * u);
      }
      for (let y = startY; y <= endY; y += step) {
        if (Math.round(y / step) % major !== 0) continue;
        ctx.moveTo(startX * u, y * u);
        ctx.lineTo(endX * u, y * u);
      }

      const originalLineWidth = ctx.lineWidth;
      ctx.lineWidth = (strokewidth * 2) * u;
      ctx.stroke();
      ctx.lineWidth = originalLineWidth;
    }

    // Coordinates at the major intersections, in the fill color (or the stroke color without fill)
    if (labels && major > 0) {
      ctx.fillStyle = this.hasFill() ? this.createGradient(ctx, u, this.attributeValues.fill, 0) : ctx.strokeStyle;
      ctx.font = `${labelsize * u}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0px';

      const majorStep = step * major;
      const startMajorX = Math.floor(minX / majorStep) * majorStep;
      const endMajorX = Math.ceil(maxX / majorStep) * majorStep;
      const startMajorY = Math.floor(minY / majorStep) * majorStep;
      const endMajorY = Math.ceil(maxY / majorStep) * majorStep;

      for (let x = startMajorX; x <= endMajorX; x += majorStep) {
        for (let y = startMajorY; y <= endMajorY; y += majorStep) {
          ctx.fillText(`${x},${y}`, x * u, y * u);
        }
      }
    }
  }

  // Set in draw(): the visible area
  getBoundingBox() {
    return this.boundingBox;
  }
};
customElements.define('pxl-grid', pxl.Grid);
