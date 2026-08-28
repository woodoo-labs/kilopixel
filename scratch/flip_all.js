const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf-8');

// We want to find all instances of:
// <div class="demo-container">
//   <pxl-stage ...> ... </pxl-stage>
//   <div class="demo-controls"> ... </div>
// </div>

const chunks = content.split('<div class="demo-container">');
let newContent = chunks[0];

for (let i = 1; i < chunks.length; i++) {
    let chunk = chunks[i];
    
    // Check if this chunk has demo-controls
    const controlsIndex = chunk.indexOf('<div class="demo-controls">');
    if (controlsIndex !== -1) {
        
        // Find where the controls block ends. It ends with the last </div> before the next section, 
        // which means we need to balance the divs or just look for the end of demo-container.
        // Actually, since chunk is everything up to the NEXT demo-container, it's exactly the whole section.
        // The last </div> in the chunk is the closing div of demo-container.
        
        // Wait, chunk might contain the rest of the HTML! 
        // split('<div class="demo-container">') means `chunk` contains the inside of demo-container 
        // AND all the text between this demo-container and the NEXT demo-container!
        
        // Let's just find <pxl-stage... up to </pxl-stage>
        const stageStart = chunk.indexOf('<pxl-stage');
        const stageEndToken = '</pxl-stage>';
        let stageEnd = chunk.indexOf(stageEndToken);
        if (stageEnd !== -1) {
            stageEnd += stageEndToken.length;
            
            // extract the stage block
            let stageBlock = chunk.substring(stageStart, stageEnd);
            
            // check if there's a div wrapper (like sec1Container or sec2Container)
            const beforeStage = chunk.substring(0, stageStart).trim();
            if (beforeStage.startsWith('<div id="sec')) {
                // we already processed this manually, so skip
                newContent += '<div class="demo-container">' + chunk;
                continue;
            }
            
            // Extract the controls block
            // Controls block starts at <div class="demo-controls">
            // And ends at the last </div> before the end of the demo-container.
            // A simpler way: The controls block is everything from <div class="demo-controls"> 
            // up to the closing </div> of demo-container.
            // How to find the closing div of demo-container?
            // It's the last </div> before the next <h2> or before the end of chunk.
            let h2Index = chunk.indexOf('<h2>');
            if (h2Index === -1) h2Index = chunk.indexOf('<script'); // end of page
            
            // The demo-container ends right before the next content (like <h2>).
            // Let's just do a simple replacement: move the stageBlock to just before the demo-container ends.
            // Better yet, just find the controls block.
            
            // Find the </div> that closes demo-container.
            // It is usually followed by a newline and then the next HTML (like <h2>).
            let endOfContainer = chunk.lastIndexOf('</div>', h2Index !== -1 ? h2Index : chunk.length);
            
            let controlsBlock = chunk.substring(controlsIndex, endOfContainer);
            
            // apply margin to the stage block
            if (!stageBlock.includes('style="margin-top: 2rem;"')) {
                 stageBlock = stageBlock.replace('<pxl-stage', '<pxl-stage style="margin-top: 2rem;"');
            }
            
            // reconstruct chunk
            // before stage (should be empty except whitespace)
            let newChunk = '\n  ' + controlsBlock + '\n  ' + stageBlock + '\n</div>' + chunk.substring(endOfContainer + 6);
            
            newContent += '<div class="demo-container">' + newChunk;
            continue;
        }
    }
    newContent += '<div class="demo-container">' + chunk;
}

fs.writeFileSync('docs/coordinates.html', newContent);
console.log('Processed all sections!');
