class Grid extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'spacing', 'bounds', 'numbers', 'size', 'font']; }

  constructor() {
    super();
    const defaults = { 
      spacing: 20, 
      bounds: null, 
      numbers: true,
      size: 12,
      font: 'monospace',
      stroke: 'rgba(255, 255, 255, 0.1)',
      strokewidth: 1,
      fill: 'rgba(255, 255, 255, 0.5)'
    };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
    
    // Zero-GC string cache for numbers
    this._textCache = {};
  }

  draw(ctx, u, t) {
    const { spacing, bounds, numbers, size, font } = this.attributeValues;
    
    // Safety clamp to prevent infinite loops if user animates spacing <= 0
    const s = Math.max(1, spacing);

    // Calculate dynamic bound if none is provided
    let b = bounds;
    if (b === null || b === undefined) {
      const h = this.stage ? this.stage.attributeValues.height : 1000;
      b = Math.ceil(Math.sqrt(1000 * 1000 + h * h));
    }

    // Batch path drawing for maximum performance
    ctx.beginPath();
    
    // Draw horizontal lines
    for (let y = 0; y <= b; y += s) {
      ctx.moveTo(-b * u, y * u);
      ctx.lineTo(b * u, y * u);
      if (y !== 0) {
        ctx.moveTo(-b * u, -y * u);
        ctx.lineTo(b * u, -y * u);
      }
    }

    // Draw vertical lines
    for (let x = 0; x <= b; x += s) {
      ctx.moveTo(x * u, -b * u);
      ctx.lineTo(x * u, b * u);
      if (x !== 0) {
        ctx.moveTo(-x * u, -b * u);
        ctx.lineTo(-x * u, b * u);
      }
    }
    
    // Apply stroke exactly once
    // We temporarily hide fill so it doesn't try to fill the grid paths
    const f = this.attributeValues.fill;
    this.attributeValues.fill = null;
    this.applyStyle(ctx, u);
    this.attributeValues.fill = f;

    // Draw numbers if requested
    if (numbers) {
      ctx.font = `${size * u}px ${font}`;
      
      if (f && f !== 'none' && f !== 'transparent') {
        ctx.fillStyle = this.createGradient(ctx, u, f);
      } else {
        ctx.fillStyle = ctx.strokeStyle || '#ffffff';
      }
      
      // Ensure text doesn't overlap by forcing at least 40px between labels
      const textStep = s < 40 ? s * Math.ceil(40 / s) : s;

      // Perfectly center all labels on their mathematical lines
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // X-Axis
      for (let x = 0; x <= b; x += textStep) {
        if (!this._textCache[x]) this._textCache[x] = x.toString();
        ctx.fillText(this._textCache[x], x * u, 0);
        
        if (x !== 0) {
          if (!this._textCache[-x]) this._textCache[-x] = (-x).toString();
          ctx.fillText(this._textCache[-x], -x * u, 0);
        }
      }
      
      // Y-Axis
      for (let y = 0; y <= b; y += textStep) {
        if (y === 0) continue; // Origin 0 is already drawn by the X-axis loop
        
        if (!this._textCache[y]) this._textCache[y] = y.toString();
        ctx.fillText(this._textCache[y], 0, y * u);
        
        if (!this._textCache[-y]) this._textCache[-y] = (-y).toString();
        ctx.fillText(this._textCache[-y], 0, -y * u);
      }
    }
  }

  getBoundingBox() {
    const { bounds } = this.attributeValues;
    let b = bounds;
    if (b === null || b === undefined) {
      const h = this.stage ? this.stage.attributeValues.height : 1000;
      b = Math.ceil(Math.sqrt(1000 * 1000 + h * h));
    }
    
    this.boundingBox.left = -b;
    this.boundingBox.right = b;
    this.boundingBox.top = -b;
    this.boundingBox.bottom = b;
    return this.boundingBox;
  }
}

customElements.define('pxl-grid', Grid);
