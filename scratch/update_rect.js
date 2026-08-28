const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf8');

// The original rect is 900x500. We change it to exactly 980x580 to cover the circle without scaling the gradient too much
content = content.replace(/<pxl-rect x="0" y="0" w="900" h="500"/g, '<pxl-rect x="0" y="0" w="980" h="580"');

fs.writeFileSync('docs/coordinates.html', content);
console.log('Updated rect size');
