// =========================================================================
// Drawing & Transform Helpers
// =========================================================================
pxl.anchorX = { 'left': 0, 'right': 1, 'center': 0.5, 'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1, 'top': 0.5, 'bottom': 0.5 };
pxl.anchorY = { 'top': 0, 'bottom': 1, 'center': 0.5, 'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1, 'left': 0.5, 'right': 0.5 };

// =========================================================================
// Zero-GC Matrix Math Engine
// =========================================================================
pxl.pushMatrix = function() {
  const depth = this.matrixDepth * 6;
  const m = this.currentMatrix;
  this.matrixStack[depth] = m[0];
  this.matrixStack[depth+1] = m[1];
  this.matrixStack[depth+2] = m[2];
  this.matrixStack[depth+3] = m[3];
  this.matrixStack[depth+4] = m[4];
  this.matrixStack[depth+5] = m[5];
  this.matrixDepth++;
};

pxl.popMatrix = function() {
  this.matrixDepth--;
  const depth = this.matrixDepth * 6;
  const m = this.currentMatrix;
  m[0] = this.matrixStack[depth];
  m[1] = this.matrixStack[depth+1];
  m[2] = this.matrixStack[depth+2];
  m[3] = this.matrixStack[depth+3];
  m[4] = this.matrixStack[depth+4];
  m[5] = this.matrixStack[depth+5];
};

pxl.matrixTranslate = function(tx, ty) {
  const m = this.currentMatrix;
  m[4] += m[0] * tx + m[2] * ty;
  m[5] += m[1] * tx + m[3] * ty;
};

pxl.matrixScale = function(sx, sy) {
  const m = this.currentMatrix;
  m[0] *= sx;
  m[1] *= sx;
  m[2] *= sy;
  m[3] *= sy;
};

pxl.matrixRotate = function(rad) {
  const m = this.currentMatrix;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const a = m[0], b = m[1], c = m[2], d = m[3];
  m[0] = a * cos + c * sin;
  m[1] = b * cos + d * sin;
  m[2] = a * -sin + c * cos;
  m[3] = b * -sin + d * cos;
};

pxl.matrixSkew = function(skewX, skewY) {
  const m = this.currentMatrix;
  const a = m[0], b = m[1], c = m[2], d = m[3];
  m[0] = a + c * skewY;
  m[1] = b + d * skewY;
  m[2] = a * skewX + c;
  m[3] = b * skewX + d;
};

pxl.applyContextState = function(ctx, u, attributeValues, isContainer = false) {
  const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, filter } = attributeValues;
  
  // 1. Geometric Transforms
  if (x || y) ctx.translate(x * u, y * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);
  
  const finalScaleX = (scalex !== 1 && scalex !== undefined) ? scalex : (scale !== undefined ? scale : 1);
  const finalScaleY = (scaley !== 1 && scaley !== undefined) ? scaley : (scale !== undefined ? scale : 1);
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) ctx.transform(1, skewy || 0, skewx || 0, 1, 0, 0);
  if (dx || dy) ctx.translate(dx * u, dy * u);

  // --- Zero-GC Matrix Tracker (Containers Only) ---
  if (isContainer && pxl.needsMatrixTracking) {
    if (x || y) pxl.matrixTranslate(x || 0, y || 0);
    if (rotate) pxl.matrixRotate(rotate * Math.PI / 180);
    if (finalScaleX !== 1 || finalScaleY !== 1) pxl.matrixScale(finalScaleX, finalScaleY);
    if (skewx || skewy) pxl.matrixSkew(skewx || 0, skewy || 0);
    if (dx || dy) pxl.matrixTranslate(dx || 0, dy || 0);
  }

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
