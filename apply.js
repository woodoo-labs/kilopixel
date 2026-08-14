const fs = require('fs');
const file = 'docs/coordinates.html';
let html = fs.readFileSync(file, 'utf8');

let pts = [];
for(let i = 0; i <= 100; i++) {
  let localT = (i / 100) * Math.PI * 2;
  let px = `sin(${localT.toFixed(5)} * ref.sec9FreqX.value) * 300`;
  let py = `cos(${localT.toFixed(5)} * ref.sec9FreqY.value) * 150`;
  pts.push(px + ',' + py);
}
let pointsStr = pts.join(';\n              ');

// 1. Remove the old axes helpers from sec9Layer
const axesStr = `            <!-- Axes Helpers -->
            <pxl-line x1="0" y1="-2000" x2="0" y2="2000" stroke="#cbd5e1" strokewidth="2" linedash="[5, 5]"></pxl-line>
            <pxl-line x1="-2000" y1="0" x2="2000" y2="0" stroke="#cbd5e1" strokewidth="2" linedash="[5, 5]"></pxl-line>
`;
html = html.replace(axesStr, '');

// 2. Insert the new Background Layer right before sec9Layer
const targetStr = `          <pxl-layer id="sec9Layer" x="500" y="300" rotate="0">`;
const bgLayerStr = `          <!-- Background Layer (Trace Path) -->
          <pxl-layer id="sec9BgLayer" x="500" y="300" rotate="0">
            <!-- Axes Helpers -->
            <pxl-line x1="0" y1="-2000" x2="0" y2="2000" stroke="#cbd5e1" strokewidth="2" linedash="[5, 5]"></pxl-line>
            <pxl-line x1="-2000" y1="0" x2="2000" y2="0" stroke="#cbd5e1" strokewidth="2" linedash="[5, 5]"></pxl-line>

            <!-- Trace Path -->
            <pxl-polyline smooth="true" stroke="#94a3b8" strokewidth="2" fill="none" points="
              ${pointsStr}
            "></pxl-polyline>
          </pxl-layer>

          <pxl-layer id="sec9Layer" x="500" y="300" rotate="0">`;

html = html.replace(targetStr, bgLayerStr);

fs.writeFileSync(file, html, 'utf8');
console.log('Update applied successfully!');
