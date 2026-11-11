// Worst and mean error of uniform vs centripetal over all slider combinations, with an exact distance to the true curve.
// Usage: node design/prototypes/2026-11-11_polyline_smoothstyle/spline_uniform_sec9.js
const src = require('fs').readFileSync(__dirname + '/spline_error.js', 'utf8').split('function maxError')[0];
eval(src);
const M = 4000;
function exactError(p, seg, fx, fy) {
  const f = v => [Math.sin(v * fx) * 450, Math.cos(v * fy) * 250];
  const truth = []; for (let j = 0; j < M; j++) truth.push(f(j * 2 * Math.PI / M));
  let worst = 0;
  for (let i = 0; i < p.length; i++) {
    const s = seg(p, i);
    for (let k = 0; k <= 16; k++) {
      const q = bez(s, k / 16);
      let bj = 0, best = Infinity;
      for (let j = 0; j < M; j++) { const d = (q[0] - truth[j][0]) ** 2 + (q[1] - truth[j][1]) ** 2; if (d < best) { best = d; bj = j; } }
      // refine on the continuous parameter around the best sample
      let lo = (bj - 1) * 2 * Math.PI / M, hi = (bj + 1) * 2 * Math.PI / M;
      const dist = v => { const r = f(v); return (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2; };
      for (let it = 0; it < 40; it++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (dist(a) < dist(b)) hi = b; else lo = a; }
      best = Math.min(best, dist((lo + hi) / 2));
      if (best > worst) worst = best;
    }
  }
  return Math.sqrt(worst);
}
for (const [maxF, counts] of [[5, [60, 120]], [10, [100, 120, 200]]]) {
  for (const n of counts) {
    const r = { uniform: [0, 0, ''], centripetal: [0, 0, ''] }; let k = 0;
    for (let a = 1; a <= maxF; a++) for (let b = 1; b <= maxF; b++) {
      k++;
      for (const [name, fn] of [['uniform', uniform], ['centripetal', centripetal]]) {
        const e = exactError(sample(n, a, b), fn, a, b);
        if (e > r[name][0]) { r[name][0] = e; r[name][2] = a + '/' + b; }
        r[name][1] += e;
      }
    }
    console.log(`freq 1-${maxF}, ${n} pts:  uniform worst ${r.uniform[0].toFixed(1)} (${r.uniform[2]}) mean ${(r.uniform[1]/k).toFixed(2)}   centripetal worst ${r.centripetal[0].toFixed(1)} (${r.centripetal[2]}) mean ${(r.centripetal[1]/k).toFixed(2)}`);
  }
}
