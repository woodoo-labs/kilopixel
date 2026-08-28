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

// 4. Flip sections 1 and 2 and add margin
let regex1 = /(<div class="demo-container">\s*)(<div id="sec1Container"[\s\S]*?<\/div>\s*)(<!-- Tabbed Controls -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*)(<\/div>)/;
content = content.replace(regex1, '$1$3$2$4');
content = content.replace('<div id="sec1Container" style="width: 100%; margin: 0 auto; transition: width 0.1s ease-out;">', '<div id="sec1Container" style="width: 100%; margin: 2rem auto 0; transition: width 0.1s ease-out;">');

let regex2 = /(<div id="sec2Container"[\s\S]*?<\/div>\s*)(<!-- Tabbed Controls -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*)(<\/div>)/;
content = content.replace(regex2, '$2$1$3');
content = content.replace('<div id="sec2Container" style="width: 100%; margin: 0 auto; transition: width 0.1s ease-out;">', '<div id="sec2Container" style="width: 100%; margin: 2rem auto 0; transition: width 0.1s ease-out;">');

fs.writeFileSync('docs/coordinates.html', content);
console.log("Restored all manual changes!");
