pxl.Shape = class Shape extends pxl.PxlNode {
  static get observedAttributes() {
    return [
      'x', 'y', 'dx', 'dy', 'rotate', 'zoom', 'scalex', 'scaley', 'skewx', 'skewy',
      'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset',
      'alpha', 'blend', 'mask', 'filter', 'shadowcolor', 'shadowblur', 'shadowx', 'shadowy', 'hidden',
      'onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove'
    ];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0,
    alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false,
    isHovered: false, isPressed: false
  };

  // Event attribute → its key in this.handlers
  static HANDLER_EVENTS = { onclick: 'click', onenter: 'enter', onleave: 'leave', ondown: 'down', onup: 'up', onmove: 'move' };

  constructor() {
    super();
    this.stage = null; // set in connectedCallback

    // Reused by getBoundingBox() every frame
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };

    // Gradient cache per slot: [0] = fill, [1] = stroke (createGradient)
    this._gradCache = [
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null },
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null }
    ];

    // Scaled dash pattern, cached per (linedash, u) by applyLineDash()
    this._lastDash = null;
    this._lastDashU = 0;
    this._scaledDash = [];

    // Compiled on* handlers, called by the InteractionEngine
    this.handlers = { click: null, enter: null, leave: null, down: null, up: null, move: null };
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    const event = pxl.Shape.HANDLER_EVENTS[name];
    if (event) {
      // Removed or empty: no handler. Not unregistered here (a handler may remove itself during
      // InteractionEngine.process()); releaseIfUnused() unregisters the shape on its next leave / release.
      let compiled = null;
      if (newValue) {
        // Handlers are plain JavaScript and never subscribe to ref.*, so their state references are sticky
        pxl.trackInteractiveRefs(newValue, true);
        compiled = new Function('scope', 'ref', `
          const { ${pxl.scopeKeys} } = scope;
          return function() {
            ${pxl.rewriteExpression(newValue)}
          };
        `)(pxl.scope, pxl.nodes).bind(this);
      }

      this.handlers[event] = compiled;
      if (compiled) this.stage?.interaction.registerElement(this);
      return;
    }

    super.attributeChangedCallback(name, oldValue, newValue);
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();

    // Register if it has handlers, or if another element reads its isHovered / isPressed
    if (this.hasEventHandlers() || (this.id && pxl._interactiveIds.has(this.id))) {
      this.stage?.interaction.registerElement(this);
    }
  }

  hasEventHandlers() {
    const h = this.handlers;
    return !!(h.click || h.enter || h.leave || h.down || h.up || h.move);
  }

  // Hand cursor only for elements that react to clicks or presses
  isClickable() {
    const h = this.handlers;
    return !!(h.click || h.down || h.up) || (!!this.id && pxl._pressableIds.has(this.id));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.unregisterElement(this);
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy, alpha, blend, mask, filter, shadowcolor } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate ||
                            zoom !== 1 || scalex !== 1 || scaley !== 1 ||
                            skewx || skewy ||
                            alpha !== 1 || blend !== 'source-over' || mask !== 'none' || filter !== 'none' ||
                            shadowcolor;

    // save / restore only when the shape changes the context state
    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues, this);
      this.draw(ctx, u, t);
      ctx.restore();
    } else {
      this.draw(ctx, u, t);
    }
  }

  // Custom shapes override this (gradients are sized to it); without it, gradients collapse to a point
  getBoundingBox() {
    console.warn(`[pxl] Warning: Subclass ${this.constructor.name} does not implement getBoundingBox(). Fallback to zeroed bounding box.`);
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

    // Reuse while the descriptor, the unit and the bounding box are unchanged
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
      const px0 = (box.left + width * styleValue.x0) * u;
      const py0 = (box.top + height * styleValue.y0) * u;
      const px1 = (box.left + width * styleValue.x1) * u;
      const py1 = (box.top + height * styleValue.y1) * u;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height, u);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height, u);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = (box.left + width * styleValue.cx) * u;
      const gcy = (box.top + height * styleValue.cy) * u;
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
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

  // Sets all stroke-related context state (style, width, caps, joins, dash).
  // Shared by path-based shapes (via applyStyle) and non-path shapes like Text (strokeText).
  applyStrokeState(ctx, u) {
    const { stroke, strokewidth, linecap, linejoin, miterlimit } = this.attributeValues;

    ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);

    ctx.lineWidth = strokewidth * u;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    this.applyLineDash(ctx, u);
  }

  // Dash pattern scaled by u; the scaled array is cached per (linedash, u)
  applyLineDash(ctx, u) {
    const { linedash, dashoffset } = this.attributeValues;
    if (!pxl.hasLineDash(linedash)) {
      ctx.setLineDash(pxl._emptyDash);
      ctx.lineDashOffset = 0;
      return;
    }

    if (this._lastDash !== linedash || this._lastDashU !== u) {
      this._lastDash = linedash;
      this._lastDashU = u;

      const scaled = this._scaledDash;
      if (typeof linedash === 'number') {
        scaled.length = 1;
        scaled[0] = linedash * u;
      } else if (Array.isArray(linedash)) {
        scaled.length = linedash.length;
        for (let i = 0; i < linedash.length; i++) {
          scaled[i] = linedash[i] * u;
        }
      }
    }

    ctx.setLineDash(this._scaledDash);
    ctx.lineDashOffset = dashoffset * u;
  }

  hasFill() {
    const { fill } = this.attributeValues;
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  isStroked() {
    const { stroke, strokewidth } = this.attributeValues;
    return !!stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;
  }

  applyStyle(ctx, u) {
    if (this.hasFill()) {
      ctx.fillStyle = this.createGradient(ctx, u, this.attributeValues.fill, 0);
      ctx.fill();
    }

    if (this.isStroked()) {
      this.applyStrokeState(ctx, u);
      ctx.stroke();
    }
  }

  // --- Arrowheads ---
  // Geometry: design/2026-10-14_unified_arrowhead_geometry_plan.md
  // All distances are in context units (logical value × u).

  // Resolves one arrow end into distances along the path and writes them into the pre-allocated rec.
  // Returns true if this end has an arrowhead.
  resolveArrow(rec, attrValue, u) {
    const { strokewidth, linecap, linejoin, arrowstyle } = this.attributeValues;
    const size = (attrValue === 'auto' ? strokewidth * 3.6 : attrValue) * u;

    if (!(size > 0)) {
      rec.size = 0;
      return false;
    }

    const sw = strokewidth * u;
    const len = size * pxl.ARROW_COS30;
    const capExt = (linecap === 'butt') ? 0 : sw * 0.5;

    rec.size = size;
    rec.len = len;

    if (arrowstyle === 'line') {
      // How far the stroked chevron corner reaches beyond its path vertex.
      // Miter tips are always sharp: drawArrows lifts a low miterlimit for the chevron.
      const joinExt = (linejoin === 'round') ? sw * 0.5
                    : (linejoin === 'bevel') ? sw * 0.25
                    : sw;
      rec.tipAdvance = capExt - joinExt;
      rec.inset = joinExt;
    } else {
      // Shallowest depth (behind the tip) at which the shaft's visible end fits inside the 30° wedge.
      const minDepth = (linecap === 'butt') ? sw * pxl.ARROW_COS30
                     : (linecap === 'square') ? sw * (pxl.ARROW_COS30 + 0.5)
                     : sw;
      // Heads narrower than the stroke clamp to the base line: continuous in size and strokewidth.
      const depth = Math.min(Math.max(minDepth, pxl.ARROW_K_DEPTH * len), len + capExt);
      rec.tipAdvance = capExt;
      rec.inset = depth - capExt;
    }
    return true;
  }

  // Points rec away from the path end (px, py) along the vector (vx, vy) and places the tip.
  // Returns the length of (vx, vy).
  aimArrow(rec, px, py, vx, vy) {
    const length = Math.sqrt(vx * vx + vy * vy);
    rec.dirX = (length > 0) ? vx / length : 1;
    rec.dirY = (length > 0) ? vy / length : 0;
    rec.tipX = px + rec.dirX * rec.tipAdvance;
    rec.tipY = py + rec.dirY * rec.tipAdvance;
    return length;
  }

  // Draws both arrowheads in one path. Expects stroke state to be applied already.
  drawArrows(ctx, u, recA, recB) {
    const isLine = this.attributeValues.arrowstyle === 'line';

    ctx.beginPath();
    if (recA.size > 0) this.traceArrow(ctx, recA, isLine);
    if (recB.size > 0) this.traceArrow(ctx, recB, isLine);

    if (isLine) {
      // A 60° miter needs a limit of 2 (1 / sin 30°); a lower path miterlimit must not blunt the tip.
      // 4 leaves headroom for float rounding. Not restored: stroke state is always set before stroking.
      if (ctx.miterLimit < 4) ctx.miterLimit = 4;

      // Chevrons are always solid
      const hasDash = pxl.hasLineDash(this.attributeValues.linedash);
      if (hasDash) ctx.setLineDash(pxl._emptyDash);
      ctx.stroke();
      if (hasDash) this.applyLineDash(ctx, u);
    } else {
      const originalFill = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.fillStyle = originalFill;
    }
  }

  traceArrow(ctx, rec, isLine) {
    const { size, tipX, tipY, dirX, dirY } = rec;
    // Wings: direction rotated by ±30°, pointing back from the tip
    const cx = size * dirX * pxl.ARROW_COS30, cy = size * dirY * pxl.ARROW_COS30;
    const sx = size * dirX * pxl.ARROW_SIN30, sy = size * dirY * pxl.ARROW_SIN30;
    const wing1X = tipX - cx - sy, wing1Y = tipY - cy + sx;
    const wing2X = tipX - cx + sy, wing2Y = tipY - cy - sx;

    if (isLine) {
      ctx.moveTo(wing1X, wing1Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(wing2X, wing2Y);
    } else {
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(wing1X, wing1Y);
      ctx.lineTo(wing2X, wing2Y);
      ctx.closePath();
    }
  }
};