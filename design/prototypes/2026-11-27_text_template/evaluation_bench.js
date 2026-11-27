// Evaluation cost: today's backtick template (one compiled function) vs. the sketch's joined parts
// (one compiled function per ${…} plus the joining loop). Run: node design/prototypes/2026-11-27_text_template/evaluation_bench.js (design/done/2026-11-27_text_template_plan.md §10)
const ref = { score: { value: 2 }, lives: { value: 3 } };
const N = 2e6;

function time(label, fn) {
  for (let i = 0; i < 1e5; i++) fn(i); // warm up
  const start = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += fn(i).length;
  const ns = Number(process.hrtime.bigint() - start) / N;
  console.log(`${label.padEnd(44)} ${ns.toFixed(1)} ns per evaluation (${sink > 0 ? 'ok' : ''})`);
  return ns;
}

// Today: `Score: ${ref.score.value} / ${ref.lives.value}` compiled as one function
const today = new Function('ref', 'return function(t) { return `Score: ${ref.score?.value} / ${ref.lives?.value}`; };')(ref);

// Sketch: two part functions and the joining loop of pxl.parseTemplate
const partA = new Function('ref', 'return function(t) { return ref.score?.value; };')(ref);
const partB = new Function('ref', 'return function(t) { return ref.lives?.value; };')(ref);
const texts = ['Score: ', ' / ', ''];
const parts = [partA, partB];
const joined = function(t) {
  let result = texts[0];
  for (let p = 0; p < 2; p++) {
    const part = parts[p];
    const value = typeof part === 'function' ? part.call(this, t) : part;
    if (value === undefined || value === null || Number.isNaN(value)) return null;
    result += value + texts[p + 1];
  }
  return result;
};

// The value changes in every evaluation, so no engine could skip it
const a = time('today: one backtick template', (i) => { ref.score.value = i & 255; return today(i); });
const b = time('sketch: two parts joined', (i) => { ref.score.value = i & 255; return joined(i); });
console.log(`difference: ${(b - a).toFixed(1)} ns per evaluation`);
