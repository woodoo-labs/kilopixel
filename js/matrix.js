// =========================================================================
// pxl.Matrix: 2D affine matrices [a, b, c, d, tx, ty], written into existing arrays
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

// toLocal(ref.target, prop) in expressions (the compiler adds the caller): the target's frame
// in the caller's parent space, the space of the caller's own x / y.
pxl.toLocal = function(caller, targetObj, prop) {
  if (!targetObj) return 0; // ref.<id> of an element that isn't connected yet

  const targetNode = targetObj.$node;
  if (!targetNode.getGlobalMatrix) return 0; // pxl-stage: no frame

  const callerParentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;

  // d = inverse(caller parent global) × target global
  pxl.Matrix.invert(pxl._scratchMatrixA, callerParentGlobal);
  const d = pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetNode.getGlobalMatrix());

  // The target's offset (dx, dy) in the caller's space; the translation d[4], d[5] already includes it
  const { dx, dy } = targetNode.attributeValues;
  const tdx = d[0] * dx + d[2] * dy;
  const tdy = d[1] * dx + d[3] * dy;

  if (prop === 'x')      return d[4] - tdx;
  if (prop === 'y')      return d[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return d[4];
  if (prop === 'ty')     return d[5];
  // Kilopixel's order rotate → scale → skew: rotate, scalex, scaley (negative = mirrored) and skewx
  // rebuild any target frame. zoom is the uniform factor with the same area change.
  if (prop === 'rotate') return Math.atan2(d[1], d[0]) * 180 / Math.PI;
  const det = d[0] * d[3] - d[1] * d[2];
  const lenX = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  if (prop === 'scalex') return lenX;
  if (prop === 'scaley') return det / lenX;
  if (prop === 'skewx')  return Math.atan((d[0] * d[2] + d[1] * d[3]) / (lenX * lenX)) * 180 / Math.PI;
  if (prop === 'zoom')   return Math.sqrt(Math.abs(det));

  // Unknown names are reported once by the compiler (pxl.checkToLocalProperties), not here in the frame loop
  return 0;
};

pxl.toLocalProperties = ['x', 'y', 'dx', 'dy', 'tx', 'ty', 'rotate', 'scalex', 'scaley', 'skewx', 'zoom'];
