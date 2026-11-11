// Simplified Phase 1 parser sketch (parentheses only + validation), see design/2026-10-18_polyline_optimization_plan.md §3.
// Usage: node design/prototypes/2026-10-18_polyline_optimization/points_parser_sketch.js
const parse = function(str, targetArray) {
  targetArray.length = 0;
  if (!str) return true;

  const len = str.length;
  let depth = 0, start = 0, x = null, extra = false, clean = true;

  for (let i = 0; i <= len; i++) {
    const ch = i < len ? str[i] : ';'; // virtual terminator, no string concatenation
    if (ch === '(') depth++;
    else if (ch === ')') { if (--depth < 0) break; }
    else if (depth === 0 && ch === ',') {
      if (x === null) x = str.substring(start, i).trim();
      else extra = true;
      start = i + 1;
    } else if (depth === 0 && ch === ';') {
      const y = str.substring(start, i).trim();
      if (x !== null && x !== '' && y !== '' && !extra) targetArray.push(x, y);
      else if (x !== null || y !== '') clean = false; // malformed point: skipped
      x = null; extra = false; start = i + 1;
    }
  }

  if (depth !== 0) { // unbalanced parentheses: reject everything
    targetArray.length = 0;
    return false;
  }
  return clean;
};

const cases = [
  ['plain', '0,0; 100,50; 200,0'],
  ['function args', '0,0; 100,min(50, t * 10); 200,0'],
  ['real test40', '0, ref.y0.value; ref.x1.value, ref.y1.value; -ref.x1.value, ref.y1.value'],
  ['ternary with string', "0,0; ref.mode.value === 'wide' ? 300 : 200,50"],
  ['list in parentheses', '0,0; ([100, 200, 300][floor(loop(3) * 3)]),50'],
  ['trailing ;', '0,0; 100,50;'],
  ['newlines', '0,0;\n  100,50;\n  200,0\n'],
  ['missing y', '0,0; 100; 200,0'],
  ['three values', '0,0,5; 100,50'],
  ['trailing comma', '0,0; 100,50,; 200,0'],
  ['empty x', '0,0; ,50; 200,0'],
  ['unbalanced (', '0,0; 100,sin(t; 200,0'],
  ['unbalanced )', '0,0; 100,sin(t)); 200,0'],
  ['empty', ''],
  ['removed (null)', null],
];

for (const [name, input] of cases) {
  const out = [];
  const clean = parse(input, out);
  const pairs = [];
  for (let i = 0; i < out.length; i += 2) pairs.push(`(${out[i]} | ${out[i + 1]})`);
  console.log(`${name.padEnd(20)} ${clean ? 'clean' : 'WARN '} ${String(out.length / 2).padStart(2)} pts  ${pairs.join('  ')}`);
}
