// Micro-benchmark: today's per-frame flatCache refill (string-keyed reads) vs. a numeric array.
// JS cost only; canvas path building and rasterization are not included.
// Usage: node design/prototypes/2026-10-18_polyline_optimization/polyline_lookup_bench.js
function makeValues(n, dictionaryMode) {
  const o = { x: 0, y: 0, fill: null, stroke: '#fff', strokewidth: 2 };
  const keys = [];
  for (let i = 0; i < n; i++) { keys.push(`p${i}`); o[`p${i}`] = Math.random() * 1000; }
  if (dictionaryMode) { o.tmp = 1; delete o.x; o.x = 0; } // what clearPoints() + re-adding does
  return { o, keys };
}

function bench(label, n, fn) {
  for (let i = 0; i < 2000; i++) fn(); // warm up (JIT)
  const frames = 20000;
  const start = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) fn();
  const us = Number(process.hrtime.bigint() - start) / 1000 / frames;
  console.log(`${label.padEnd(44)} ${us.toFixed(2).padStart(7)} µs per frame`);
}

for (const n of [200, 1000, 4000]) { // values = 2 × points (100, 500, 2000 points)
  const u = 1.37;
  const fast = makeValues(n, false), slow = makeValues(n, true);
  const flat = new Float32Array(n);
  const numeric = new Float64Array(n).map(() => Math.random() * 1000);
  const flat64 = new Float64Array(n);
  console.log(`--- ${n / 2} points`);
  bench('today: string keys (fast properties)', n, () => { for (let i = 0; i < n; i++) flat[i] = fast.o[fast.keys[i]] * u; });
  bench('today: string keys (dictionary mode)', n, () => { for (let i = 0; i < n; i++) flat[i] = slow.o[slow.keys[i]] * u; });
  bench('phase 2: Float64Array', n, () => { for (let i = 0; i < n; i++) flat64[i] = numeric[i] * u; });
}
console.log('Frame budget at 60 fps: 16 667 µs');
