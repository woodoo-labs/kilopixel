const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

const regex = /(<div id="sec2Container"[\s\S]*?<\/div>\s*)(<!-- Tabbed Controls -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*)(<\/div>)/;

if (regex.test(content)) {
    // $1 is sec2Container block
    // $2 is demo-controls block
    // $3 is closing div for demo-container
    
    // We swap $1 and $2
    content = content.replace(regex, '$2$1$3');
    
    // add margin to sec2Container
    content = content.replace('<div id="sec2Container" style="width: 100%; margin: 0 auto; transition: width 0.1s ease-out;">', '<div id="sec2Container" style="width: 100%; margin: 2rem auto 0; transition: width 0.1s ease-out;">');
    
    fs.writeFileSync('docs/coordinates.html', content);
    console.log('Successfully moved controls for section 2.');
} else {
    console.log('Regex did not match section 2!');
}
