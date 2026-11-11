// How far do the uniform and the centripetal Catmull-Rom spline stray from the true Lissajous curve?
// Usage: node design/prototypes/2026-11-11_polyline_smoothstyle/spline_error.js
// Error = largest distance (stage units, stage 1000 wide) from a point on the drawn curve to the true curve.

function sample(n, fx, fy) {
  const p = [];
  for (let i = 0; i < n; i++) { const v = i * 2 * Math.PI / n; p.push([Math.sin(v * fx) * 450, Math.cos(v * fy) * 250]); }
  return p;
}

// Bezier control points for segment i -> i+1 of a closed polyline
function uniform(p, i) {
  const n = p.length, a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], d = p[(i + 2) % n];
  return [b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c];
}
function centripetal(p, i) {
  const n = p.length;
  const handle = (j, out) => {           // plan 2026-10-23 §4.1, k = 1
    const P = p[j], A = p[(j - 1 + n) % n], B = p[(j + 1) % n];
    const din = Math.hypot(P[0] - A[0], P[1] - A[1]), dout = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const ain = Math.sqrt(din), aout = Math.sqrt(dout);
    if (ain < 1e-6 || aout < 1e-6) return [0, 0];
    const T = [din * (B[0] - P[0]) + dout * (P[0] - A[0]), din * (B[1] - P[1]) + dout * (P[1] - A[1])];
    const s = out ? 1 / (3 * ain * (ain + aout)) : -1 / (3 * aout * (ain + aout));
    return [T[0] * s, T[1] * s];
  };
  const b = p[i], c = p[(i + 1) % n], h1 = handle(i, true), h2 = handle((i + 1) % n, false);
  return [b, [b[0] + h1[0], b[1] + h1[1]], [c[0] + h2[0], c[1] + h2[1]], c];
}
function straight(p, i) { const n = p.length, b = p[i], c = p[(i + 1) % n]; return [b, b, c, c]; }

function bez(s, t) {
  const u = 1 - t;
  return [0, 1].map(k => u*u*u*s[0][k] + 3*u*u*t*s[1][k] + 3*u*t*t*s[2][k] + t*t*t*s[3][k]);
}

function maxError(p, seg, truth) {
  let worst = 0, at = null;
  for (let i = 0; i < p.length; i++) {
    const s = seg(p, i);
    for (let k = 0; k <= 20; k++) {
      const q = bez(s, k / 20);
      let best = Infinity;
      for (const r of truth) { const d = (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2; if (d < best) best = d; }
      if (best > worst) { worst = best; at = q; }
    }
  }
  return { err: Math.sqrt(worst).toFixed(1), at: at.map(Math.round).join(',') };
}

for (const [fx, fy] of [[4, 1], [5, 3], [2, 3], [9, 3]]) {
  const truth = sample(20000, fx, fy);
  for (const n of [60, 100, 600]) {
    const p = sample(n, fx, fy);
    const row = [['uniform', uniform], ['centripetal', centripetal], ['straight', straight]]
      .map(([name, f]) => `${name} ${maxError(p, f, truth).err}`).join('   ');
    console.log(`${fx}/${fy}  n=${String(n).padEnd(3)}  ${row}`);
  }
}
