// Runs pxl.parsePointsIntoArray (from js/graphics.js) against edge cases.
// Usage: node design/prototypes/2026-10-18_polyline_optimization/points_parser_cases.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { pxl: {}, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'graphics.js'), 'utf8'), ctx);

const cases = [
  ['plain', '0,0; 100,50; 200,0'],
  ['function args', '0,0; 100,min(50, t * 10); 200,0'],
  ['real test40', '0, ref.y0.value; ref.x1.value, ref.y1.value; -ref.x1.value, ref.y1.value'],
  ['trailing ;', '0,0; 100,50;'],
  ['newlines', '0,0;\n  100,50;\n  200,0'],
  ['array keyframes', '0,0; [100, 200, 300][floor(loop(3) * 3)],50; 400,0'],
  ['string with comma', "0,0; ref.m.value === 'a,b' ? 100 : 200,50; 400,0"],
  ['string with paren', "0,0; ref.m.value === '(' ? 100 : 200,50; 400,0"],
  ['code block braces', '0,0; 100,if (t < 1) { return 0; } else { return 50; }; 200,0'],
  ['code block no braces', '0,0; 100,if (t < 1) return 0; return 50; 200,0'],
  ['missing y', '0,0; 100; 200,0'],
  ['three values', '0,0,5; 100,50'],
  ['trailing comma', '0,0; 100,50,; 200,0'],
  ['unbalanced (', '0,0; 100,sin(t; 200,0; 300,0'],
  ['unbalanced )', '0,0; 100,sin(t)); 200,0; 300,0'],
  ['empty', ''],
  ['removed (null)', null],
];

for (const [name, input] of cases) {
  const out = [];
  ctx.pxl.parsePointsIntoArray(input, out);
  const pairs = [];
  for (let i = 0; i < out.length; i += 2) pairs.push(`(${out[i]} | ${out[i + 1]})`);
  console.log(`${name.padEnd(22)} ${String(out.length / 2).padStart(2)} pts  ${pairs.join('  ')}`);
}
