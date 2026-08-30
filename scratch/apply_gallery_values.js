const fs = require('fs');
let html = fs.readFileSync('docs/gradients.html', 'utf8');

// 1. ELLIPSE
// Update code block marks
html = html.replace(
    /fill="linear\(\[<mark id="sec2ex2EllipseX0Code">0<\/mark>, <mark id="sec2ex2EllipseY0Code">0<\/mark>, <mark id="sec2ex2EllipseX1Code">1<\/mark>, <mark id="sec2ex2EllipseY1Code">1<\/mark>\], \['darkorange', 'gold', 'crimson'\]\)"/,
    `fill="linear([<mark id="sec2ex2EllipseX0Code">0.25</mark>, <mark id="sec2ex2EllipseY0Code">0.25</mark>, <mark id="sec2ex2EllipseX1Code">0.75</mark>, <mark id="sec2ex2EllipseY1Code">0.75</mark>], ['darkorange', 'gold', 'crimson'])"`
);
// Update sliders
html = html.replace(/<span id="sec2ex2EllipseX0Val">0<\/span>/, `<span id="sec2ex2EllipseX0Val">0.25</span>`);
html = html.replace(/<input type="range" id="sec2ex2EllipseX0Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2EllipseX0Input" min="-0.5" max="1.5" step="0.05" value="0.25"`);
html = html.replace(/<span id="sec2ex2EllipseY0Val">0<\/span>/, `<span id="sec2ex2EllipseY0Val">0.25</span>`);
html = html.replace(/<input type="range" id="sec2ex2EllipseY0Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2EllipseY0Input" min="-0.5" max="1.5" step="0.05" value="0.25"`);
html = html.replace(/<span id="sec2ex2EllipseX1Val">1<\/span>/, `<span id="sec2ex2EllipseX1Val">0.75</span>`);
html = html.replace(/<input type="range" id="sec2ex2EllipseX1Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2EllipseX1Input" min="-0.5" max="1.5" step="0.05" value="0.75"`);
html = html.replace(/<span id="sec2ex2EllipseY1Val">1<\/span>/, `<span id="sec2ex2EllipseY1Val">0.75</span>`);
html = html.replace(/<input type="range" id="sec2ex2EllipseY1Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2EllipseY1Input" min="-0.5" max="1.5" step="0.05" value="0.75"`);
// Update stage element
html = html.replace(
    /fill="linear\(\[0, 0, 1, 1\], \['darkorange', 'gold', 'crimson'\]\)"/,
    `fill="linear([0.25, 0.25, 0.75, 0.75], ['darkorange', 'gold', 'crimson'])"`
);

// 2. RECT
// Update code block marks
html = html.replace(
    /fill="linear\(\[<mark id="sec2ex2RectX0Code">1<\/mark>, <mark id="sec2ex2RectY0Code">0<\/mark>, <mark id="sec2ex2RectX1Code">0<\/mark>, <mark id="sec2ex2RectY1Code">1<\/mark>\], \[0, '#3b82f6', 0.5, '#3b82f6', 0.501, '#93c5fd', 1, '#93c5fd'\]\)"/,
    `fill="linear([<mark id="sec2ex2RectX0Code">0</mark>, <mark id="sec2ex2RectY0Code">0.5</mark>, <mark id="sec2ex2RectX1Code">0.5</mark>, <mark id="sec2ex2RectY1Code">0.5</mark>], [0, '#3b82f6', 0.5, '#3b82f6', 0.501, '#93c5fd', 1, '#93c5fd'])"`
);
// Update sliders
html = html.replace(/<span id="sec2ex2RectX0Val">1<\/span>/, `<span id="sec2ex2RectX0Val">0</span>`);
html = html.replace(/<input type="range" id="sec2ex2RectX0Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2RectX0Input" min="-0.5" max="1.5" step="0.1" value="0"`);
html = html.replace(/<span id="sec2ex2RectY0Val">0<\/span>/, `<span id="sec2ex2RectY0Val">0.5</span>`);
html = html.replace(/<input type="range" id="sec2ex2RectY0Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2RectY0Input" min="-0.5" max="1.5" step="0.1" value="0.5"`);
html = html.replace(/<span id="sec2ex2RectX1Val">0<\/span>/, `<span id="sec2ex2RectX1Val">0.5</span>`);
html = html.replace(/<input type="range" id="sec2ex2RectX1Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2RectX1Input" min="-0.5" max="1.5" step="0.1" value="0.5"`);
html = html.replace(/<span id="sec2ex2RectY1Val">1<\/span>/, `<span id="sec2ex2RectY1Val">0.5</span>`);
html = html.replace(/<input type="range" id="sec2ex2RectY1Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2RectY1Input" min="-0.5" max="1.5" step="0.1" value="0.5"`);
// Update stage element
html = html.replace(
    /fill="linear\(\[1, 0, 0, 1\], \[0, '#3b82f6', 0.5, '#3b82f6', 0.501, '#93c5fd', 1, '#93c5fd'\]\)"/,
    `fill="linear([0, 0.5, 0.5, 0.5], [0, '#3b82f6', 0.5, '#3b82f6', 0.501, '#93c5fd', 1, '#93c5fd'])"`
);

// 3. TEXT
// Update code block marks
html = html.replace(
    /fill="linear\(\[<mark id="sec2ex2TextX0Code">0<\/mark>, <mark id="sec2ex2TextY0Code">0<\/mark>, <mark id="sec2ex2TextX1Code">1<\/mark>, <mark id="sec2ex2TextY1Code">1<\/mark>\], \['#8b5cf6', '#ec4899', '#f59e0b'\]\)"/,
    `fill="linear([<mark id="sec2ex2TextX0Code">0</mark>, <mark id="sec2ex2TextY0Code">0.4</mark>, <mark id="sec2ex2TextX1Code">0</mark>, <mark id="sec2ex2TextY1Code">0.6</mark>], ['#8b5cf6', '#ec4899', '#f59e0b'])"`
);
// Update sliders
html = html.replace(/<span id="sec2ex2TextX0Val">0<\/span>/, `<span id="sec2ex2TextX0Val">0</span>`);
// text X0 input is already 0, no need to change value but need to change step for fine tuning
html = html.replace(/<input type="range" id="sec2ex2TextX0Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2TextX0Input" min="-0.5" max="1.5" step="0.1" value="0"`);
html = html.replace(/<span id="sec2ex2TextY0Val">0<\/span>/, `<span id="sec2ex2TextY0Val">0.4</span>`);
html = html.replace(/<input type="range" id="sec2ex2TextY0Input" min="-0.5" max="1.5" step="0.1" value="0"/, `<input type="range" id="sec2ex2TextY0Input" min="-0.5" max="1.5" step="0.1" value="0.4"`);
html = html.replace(/<span id="sec2ex2TextX1Val">1<\/span>/, `<span id="sec2ex2TextX1Val">0</span>`);
html = html.replace(/<input type="range" id="sec2ex2TextX1Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2TextX1Input" min="-0.5" max="1.5" step="0.1" value="0"`);
html = html.replace(/<span id="sec2ex2TextY1Val">1<\/span>/, `<span id="sec2ex2TextY1Val">0.6</span>`);
html = html.replace(/<input type="range" id="sec2ex2TextY1Input" min="-0.5" max="1.5" step="0.1" value="1"/, `<input type="range" id="sec2ex2TextY1Input" min="-0.5" max="1.5" step="0.1" value="0.6"`);
// Update stage element
html = html.replace(
    /fill="linear\(\[0, 0, 1, 1\], \['#8b5cf6', '#ec4899', '#f59e0b'\]\)"/,
    `fill="linear([0, 0.4, 0, 0.6], ['#8b5cf6', '#ec4899', '#f59e0b'])"`
);

fs.writeFileSync('docs/gradients.html', html);
console.log('Applied new gradient defaults!');
