// =========================================================================
// pxl.Matrix - Zero-GC 2D Affine Engine
// =========================================================================

pxl.Matrix = {
  create: function() {
    return new Float32Array([1, 0, 0, 1, 0, 0]);
  },

  // Order: Translate(x,y) -> Rotate -> Scale -> Skew -> Translate(dx,dy)
  updateLocal: function(out, x, y, dx, dy, rotate, scaleX, scaleY, skewX, skewY) {
    out[0] = 1; out[1] = 0;
    out[2] = 0; out[3] = 1;
    out[4] = 0; out[5] = 0;

    if (x || y) {
      out[4] = x || 0;
      out[5] = y || 0;
    }

    if (rotate) {
      const rad = rotate * Math.PI / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const o0 = out[0], o1 = out[1], o2 = out[2], o3 = out[3];
      out[0] = o0 * c + o2 * s;
      out[1] = o1 * c + o3 * s;
      out[2] = o0 * -s + o2 * c;
      out[3] = o1 * -s + o3 * c;
    }

    if (scaleX !== 1 || scaleY !== 1) {
      out[0] *= scaleX; out[1] *= scaleX;
      out[2] *= scaleY; out[3] *= scaleY;
    }

    if (skewX || skewY) {
      const sx = Math.tan((skewX || 0) * Math.PI / 180);
      const sy = Math.tan((skewY || 0) * Math.PI / 180);
      const o0 = out[0], o1 = out[1], o2 = out[2], o3 = out[3];
      out[0] = o0 + o2 * sy;
      out[1] = o1 + o3 * sy;
      out[2] = o0 * sx + o2;
      out[3] = o1 * sx + o3;
    }

    if (dx || dy) {
      const ddx = dx || 0;
      const ddy = dy || 0;
      out[4] += out[0] * ddx + out[2] * ddy;
      out[5] += out[1] * ddx + out[3] * ddy;
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

  if (prop === 'x') return pxl._scratchMatrixB[4];
  if (prop === 'y') return pxl._scratchMatrixB[5];
  if (prop === 'rotate' || prop === 'r') return Math.atan2(pxl._scratchMatrixB[1], pxl._scratchMatrixB[0]) * 180 / Math.PI;
  if (prop === 'scaleX' || prop === 'sx') return Math.sqrt(pxl._scratchMatrixB[0]*pxl._scratchMatrixB[0] + pxl._scratchMatrixB[1]*pxl._scratchMatrixB[1]);
  if (prop === 'scaleY' || prop === 'sy') return Math.sqrt(pxl._scratchMatrixB[2]*pxl._scratchMatrixB[2] + pxl._scratchMatrixB[3]*pxl._scratchMatrixB[3]);
  
  return 0;
};
