const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

const sections = content.split('<div class="demo-container">');
let newContent = sections[0];

for (let i = 1; i < sections.length; i++) {
    let section = sections[i];
    
    if (section.trim().startsWith('<div id="sec1Container"') || section.trim().startsWith('<div id="sec2Container"')) {
        newContent += '<div class="demo-container">' + section;
        continue;
    }
    
    const stageStartIndex = section.indexOf('<pxl-stage');
    if (stageStartIndex === -1) {
        newContent += '<div class="demo-container">' + section;
        continue;
    }
    
    const stageEndIndex = section.indexOf('</pxl-stage>') + '</pxl-stage>'.length;
    let stageBlock = section.substring(stageStartIndex, stageEndIndex);
    
    if (!stageBlock.includes('margin-top: 2rem')) {
        stageBlock = stageBlock.replace('<pxl-stage', '<pxl-stage style="margin-top: 2rem;"');
    }
    
    let actualControlsStart = section.indexOf('<div class="demo-controls">', stageEndIndex);
    if (actualControlsStart === -1) {
        newContent += '<div class="demo-container">' + section;
        continue;
    }
    
    // Find the comment before it if it exists
    let commentStart = section.lastIndexOf('<!--', actualControlsStart);
    if (commentStart < stageEndIndex) commentStart = actualControlsStart;
    
    let textBeforeControls = section.substring(stageEndIndex, actualControlsStart);
    
    let nextH2 = section.indexOf('<h2>');
    let mainEnd = section.indexOf('</main>');
    
    let endOfContainer = section.length;
    if (nextH2 !== -1) {
        endOfContainer = section.lastIndexOf('</div>', nextH2);
        // Sometimes there are multiple divs, we need to find the one that closes demo-container
        // Let's just find the last </div> before nextH2
        let searchArea = section.substring(actualControlsStart, nextH2);
        let lastDiv = searchArea.lastIndexOf('</div>');
        endOfContainer = actualControlsStart + lastDiv;
    } else if (mainEnd !== -1) {
        let searchArea = section.substring(actualControlsStart, mainEnd);
        let lastDiv = searchArea.lastIndexOf('</div>');
        endOfContainer = actualControlsStart + lastDiv;
    }
    
    let controlsBlock = section.substring(actualControlsStart, endOfContainer);
    
    let swapped = '\n        ' + textBeforeControls.trim() + '\n        ' + controlsBlock.trim() + '\n        ' + stageBlock.trim() + '\n      ';
    
    let newSection = section.substring(0, stageStartIndex) + swapped + section.substring(endOfContainer);
    newContent += '<div class="demo-container">' + newSection;
}

fs.writeFileSync('docs/coordinates.html', newContent);
console.log("Flipped all other sections safely.");
