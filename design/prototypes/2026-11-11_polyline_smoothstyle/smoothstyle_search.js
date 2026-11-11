// Find a small sampled curve where centripetal visibly misses and uniform doesn't (docs example).
// Usage: node design/prototypes/2026-11-11_polyline_smoothstyle/smoothstyle_search.js
const src = require('fs').readFileSync(__dirname + '/spline_uniform_sec9.js', 'utf8').split('for (const [maxF')[0];
eval(src.replace(/Math.sin\(v \* fx\) \* 450, Math.cos\(v \* fy\) \* 250/g, 'Math.sin(v * fx + PH) * 400, Math.cos(v * fy) * 150'));
const out = [];
for (const PHd of [0, 45, 90]) {
  globalThis.PH = PHd * Math.PI / 180;
  for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (const n of [12, 16, 20, 24]) {
    const p = sample(n, a, b).map(q => q); // sample() uses the replaced formula via exactError? no: rebuild
    const pts = []; for (let i = 0; i < n; i++) { const v = i * 2 * Math.PI / n; pts.push([Math.sin(v * a + PH) * 400, Math.cos(v * b) * 150]); }
    const u = exactError(pts, uniform, a, b), c = exactError(pts, centripetal, a, b);
    out.push({ PHd, a, b, n, u: +u.toFixed(1), c: +c.toFixed(1) });
  }
}
out.filter(r => r.u < 2.5 && r.c > 8).sort((x, y) => y.c / Math.max(y.u, .3) - x.c / Math.max(x.u, .3)).slice(0, 15).forEach(r => console.log(JSON.stringify(r)));
