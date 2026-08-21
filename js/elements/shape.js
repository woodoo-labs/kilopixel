// TODO
// Cache Paths?
class Shape extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'mask', 'filter', 'shadowcolor', 'shadowblur', 'shadowx', 'shadowy', 'hidden', 'onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove']; }

  constructor() {
    super();
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false, isHovered: false, isPressed: false });
    Object.assign(this.attributeValues, this.attributeExpressions);
    
    // Pre-allocated bounding box object (zero-GC)
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };
    
    // Dual-Slot Gradient Cache: [0] = fill, [1] = stroke (pre-allocated, zero-GC)
    this._gradCache = [
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null },
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null }
    ];

    this._scaledDash = [];  // Pre-allocated for zero-GC line dash scaling
    this._emptyDash = [];   // Zero-GC empty linedash
    
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

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, mask, filter, shadowcolor } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scalex !== 1 || scaley !== 1 || 
                            skewx || skewy || 
                            alpha !== 1 || blend !== 'source-over' || mask !== 'none' || filter !== 'none' ||
                            shadowcolor;

    // Global Pipeline Sandbox
    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues, this);
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

  createGradient(ctx, u, styleValue, slot) {
    if (typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }

    const box = this.getBoundingBox();
    const c = this._gradCache[slot];

    // Dual-Slot Gradient Cache (bbox-aware)
    if (c.config === styleValue && c.u === u &&
        c.bl === box.left && c.bt === box.top &&
        c.br === box.right && c.bb === box.bottom) {
      return c.grad;
    }

    const width = box.right - box.left;
    const height = box.bottom - box.top;

    let grad;

    if (styleValue.type === 'linear') {
      let gx1, gy1, gx2, gy2;
      
      if (styleValue.angle !== undefined) {
        const bx = (box.left + box.right) / 2;
        const by = (box.top + box.bottom) / 2;
        const rad = styleValue.angle * Math.PI / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
        gx1 = (bx - distance * cosRad) * u;
        gy1 = (by - distance * sinRad) * u;
        gx2 = (bx + distance * cosRad) * u;
        gy2 = (by + distance * sinRad) * u;
      } else {
        gx1 = (box.left + width * styleValue.x1) * u;
        gy1 = (box.top + height * styleValue.y1) * u;
        gx2 = (box.left + width * styleValue.x2) * u;
        gy2 = (box.top + height * styleValue.y2) * u;
      }
      
      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const dx = Math.max(styleValue.x1, 1 - styleValue.x1) * width;
      const dy = Math.max(styleValue.y1, 1 - styleValue.y1) * height;
      const maxD = Math.sqrt(dx * dx + dy * dy);
      
      const gx0 = (box.left + width * styleValue.x0) * u;
      const gy0 = (box.top + height * styleValue.y0) * u;
      const gr0 = maxD * styleValue.r0 * u;
      
      const gx1 = (box.left + width * styleValue.x1) * u;
      const gy1 = (box.top + height * styleValue.y1) * u;
      const gr1 = maxD * styleValue.r1 * u;
      
      grad = ctx.createRadialGradient(gx0, gy0, gr0, gx1, gy1, gr1);

    } else if (styleValue.type === 'conic') {
      const gcx = (box.left + width * styleValue.cx) * u;
      const gcy = (box.top + height * styleValue.cy) * u;
      
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    if (grad) {
      const stops = styleValue.stops;
      const len = stops.length;
      for (let i = 0; i < len; i++) {
        grad.addColorStop(stops[i].offset, stops[i].color);
      }

      c.config = styleValue;
      c.u = u;
      c.bl = box.left;
      c.bt = box.top;
      c.br = box.right;
      c.bb = box.bottom;
      c.grad = grad;
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
      ctx.fillStyle = this.createGradient(ctx, u, fill, 0);
      ctx.fill();
    }
    
    if (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) {
      ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);
      
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