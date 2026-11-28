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
      { config: null, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null, error: null },
      { config: null, bl: 0, bt: 0, br: 0, bb: 0, sw: 0, grad: null, error: null }
    ];

    // A dash written as one number, as the array setLineDash() needs (applyLineDash())
    this._singleDash = [0];

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
  // draw() works in logical units (design/done/2026-11-20_custom_shapes_plan.md §5.3): the layer has scaled the
  // context by u, so every length is written as the attribute gives it. u is only passed on for what ignores the
  // transform: shadows and canvas filters (applyCompositingState()). draw() gets no time: time-dependent values are
  // evaluated in update(), so the hit test sees what is drawn.
  render(ctx, u) {
    if (this._failedFrame === pxl._frame || this.values.hidden) return;
    if (this.needsIsolation()) {
      this.renderIsolated(ctx, u);
      return;
    }
    ctx.save();
    try {
      pxl.applyContextState(ctx, u, this.values, this);
      this.draw(ctx);
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

  // Draws with the shape's global matrix (the same pixels as the layer's transform chain, plan §3.4) into the scratch
  // canvas, only within the shape's device box, then composites that box with an identity transform: canvas shadows
  // and filters ignore the transform, so offsets and blur sizes stay as on the direct path, and they may reach beyond
  // the box. Masks that erase outside the drawn image (destination-in, copy, …) still do: the canvas treats the area
  // outside it as transparent. The GPU work then depends on the shape's size, not the layer's: a shadow is a blur over
  // what is composited (design/done/2026-11-26_isolation_box_plan.md). The scratch canvas is never cleared as a whole:
  // a shape composites only its own box, which it cleared first.
  renderIsolated(ctx, u) {
    const canvas = ctx.canvas, w = canvas.width, h = canvas.height, k = u * this.parentLayer.dpr;
    const scratch = pxl.getIsolationContext(w, h);
    const m = this.getGlobalMatrix(); // in logical units: scaled by u like the layer
    let left = 0, top = 0, right = w, bottom = h;
    scratch.save();
    try {
      // Inside save() / restore(), so state set here (a text's font) doesn't reach the next isolated shape
      if (!this.prepare(scratch)) return;
      if (this.hasBoxBeforeDraw()) {
        // The hit box, padded like for hit testing, through the global matrix: the four corners unrolled (no
        // allocation), rounded outwards with one more device pixel for antialiasing, clamped to the canvas
        const box = this.getHitBox(), pad = this.hitPadding();
        const l = box.left - pad, r = box.right + pad, t = box.top - pad, b = box.bottom + pad;
        const xl = m[0] * l, xr = m[0] * r, xt = m[2] * t + m[4], xb = m[2] * b + m[4];
        const yl = m[1] * l, yr = m[1] * r, yt = m[3] * t + m[5], yb = m[3] * b + m[5];
        left = Math.max(0, Math.floor(Math.min(xl + xt, xr + xt, xl + xb, xr + xb) * k) - 1);
        right = Math.min(w, Math.ceil(Math.max(xl + xt, xr + xt, xl + xb, xr + xb) * k) + 1);
        top = Math.max(0, Math.floor(Math.min(yl + yt, yr + yt, yl + yb, yr + yb) * k) - 1);
        bottom = Math.min(h, Math.ceil(Math.max(yl + yt, yr + yt, yl + yb, yr + yb) * k) + 1);
        // Empty, NaN or off the canvas: nothing to composite
        if (!(right > left && bottom > top)) return;
      }
      scratch.clearRect(0, 0, right - left, bottom - top);
      scratch.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k - left, m[5] * k - top);
      this.draw(scratch);
    } catch (error) {
      this.reportError(error);
      return;
    } finally {
      scratch.restore();
    }
    const bw = right - left, bh = bottom - top;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      pxl.applyCompositingState(ctx, u, this.values, this);
      ctx.drawImage(scratch.canvas, 0, 0, bw, bh, left, top, bw, bh);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  }

  // Runs on the scratch canvas before an isolated shape's box is computed; false means there is nothing to draw.
  // Text lays out here, so its box (measured in draw() otherwise) is current.
  prepare(ctx) {
    return true;
  }

  // Whether the box is known before drawing. Not for a shape without its own getBoundingBox() (it gets the whole
  // area, as its hit test does) and not for the grid, whose box is the visible area, computed in draw().
  hasBoxBeforeDraw() {
    return !this.needsExactHitTest();
  }

  // Custom shapes override this (gradients are sized to it); without it, gradients collapse to a point and hit
  // testing skips its box check. pxl.defineShape() warns once for such a class.
  getBoundingBox() {
    return this.setBoundingBox(0, 0, 0, 0);
  }

  // Writes the box (in the shape's own units, without the stroke) and returns it: no allocation per frame
  setBoundingBox(left, top, right, bottom) {
    const box = this.boundingBox;
    box.left = left;
    box.top = top;
    box.right = right;
    box.bottom = bottom;
    return box;
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

  // The fill or stroke as a canvas style, for a shape that paints with it in its own way (fillText(), a second
  // path): a color string as it is, a gradient built in the shape's box
  paint(ctx, which) {
    return which === 'stroke' ? this.createGradient(ctx, this.values.stroke, 1) : this.createGradient(ctx, this.values.fill, 0);
  }

  createGradient(ctx, styleValue, slot) {
    if (typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }

    const box = this.getBoundingBox();
    const c = this._gradCache[slot];
    const sw = this.values.strokewidth;

    // Reuse while the descriptor, the bounding box and the stroke width are unchanged
    if (c.config === styleValue &&
        c.bl === box.left && c.bt === box.top &&
        c.br === box.right && c.bb === box.bottom && c.sw === sw) {
      if (c.error) throw c.error;
      return c.grad;
    }

    c.config = styleValue;
    c.bl = box.left;
    c.bt = box.top;
    c.br = box.right;
    c.bb = box.bottom;
    c.sw = sw;
    c.grad = null;
    c.error = null;
    try {
      c.grad = this.buildGradient(ctx, styleValue, slot, box, sw);
    } catch (error) {
      // A gradient that fails with these values (a typo in a stop color) fails again: keep the error, so later
      // frames throw the same object instead of building a new one (render() catches it, reportError() stays quiet)
      c.error = error;
      throw error;
    }
    return c.grad;
  }

  // The canvas gradient for a descriptor in the shape's box; createGradient() caches it
  buildGradient(ctx, styleValue, slot, box, sw) {
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
        gx1 = cx - distance * cosRad;
        gy1 = cy - distance * sinRad;
        gx2 = cx + distance * cosRad;
        gy2 = cy + distance * sinRad;
      } else {
        gx1 = left + width * styleValue.x1;
        gy1 = top + height * styleValue.y1;
        gx2 = left + width * styleValue.x2;
        gy2 = top + height * styleValue.y2;
      }

      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const px0 = left + width * styleValue.x0;
      const py0 = top + height * styleValue.y0;
      const px1 = left + width * styleValue.x1;
      const py1 = top + height * styleValue.y1;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = left + width * styleValue.cx;
      const gcy = top + height * styleValue.cy;
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
  applyStrokeState(ctx) {
    const { stroke, strokewidth, linecap, linejoin, miterlimit } = this.values;

    ctx.strokeStyle = this.createGradient(ctx, stroke, 1);

    ctx.lineWidth = strokewidth;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    this.applyLineDash(ctx);
  }

  // The dash pattern as written (setLineDash() copies it): an array, or one number for equal dashes and gaps. Any
  // other value (a string that isn't a pattern) draws solid.
  applyLineDash(ctx) {
    const { linedash, dashoffset } = this.values;
    if (!pxl.hasLineDash(linedash)) {
      ctx.setLineDash(pxl._emptyDash);
      ctx.lineDashOffset = 0;
      return;
    }
    if (typeof linedash === 'number') {
      this._singleDash[0] = linedash;
      ctx.setLineDash(this._singleDash);
    } else {
      ctx.setLineDash(Array.isArray(linedash) ? linedash : pxl._emptyDash);
    }
    ctx.lineDashOffset = dashoffset;
  }

  hasFill() {
    const { fill } = this.values;
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  isStroked() {
    const { stroke, strokewidth } = this.values;
    return !!stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;
  }

  applyStyle(ctx) {
    if (this.hasFill()) {
      ctx.fillStyle = this.createGradient(ctx, this.values.fill, 0);
      ctx.fill();
    }

    if (this.isStroked()) {
      this.applyStrokeState(ctx);
      ctx.stroke();
    }
  }

  // --- Arrowheads ---
  // Geometry: design/done/2026-10-14_unified_arrowhead_geometry_plan.md
  // All distances are logical units, like the path they end.

  // Resolves one arrow end into distances along the path and writes them into the pre-allocated rec.
  // Returns true if this end has an arrowhead.
  resolveArrow(rec, attrValue) {
    const { strokewidth, linecap, linejoin, arrowstyle } = this.values;
    const size = pxl.arrowSize(attrValue, strokewidth);

    if (!(size > 0)) {
      rec.size = 0;
      return false;
    }

    const sw = strokewidth;
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
  drawArrows(ctx, recA, recB) {
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

// =========================================================================
// Defining a Shape's Tag
// =========================================================================
// For built-in and custom shapes alike (design/done/2026-11-20_custom_shapes_plan.md §5.5), in a script after pxl.min.js.
// The checks run once per class, here, instead of in every frame; the tag joins the default styles' display: none,
// so content written inside a shape never shows as page text.
// A key named like one of the engine's own lowercase fields or methods is refused: its accessor on the class prototype
// would take the name over (values and expressions make the constructor throw, stage breaks on disconnect). The fields
// are listed here, the methods are found on the prototypes.
pxl.defineShape = function(tag, Class) {
  if (customElements.get(tag)) {
    console.warn(`[pxl] <${tag}> is already defined; this definition is ignored (is the script loaded twice?).`);
    return;
  }
  const name = Class.name || tag;
  const keys = Object.keys(Class.defaults);
  const reserved = keys.filter((key) => ['values', 'expressions', 'stage', 'handlers'].includes(key) ||
    Object.hasOwn(pxl.Shape.prototype, key) || Object.hasOwn(pxl.PxlNode.prototype, key));
  if (reserved.length > 0) {
    console.error(`[pxl] ${name}: ${reserved.map((key) => `"${key}"`).join(', ')} can't be an attribute: the engine uses ` +
      `the name on every shape. <${tag}> is not defined; rename the attribute.`);
    return;
  }
  for (const key of keys) {
    if (key !== key.toLowerCase()) {
      console.warn(`[pxl] ${name}: the attribute "${key}" must be lowercase. HTML lowercases attribute names, so it never arrives.`);
    }
  }
  // Without ...pxl.Shape.defaults the shape has no x, zoom, fill, …: its matrix is NaN, and it draws nothing
  const missing = Object.keys(pxl.Shape.defaults).filter((key) => !(key in Class.defaults));
  if (missing.length > 0) {
    console.warn(`[pxl] ${name}: static defaults has no ${missing.join(', ')}. Start it with ...pxl.Shape.defaults, ` +
      `or <${tag}> has no position, transform or style.`);
  }
  if (typeof Class.prototype.draw !== 'function') console.warn(`[pxl] ${name} has no draw(ctx): <${tag}> draws nothing.`);
  if (Class.prototype.getBoundingBox === pxl.Shape.prototype.getBoundingBox) {
    console.warn(`[pxl] ${name} has no getBoundingBox(): its gradients collapse to a point, and hit testing can't skip it early.`);
  }
  pxl.hideShapeTag(tag);
  customElements.define(tag, Class);
};
