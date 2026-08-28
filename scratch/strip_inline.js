const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

// Strip out inline styles
content = content.replace(/<div id=\"sec1Container\" style=\"width: 100%; margin: 2rem auto 0; transition: width 0.1s ease-out;\">/g, '<div id=\"sec1Container\" style=\"width: 100%; margin: 0 auto; transition: width 0.1s ease-out;\">');
content = content.replace(/<div id=\"sec2Container\" style=\"width: 100%; margin: 2rem auto 0; transition: width 0.1s ease-out;\">/g, '<div id=\"sec2Container\" style=\"width: 100%; margin: 0 auto; transition: width 0.1s ease-out;\">');

content = content.replace(/<pxl-stage style=\"margin-top: 2rem;\" /g, '<pxl-stage ');

fs.writeFileSync('docs/coordinates.html', content);
console.log('Stripped inline styles');
