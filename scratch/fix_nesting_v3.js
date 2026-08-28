const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf8');

content = content.replace(/\x22><\/pxl-polyline>\r?\n\s*<pxl-layer id=\x22sec9Layer\x22/g, '\"></pxl-polyline>\n          </pxl-layer>\n\n          <pxl-layer id=\"sec9Layer\"');
content = content.replace(/<\/pxl-layer>\r?\n\s*<\/pxl-layer>\r?\n\s*<\/pxl-stage>/g, '</pxl-layer>\n        </pxl-stage>');

fs.writeFileSync('docs/coordinates.html', content);
console.log('Fixed tags with regex script');
