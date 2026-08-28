const fs = require('fs');
const content = fs.readFileSync('docs/colors.html', 'utf-8');
const insertIndex = content.indexOf('</main>');
const section5 = `
        <!-- ================================================================= -->
        <!-- SECTION 5: RADIAL GRADIENTS -->
        <!-- ================================================================= -->
        <h2 style="margin-top: 4rem;">5. Radial Gradients</h2>
        <p>The <code>radial()</code> helper generates radial gradients. The engine uses a <strong>farthest-corner</strong> architecture: a radius of <code>1</code> perfectly and intuitively stretches to the extreme tips of any shape's bounding box. You can pass a simple number, or an array of up to 6 coordinates to unlock full 3D spotlight effects.</p>

        <div class="callout-info">
          <p class="callout-body"><strong>The Farthest-Corner Guarantee:</strong> Because Kilopixel defaults to the farthest corner, you don't need magic numbers to fill a shape. Below, notice how the white border of the gradient perfectly kisses the absolute tips of the bounding box.</p>

          <pxl-stage ratio="5 / 2" style="width: 100%; background: transparent; margin-top: 1rem;">
            <pxl-layer>
              <pxl-grid stroke="#cbd5e1" major="2"></pxl-grid>
              
              <!-- Center -->
              <pxl-rect x="300" y="200" w="250" h="150" fill="radial(1, [0, '#3b82f6', 0.98, '#8b5cf6', 0.98, '#ffffff', 1, '#ffffff'])"></pxl-rect>
              <pxl-rect x="300" y="200" w="250" h="150" fill="none" stroke="#cbd5e1" strokewidth="2" linedash="5, 5"></pxl-rect>
              <pxl-line x1="300" y1="200" x2="175" y2="125" stroke="#cbd5e1" strokewidth="2"></pxl-line>
              <pxl-text x="300" y="100" text="'radial(1)'" fill="#ffffff" size="24" font="monospace" align="center" baseline="bottom"></pxl-text>
        
              <!-- Offset -->
              <pxl-rect x="700" y="200" w="250" h="150" fill="radial([0, 0], [0, '#3b82f6', 0.98, '#8b5cf6', 0.98, '#ffffff', 1, '#ffffff'])"></pxl-rect>
              <pxl-rect x="700" y="200" w="250" h="150" fill="none" stroke="#cbd5e1" strokewidth="2" linedash="5, 5"></pxl-rect>
              <pxl-line x1="575" y1="125" x2="825" y2="275" stroke="#cbd5e1" strokewidth="2"></pxl-line>
              <pxl-text x="700" y="100" text="'radial([0, 0])'" fill="#ffffff" size="24" font="monospace" align="center" baseline="bottom"></pxl-text>
            </pxl-layer>
          </pxl-stage>
        </div>

        <div class="example-card" style="margin-top: 2rem;">
          <div class="example-code">
            <pre><code class="language-html">&lt;pxl-stage ratio="5 / 3"&gt;
  &lt;pxl-layer&gt;
    &lt;!-- Rect 1 (Standard Radius) --&gt;
    &lt;pxl-rect x="140" y="300" w="200" h="280" fill="radial(<mark id="sec5Rect1RadiusCode">1</mark>, ['#ff0055', '#00ffcc'])"&gt;&lt;/pxl-rect&gt;
      
    &lt;!-- Rect 2 (Offset Center) --&gt;
    &lt;pxl-rect x="380" y="300" w="200" h="280" fill="radial([<mark id="sec5Rect2XCode">0.2</mark>, <mark id="sec5Rect2YCode">0.2</mark>], ['#ffea00', '#ff00a0'])"&gt;&lt;/pxl-rect&gt;

    &lt;!-- Rect 3 (3D Spotlight) --&gt;
    &lt;pxl-rect x="620" y="300" w="200" h="280" fill="radial([<mark id="sec5Rect3X0Code">0.2</mark>, <mark id="sec5Rect3Y0Code">0.2</mark>, <mark id="sec5Rect3X1Code">0.8</mark>, <mark id="sec5Rect3Y1Code">0.8</mark>], ['#8A2387', '#E94057', '#F27121'])"&gt;&lt;/pxl-rect&gt;
      
    &lt;!-- Rect 4 (Hard Border Trick) --&gt;
    &lt;pxl-rect x="860" y="300" w="200" h="280" fill="radial(1, [0, '#000', <mark id="sec5Rect4OffsetCode">0.95</mark>, '#00f', <mark id="sec5Rect4OffsetCode2">0.95</mark>, '#fff', 1, '#fff'])"&gt;&lt;/pxl-rect&gt;
  &lt;/pxl-layer&gt;
&lt;/pxl-stage&gt;</code></pre>
          </div>

          <div class="demo-container">
            <pxl-stage id="sec5Stage" ratio="5 / 3" class="demo-stage">
              <pxl-layer>
                <pxl-grid stroke="#f1f5f9" major="2"></pxl-grid>
                <pxl-rect id="sec5Rect1" x="140" y="300" w="200" h="280" r="10" fill="radial(1, ['#ff0055', '#00ffcc'])"></pxl-rect>
                <pxl-rect id="sec5Rect2" x="380" y="300" w="200" h="280" r="10" fill="radial([0.2, 0.2], ['#ffea00', '#ff00a0'])"></pxl-rect>
                <pxl-rect id="sec5Rect3" x="620" y="300" w="200" h="280" r="10" fill="radial([0.2, 0.2, 0.8, 0.8], ['#8A2387', '#E94057', '#F27121'])"></pxl-rect>
                <pxl-rect id="sec5Rect4" x="860" y="300" w="200" h="280" r="10" fill="radial(1, [0, '#000', 0.95, '#00f', 0.95, '#fff', 1, '#fff'])"></pxl-rect>
              </pxl-layer>
            </pxl-stage>

            <div class="demo-controls">
              <div class="demo-controls-header">
                <h3 class="demo-controls-title">Controls</h3>
                <div class="demo-tabs">
                  <button class="tab-btn active" onclick="pxlDocs.switchTab(this, 'sec5Rect1Tab')">Rect 1</button>
                  <button class="tab-btn" onclick="pxlDocs.switchTab(this, 'sec5Rect2Tab')">Rect 2</button>
                  <button class="tab-btn" onclick="pxlDocs.switchTab(this, 'sec5Rect3Tab')">Rect 3</button>
                  <button class="tab-btn" onclick="pxlDocs.switchTab(this, 'sec5Rect4Tab')">Rect 4</button>
                </div>
              </div>

              <!-- Radial Rect 1 Tab -->
              <div class="tab-content active" id="sec5Rect1Tab">
                <div class="playground-sliders">
                  <div class="control-group">
                    <label><span>Radius</span> <span id="sec5Rect1RadiusVal">1</span></label>
                    <input type="range" min="0.1" max="2" step="0.1" value="1" autocomplete="off"
                      oninput="document.getElementById('sec5Rect1').setAttribute('fill', \`radial(${this.value}, ['#ff0055', '#00ffcc'])\`); document.getElementById('sec5Rect1RadiusVal').innerText = this.value; document.getElementById('sec5Rect1RadiusCode').innerText = this.value;">
                  </div>
                </div>
              </div>

              <!-- Radial Rect 2 Tab -->
              <div class="tab-content" id="sec5Rect2Tab">
                <div class="playground-sliders">
                  <div class="control-group">
                    <label><span>Center X</span> <span id="sec5Rect2XVal">0.2</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.2" autocomplete="off"
                      oninput="document.getElementById('sec5Rect2').setAttribute('fill', \`radial([\${this.value}, \${document.getElementById('sec5Rect2YVal').innerText}], ['#ffea00', '#ff00a0'])\`); document.getElementById('sec5Rect2XVal').innerText = this.value; document.getElementById('sec5Rect2XCode').innerText = this.value;">
                  </div>
                  <div class="control-group">
                    <label><span>Center Y</span> <span id="sec5Rect2YVal">0.2</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.2" autocomplete="off"
                      oninput="document.getElementById('sec5Rect2').setAttribute('fill', \`radial([\${document.getElementById('sec5Rect2XVal').innerText}, \${this.value}], ['#ffea00', '#ff00a0'])\`); document.getElementById('sec5Rect2YVal').innerText = this.value; document.getElementById('sec5Rect2YCode').innerText = this.value;">
                  </div>
                </div>
              </div>

              <!-- Radial Rect 3 Tab -->
              <div class="tab-content" id="sec5Rect3Tab">
                <div class="playground-sliders">
                  <div class="control-group">
                    <label><span>Start X (x0)</span> <span id="sec5Rect3X0Val">0.2</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.2" autocomplete="off"
                      oninput="document.getElementById('sec5Rect3').setAttribute('fill', \`radial([\${this.value}, \${document.getElementById('sec5Rect3Y0Val').innerText}, \${document.getElementById('sec5Rect3X1Val').innerText}, \${document.getElementById('sec5Rect3Y1Val').innerText}], ['#8A2387', '#E94057', '#F27121'])\`); document.getElementById('sec5Rect3X0Val').innerText = this.value; document.getElementById('sec5Rect3X0Code').innerText = this.value;">
                  </div>
                  <div class="control-group">
                    <label><span>Start Y (y0)</span> <span id="sec5Rect3Y0Val">0.2</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.2" autocomplete="off"
                      oninput="document.getElementById('sec5Rect3').setAttribute('fill', \`radial([\${document.getElementById('sec5Rect3X0Val').innerText}, \${this.value}, \${document.getElementById('sec5Rect3X1Val').innerText}, \${document.getElementById('sec5Rect3Y1Val').innerText}], ['#8A2387', '#E94057', '#F27121'])\`); document.getElementById('sec5Rect3Y0Val').innerText = this.value; document.getElementById('sec5Rect3Y0Code').innerText = this.value;">
                  </div>
                  <div class="control-group">
                    <label><span>End X (x1)</span> <span id="sec5Rect3X1Val">0.8</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.8" autocomplete="off"
                      oninput="document.getElementById('sec5Rect3').setAttribute('fill', \`radial([\${document.getElementById('sec5Rect3X0Val').innerText}, \${document.getElementById('sec5Rect3Y0Val').innerText}, \${this.value}, \${document.getElementById('sec5Rect3Y1Val').innerText}], ['#8A2387', '#E94057', '#F27121'])\`); document.getElementById('sec5Rect3X1Val').innerText = this.value; document.getElementById('sec5Rect3X1Code').innerText = this.value;">
                  </div>
                  <div class="control-group">
                    <label><span>End Y (y1)</span> <span id="sec5Rect3Y1Val">0.8</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="0.8" autocomplete="off"
                      oninput="document.getElementById('sec5Rect3').setAttribute('fill', \`radial([\${document.getElementById('sec5Rect3X0Val').innerText}, \${document.getElementById('sec5Rect3Y0Val').innerText}, \${document.getElementById('sec5Rect3X1Val').innerText}, \${this.value}], ['#8A2387', '#E94057', '#F27121'])\`); document.getElementById('sec5Rect3Y1Val').innerText = this.value; document.getElementById('sec5Rect3Y1Code').innerText = this.value;">
                  </div>
                </div>
              </div>

              <!-- Radial Rect 4 Tab -->
              <div class="tab-content" id="sec5Rect4Tab">
                <div class="playground-sliders">
                  <div class="control-group">
                    <label><span>Ring Offset</span> <span id="sec5Rect4OffsetVal">0.95</span></label>
                    <input type="range" min="0" max="1" step="0.01" value="0.95" autocomplete="off"
                      oninput="document.getElementById('sec5Rect4').setAttribute('fill', \`radial(1, [0, '#000', \${this.value}, '#00f', \${this.value}, '#fff', 1, '#fff'])\`); document.getElementById('sec5Rect4OffsetVal').innerText = this.value; document.getElementById('sec5Rect4OffsetCode').innerText = this.value; document.getElementById('sec5Rect4OffsetCode2').innerText = this.value;">
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

\n\n`;
const newContent = content.slice(0, insertIndex) + section5 + content.slice(insertIndex);
fs.writeFileSync('docs/colors.html', newContent);
console.log('Section 5 successfully injected into colors.html');
