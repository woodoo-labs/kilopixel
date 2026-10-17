class Ellipse extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  static defaults = { ...Shape.defaults, rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

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

    // --- DRAW PATH ---
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

  // Parameter offset that moves `distance` away from `radians`: local-speed estimate plus one chord correction.
  parameterOffset(radiusX, radiusY, radians, inward, distance) {
    const speedX = radiusX * Math.sin(radians), speedY = radiusY * Math.cos(radians);
    let offset = distance / (Math.sqrt(speedX * speedX + speedY * speedY) || 1);

    const target = radians + inward * offset;
    const chordX = radiusX * (Math.cos(target) - Math.cos(radians));
    const chordY = radiusY * (Math.sin(target) - Math.sin(radians));
    const chord = Math.sqrt(chordX * chordX + chordY * chordY);
    if (chord > 0) offset *= distance / chord;
    return offset;
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
}
customElements.define('pxl-ellipse', Ellipse);
