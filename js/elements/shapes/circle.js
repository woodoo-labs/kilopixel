pxl.Circle = class Circle extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'r', 'ir', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  static defaults = { ...pxl.Shape.defaults, r: 0, ir: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.attributeValues;

    const safeR = Math.max(0, r);
    const safeIR = Math.max(0, ir);

    if (safeR === 0 && safeIR === 0) return;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;
    const isClosed = closed === true;

    const startRadians = start * Math.PI / 180;

    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= (Math.PI * 2 - 1e-4);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROWHEADS (open arcs only) ---
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = safeR > 0 && safeIR === 0 && !isPie && !isClosed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const radius = safeR * u;
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimArcArrow(arrowStart, radius, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimArcArrow(arrowEnd, radius, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    // --- DRAW PATH ---
    if (drawShaft) {
      ctx.beginPath();
      ctx.arc(0, 0, safeR * u, drawStartRadians, drawEndRadians, isAnti);

      if (safeIR > 0) {
        if (isFull) {
          ctx.moveTo((safeIR * u) * Math.cos(drawEndRadians), (safeIR * u) * Math.sin(drawEndRadians));
        }
        ctx.arc(0, 0, safeIR * u, drawEndRadians, drawStartRadians, !isAnti);
        ctx.closePath();
      } else if (isPie && !isFull) {
        ctx.lineTo(0, 0);
        ctx.closePath();
      } else if ((isFull && !hasArrows) || isClosed) {
        ctx.closePath();
      }

      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasArrows) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Aims an arrow at the arc end at angle `radians`; `inward` (±1) is the angle direction into the arc.
  // Direction is the chord from the arc point one head length in, back to the end, so the head's
  // base sits on the arc. Returns the inset as an angle (straight distance from the end, like all arrowheads).
  aimArcArrow(rec, radius, radians, inward) {
    const px = radius * Math.cos(radians), py = radius * Math.sin(radians);
    const baseRadians = radians + inward * 2 * Math.asin(Math.min(rec.len, 2 * radius) / (2 * radius));
    this.aimArrow(rec, px, py, px - radius * Math.cos(baseRadians), py - radius * Math.sin(baseRadians));
    return 2 * Math.asin(Math.min(rec.inset, 2 * radius) / (2 * radius));
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
};
customElements.define('pxl-circle', pxl.Circle);
