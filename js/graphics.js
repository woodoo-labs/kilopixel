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

// Radial gradient radius resolver: number → absolute logical canvas units,
// string → anchor point distance or CSS dynamic keyword
pxl.resolveRadius = (r, x, y, w, h, u) => {
  if (typeof r === 'number') return Math.abs(r * u);

  // 1. Direct Side Edges (Perpendicular projection: 0 sqrt, 0 object lookups)
  if (r === 'top')    return Math.abs(y * h * u);
  if (r === 'bottom') return Math.abs((1 - y) * h * u);
  if (r === 'left')   return Math.abs(x * w * u);
  if (r === 'right')  return Math.abs((1 - x) * w * u);

  // 2. Perimeter Points (Euclidean distance to discrete vertex)
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w * u, dy = (y - pxl.anchorY[r]) * h * u;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 3. Dynamic CSS Keywords (Lazy evaluated bounds)
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

pxl.applyTransformState = function(ctx, u, attributeValues) {
  const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = attributeValues;
  
  if (x || y) ctx.translate(x * u, y * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);
  
  const finalScaleX = scale !== 1 ? scale : scalex;
  const finalScaleY = scale !== 1 ? scale : scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx * u, dy * u);
};

pxl.scaleResponsiveFilter = function(filterStr, u) {
  // Only match and scale values explicitly suffixed with 'px' from pxl.scope helpers
  return filterStr.replace(/(-?\d+\.?\d*)px/g, (match, val) => {
    return (parseFloat(val) * u) + 'px';
  });
};

pxl.resolveFilter = function(node, filter, u) {
  if (!filter || filter === 'none') return 'none';
  
  if (Array.isArray(filter)) {
    let changed = !node._lastFilterArr || node._lastFilterArr.length !== filter.length;
    if (!changed) {
      for (let i = 0; i < filter.length; i++) {
        if (node._lastFilterArr[i] !== filter[i]) {
          changed = true;
          break;
        }
      }
    }
    
    if (changed || node._lastFilterU !== u) {
      if (changed) {
        if (!node._lastFilterArr) node._lastFilterArr = [];
        node._lastFilterArr.length = filter.length;
        for (let i = 0; i < filter.length; i++) node._lastFilterArr[i] = filter[i];
        node._lastFilterRaw = filter.join(' ');
      }
      node._lastFilterU = u;
      node._cachedFilterScaled = pxl.scaleResponsiveFilter(node._lastFilterRaw, u);
    }
  } else {
    if (node._lastFilterRaw !== filter || node._lastFilterU !== u) {
      node._lastFilterRaw = filter;
      node._lastFilterU = u;
      node._cachedFilterScaled = pxl.scaleResponsiveFilter(filter, u);
    }
  }
  
  return node._cachedFilterScaled;
};

pxl.applyContextState = function(ctx, u, attributeValues, node) {
  pxl.applyTransformState(ctx, u, attributeValues);
  
  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = attributeValues;
  
  // 2. Rendering States
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  
  if (mask && mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }
  
  if (filter && filter !== 'none') {
    ctx.filter = pxl.resolveFilter(node, filter, u);
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
// Geometry Parsing
// =========================================================================
// Smart Parser: Comma separates X/Y. Semicolon separates pairs.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  let start = 0;
  let depth = 0;
  let currentX = null;
  // Add a semicolon at the end to ensure the last point is processed
  const input = str + ";"; 

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    // Track parentheses so we don't split math functions like min(a, b)
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      if (char === ',') {
        // We found the end of X
        currentX = input.substring(start, i).trim();
        start = i + 1;
      } else if (char === ';') {
        // We found the end of Y
        const currentY = input.substring(start, i).trim();
        if (currentX !== null && currentX !== "" && currentY !== "") {
          targetArray.push(currentX, currentY);
        }
        currentX = null;
        start = i + 1;
      }
    }
  }
};
