// =========================================================================
// Drawing & Transform Helpers
// =========================================================================
pxl.anchorX = { 'left': 0, 'right': 1, 'center': 0.5, 'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1, 'top': 0.5, 'bottom': 0.5 };
pxl.anchorY = { 'top': 0, 'bottom': 1, 'center': 0.5, 'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1, 'left': 0.5, 'right': 0.5 };

pxl.applyContextState = function(ctx, u, attributeValues) {
  const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, filter } = attributeValues;
  
  // 1. Geometric Transforms
  if (x || y) ctx.translate(x * u, y * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);
  
  const finalScaleX = (scalex !== 1 && scalex !== undefined) ? scalex : (scale !== undefined ? scale : 1);
  const finalScaleY = (scaley !== 1 && scaley !== undefined) ? scaley : (scale !== undefined ? scale : 1);
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) ctx.transform(1, skewy || 0, skewx || 0, 1, 0, 0);
  if (dx || dy) ctx.translate(dx * u, dy * u);

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
