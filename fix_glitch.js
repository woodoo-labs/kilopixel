const fs = require('fs');
const file = 'docs/coordinates.html';
let html = fs.readFileSync(file, 'utf8');

// Generate exactly 100 unique points (0 to 99) to avoid duplicating the start point!
let pts = [];
for(let i = 0; i < 100; i++) { // Changed from <= 100 to < 100
  let localT = `${i} * 2 * PI / 100`;
  let px = `sin(${localT} * ref.sec9FreqX.value) * 450`;
  let py = `cos(${localT} * ref.sec9FreqY.value) * 250`;
  pts.push(px + ', ' + py);
}
let pointsStr = pts.join(';\n              ');

// We use regex to find the polyline and inject `closed="true"`
const regex = /(<pxl-polyline smooth="true" stroke="#94a3b8" strokewidth="2" fill="none" )(points="[\s\S]+?"><\/pxl-polyline>)/;

if (regex.test(html)) {
  // Add closed="true" and replace the points
  html = html.replace(regex, `$1closed="true" points="\n              ${pointsStr}\n            "></pxl-polyline>`);
  
  fs.writeFileSync(file, html, 'utf8');
  console.log('Successfully fixed the closed loop glitch!');
} else {
  // In case closed="true" was already added by a previous run or tweak
  const regexClosed = /(<pxl-polyline smooth="true" stroke="#94a3b8" strokewidth="2" fill="none" closed="true" points=")([\s\S]+?)("><\/pxl-polyline>)/;
  if (regexClosed.test(html)) {
    html = html.replace(regexClosed, `$1\n              ${pointsStr}\n            $3`);
    fs.writeFileSync(file, html, 'utf8');
    console.log('Successfully updated points (closed was already true)!');
  } else {
    console.log('Error: Could not find the polyline to replace!');
  }
}
