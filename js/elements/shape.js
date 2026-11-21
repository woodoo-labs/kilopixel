pxl.Shape = class Shape extends pxl.PxlNode {
  // The pxl-on-* handlers are attributes without a value, so they aren't in defaults
  static get observedAttributes() {
    return [...super.observedAttributes, ...Object.keys(pxl.HANDLER_EVENTS)];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0,
    alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false
  };

  constructor() {
    super();
    // Runtime state written by the interaction engine, read as ref.<id>.isHovered: values, but not attributes
    this.values.isHovered = false;
    this.values.isPressed = false;

    this.stage = null; // set in connectedCallback

    // Reused by getBoundingBox() every frame
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };

    // Gradient cache per slot: [0] = fill, [1] = stroke (createGradient). error: kept when building failed
    this._gradCache = [
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null, error: null },
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null, error: null }
    ];

    // Scaled dash pattern, cached per (linedash, u) by applyLineDash()
    this._lastDash = null;
    this._lastDashU = 0;
    this._scaledDash = [];

    // pxl-on-* listeners by DOM event type (PxlNode.setHandler())
    this.handlers = pxl.createHandlers();
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.releaseElement(this);
  }

  // Update phase. A hidden shape still evaluates, so ref.* to it stays current.
  update(t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
    }
  }

  // Draw phase. Every shape draws in its own canvas state: whatever it changes or throws, the next shape starts clean.
  // draw() works in logical units (design/2026-11-20_custom_shapes_plan.md §5.3): the context is scaled by u after
  // the shape's transform and compositing state (shadows and filters ignore the transform, so they carry u
  // themselves). The built-in shapes still multiply their lengths by draw()'s second argument, which is always 1.
  // draw() gets no time: time-dependent values are evaluated in update(), so the hit test sees what is drawn.
  render(ctx, u) {
    if (this._failedFrame === pxl._frame || this.values.hidden) return;
    if (this.needsIsolation()) {
      this.renderIsolated(ctx, u);
      return;
    }
    ctx.save();
    try {
      pxl.applyContextState(ctx, u, this.values, this);
      ctx.scale(u, u);
      this.draw(ctx, 1);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  }

  // --- Isolated Compositing ---
  // (design/done/2026-11-01_isolated_shape_compositing_plan.md)
  // The canvas composites every draw call on its own, so a shape that draws more than once (fill and stroke,
  // arrowheads, text lines) would mask, blend, filter or shadow its own earlier parts. Such a shape draws into the
  // scratch canvas instead, which then goes onto the layer once, with the shape's compositing state.

  // State that acts on the whole shape. alpha is left out: fades are common and isolating them costs a frame time
  // the per-call result hardly shows (plan §6.1).
  hasCompositingState() {
    const { mask, blend, filter, shadowcolor } = this.values;
    return mask !== 'none' || blend !== 'source-over' || filter !== 'none' ||
           (!!shadowcolor && shadowcolor !== 'none' && shadowcolor !== 'transparent');
  }

  needsIsolation() {
    return this.hasCompositingState() && this.drawsMoreThanOnce();
  }

  // The built-in shapes answer from the values they draw with. A custom shape's draw() is unknown, so it counts as
  // drawing more than once; one that draws once can override this or needsIsolation() (plan §3.5).
  drawsMoreThanOnce() {
    return true;
  }

  // The rule of the path shapes: a fill and a stroke, or arrowheads (one more call in drawArrows())
  fillsAndStrokesOrHasArrows() {
    return (this.hasFill() && this.isStroked()) || this.hasArrowheads();
  }

  // Only lines, polylines, circles and ellipses have arrowstart
  hasArrowheads() {
    const { arrowstart, arrowend, strokewidth } = this.values;
    return arrowstart !== undefined && this.isStroked() &&
           (pxl.arrowSize(arrowstart, strokewidth) > 0 || pxl.arrowSize(arrowend, strokewidth) > 0);
  }

  // Draws with the shape's global matrix (the same pixels as the layer's transform chain, plan §3.4) into the whole
  // scratch area of the layer's size, then composites it with an identity transform: canvas shadows and filters
  // ignore the transform, so offsets and blur sizes stay as on the direct path.
  renderIsolated(ctx, u) {
    const canvas = ctx.canvas, w = canvas.width, h = canvas.height, k = u * this.parentLayer.dpr;
    const scratch = pxl.getIsolationContext(w, h);
    scratch.clearRect(0, 0, w, h);
    scratch.save();
    try {
      const m = this.getGlobalMatrix(); // in logical units: scaled by u like render()
      scratch.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
      this.draw(scratch, 1);
    } catch (error) {
      this.reportError(error);
      return;
    } finally {
      scratch.restore();
    }
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      pxl.applyCompositingState(ctx, u, this.values, this);
      ctx.drawImage(scratch.canvas, 0, 0, w, h, 0, 0, w, h);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
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

  // --- Hit Testing ---
  // (design/done/2026-10-30_framework_compatibility_plan.md §23, E5)

  // Quick test before the exact one: is the point (x, y) in stage units inside the box of what this shape paints?
  // The box is read in every test: a cached box would miss setAttribute('r', …) on a static shape, which doesn't
  // change the matrix. min / max because a rect with a negative w or h is drawn mirrored.
  mayContainPoint(x, y) {
    if (this.needsExactHitTest()) return true;
    const m = this.getInverseGlobalMatrix();
    const lx = m[0] * x + m[2] * y + m[4];
    const ly = m[1] * x + m[3] * y + m[5];
    const box = this.getHitBox();
    const pad = this.hitPadding();
    return lx >= Math.min(box.left, box.right) - pad && lx <= Math.max(box.left, box.right) + pad &&
           ly >= Math.min(box.top, box.bottom) - pad && ly <= Math.max(box.top, box.bottom) + pad;
  }

  // The box that contains the shape's path, in its own units. Usually the bounding box; a shape whose path can leave
  // its bounding box (a smooth polyline's curve) returns a larger one. A NaN box rules the shape out.
  getHitBox() {
    return this.getBoundingBox();
  }

  // A custom shape without its own getBoundingBox() always gets the exact test (the base method warns on every call)
  needsExactHitTest() {
    return this.getBoundingBox === pxl.Shape.prototype.getBoundingBox;
  }

  // How far the paint can reach beyond the path's box: half the stroke, a miter join up to miterlimit × half the
  // stroke, the corner of a square cap, arrowheads (only lines, polylines, circles and ellipses have arrowstart)
  hitPadding() {
    if (!this.isStroked()) return 0;
    const { strokewidth, linejoin, miterlimit, linecap, arrowstart, arrowend } = this.values;
    let pad = strokewidth / 2 * (linejoin === 'miter' ? Math.max(1, miterlimit) : 1);
    if (linecap === 'square') pad = Math.max(pad, strokewidth * Math.SQRT1_2);
    if (arrowstart !== undefined) pad += Math.max(pxl.arrowSize(arrowstart, strokewidth), pxl.arrowSize(arrowend, strokewidth));
    return pad;
  }

  createGradient(ctx, u, styleValue, slot) {
    if (typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }

    const box = this.getBoundingBox();
    const c = this._gradCache[slot];
    const sw = this.values.strokewidth;

    // Reuse while the descriptor, the unit, the bounding box and the stroke width are unchanged
    if (c.config === styleValue && c.u === u &&
        c.bl === box.left && c.bt === box.top &&
        c.br === box.right && c.bb === box.bottom && c.sw === sw) {
      if (c.error) throw c.error;
      return c.grad;
    }

    c.config = styleValue;
    c.u = u;
    c.bl = box.left;
    c.bt = box.top;
    c.br = box.right;
    c.bb = box.bottom;
    c.sw = sw;
    c.grad = null;
    c.error = null;
    try {
      c.grad = this.buildGradient(ctx, u, styleValue, slot, box, sw);
    } catch (error) {
      // A gradient that fails with these values (a typo in a stop color) fails again: keep the error, so later
      // frames throw the same object instead of building a new one (render() catches it, reportError() stays quiet)
      c.error = error;
      throw error;
    }
    return c.grad;
  }

  // The canvas gradient for a descriptor in the shape's box; createGradient() caches it
  buildGradient(ctx, u, styleValue, slot, box, sw) {
    // A stroke is at least strokewidth thick: a line's box has a zero side, and a gradient across it would
    // have zero length and paint nothing. For the stroke, each side spans at least strokewidth around the center.
    // (design/done/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md)
    const width = slot === 1 ? Math.max(box.right - box.left, sw) : box.right - box.left;
    const height = slot === 1 ? Math.max(box.bottom - box.top, sw) : box.bottom - box.top;
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const left = cx - width / 2;
    const top = cy - height / 2;

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
        gx1 = (left + width * styleValue.x1) * u;
        gy1 = (top + height * styleValue.y1) * u;
        gx2 = (left + width * styleValue.x2) * u;
        gy2 = (top + height * styleValue.y2) * u;
      }

      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const px0 = (left + width * styleValue.x0) * u;
      const py0 = (top + height * styleValue.y0) * u;
      const px1 = (left + width * styleValue.x1) * u;
      const py1 = (top + height * styleValue.y1) * u;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height, u);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height, u);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = (left + width * styleValue.cx) * u;
      const gcy = (top + height * styleValue.cy) * u;
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    // Offsets outside 0–1 throw in addColorStop; an animated stop may overshoot, so it parks at the end.
    // NaN (a ref that isn't connected yet) fails both comparisons and becomes 0.
    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
      const offset = stops[i].offset;
      grad.addColorStop(offset > 0 ? (offset < 1 ? offset : 1) : 0, stops[i].color);
    }
    return grad;
  }

  // Sets all stroke-related context state (style, width, caps, joins, dash).
  // Shared by path-based shapes (via applyStyle) and non-path shapes like Text (strokeText).
  applyStrokeState(ctx, u = 1) {
    const { stroke, strokewidth, linecap, linejoin, miterlimit } = this.values;

    ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);

    ctx.lineWidth = strokewidth * u;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    this.applyLineDash(ctx, u);
  }

  // Dash pattern scaled by u; the scaled array is cached per (linedash, u)
  applyLineDash(ctx, u) {
    const { linedash, dashoffset } = this.values;
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
    const { fill } = this.values;
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  isStroked() {
    const { stroke, strokewidth } = this.values;
    return !!stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;
  }

  applyStyle(ctx, u = 1) {
    if (this.hasFill()) {
      ctx.fillStyle = this.createGradient(ctx, u, this.values.fill, 0);
      ctx.fill();
    }

    if (this.isStroked()) {
      this.applyStrokeState(ctx, u);
      ctx.stroke();
    }
  }

  // --- Arrowheads ---
  // Geometry: design/done/2026-10-14_unified_arrowhead_geometry_plan.md
  // All distances are in context units (logical value × u).

  // Resolves one arrow end into distances along the path and writes them into the pre-allocated rec.
  // Returns true if this end has an arrowhead.
  resolveArrow(rec, attrValue, u) {
    const { strokewidth, linecap, linejoin, arrowstyle } = this.values;
    const size = pxl.arrowSize(attrValue, strokewidth) * u;

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
  // Always the last call of a shape's draw(): it changes the miter limit, the dash and fillStyle without
  // resetting them, and render() restores the state afterwards.
  drawArrows(ctx, u, recA, recB) {
    const isLine = this.values.arrowstyle === 'line';

    ctx.beginPath();
    if (recA.size > 0) this.traceArrow(ctx, recA, isLine);
    if (recB.size > 0) this.traceArrow(ctx, recB, isLine);

    if (isLine) {
      // A 60° miter needs a limit of 2 (1 / sin 30°); a lower path miterlimit must not blunt the tip.
      // 4 leaves headroom for float rounding.
      if (ctx.miterLimit < 4) ctx.miterLimit = 4;

      // Chevrons are always solid
      if (pxl.hasLineDash(this.values.linedash)) ctx.setLineDash(pxl._emptyDash);
      ctx.stroke();
    } else {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
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