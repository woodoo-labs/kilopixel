const fs = require('fs');
const file = 'docs/coordinates.html';
let html = fs.readFileSync(file, 'utf8');

// Fix X slider
html = html.replace(
  `document.getElementById('sec9Layer').setAttribute('x', this.value);`,
  `document.getElementById('sec9Layer').setAttribute('x', this.value); document.getElementById('sec9BgLayer').setAttribute('x', this.value);`
);

// Fix Y slider
html = html.replace(
  `document.getElementById('sec9Layer').setAttribute('y', this.value);`,
  `document.getElementById('sec9Layer').setAttribute('y', this.value); document.getElementById('sec9BgLayer').setAttribute('y', this.value);`
);

// Fix Rotate slider
html = html.replace(
  `document.getElementById('sec9Layer').setAttribute('rotate', this.value);`,
  `document.getElementById('sec9Layer').setAttribute('rotate', this.value); document.getElementById('sec9BgLayer').setAttribute('rotate', this.value);`
);

fs.writeFileSync(file, html, 'utf8');
console.log('Fixed layer controls to target both sec9Layer and sec9BgLayer');
