// TODO
// Cache Paths?
class Shape extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden', 'onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove']; }

  constructor() {
    super();
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false, isHovered: false, isPressed: false });
    Object.assign(this.attributeValues, this.attributeExpressions);
    
    // Pre-allocated bounding box object (zero-GC)
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };
    
    // Memory Cache to prevent GC allocations at 60 FPS
    this._scaledDash = [];
    this._cachedGradient = null;
    this._lastGradientConfig = null;
    this._lastGradientU = 0;


    this._emptyDash = []; // Zero-GC empty linedash
    
    this._compiledOnClick = null;
    this._compiledOnEnter = null;
    this._compiledOnLeave = null;
    this._compiledOnDown = null;
    this._compiledOnUp = null;
    this._compiledOnMove = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    if (name === 'onclick' || name === 'onenter' || name === 'onleave' || name === 'ondown' || name === 'onup' || name === 'onmove') {
      let sanitizedStr = newValue.replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
      const compiled = new Function('scope', 'ref', `
        const { ${pxl.scopeKeys} } = scope;
        return function() { 
          ${sanitizedStr} 
        };
      `)(pxl.scope, pxl.nodes).bind(this);

      if (name === 'onclick') this._compiledOnClick = compiled;
      if (name === 'onenter') this._compiledOnEnter = compiled;
      if (name === 'onleave') this._compiledOnLeave = compiled;
      if (name === 'ondown')  this._compiledOnDown = compiled;
      if (name === 'onup')    this._compiledOnUp = compiled;
      if (name === 'onmove')  this._compiledOnMove = compiled;
      
      this.stage?.interaction.registerElement(this);
      return;
    }

    super.attributeChangedCallback(name, oldValue, newValue);
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
    
    if (this._compiledOnClick || this._compiledOnEnter || this._compiledOnLeave || this._compiledOnDown || this._compiledOnUp || this._compiledOnMove) {
      this.stage?.interaction.registerElement(this);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.unregisterElement(this);
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, filter } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scalex !== 1 || scaley !== 1 || 
                            skewx || skewy || 
                            alpha !== 1 || blend !== 'source-over' || filter !== 'none';

    // Global Pipeline Sandbox
    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues);
      this.draw(ctx, u, t);
      ctx.restore();
    } else {
      this.draw(ctx, u, t);
    }
  }

  getBoundingBox() {
    console.warn(`[pxl] Warning: Subclass ${this.constructor.name} does not implement getBoundingBox(). Fallback to zeroed bounding box.`);
    // Safe default for unknown shapes
    this.boundingBox.left = 0;
    this.boundingBox.right = 0;
    this.boundingBox.top = 0;
    this.boundingBox.bottom = 0;
    return this.boundingBox;
  }

  createGradient(ctx, u, styleValue) {
    if (typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }

    // Zero-Allocation Gradient Cache
    if (this._lastGradientConfig === styleValue && this._lastGradientU === u) {
      return this._cachedGradient;
    }

    const box = this.getBoundingBox();
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;

    let grad;

    if (styleValue.type === 'linear') {
      let gx1, gy1, gx2, gy2;
      
      if (styleValue.angle !== undefined) {
        const rad = styleValue.angle * Math.PI / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
        gx1 = (cx - distance * cosRad) * u;
        gy1 = (cy - distance * sinRad) * u;
        gx2 = (cx + distance * cosRad) * u;
        gy2 = (cy + distance * sinRad) * u;
      } else {
        gx1 = (box.left + width * styleValue.x1) * u;
        gy1 = (box.top + height * styleValue.y1) * u;
        gx2 = (box.left + width * styleValue.x2) * u;
        gy2 = (box.top + height * styleValue.y2) * u;
      }
      
      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
      
      const stops = styleValue.stops;
      const len = stops.length;
      for (let i = 0; i < len; i++) {
        grad.addColorStop(stops[i].offset, stops[i].color);
      }

    } else if (styleValue.type === 'radial') {
      const rx = (box.left + width * styleValue.cx) * u;
      const ry = (box.top + height * styleValue.cy) * u;
      const radius = (Math.max(width, height) / 2) * styleValue.r * u;
      
      grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, radius);
      
      const stops = styleValue.stops;
      const len = stops.length;
      for (let i = 0; i < len; i++) {
        grad.addColorStop(stops[i].offset, stops[i].color);
      }
    }

    if (grad) {
      this._lastGradientConfig = styleValue;
      this._lastGradientU = u;
      this._cachedGradient = grad;
      return grad;
    }

    return styleValue;
  }

  createLineDash(u, linedash) {
    const len = linedash.length;
    this._scaledDash.length = len;
    for (let i = 0; i < len; i++) {
      this._scaledDash[i] = linedash[i] * u;
    }
    return this._scaledDash;
  }

  applyStyle(ctx, u) {
    const { fill, stroke, strokewidth, linecap, linejoin, miterlimit, linedash, dashoffset } = this.attributeValues;

    if (fill && fill !== 'none' && fill !== 'transparent') {
      ctx.fillStyle = this.createGradient(ctx, u, fill);
      ctx.fill();
    }
    
    if (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) {
      ctx.strokeStyle = this.createGradient(ctx, u, stroke);
      
      ctx.lineWidth = strokewidth * u;
      ctx.lineCap = linecap;
      ctx.lineJoin = linejoin;
      ctx.miterLimit = miterlimit;
      
      if (linedash && Array.isArray(linedash)) {
        ctx.setLineDash(this.createLineDash(u, linedash));
        ctx.lineDashOffset = dashoffset * u;
      } else {
        ctx.setLineDash(this._emptyDash);
        ctx.lineDashOffset = 0;
      }
      
      ctx.stroke();
    }
  }

  drawArrow(ctx, u, tipX, tipY, tangent, size, style) {
    const phi = Math.PI / 6; // 30 degrees
    const wing1X = tipX - size * u * Math.cos(tangent - phi);
    const wing1Y = tipY - size * u * Math.sin(tangent - phi);
    const wing2X = tipX - size * u * Math.cos(tangent + phi);
    const wing2Y = tipY - size * u * Math.sin(tangent + phi);

    ctx.beginPath();
    if (style === 'line') {
      ctx.moveTo(wing1X, wing1Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(wing2X, wing2Y);
      ctx.stroke();
    } else {
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(wing1X, wing1Y);
      ctx.lineTo(wing2X, wing2Y);
      ctx.closePath();
      
      const originalFill = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle; 
      ctx.fill();
      ctx.fillStyle = originalFill;
    }
  }
}