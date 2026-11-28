// =========================================================================
// pxl.ArcShape: the shared base of circle and ellipse (no tag of its own)
// =========================================================================
// Both draw an elliptical arc and close it in one of their ways: a full turn, a ring (inner radii), a pie (lines to
// the center) or a chord (closed), with arrowheads on an open arc. A circle is the case rx = ry. The radii are
// parameters, never read here from the values: each subclass has its own radius attributes (r, ir or rx, ry, irx, iry).
// End angle in radians: sweep (relative to start) wins over end; neither means a full turn
pxl.arcEndRadians = function(startRadians, end, sweep) {
  if (sweep !== null) return startRadians + sweep * Math.PI / 180;
  if (end !== null) return end * Math.PI / 180;
  return startRadians + Math.PI * 2;
};

pxl.isFullTurn = function(startRadians, endRadians) {
  return Math.abs(endRadians - startRadians) >= Math.PI * 2 - 1e-4;
};

pxl.ArcShape = class ArcShape extends pxl.Shape {
  static defaults = {
    ...pxl.Shape.defaults,
    start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false,
    arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  // The arc with radii rx, ry and the inner radii irx, iry (a ring when either is above 0). Negative radii count as 0.
  drawArc(ctx, rx, ry, irx, iry) {
    const { start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.values;

    const safeRX = Math.max(0, rx);
    const safeRY = Math.max(0, ry);
    const safeIRX = Math.max(0, irx);
    const safeIRY = Math.max(0, iry);

    if (safeRX === 0 && safeRY === 0 && safeIRX === 0 && safeIRY === 0) return;

    const isPie = pie === true;
    const isClosed = closed === true;
    const isAnti = anticlockwise === true;
    const hasInner = safeIRX > 0 || safeIRY > 0;

    const startRadians = start * Math.PI / 180;
    const endRadians = pxl.arcEndRadians(startRadians, end, sweep);
    const isFull = pxl.isFullTurn(startRadians, endRadians);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // Arrowheads (open arcs only)
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = safeRX > 0 && safeRY > 0 && !hasInner && !isPie && !isClosed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimArcArrow(arrowStart, safeRX, safeRY, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimArcArrow(arrowEnd, safeRX, safeRY, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    if (drawShaft) {
      ctx.beginPath();
      this.traceArc(ctx, safeRX, safeRY, drawStartRadians, drawEndRadians, isAnti);

      if (hasInner) {
        if (isFull) {
          ctx.moveTo(safeIRX * Math.cos(drawEndRadians), safeIRY * Math.sin(drawEndRadians));
        }
        this.traceArc(ctx, safeIRX, safeIRY, drawEndRadians, drawStartRadians, !isAnti);
        ctx.closePath();
      } else if (isPie && !isFull) {
        ctx.lineTo(0, 0);
        ctx.closePath();
      } else if ((isFull && !hasArrows) || isClosed) {
        ctx.closePath();
      }

      this.applyStyle(ctx);
    } else {
      this.applyStrokeState(ctx);
    }

    if (hasArrows) this.drawArrows(ctx, arrowStart, arrowEnd);
  }

  // Equal radii draw with arc(): a circle keeps the exact path it always had
  traceArc(ctx, rx, ry, from, to, anticlockwise) {
    if (rx === ry) ctx.arc(0, 0, rx, from, to, anticlockwise);
    else ctx.ellipse(0, 0, rx, ry, 0, from, to, anticlockwise);
  }

  // Aims an arrow at the arc end at parameter `radians`; `inward` (±1) is the parameter direction into the arc.
  // Direction is the chord from the curve point one head length in, back to the end, so the head's base sits on the
  // arc. Returns the inset as a parameter offset (straight distance from the end, like all arrowheads).
  aimArcArrow(rec, radiusX, radiusY, radians, inward) {
    const px = radiusX * Math.cos(radians), py = radiusY * Math.sin(radians);
    const baseRadians = radians + inward * this.parameterOffset(radiusX, radiusY, radians, inward, rec.len);
    this.aimArrow(rec, px, py, px - radiusX * Math.cos(baseRadians), py - radiusY * Math.sin(baseRadians));
    return this.parameterOffset(radiusX, radiusY, radians, inward, rec.inset);
  }

  // Parameter offset (towards `inward`) where the arc is `distance` away from `radians` in a straight line. On a
  // circle the chord gives it exactly; on an ellipse by bisection, since a local estimate fails at the tip of thin
  // ellipses, where the curve turns fast.
  parameterOffset(radiusX, radiusY, radians, inward, distance) {
    if (radiusX === radiusY) return 2 * Math.asin(Math.min(distance, 2 * radiusX) / (2 * radiusX));
    const cos = Math.cos(radians), sin = Math.sin(radians);
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, target = radians + inward * mid;
      const x = radiusX * (Math.cos(target) - cos), y = radiusY * (Math.sin(target) - sin);
      if (x * x + y * y > distance * distance) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }
};
