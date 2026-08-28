const fs = require('fs');
let content = fs.readFileSync('docs/coordinates.html', 'utf8');

const oldRect = <pxl-rect x="0" y="0" w="980" h="580" fill="linear(t * 50, ['#0ea5e9', '#8b5cf6', '#ec4899'])" blend="source-in"></pxl-rect>;
const newRect = <pxl-rect id="sec9GradientRect" x="0" y="0" w="980" h="580" fill="linear(t * 50, ['#0ea5e9', '#8b5cf6', '#ec4899'])" blend="source-in"></pxl-rect>;
content = content.replace(oldRect, newRect);

const oldText = <pxl-text x="ref.sec9OrbX.value + 50" y="ref.sec9OrbY.value - 20" text="'Oscillator'" size="27" fill="#ffffff" shadowcolor="#000000" shadowblur="5"></pxl-text>;
const newText = <pxl-text x="ref.sec9OrbX.value + 50" y="ref.sec9OrbY.value - 20" text="'Oscillator'" size="27" fill="ref.sec9GradientRect.fill" shadowcolor="#000000" shadowblur="5"></pxl-text>;
content = content.replace(oldText, newText);

fs.writeFileSync('docs/coordinates.html', content);
console.log('Updated text using ref.*');
