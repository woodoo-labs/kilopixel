const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

// Insert missing </div> for demo-controls in section 2
content = content.replace('</div>\r\n        <div id="sec2Container"', '</div>\n</div>\n        <div id="sec2Container"');
content = content.replace('</div>\n        <div id="sec2Container"', '</div>\n</div>\n        <div id="sec2Container"'); // fallback without \r

// Insert missing </div> for demo-container in section 2
content = content.replace('</pxl-stage>\r\n          </div>\r\n<h2>3. Shape', '</pxl-stage>\n          </div>\n</div>\n<h2>3. Shape');
content = content.replace('</pxl-stage>\n          </div>\n<h2>3. Shape', '</pxl-stage>\n          </div>\n</div>\n<h2>3. Shape');

fs.writeFileSync('docs/coordinates.html', content);
console.log('Fixed Section 2 nesting!');
