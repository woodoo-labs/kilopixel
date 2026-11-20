pxl.Polyline = class Polyline extends pxl.Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'points', 'closed', 'smooth', 'mode', 'arrowstart', 'arrowend', 'arrowstyle'];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._pointCount = 0;
    this._rawParts = []; // parser output, reused

    // Each coordinate is its own attribute p0, p1, … (keys built once per points change);
    // loadPoints() copies their values, scaled by u, into flatCache, for draw() and for getHitBox(). Float64 like the
    // matrices: relative mode adds the points up, and Float32 rounding would add up with them.
    this._flatCache = new Float64Array(0);
    this._pointKeys = [];
    this._hitBox = { left: 0, right: 0, top: 0, bottom: 0 }; // a smooth curve's box with its handles

    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();

    // Reused buffers for trimming the first / last spline segment
    this._segment = new Float64Array(8);  // p1, cp1, cp2, p2
    this._split = new Float64Array(10);   // q0, r0, s, r1, q2
  }

  // --- Points ---

  // The property (frameworks): a points string like the attribute, or an array, flat [x0, y0, x1, y1, …] or pairs
  // [[x0, y0], …], each coordinate a number or an expression string. Reading returns the evaluated coordinates,
  // flat, in a new array.
  get points() {
    const out = new Array(this._pointCount);
    for (let i = 0; i < this._pointCount; i++) out[i] = this.attributeValues[this._pointKeys[i]];
    return out;
  }

  set points(value) {
    this.setValue('points', value === undefined ? null : value);
  }

  setValue(name, value) {
    if (name === 'points') this.setPoints(value);
    else super.setValue(name, value);
  }

  // Each coordinate is its own value p0, p1, …: a number is stored, a string compiled like an attribute. An array is
  // read in place (copying it would allocate in every update), and with the same number of coordinates the keys and
  // the buffer stay: a chart whose points change in every frame allocates nothing for number coordinates.
  setPoints(value) {
    let count;
    const isArray = Array.isArray(value);
    const isPairs = isArray && Array.isArray(value[0]);
    if (isPairs) {
      count = 0; // up to the first incomplete pair, like an incomplete point in the string
      while (count / 2 < value.length && Array.isArray(value[count / 2]) && value[count / 2].length >= 2) count += 2;
    } else if (isArray) {
      count = value.length - value.length % 2; // an x without its y is dropped
    } else {
      pxl.parsePointsIntoArray(typeof value === 'string' ? value : '', this._rawParts); // null or '': no points
      count = this._rawParts.length;
    }
    if (count !== this._pointCount) this.resizePoints(count);

    const expressions = this.attributeExpressions;
    for (let i = 0; i < count; i++) {
      const key = this._pointKeys[i];
      const part = isPairs ? value[i >> 1][i & 1] : isArray ? value[i] : this._rawParts[i];
      if (typeof part === 'string') {
        pxl.compileAttribute(this, key, part);
      } else if (typeof expressions[key] !== 'function') {
        // A number over a value that is no expression: it is in none of the key lists, so it is just written
        expressions[key] = part;
        this.attributeValues[key] = part;
      } else {
        pxl.storeValue(this, key, part);
      }
    }

    this.isAnimated = this.animatedAttributeKeys.length > 0;
    // Readers of ref.<id>.pN update like for any other attribute
    if (this.refKey) pxl.broadcast(this.refKey);
    this.parentLayer?.invalidate();
  }

  // Keys beyond the new count go, new ones are added; keys below it keep their value until set again (animated
  // coordinates are only evaluated in the next frame, so ref.<id>.pN readers would see undefined in between)
  resizePoints(count) {
    for (let i = count; i < this._pointCount; i++) {
      const key = this._pointKeys[i];
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      pxl.removeFromArray(this.toLocalAttributeKeys, key);
      delete this.attributeExpressions[key];
      delete this.attributeValues[key];
    }
    for (let i = this._pointCount; i < count; i++) this._pointKeys[i] = `p${i}`;
    this._pointKeys.length = count;
    this._flatCache = new Float64Array(count);
    this._pointCount = count;
  }

  draw(ctx, u, t) {
    if (this._pointCount < 4) return;

    if (!this.loadPoints(u)) return;

    const { smooth, arrowstart, arrowend } = this.attributeValues;
    const closed = this.attributeValues.closed === true;
    const len = this._pointCount / 2;

    // Arrowheads only apply to open strokes
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = !closed && this.isStroked();
    let hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    let hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);

    // Arrows sit on the first / last point with a distinct neighbour: zero-length end segments are skipped
    let first = 0, last = len - 1;
    if (hasStart || hasEnd) {
      while (first < last && this.isSamePoint(first, first + 1)) first++;
      while (last > first && this.isSamePoint(last, last - 1)) last--;
      if (first === last) {
        hasStart = hasEnd = false;
        first = 0;
        last = len - 1;
      }
    }

    // A smooth curve through only 2 points (with free ends) is a straight line
    const isSmooth = smooth !== false && smooth !== null && last - first > 1;

    if (isSmooth) {
      const k3 = (typeof smooth === 'number' ? smooth : 1) / 3;
      this.traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last);
      this.applyStyle(ctx, u);
    } else if (this.traceStraight(ctx, closed, hasStart, hasEnd, first, last)) {
      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasStart || hasEnd) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Fills flatCache with the absolute coordinates, scaled by u. Returns false if a coordinate isn't a finite number
  // (a ref that isn't connected yet, a division by zero): the canvas would drop that vertex or bend a smooth curve,
  // so the polyline draws nothing until all coordinates are valid.
  loadPoints(u) {
    const pts = this._flatCache;
    let probe = 0;
    for (let i = 0; i < this._pointCount; i++) {
      pts[i] = this.attributeValues[this._pointKeys[i]] * u;
      probe += pts[i] * 0;   // 0 for a finite value, NaN for NaN or ±Infinity
    }
    if (probe !== 0) return false;

    if (this.attributeValues.mode === 'relative') {
      for (let i = 2; i < this._pointCount; i++) {
        pts[i] += pts[i - 2];
      }
    }
    return true;
  }

  // Draws points first..last. Returns false if the shaft is skipped (single segment shorter than both arrow insets).
  traceStraight(ctx, closed, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const f = first * 2, l = last * 2;
    let startX = pts[f], startY = pts[f + 1];
    let endX = pts[l], endY = pts[l + 1];

    // flatCache is never mutated: only the drawn end points are trimmed, each within its own segment
    let startInset = 0, endInset = 0, firstLength = 0;
    if (hasStart) {
      const a = this._arrowStart;
      firstLength = this.aimArrow(a, startX, startY, startX - pts[f + 2], startY - pts[f + 3]);
      startInset = Math.min(a.inset, firstLength);
      startX -= a.dirX * startInset;
      startY -= a.dirY * startInset;
    }
    if (hasEnd) {
      const b = this._arrowEnd;
      const lastLength = this.aimArrow(b, endX, endY, endX - pts[l - 2], endY - pts[l - 1]);
      endInset = Math.min(b.inset, lastLength);
      endX -= b.dirX * endInset;
      endY -= b.dirY * endInset;
    }
    if (last - first === 1 && hasStart && hasEnd && startInset + endInset >= firstLength) return false;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = f + 2; i < l; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineTo(endX, endY);
    if (closed) ctx.closePath();
    return true;
  }

  // Centripetal Catmull-Rom through points first..last (design/done/2026-10-23_smooth_polyline_spline_plan.md).
  // `k3` is smooth / 3. Arrows imply an open path with >= 2 segments between first and last.
  traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const segment = this._segment, split = this._split;

    let from = first;
    const to = closed ? len : last;     // segments from..to-1

    ctx.beginPath();

    // First segment, trimmed from the front
    if (hasStart) {
      const a = this._arrowStart;
      this.loadSegment(from, len, closed, k3);
      // Direction: chord from the curve point one head length in, back to the start
      this.splitSegment(this.trimParameter(a.len, false));
      this.aimArrow(a, segment[0], segment[1], segment[0] - split[4], segment[1] - split[5]);
      this.splitSegment(this.trimParameter(a.inset, false));
      ctx.moveTo(split[4], split[5]);
      ctx.bezierCurveTo(split[6], split[7], split[8], split[9], segment[6], segment[7]);
      from++;
    } else {
      ctx.moveTo(pts[first * 2], pts[first * 2 + 1]);
    }

    // Hot loop: the same segment loader as the arrow trimming, so both always agree
    const end = hasEnd ? to - 1 : to;
    for (let i = from; i < end; i++) {
      this.loadSegment(i, len, closed, k3);
      ctx.bezierCurveTo(segment[2], segment[3], segment[4], segment[5], segment[6], segment[7]);
    }

    // Last segment, trimmed from the back
    if (hasEnd) {
      const b = this._arrowEnd;
      this.loadSegment(to - 1, len, closed, k3);
      this.splitSegment(this.trimParameter(b.len, true));
      this.aimArrow(b, segment[6], segment[7], segment[6] - split[4], segment[7] - split[5]);
      this.splitSegment(this.trimParameter(b.inset, true));
      ctx.bezierCurveTo(split[0], split[1], split[2], split[3], split[4], split[5]);
    }

    if (closed) ctx.closePath();
  }

  // Loads segment i (point A = i to point B = i + 1) as a cubic Bézier into this._segment.
  // Centripetal handles (D3 curveCatmullRom), scaled by k3 = smooth / 3. On a closed path neighbours wrap around;
  // on an open path a missing neighbour (free end) counts as a zero-length side: no handle.
  loadSegment(i, len, closed, k3) {
    const pts = this._flatCache, segment = this._segment;
    const a = i, b = closed ? (i + 1) % len : i + 1;
    const p = closed ? (a - 1 + len) % len : a - 1;   // neighbour before A
    const q = closed ? (b + 1) % len : b + 1;         // neighbour after B

    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const abx = bx - ax, aby = by - ay;
    const dAB = Math.sqrt(abx * abx + aby * aby), rAB = Math.sqrt(dAB);

    let pax = 0, pay = 0, dPA = 0, bqx = 0, bqy = 0, dBQ = 0;
    if (p >= 0) {
      pax = ax - pts[p * 2]; pay = ay - pts[p * 2 + 1];
      dPA = Math.sqrt(pax * pax + pay * pay);
    }
    if (q < len) {
      bqx = pts[q * 2] - bx; bqy = pts[q * 2 + 1] - by;
      dBQ = Math.sqrt(bqx * bqx + bqy * bqy);
    }
    const rPA = Math.sqrt(dPA), rBQ = Math.sqrt(dBQ);

    // Tangent at A: dPA·AB + dAB·PA; at B: dAB·BQ + dBQ·AB. A zero-length side gets no handle (corner, free end).
    const fa = rPA > 1e-6 ? k3 / (rPA * (rPA + rAB)) : 0;
    const fb = rBQ > 1e-6 ? k3 / (rBQ * (rAB + rBQ)) : 0;

    segment[0] = ax;
    segment[1] = ay;
    segment[2] = ax + (dPA * abx + dAB * pax) * fa;
    segment[3] = ay + (dPA * aby + dAB * pay) * fa;
    segment[4] = bx - (dAB * bqx + dBQ * abx) * fb;
    segment[5] = by - (dAB * bqy + dBQ * aby) * fb;
    segment[6] = bx;
    segment[7] = by;
  }

  // Curve parameter on this._segment where the curve is `dist` away from its start (or end) in a straight line,
  // like all arrowhead trims. Bisection: free ends leave the end point slowly, so a chord estimate trims too little.
  trimParameter(dist, fromEnd) {
    const g = this._segment;
    const ex = fromEnd ? g[6] : g[0], ey = fromEnd ? g[7] : g[1];
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      const x = a * g[0] + b * g[2] + c * g[4] + e * g[6] - ex;
      const y = a * g[1] + b * g[3] + c * g[5] + e * g[7] - ey;
      if ((x * x + y * y > dist * dist) === fromEnd) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }

  // A smooth curve can leave the box of its points, but each Bézier segment stays inside the box of its four control
  // points: the hit box adds the handles (also for smooth > 1 or < 0, and closed paths). Arrow trims only shorten
  // the curve, and arrowheads are in hitPadding(). From the current values, like getBoundingBox(), so a shape
  // changed with setAttribute() is hit at its new place.
  getHitBox() {
    const smooth = this.attributeValues.smooth;
    if (smooth === false || smooth === null || this._pointCount < 6) return this.getBoundingBox();

    const box = this._hitBox;
    if (!this.loadPoints(1)) {
      box.left = box.right = box.top = box.bottom = NaN; // draws nothing, so nothing to hit
      return box;
    }
    const pts = this._flatCache, segment = this._segment;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this._pointCount; i += 2) {
      if (pts[i] < minX) minX = pts[i];
      if (pts[i] > maxX) maxX = pts[i];
      if (pts[i + 1] < minY) minY = pts[i + 1];
      if (pts[i + 1] > maxY) maxY = pts[i + 1];
    }
    const len = this._pointCount / 2, closed = this.attributeValues.closed === true;
    const k3 = (typeof smooth === 'number' ? smooth : 1) / 3;
    const count = closed ? len : len - 1;
    for (let i = 0; i < count; i++) {
      this.loadSegment(i, len, closed, k3);
      for (let j = 2; j < 6; j += 2) {
        if (segment[j] < minX) minX = segment[j];
        if (segment[j] > maxX) maxX = segment[j];
        if (segment[j + 1] < minY) minY = segment[j + 1];
        if (segment[j + 1] > maxY) maxY = segment[j + 1];
      }
    }
    box.left = minX;
    box.right = maxX;
    box.top = minY;
    box.bottom = maxY;
    return box;
  }

  // Points closer than 0.01 px count as the same (zero-length end segments for arrows)
  isSamePoint(i, j) {
    const pts = this._flatCache;
    return Math.abs(pts[i * 2] - pts[j * 2]) < 0.01 && Math.abs(pts[i * 2 + 1] - pts[j * 2 + 1]) < 0.01;
  }

  // de Casteljau split of this._segment at t. Left part: p1, q0, r0, s. Right part: s, r1, q2, p2.
  splitSegment(t) {
    const g = this._segment, out = this._split;
    const q0x = g[0] + (g[2] - g[0]) * t, q0y = g[1] + (g[3] - g[1]) * t;
    const q1x = g[2] + (g[4] - g[2]) * t, q1y = g[3] + (g[5] - g[3]) * t;
    const q2x = g[4] + (g[6] - g[4]) * t, q2y = g[5] + (g[7] - g[5]) * t;
    const r0x = q0x + (q1x - q0x) * t,    r0y = q0y + (q1y - q0y) * t;
    const r1x = q1x + (q2x - q1x) * t,    r1y = q1y + (q2y - q1y) * t;

    out[0] = q0x; out[1] = q0y;
    out[2] = r0x; out[3] = r0y;
    out[4] = r0x + (r1x - r0x) * t;
    out[5] = r0y + (r1y - r0y) * t;
    out[6] = r1x; out[7] = r1y;
    out[8] = q2x; out[9] = q2y;
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }

  getBoundingBox() {
    if (this._pointCount < 4) {
      this.boundingBox.left = 0;
      this.boundingBox.right = 0;
      this.boundingBox.top = 0;
      this.boundingBox.bottom = 0;
      return this.boundingBox;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.attributeValues.mode === 'relative';

    for (let i = 0; i < this._pointCount; i += 2) {
      const px = this.attributeValues[this._pointKeys[i]];
      const py = this.attributeValues[this._pointKeys[i + 1]];

      if (isRelative && i > 0) {
        currentX += px;
        currentY += py;
      } else {
        currentX = px;
        currentY = py;
      }

      if (currentX < minX) minX = currentX;
      if (currentX > maxX) maxX = currentX;
      if (currentY < minY) minY = currentY;
      if (currentY > maxY) maxY = currentY;
    }
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;
    return this.boundingBox;
  }
};
customElements.define('pxl-polyline', pxl.Polyline);
