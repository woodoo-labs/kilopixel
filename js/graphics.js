// =========================================================================
// Drawing & Transform Helpers
// =========================================================================
pxl.anchorX = {
  'left': 0, 'right': 1, 'center': 0.5,
  'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1,
  'top': 0.5, 'bottom': 0.5,
  'top-center': 0.5, 'bottom-center': 0.5,
  'left-center': 0, 'right-center': 1,
  'center-top': 0.5, 'center-bottom': 0.5,
  'center-left': 0, 'center-right': 1
};
pxl.anchorY = {
  'top': 0, 'bottom': 1, 'center': 0.5,
  'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1,
  'left': 0.5, 'right': 0.5,
  'top-center': 0, 'bottom-center': 1,
  'left-center': 0.5, 'right-center': 0.5,
  'center-top': 0, 'center-bottom': 1,
  'center-left': 0.5, 'center-right': 0.5
};

// Radial gradient radius: a number is a logical length; a string is the distance from the center (x, y)
// to a side, a perimeter point or a CSS keyword of the bounding box (w × h)
pxl.resolveRadius = function(r, x, y, w, h, u) {
  if (typeof r === 'number') return Math.abs(r * u);

  // Sides: perpendicular distance
  if (r === 'top')    return Math.abs(y * h * u);
  if (r === 'bottom') return Math.abs((1 - y) * h * u);
  if (r === 'left')   return Math.abs(x * w * u);
  if (r === 'right')  return Math.abs((1 - x) * w * u);

  // Perimeter points (corners, edge midpoints): straight distance
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w * u, dy = (y - pxl.anchorY[r]) * h * u;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // CSS keywords
  const lx = x * w * u, rx = (1 - x) * w * u;
  const ty = y * h * u, by = (1 - y) * h * u;
  switch (r) {
    case 'closest-side':   return Math.max(0.001, Math.min(lx, rx, ty, by));
    case 'farthest-side':  return Math.max(lx, rx, ty, by);
    case 'closest-corner':
      return Math.max(0.001, Math.min(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by)));
    case 'farthest-corner':
      return Math.max(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by));
    default: return 0;
  }
};

// Same order as pxl.Matrix.updateLocal: translate(x, y) → rotate → scale → skew → translate(dx, dy)
pxl.applyTransformState = function(ctx, u, attributeValues) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = attributeValues;

  if (x || y) ctx.translate(x * u, y * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);

  const finalScaleX = zoom * scalex;
  const finalScaleY = zoom * scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx * u, dy * u);
};

// Scales the px values written by the filter helpers (blur(5) → 'blur(5px)') by the unit u
pxl.scaleResponsiveFilter = function(filterStr, u) {
  return filterStr.replace(/(-?\d+\.?\d*)px/g, (match, val) => (parseFloat(val) * u) + 'px');
};

pxl.applyContextState = function(ctx, u, attributeValues, node) {
  pxl.applyTransformState(ctx, u, attributeValues);

  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = attributeValues;

  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }

  if (filter !== 'none') {
    ctx.filter = node.resolveFilter(filter, u);
  }

  if (shadowcolor) {
    if (shadowcolor === 'none' || shadowcolor === 'transparent') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = shadowcolor;
      ctx.shadowBlur = shadowblur * u;
      ctx.shadowOffsetX = shadowx * u;
      ctx.shadowOffsetY = shadowy * u;
    }
  }
};

// =========================================================================
// Arc Angles (circle, ellipse)
// =========================================================================

// End angle in radians: sweep (relative to start) wins over end; neither means a full turn
pxl.arcEndRadians = function(startRadians, end, sweep) {
  if (sweep !== null) return startRadians + sweep * Math.PI / 180;
  if (end !== null) return end * Math.PI / 180;
  return startRadians + Math.PI * 2;
};

pxl.isFullTurn = function(startRadians, endRadians) {
  return Math.abs(endRadians - startRadians) >= Math.PI * 2 - 1e-4;
};

// =========================================================================
// Arrowhead Geometry (design/2026-10-14_unified_arrowhead_geometry_plan.md)
// =========================================================================
pxl.ARROW_COS30 = Math.cos(Math.PI / 6); // arrowhead half-angle is 30°
pxl.ARROW_SIN30 = 0.5;
pxl.ARROW_K_DEPTH = 0.6;                 // min shaft depth inside a filled head, as fraction of head length

// Per-arrow-end record, allocated once per shape and reused every frame. All fields start as doubles
// so V8 keeps one stable hidden class for every arrow shape.
pxl.createArrowRecord = function() {
  return { size: NaN, len: NaN, tipAdvance: NaN, inset: NaN, tipX: NaN, tipY: NaN, dirX: NaN, dirY: NaN };
};

// =========================================================================
// Stroke & Line Dash Helpers
// =========================================================================
pxl._emptyDash = [];

// Solid line: null (default), 'none' or 0
pxl.hasLineDash = function(linedash) {
  return !!linedash && linedash !== 'none' && linedash !== '0';
};

// =========================================================================
// Geometry Parsing
// =========================================================================
// Splits "x,y; x,y; …" into coordinate strings [x0, y0, x1, y1, …]. Commas and semicolons
// inside parentheses belong to the expression: min(a, b) stays one coordinate.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  let start = 0;
  let depth = 0;
  let currentX = null;
  const input = str + ';'; // the last point ends like all others

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      if (char === ',') {
        currentX = input.substring(start, i).trim();
        start = i + 1;
      } else if (char === ';') {
        const currentY = input.substring(start, i).trim();
        if (currentX !== null && currentX !== '' && currentY !== '') {
          targetArray.push(currentX, currentY);
        }
        currentX = null;
        start = i + 1;
      }
    }
  }
};
