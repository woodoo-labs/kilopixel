const fs = require('fs');
let html = fs.readFileSync('docs/colors.html', 'utf-8');

const startStr = '<div class="callout-info">';
const endStr = '</div>\n\n        <div class="example-card" style="margin-top: 2rem;">';

const startIndex = html.indexOf(startStr, html.indexOf('SECTION 5: RADIAL GRADIENTS'));
const endIndex = html.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find callout block');
  process.exit(1);
}

const newCallout = `<div class="callout-info">
          <p class="callout-body"><strong>The Farthest-Corner Guarantee:</strong> Kilopixel gradients are mathematically locked to the element's bounding box. For radial gradients, the engine dynamically calculates the distance to the farthest corner so that a radius of <code>1</code> perfectly and intuitively stretches to the extreme tips of any shape.</p>
          <p class="callout-body" style="margin-top: 1rem;">In the diagrams below, the <span style="color: #3b82f6; font-weight: 600;">blue dashed box</span> represents the invisible bounding box, while the <span style="color: #8b5cf6; font-weight: 600;">purple vector</span> represents the generated radius targeting the farthest corner.</p>

          <pxl-stage ratio="2 / 1" style="width: 100%; background: transparent; margin-top: 1rem;">
            <pxl-layer>
              <pxl-grid stroke="#cbd5e1" major="2"></pxl-grid>
              
              <!-- 1. Center (Standard) -->
              <pxl-rect x="250" y="200" w="250" h="150" fill="radial(1, [0, '#e2e8f0', 0.98, '#94a3b8', 0.98, '#fff', 1, '#fff'])"></pxl-rect>
              <pxl-rect x="250" y="200" w="250" h="150" fill="none" stroke="#3b82f6" strokewidth="2" linedash="5, 5"></pxl-rect>
              
              <!-- Farthest Corner Line -->
              <pxl-circle x="250" y="200" r="8" fill="#8b5cf6"></pxl-circle>
              <pxl-line x1="250" y1="200" x2="125" y2="125" stroke="#8b5cf6" strokewidth="3" arrowend="25"></pxl-line>
              <pxl-text x="250" y="300" text="'radial(1)'" fill="#8b5cf6" size="27" font="monospace" align="center" baseline="middle"></pxl-text>
        
              <!-- 2. Offset Center (3-Arg) -->
              <pxl-rect x="750" y="200" w="250" h="150" fill="radial([0.2, 0.2, 1], [0, '#e2e8f0', 0.98, '#94a3b8', 0.98, '#fff', 1, '#fff'])"></pxl-rect>
              <pxl-rect x="750" y="200" w="250" h="150" fill="none" stroke="#3b82f6" strokewidth="2" linedash="5, 5"></pxl-rect>
              
              <!-- Farthest Corner Line -->
              <pxl-circle x="675" y="155" r="8" fill="#8b5cf6"></pxl-circle>
              <pxl-line x1="675" y1="155" x2="875" y2="275" stroke="#8b5cf6" strokewidth="3" arrowend="25"></pxl-line>
              <pxl-text x="750" y="300" text="'radial([0.2, 0.2, 1])'" fill="#8b5cf6" size="27" font="monospace" align="center" baseline="middle"></pxl-text>
            </pxl-layer>
          </pxl-stage>
`;

html = html.substring(0, startIndex) + newCallout + html.substring(endIndex);
fs.writeFileSync('docs/colors.html', html);
console.log('Callout replaced!');
`;
