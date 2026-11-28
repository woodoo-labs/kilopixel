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
pxl.resolveRadius = function(r, x, y, w, h) {
  if (typeof r === 'number') return Math.abs(r);

  // Sides: perpendicular distance
  if (r === 'top')    return Math.abs(y * h);
  if (r === 'bottom') return Math.abs((1 - y) * h);
  if (r === 'left')   return Math.abs(x * w);
  if (r === 'right')  return Math.abs((1 - x) * w);

  // Perimeter points (corners, edge midpoints): straight distance
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w, dy = (y - pxl.anchorY[r]) * h;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // CSS keywords
  const lx = x * w, rx = (1 - x) * w;
  const ty = y * h, by = (1 - y) * h;
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

// Same order as pxl.Matrix.updateLocal: translate(x, y) → rotate → scale → skew → translate(dx, dy). In logical
// units: the layer has scaled the context by u.
pxl.applyTransformState = function(ctx, values) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = values;

  if (x || y) ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);

  const finalScaleX = zoom * scalex;
  const finalScaleY = zoom * scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx, dy);
};

// Scales every px value in the final filter string by the unit u: the helpers' (blur(5) → 'blur(5px)')
// and those written in backticks. JavaScript prints values near 0 in exponent notation (1.2e-15),
// so the number includes an optional exponent; otherwise only '-15px' would be scaled.
pxl.scaleResponsiveFilter = function(filterStr, u) {
  return filterStr.replace(/(-?\d*\.?\d+(?:e[-+]?\d+)?)px/g, (match, val) => (parseFloat(val) * u) + 'px');
};

pxl.applyContextState = function(ctx, u, values, node) {
  pxl.applyTransformState(ctx, values);
  pxl.applyCompositingState(ctx, u, values, node);
};

// Safari's canvas has ctx.filter only behind its "Canvas Filters" feature flag, off by default: a shape's filter is
// then ignored (TODO §49). Checked once per page, at the first shape with a filter; the prototype is asked, because
// assigning ctx.filter where it doesn't exist creates a plain property on that context.
pxl._canvasFilterChecked = false;

pxl.checkCanvasFilter = function(ctx, node) {
  if (pxl._canvasFilterChecked) return;
  pxl._canvasFilterChecked = true;
  if ('filter' in Object.getPrototypeOf(ctx)) return;
  console.warn(`[pxl] ${pxl.describe(node)} has a filter, but this browser's canvas ` +
    'ignores filters on shapes (Safari: only with its "Canvas Filters" feature flag). A filter on a layer works everywhere.');
};

// How a shape's pixels combine with the layer: alpha, mask / blend, filter, shadow. An isolated shape
// (Shape.renderIsolated()) applies it once, when its finished bitmap is drawn onto the layer.
// Canvas shadows and filters ignore the canvas transform, which holds the layer's device pixel ratio: their lengths
// are bitmap pixels, so they are scaled by u and the DPR.
pxl.applyCompositingState = function(ctx, u, values, node) {
  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = values;
  const k = u * node.parentLayer.dpr;

  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }

  if (filter !== 'none') {
    pxl.checkCanvasFilter(ctx, node);
    ctx.filter = node.resolveFilter(filter, k);
  }

  if (shadowcolor) {
    if (shadowcolor === 'none' || shadowcolor === 'transparent') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = shadowcolor;
      ctx.shadowBlur = shadowblur * k;
      ctx.shadowOffsetX = shadowx * k;
      ctx.shadowOffsetY = shadowy * k;
    }
  }
};

// The scratch canvas of isolated shapes (design/done/2026-11-01_isolated_shape_compositing_plan.md §3.2): one for the
// page, created on first use. It only grows, to the largest layer canvas it served, so it never resizes back and
// forth between layers of different sizes. Isolation never nests: groups have no compositing state.
pxl._isolationContext = null;

pxl.getIsolationContext = function(width, height) {
  let ctx = pxl._isolationContext;
  if (ctx === null) {
    ctx = pxl._isolationContext = document.createElement('canvas').getContext('2d');
  }
  const canvas = ctx.canvas;
  if (canvas.width < width) canvas.width = width;
  if (canvas.height < height) canvas.height = height;
  return ctx;
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
// Arrowhead Geometry (design/done/2026-10-14_unified_arrowhead_geometry_plan.md)
// =========================================================================
pxl.ARROW_COS30 = Math.cos(Math.PI / 6); // arrowhead half-angle is 30°
pxl.ARROW_SIN30 = 0.5;
pxl.ARROW_K_DEPTH = 0.6;                 // min shaft depth inside a filled head, as fraction of head length

// Side length of an arrowhead in logical units for an arrowstart / arrowend value: 'auto' is 3.6 × strokewidth;
// 0 (also for a negative or invalid value) means no arrowhead
pxl.arrowSize = function(value, strokewidth) {
  const size = value === 'auto' ? strokewidth * 3.6 : value;
  return size > 0 ? size : 0;
};

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
