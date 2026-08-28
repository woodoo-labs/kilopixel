const fs = require('fs');
let content = fs.readFileSync('docs/css/docs.css', 'utf8');

const targetStr = \.docs-content pre mark.highlight-active {\;
const insertStr = \
.docs-content pre mark.highlight-reactive {
  background-color: transparent;
}
.docs-content pre mark.highlight-reactive.highlight-active {
  background-color: #f59e0b;
  color: #fff;
  border-radius: 4px;
}
\;

content = content.replace(targetStr, insertStr + targetStr);
fs.writeFileSync('docs/css/docs.css', content);
