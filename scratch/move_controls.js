const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

const regex = /(<div class="demo-container">\s*)(<div id="sec1Container"[\s\S]*?<\/div>\s*)(<!-- Tabbed Controls -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*)(<\/div>)/;

if (regex.test(content)) {
    content = content.replace(regex, '$1$3$2$4');
    fs.writeFileSync('docs/coordinates.html', content);
    console.log('Successfully moved controls.');
} else {
    console.log('Regex did not match!');
}
