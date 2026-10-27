pxl.Ellipse = class Ellipse extends pxl.Shape {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise',
      'arrowstart', 'arrowend', 'arrowstyle'
    ];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false,
    arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.attributeValues;

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
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const radiusX = safeRX * u, radiusY = safeRY * u;
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimEllipseArrow(arrowStart, radiusX, radiusY, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimEllipseArrow(arrowEnd, radiusX, radiusY, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    if (drawShaft) {
      ctx.beginPath();
      ctx.ellipse(0, 0, safeRX * u, safeRY * u, 0, drawStartRadians, drawEndRadians, isAnti);

      if (hasInner) {
        if (isFull) {
          ctx.moveTo((safeIRX * u) * Math.cos(drawEndRadians), (safeIRY * u) * Math.sin(drawEndRadians));
        }
        ctx.ellipse(0, 0, safeIRX * u, safeIRY * u, 0, drawEndRadians, drawStartRadians, !isAnti);
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

  // Aims an arrow at the arc end at parameter `radians`; `inward` (±1) is the parameter direction into the arc.
  // Direction is the chord from the curve point one head length in, back to the end. Returns the inset as a parameter offset.
  aimEllipseArrow(rec, radiusX, radiusY, radians, inward) {
    const px = radiusX * Math.cos(radians), py = radiusY * Math.sin(radians);
    const baseRadians = radians + inward * this.parameterOffset(radiusX, radiusY, radians, inward, rec.len);
    this.aimArrow(rec, px, py, px - radiusX * Math.cos(baseRadians), py - radiusY * Math.sin(baseRadians));
    return this.parameterOffset(radiusX, radiusY, radians, inward, rec.inset);
  }

  // Parameter offset (towards `inward`) where the arc is `distance` away from `radians` in a straight line.
  // Bisection: a local estimate fails at the tip of thin ellipses, where the curve turns fast.
  parameterOffset(radiusX, radiusY, radians, inward, distance) {
    const cos = Math.cos(radians), sin = Math.sin(radians);
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, target = radians + inward * mid;
      const x = radiusX * (Math.cos(target) - cos), y = radiusY * (Math.sin(target) - sin);
      if (x * x + y * y > distance * distance) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
};
customElements.define('pxl-ellipse', pxl.Ellipse);
