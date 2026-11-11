// Does shifting where the samples start (a fraction of one step) change the centripetal error?
// Usage: node design/prototypes/2026-11-11_polyline_smoothstyle/spline_offset.js
const src = require('fs').readFileSync(__dirname + '/spline_error.js', 'utf8').split('for (const [fx, fy]')[0];
eval(src.replace('function sample(n, fx, fy) {', 'function sample(n, fx, fy, off = 0) {').replace('const v = i * 2', 'const v = (i + off) * 2'));
const offs = [0, 0.25, 0.5, 0.75];
const pairs = [];
for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) pairs.push([a, b]);
const worst = offs.map(() => 0), sum = offs.map(() => 0);
for (const [fx, fy] of pairs) {
  const truth = sample(6000, fx, fy);
  const errs = offs.map(o => +maxError(sample(+process.argv[2] || 60, fx, fy, o), centripetal, truth).err);
  errs.forEach((e, k) => { worst[k] = Math.max(worst[k], e); sum[k] += e; });
  console.log(`${fx}/${fy}  ` + errs.map((e, k) => `off ${offs[k]}: ${e.toFixed(1)}`).join('   '));
}
console.log('worst  ' + worst.map((e, k) => `off ${offs[k]}: ${e.toFixed(1)}`).join('   '));
console.log('mean   ' + sum.map((e, k) => `off ${offs[k]}: ${(e / pairs.length).toFixed(2)}`).join('   '));
