const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf8');

content = content.replace('\"></pxl-polyline>\n            <pxl-layer id=\"sec9Layer\"', '\"></pxl-polyline>\n          </pxl-layer>\n\n          <pxl-layer id=\"sec9Layer\"');
content = content.replace('          </pxl-layer>\n          </pxl-layer>\n        </pxl-stage>', '          </pxl-layer>\n        </pxl-stage>');

fs.writeFileSync('docs/coordinates.html', content);
console.log('Fixed tags');
