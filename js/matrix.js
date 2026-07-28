// =========================================================================
// pxl.Matrix - Zero-GC 2D Affine Engine
// =========================================================================

pxl.Matrix = {
  create: function() {
    return new Float32Array([1, 0, 0, 1, 0, 0]);
  },

  // Order: Translate(x,y) -> Rotate -> Scale -> Skew -> Translate(dx,dy)
  updateLocal: function(out, x, y, dx, dy, rotate, scalex, scaley, skewx, skewy) {
    if (rotate) {
      const rad = rotate * Math.PI / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      out[0] = c;  out[1] = s;
      out[2] = -s; out[3] = c;
    } else {
      out[0] = 1; out[1] = 0;
      out[2] = 0; out[3] = 1;
    }
    out[4] = x;
    out[5] = y;

    if (scalex !== 1 || scaley !== 1) {
      out[0] *= scalex; out[1] *= scalex;
      out[2] *= scaley; out[3] *= scaley;
    }
    if (skewx || skewy) {
      const sx = Math.tan(skewx * Math.PI / 180);
      const sy = Math.tan(skewy * Math.PI / 180);
      const a0 = out[0], a1 = out[1], a2 = out[2], a3 = out[3];
      out[0] = a0 + a2 * sy;
      out[1] = a1 + a3 * sy;
      out[2] = a0 * sx + a2;
      out[3] = a1 * sx + a3;
    }
    if (dx || dy) {
      out[4] += out[0] * dx + out[2] * dy;
      out[5] += out[1] * dx + out[3] * dy;
    }
    return out;
  },

  multiply: function(out, a, b) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];

    out[0] = a0 * b0 + a2 * b1;
    out[1] = a1 * b0 + a3 * b1;
    out[2] = a0 * b2 + a2 * b3;
    out[3] = a1 * b2 + a3 * b3;
    out[4] = a0 * b4 + a2 * b5 + a4;
    out[5] = a1 * b4 + a3 * b5 + a5;
    return out;
  },

  invert: function(out, a) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    let det = a0 * a3 - a1 * a2;

    if (det === 0) {
      out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0;
      return out;
    }
    det = 1.0 / det;

    out[0] = a3 * det;
    out[1] = -a1 * det;
    out[2] = -a2 * det;
    out[3] = a0 * det;
    out[4] = (a2 * a5 - a3 * a4) * det;
    out[5] = (a1 * a4 - a0 * a5) * det;
    return out;
  }
};

pxl._scratchMatrixA = pxl.Matrix.create();
pxl._scratchMatrixB = pxl.Matrix.create();
pxl._identityMatrix = pxl.Matrix.create();

pxl.mapCoordinate = function(caller, targetObj, prop) {
  if (!targetObj || !caller) return 0;
  
  const targetNode = targetObj.$node || targetObj; 
  
  const callerParentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;
  
  const targetGlobal = targetNode.getGlobalMatrix ? targetNode.getGlobalMatrix() : null;
  if (!targetGlobal) return 0;

  // Delta = Invert(CallerParentGlobal) * TargetGlobal
  pxl.Matrix.invert(pxl._scratchMatrixA, callerParentGlobal);
  pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetGlobal);

  const dx = targetNode.attributeValues.dx;
  const dy = targetNode.attributeValues.dy;
  const tdx = pxl._scratchMatrixB[0] * dx + pxl._scratchMatrixB[2] * dy;
  const tdy = pxl._scratchMatrixB[1] * dx + pxl._scratchMatrixB[3] * dy;

  if (prop === 'x')      return pxl._scratchMatrixB[4] - tdx;
  if (prop === 'y')      return pxl._scratchMatrixB[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return pxl._scratchMatrixB[4];
  if (prop === 'ty')     return pxl._scratchMatrixB[5];
  if (prop === 'rotate') return Math.atan2(pxl._scratchMatrixB[1], pxl._scratchMatrixB[0]) * 180 / Math.PI;
  if (prop === 'scale' || prop === 'scalex') return Math.sqrt(pxl._scratchMatrixB[0]*pxl._scratchMatrixB[0] + pxl._scratchMatrixB[1]*pxl._scratchMatrixB[1]);
  if (prop === 'scaley') return Math.sqrt(pxl._scratchMatrixB[2]*pxl._scratchMatrixB[2] + pxl._scratchMatrixB[3]*pxl._scratchMatrixB[3]);
  
  return 0;
};
