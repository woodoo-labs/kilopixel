const fs = require('fs');

// Generate 100 points
let pts = [];
for(let i = 0; i <= 100; i++) {
  let localT = (i / 100) * Math.PI * 2;
  let px = `sin(${localT.toFixed(5)} * ref.sec9FreqX.value) * 300`;
  let py = `cos(${localT.toFixed(5)} * ref.sec9FreqY.value) * 150`;
  pts.push(px + ',' + py);
}
let pointsStr = pts.join(';\n              ');

fs.writeFileSync('points.txt', pointsStr, 'utf8');
