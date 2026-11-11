// Can rotate, scalex, scaley and skewx (Kilopixel's own transform order) rebuild ANY affine frame?
// Builds random chains of transforms with pxl.Matrix, decomposes the result, rebuilds it, compares.
// Usage: node design/prototypes/2026-10-29_tolocal_decomposition/decompose_check.js
const fs = require('fs');
const path = require('path');
global.pxl = {};
eval(fs.readFileSync(path.join(__dirname, '../../../js/matrix.js'), 'utf8'));

const M = pxl.Matrix;
const rnd = (a, b) => a + Math.random() * (b - a);

// Proposed decomposition of the linear part [a, b, c, d] into rotate → scale → skewx (skewy = 0)
function decompose(m) {
  const [a, b, c, d] = m;
  const sx = Math.hypot(a, b);
  return {
    x: m[4], y: m[5],
    rotate: Math.atan2(b, a) * 180 / Math.PI,
    scalex: sx,
    scaley: (a * d - b * c) / sx,                          // signed: negative = mirrored
    skewx: Math.atan((a * c + b * d) / (sx * sx)) * 180 / Math.PI
  };
}

// Today's toLocal formulas, for comparison
function today(m) {
  const [a, b, c, d] = m;
  return { x: m[4], y: m[5], rotate: Math.atan2(b, a) * 180 / Math.PI, scalex: Math.hypot(a, b), scaley: Math.hypot(c, d), skewx: 0 };
}

let worstNew = 0, worstToday = 0;
for (let n = 0; n < 10000; n++) {
  // A chain of 1–4 frames with rotation, non-uniform / negative scale and both skews
  let m = M.create();
  const depth = 1 + Math.floor(Math.random() * 4);
  for (let k = 0; k < depth; k++) {
    const local = M.updateLocal(M.create(), rnd(-500, 500), rnd(-500, 500), rnd(-50, 50), rnd(-50, 50),
      rnd(-180, 180), rnd(-2, 2), rnd(-2, 2), rnd(-40, 40), rnd(-40, 40));
    m = M.multiply(M.create(), m, local);
  }
  if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-3) continue; // skip (nearly) flat frames

  for (const [fn, label] of [[decompose, 'new'], [today, 'today']]) {
    const f = fn(m);
    const rebuilt = M.updateLocal(M.create(), f.x, f.y, 0, 0, f.rotate, f.scalex, f.scaley, f.skewx, 0);
    const err = Math.max(...[0, 1, 2, 3].map(i => Math.abs(rebuilt[i] - m[i]) / Math.max(1, Math.abs(m[i]))));
    if (label === 'new') worstNew = Math.max(worstNew, err); else worstToday = Math.max(worstToday, err);
  }
}
console.log(`worst relative error, rotate + scalex + scaley + skewx (proposed): ${worstNew.toExponential(2)}`);
console.log(`worst relative error, today's formulas (no skew, scaley = column length): ${worstToday.toFixed(3)}`);
