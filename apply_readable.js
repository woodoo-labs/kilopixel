const fs = require('fs');
const file = 'docs/coordinates.html';
let html = fs.readFileSync(file, 'utf8');

// Generate 100 readable points
let pts = [];
for(let i = 0; i <= 100; i++) {
  // Use semantic readable math instead of raw floats!
  let localT = `${i} * 2 * PI / 100`;
  let px = `sin(${localT} * ref.sec9FreqX.value) * 450`;
  let py = `cos(${localT} * ref.sec9FreqY.value) * 250`;
  // Add a space after the comma for pristine readability
  pts.push(px + ', ' + py);
}
let pointsStr = pts.join(';\n              ');

// The polyline starts with `<pxl-polyline smooth="true" stroke="#94a3b8" strokewidth="2" fill="none" points="`
// and ends with `"></pxl-polyline>`

const regex = /(<pxl-polyline smooth="true" stroke="#94a3b8" strokewidth="2" fill="none" points=")([\s\S]+?)("><\/pxl-polyline>)/;

if (regex.test(html)) {
  html = html.replace(regex, `$1\n              ${pointsStr}\n            $3`);
  
  fs.writeFileSync(file, html, 'utf8');
  console.log('Successfully updated points to have a space after the comma!');
} else {
  console.log('Error: Could not find the polyline to replace!');
}
