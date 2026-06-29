const fs = require('fs');

let html = fs.readFileSync('test29.html', 'utf8');

// Replace <pxl-line ... /> with <pxl-line ...></pxl-line>
html = html.replace(/<pxl-line([^>]+?)\/>/g, '<pxl-line$1></pxl-line>');

// Replace <pxl-circle ... /> with <pxl-circle ...></pxl-circle>
html = html.replace(/<pxl-circle([^>]+?)\/>/g, '<pxl-circle$1></pxl-circle>');

// Ensure no other components use self-closing tags incorrectly
html = html.replace(/<pxl-rect([^>]+?)\/>/g, '<pxl-rect$1></pxl-rect>');
html = html.replace(/<pxl-text([^>]+?)\/>/g, '<pxl-text$1></pxl-text>');

fs.writeFileSync('test29.html', html);
