pxl.Polyline = class Polyline extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'points', 'closed', 'smooth', 'mode', 'arrowstart', 'arrowend', 'arrowstyle']; }

  static defaults = { ...pxl.Shape.defaults, closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  constructor() {
    super();
    this.pointCount = 0;
    this.rawParts = []; // Reusable array for parser output

    // Highly optimized flat cache and pre-calculated string keys
    this.flatCache = new Float32Array(0);
    this.pointKeys = [];

    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();

    // Scratch buffers for trimming the first/last spline segment (zero-GC)
    this._segment = new Float64Array(8);  // p1, cp1, cp2, p2
    this._split = new Float64Array(10);   // q0, r0, s, r1, q2
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'points') {
      if (oldValue === newValue) return;

      pxl.parsePointsIntoArray(newValue, this.rawParts);
      const count = this.rawParts.length;
      this.clearPoints(count);
      this.pointCount = count;

      this.flatCache = new Float32Array(this.pointCount);
      this.pointKeys.length = this.pointCount;

      for (let i = 0; i < this.pointCount; i++) {
        const key = `p${i}`;
        this.pointKeys[i] = key;
        pxl.compileAttribute(this, key, this.rawParts[i]);
      }

      this.isAnimated = this.animatedAttributeKeys.length > 0;
      // Readers of ref.<id>.pN update like for any other attribute
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
    } else {
      super.attributeChangedCallback(name, oldValue, newValue);
    }
  }

  // Keys below keepCount keep their value until recompiled: animated coordinates are only evaluated
  // in the next frame, so ref.<id>.pN readers would otherwise see undefined in between.
  clearPoints(keepCount) {
    for (let i = 0; i < this.pointCount; i++) {
      const key = this.pointKeys[i];
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      if (i >= keepCount) {
        delete this.attributeExpressions[key];
        delete this.attributeValues[key];
      }
    }
    this.pointCount = 0;
  }

  // variableChangedCallback — INHERITED from Shape. No override needed.

  draw(ctx, u, t) {
    if (this.pointCount < 4) return;

    const { smooth, arrowstart, arrowend } = this.attributeValues;
    const closed = this.attributeValues.closed === true;
    const pts = this.flatCache;
    const len = this.pointCount / 2;
    // A Catmull-Rom curve through only 2 points is a straight line
    const isSmooth = smooth !== false && smooth !== null && len > 2;
    const tension6 = (typeof smooth === 'number' ? smooth : 1) / 6;

    for (let i = 0; i < this.pointCount; i++) {
      pts[i] = this.attributeValues[this.pointKeys[i]] * u;
    }

    if (this.attributeValues.mode === 'relative') {
      for (let i = 2; i < this.pointCount; i++) {
        pts[i] += pts[i - 2];
      }
    }

    // Arrowheads only apply to open strokes
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = !closed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);

    if (isSmooth) {
      this.traceSmooth(ctx, len, closed, tension6, hasStart, hasEnd);
      this.applyStyle(ctx, u);
    } else if (this.traceStraight(ctx, len, closed, hasStart, hasEnd)) {
      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasStart || hasEnd) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Returns false if the shaft is skipped (single segment shorter than both arrow insets).
  traceStraight(ctx, len, closed, hasStart, hasEnd) {
    const pts = this.flatCache;
    const lastX = this.pointCount - 2, lastY = this.pointCount - 1;
    let startX = pts[0], startY = pts[1];
    let endX = pts[lastX], endY = pts[lastY];

    // flatCache is never mutated: only the drawn end points are trimmed, each within its own segment
    let startInset = 0, endInset = 0, firstLength = 0;
    if (hasStart) {
      const a = this._arrowStart;
      firstLength = this.aimArrow(a, startX, startY, startX - pts[2], startY - pts[3]);
      startInset = Math.min(a.inset, firstLength);
      startX -= a.dirX * startInset;
      startY -= a.dirY * startInset;
    }
    if (hasEnd) {
      const b = this._arrowEnd;
      const lastLength = this.aimArrow(b, endX, endY, endX - pts[lastX - 2], endY - pts[lastY - 2]);
      endInset = Math.min(b.inset, lastLength);
      endX -= b.dirX * endInset;
      endY -= b.dirY * endInset;
    }
    if (len === 2 && hasStart && hasEnd && startInset + endInset >= firstLength) return false;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 2; i < lastX; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineTo(endX, endY);
    if (closed) ctx.closePath();
    return true;
  }

  traceSmooth(ctx, len, closed, tension6, hasStart, hasEnd) {
    const pts = this.flatCache;
    const segment = this._segment, split = this._split;
    const loopLen = closed ? len : len - 1;

    ctx.beginPath();

    // First segment, trimmed from the front (arrows imply an open path with >= 2 segments)
    let first = 0;
    if (hasStart) {
      const a = this._arrowStart;
      const chord = this.loadSegment(0, len, tension6);
      // Direction: chord from the curve point one head length in, back to the start
      this.splitSegment(Math.min(a.len / chord, 1));
      this.aimArrow(a, segment[0], segment[1], segment[0] - split[4], segment[1] - split[5]);
      this.splitSegment(Math.min(a.inset / chord, 1));
      ctx.moveTo(split[4], split[5]);
      ctx.bezierCurveTo(split[6], split[7], split[8], split[9], segment[6], segment[7]);
      first = 1;
    } else {
      ctx.moveTo(pts[0], pts[1]);
    }

    // Hot loop: untouched Catmull-Rom segments (branch-free body)
    const last = hasEnd ? loopLen - 1 : loopLen;
    for (let i = first; i < last; i++) {
      const i0 = closed ? (i - 1 + len) % len : Math.max(i - 1, 0);
      const i1 = i;
      const i2 = (i + 1) % len;
      const i3 = closed ? (i + 2) % len : Math.min(i + 2, len - 1);

      const p0x = pts[i0 * 2], p0y = pts[i0 * 2 + 1];
      const p1x = pts[i1 * 2], p1y = pts[i1 * 2 + 1];
      const p2x = pts[i2 * 2], p2y = pts[i2 * 2 + 1];
      const p3x = pts[i3 * 2], p3y = pts[i3 * 2 + 1];

      ctx.bezierCurveTo(
        p1x + (p2x - p0x) * tension6,
        p1y + (p2y - p0y) * tension6,
        p2x - (p3x - p1x) * tension6,
        p2y - (p3y - p1y) * tension6,
        p2x, p2y
      );
    }

    // Last segment, trimmed from the back
    if (hasEnd) {
      const b = this._arrowEnd;
      const chord = this.loadSegment(loopLen - 1, len, tension6);
      this.splitSegment(Math.max(1 - b.len / chord, 0));
      this.aimArrow(b, segment[6], segment[7], segment[6] - split[4], segment[7] - split[5]);
      this.splitSegment(Math.max(1 - b.inset / chord, 0));
      ctx.bezierCurveTo(split[0], split[1], split[2], split[3], split[4], split[5]);
    }

    if (closed) ctx.closePath();
  }

  // Loads open Catmull-Rom segment i as a cubic Bézier into this._segment. Returns its chord length.
  loadSegment(i, len, tension6) {
    const pts = this.flatCache, segment = this._segment;
    const i0 = Math.max(i - 1, 0), i2 = i + 1, i3 = Math.min(i + 2, len - 1);
    const p1x = pts[i * 2], p1y = pts[i * 2 + 1];
    const p2x = pts[i2 * 2], p2y = pts[i2 * 2 + 1];

    segment[0] = p1x;
    segment[1] = p1y;
    segment[2] = p1x + (p2x - pts[i0 * 2]) * tension6;
    segment[3] = p1y + (p2y - pts[i0 * 2 + 1]) * tension6;
    segment[4] = p2x - (pts[i3 * 2] - p1x) * tension6;
    segment[5] = p2y - (pts[i3 * 2 + 1] - p1y) * tension6;
    segment[6] = p2x;
    segment[7] = p2y;

    const dx = p2x - p1x, dy = p2y - p1y;
    return Math.sqrt(dx * dx + dy * dy);
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

  getBoundingBox() {
    if (this.pointCount < 4) {
      this.boundingBox.left = 0;
      this.boundingBox.right = 0;
      this.boundingBox.top = 0;
      this.boundingBox.bottom = 0;
      return this.boundingBox;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.attributeValues.mode === 'relative';

    for (let i = 0; i < this.pointCount; i += 2) {
      const px = this.attributeValues[this.pointKeys[i]];
      const py = this.attributeValues[this.pointKeys[i+1]];

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
