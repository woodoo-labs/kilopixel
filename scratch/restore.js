const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

// 1. Colors
content = content.replace(/#0f766e/g, '#0284c7'); // Origin
content = content.replace(/#14b8a6/g, '#0ea5e9'); // Arrows
content = content.replace(/#86efac/g, '#7dd3fc'); // Corners

// 2. Add Stage Origin to Section 4
content = content.replace(
`          <!-- 2. Fixed Stage-Level Layer Helpers -->
          <pxl-layer>
            <pxl-line x1="0" y1="ref.sec4Layer.y"`, 
`          <!-- 2. Fixed Stage-Level Layer Helpers -->
          <pxl-layer>
            <!-- Stage Origin -->
            <pxl-circle x="0" y="0" r="6" fill="#0284c7"></pxl-circle>
            <pxl-text x="15" y="15" baseline="top" text="'Stage Origin (0, 0)'" size="27" fill="#0284c7" font="monospace"></pxl-text>
            <pxl-line x1="0" y1="ref.sec4Layer.y"`);

// 3. Add Stage Origin to Section 5
content = content.replace(
`          <!-- 2. Fixed Stage-Level Layer Helpers -->
          <pxl-layer>
            <pxl-line x1="0" y1="ref.sec5Layer.y"`, 
`          <!-- 2. Fixed Stage-Level Layer Helpers -->
          <pxl-layer>
            <!-- Stage Origin -->
            <pxl-circle x="0" y="0" r="6" fill="#0284c7"></pxl-circle>
            <pxl-text x="15" y="15" baseline="top" text="'(0, 0)'" size="27" fill="#0284c7" font="monospace"></pxl-text>
            <pxl-line x1="0" y1="ref.sec5Layer.y"`);

fs.writeFileSync('docs/coordinates.html', content);
console.log('Restored colors and origins!');
