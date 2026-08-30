const fs = require('fs');
let html = fs.readFileSync('docs/gradients.html', 'utf8');

const tabs = ['Ellipse', 'Rect', 'Text'];

for (const tab of tabs) {
    const rotId = `sec2ex2${tab}RotVal`;
    
    // Find the start of the Rotation control-group
    const searchString = `                  <div class="control-group">
                    <label><span>Rotation</span> <span id="${rotId}">0°</span></label>`;
    
    const startIndex = html.indexOf(searchString);
    if (startIndex === -1) {
        console.log(`Could not find Rotation block for ${tab}`);
        continue;
    }
    
    const endIndex = html.indexOf('                  </div>', startIndex) + 24;
    const block = html.substring(startIndex, endIndex);
    
    // Remove it from current position
    html = html.substring(0, startIndex) + html.substring(endIndex + 1); // +1 for newline
    
    // Find the end of the End Y1 block to insert it after
    const endY1Id = `sec2ex2${tab}Y1Val`;
    const endY1SearchString = `                  <div class="control-group">
                    <label><span>End Y1</span> <span id="${endY1Id}">1</span></label>`;
    
    const endY1StartIndex = html.indexOf(endY1SearchString);
    const endY1EndIndex = html.indexOf('                  </div>', endY1StartIndex) + 24;
    
    // Insert block after End Y1 block
    html = html.substring(0, endY1EndIndex) + '\n' + block + html.substring(endY1EndIndex);
}

fs.writeFileSync('docs/gradients.html', html);
console.log("Done reordering!");
