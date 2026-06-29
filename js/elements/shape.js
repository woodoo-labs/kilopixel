// TODO
// Cache Paths?
class Shape extends HTMLElement {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.parentContainer = null; // Layer or group
    this.parentLayer = null;
    this.isAnimated = false;
    this.attributeExpressions = { x: 0, y: 0, dx: 0, dy: 0, fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false };
    this.attributeValues = { ...this.attributeExpressions };
    
    // Pre-allocated bounding box object (zero-GC)
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };
    
    // Memory Cache to prevent GC allocations at 60 FPS
    this._scaledDash = [];
    this._cachedGradient = null;
    this._lastGradientConfig = null;
    this._lastGradientU = 0;

    // Symmetric tracking arrays
    this.animatedAttributeKeys = []; // 60fps loop bucket
    this.reactiveAttributeKeys = []; // On-demand variable bucket
    
    this._emptyDash = []; // Zero-GC empty linedash
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (this._refKey) pxl.broadcast(this._refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);
    
    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      // Broadcast arrival so any elements initialized earlier can successfully re-evaluate
      pxl.broadcast(this._refKey);
    }
  }

  disconnectedCallback() {
    if (this.id && pxl.nodes[this.id] === this.attributeValues) {
      delete pxl.nodes[this.id];
    }
    pxl.clearAllVariableSubscriptions(this);
    this.parentContainer?.unregisterChild(this);
  }

  variableChangedCallback(varName) {
    const result = pxl.evaluateAttributesForVariable(this, varName);

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
    }
  }

  render(ctx, u, t) {
    let animatedValuesChanged = false;
    const animLen = this.animatedAttributeKeys.length;
    if (animLen > 0) {
      for (let i = 0; i < animLen; i++) {
        const key = this.animatedAttributeKeys[i];
        const newVal = this.attributeExpressions[key](t);
        if (this.attributeValues[key] !== newVal) {
          this.attributeValues[key] = newVal;
          animatedValuesChanged = true;
        }
      }
    }
    
    if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
      pxl.broadcast(this._refKey);
    }

    if (this.attributeValues.hidden) return;

    // Heartbeat logic
    if (this.isAnimated) this.parentLayer?.invalidate();

    const { x, y, dx, dy, rotate, scale, scaleX, scaleY, skewX, skewY, alpha, blend, filter } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scaleX !== 1 || scaleY !== 1 || 
                            skewX || skewY || 
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