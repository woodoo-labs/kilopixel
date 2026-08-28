const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

let sec2Index = content.indexOf('<h2>2. Layer');
let sec2End = content.indexOf('<h2>3. Shape');
let sec2Str = content.substring(sec2Index, sec2End);

let newSec2Str = sec2Str.replace(/<\/div>\r?\n<\/div>\r?\n        <div id="sec2Container"/, '        <div id="sec2Container"');
newSec2Str = newSec2Str.replace(/<\/div>\r?\n<\/div>\r?\n$/, '</div>\n');

content = content.replace(sec2Str, newSec2Str);
fs.writeFileSync('docs/coordinates.html', content);
console.log('Fixed section 2 again');
