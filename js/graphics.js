// =========================================================================
// Drawing & Transform Helpers
// =========================================================================
pxl.anchorX = { 'left': 0, 'right': 1, 'center': 0.5, 'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1, 'top': 0.5, 'bottom': 0.5 };
pxl.anchorY = { 'top': 0, 'bottom': 1, 'center': 0.5, 'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1, 'left': 0.5, 'right': 0.5 };

pxl.applyContextState = function(ctx, u, attributeValues) {
  const { x, y, pivotX, pivotY, offsetX, offsetY, rotate, scale, scaleX, scaleY, skewX, skewY, alpha, blend, filter } = attributeValues;
  
  let pivX, pivY, offX, offY;
  if (pivotX !== null || pivotY !== null) {
    pivX = pivotX !== null ? pivotX : (x || 0);
    pivY = pivotY !== null ? pivotY : (y || 0);
    offX = (x || 0) - pivX;
    offY = (y || 0) - pivY;
  } else {
    pivX = (x || 0) + (offsetX || 0);
    pivY = (y || 0) + (offsetY || 0);
    offX = -(offsetX || 0);
    offY = -(offsetY || 0);
  }

  // 1. Geometric Transforms
  if (pivX || pivY) ctx.translate(pivX * u, pivY * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);
  
  const finalScaleX = scaleX !== null && scaleX !== undefined ? scaleX : (scale !== undefined ? scale : 1);
  const finalScaleY = scaleY !== null && scaleY !== undefined ? scaleY : (scale !== undefined ? scale : 1);
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewX || skewY) ctx.transform(1, skewY || 0, skewX || 0, 1, 0, 0);
  if (offX || offY) ctx.translate(offX * u, offY * u);

  // 2. Rendering States
  if (alpha !== 1 && alpha !== undefined) ctx.globalAlpha *= alpha;
  if (blend !== 'source-over' && blend !== undefined) ctx.globalCompositeOperation = blend;
  if (filter !== 'none' && filter !== undefined) ctx.filter = filter;
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
