class Grid extends Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'step', 'major', 'labels', 'labelsize'];
  }

  constructor() {
    super();
    const defaults = { step: 50, major: 0, labels: false, labelsize: 12 };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { step, major, labels, labelsize, strokewidth } = this.attributeValues;
    if (!step || step <= 0) return;

    // 1. Invert Global Matrix
    const globalMatrix = this.getGlobalMatrix();
    pxl.Matrix.invert(pxl._scratchMatrixA, globalMatrix);

    // 2. Identify the logical bounds of the Stage/Viewport
    const stageWidth = this.stage ? this.stage.attributeValues.width : 1000;
    const stageHeight = this.stage ? this.stage.attributeValues.height : 1000;

    // 3. Push 4 corners of the viewport through the Inverse Matrix
    let minX, maxX, minY, maxY;
    
    const addPoint = (sx, sy) => {
      const lx = pxl._scratchMatrixA[0] * sx + pxl._scratchMatrixA[2] * sy + pxl._scratchMatrixA[4];
      const ly = pxl._scratchMatrixA[1] * sx + pxl._scratchMatrixA[3] * sy + pxl._scratchMatrixA[5];
      if (minX === undefined) {
        minX = maxX = lx;
        minY = maxY = ly;
      } else {
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
      }
    };

    addPoint(0, 0);
    addPoint(stageWidth, 0);
    addPoint(0, stageHeight);
    addPoint(stageWidth, stageHeight);

    // Update dynamically tracked bounding box for gradients
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;

    // Expand drawing boundaries slightly for safety
    minX -= step; maxX += step;
    minY -= step; maxY += step;

    // Snap to grid
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // 4. Draw Minor Lines
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

    // 5. Draw Major Lines
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

    // 6. Draw Intersection Wallpaper Labels
    if (labels && major > 0) {
      const fillAttr = this.attributeValues.fill;
      ctx.fillStyle = (fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent') 
                        ? this.createGradient(ctx, u, fillAttr) 
                        : ctx.strokeStyle;
      ctx.font = `${labelsize * u}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const majorStep = step * major;
      const startX_major = Math.floor(minX / majorStep) * majorStep;
      const endX_major = Math.ceil(maxX / majorStep) * majorStep;
      const startY_major = Math.floor(minY / majorStep) * majorStep;
      const endY_major = Math.ceil(maxY / majorStep) * majorStep;

      for (let x = startX_major; x <= endX_major; x += majorStep) {
        for (let y = startY_major; y <= endY_major; y += majorStep) {
          ctx.fillText(`${x},${y}`, x * u, y * u);
        }
      }
    }
  }

  getBoundingBox() {
    return this.boundingBox;
  }
}

customElements.define('pxl-grid', Grid);
