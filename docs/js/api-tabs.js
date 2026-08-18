// Web Component: Docs API Styling Tab
class DocsApiStyling extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
            <div class="api-list">
              <div class="api-subheading">Color & Transparency</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">fill</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>color</code> | <code>gradient</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fill color, CSS color string, or declarative gradient expression (e.g. <code>fill="radial(1, ['#f97316', 'transparent'])"</code>).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">stroke</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>color</code> | <code>gradient</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Border stroke color or linear/radial gradient expression.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">alpha</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>0–1</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Overall alpha transparency of the rendered shape (<code>0</code> = invisible, <code>1</code> = fully opaque).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">hidden</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>false</code> | <code>true</code></span>
                    <span class="api-pill default-pill">default: false</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  When set to <code>true</code>, hides the shape from rendering.
                </div>
              </div>

              <div class="api-subheading">Stroke Details</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">strokewidth</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number &gt;= 0</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Border thickness in logical units.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">linecap</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>'butt'</code> | <code>'round'</code> | <code>'square'</code></span>
                    <span class="api-pill default-pill">default: 'butt'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Shape of the line endpoints for stroked open arcs and curves.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">linejoin</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>'miter'</code> | <code>'round'</code> | <code>'bevel'</code></span>
                    <span class="api-pill default-pill">default: 'miter'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Corner join appearance when lines meet at sharp angles.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">miterlimit</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number >= 1</code></span>
                    <span class="api-pill default-pill">default: 10</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Maximum ratio of miter length to stroke width before beveling sharp corners.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">linedash</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>[dash, gap]</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Dash pattern array in logical coordinate units (<code>u</code>). Values scale responsively with the stage (e.g. <code>linedash="[10, 5]"</code> draws a 10u dash followed by a 5u gap). Defaults to <code>null</code> (solid line).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">dashoffset</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Phase shift offset of the line dash pattern in logical coordinate units (<code>u</code>). Animate with time <code>t</code> to create marching ants effects (e.g. <code>dashoffset="t * 20"</code>).
                </div>
              </div>

              <div class="api-subheading">Compositing & Effects</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">blend</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>'multiply'</code> | <code>'screen'</code> | <code>'overlay'</code>...</span>
                    <span class="api-pill default-pill">default: 'source-over'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Supports all 26 Canvas 2D blend modes and clipping operations (e.g. <code>'multiply'</code>, <code>'screen'</code>, <code>'overlay'</code>, <code>'source-in'</code>). See the <a href="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation" target="_blank" rel="noopener noreferrer">MDN globalCompositeOperation Reference</a> for interactive visual examples.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">filter</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>CSS filter string</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 'none'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  CSS visual filter string (e.g. <code>filter="drop-shadow(0px 0px 15px rgba(249,115,22,0.8))"</code>). Supports all CSS filter functions like <code>blur()</code>, <code>brightness()</code>, <code>contrast()</code>, and <code>drop-shadow()</code>. See the <a href="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter" target="_blank" rel="noopener noreferrer">MDN Canvas filter Reference</a> for all available functions.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowcolor</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>color</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Native Canvas 2D shadow color (e.g. <code>#38bdf8</code> or <code>rgba(56, 189, 248, 0.8)</code>). Rendered by the GPU via radial alpha masks for high-performance glows and drop shadows. Defaults to <code>null</code> (no shadow).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowblur</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number &gt;= 0</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Native shadow blur radius in logical units (<code>u</code>). Scales responsively with the stage.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowx / shadowy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Horizontal and vertical offset distance of the native shadow in logical units (<code>u</code>).
                </div>
              </div>
            </div>
    `;
  }
}
customElements.define('docs-api-styling', DocsApiStyling);

// Web Component: Docs API Transforms Tab
class DocsApiTransforms extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
            <div class="api-list">
              <div class="api-subheading">Transform Attributes (HTML Markup)</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">x / y</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  <strong>Transform Origin &amp; Center:</strong> The anchor point of the shape in logical stage coordinates.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">dx / dy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  <strong>Visual Displacement:</strong> Shifts the rendered geometry away from <code>(x, y)</code> without changing the rotation pivot.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">rotate</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Rotation around <code>(x, y)</code> in degrees (e.g. <code>rotate="t * 90"</code> for 90°/second continuous spin).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">scale / scalex / scaley</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Uniform or independent axis scaling factors.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">skewx / skewy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>number</code> | <code>expr</code></span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Horizontal and vertical shear skew angles in degrees (typically <code>-89</code> to <code>89</code> before infinite shearing at <code>±90</code>).
                </div>
              </div>

              <div class="api-subheading">Read-Only JS Properties (Runtime Getters)</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">tx / ty</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>read-only JS getter</code></span>
                    <span class="api-pill default-pill">default: x + dx</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  <strong>Total Coordinates:</strong> Read-only JS properties returning the combined total position (<code>x + dx</code> and <code>y + dy</code>).
                </div>
              </div>
            </div>
    `;
  }
}
customElements.define('docs-api-transforms', DocsApiTransforms);

// Web Component: Docs API Events Tab
class DocsApiEvents extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
            <div class="api-list">
              <div class="api-subheading">Interactive Event Handlers (HTML Attributes)</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">onclick</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires when a complete click or tap sequence (down and release over the same shape) occurs. Works on mouse, touch, and stylus.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">onenter</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires once when the pointer enters the shape. Recommended over legacy hover handlers.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">onleave</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires once when the pointer exits the shape bounding area.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">onmove</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires continuously as the pointer moves across the shape.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">ondown</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires when the primary pointer button is pressed down while over the shape.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">onup</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>script</code></span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fires when the primary pointer button is released while over the shape.
                </div>
              </div>

              <div class="api-subheading">Reactive Interaction Properties (Runtime Getters)</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">isHovered</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>read-only boolean</code></span>
                    <span class="api-pill default-pill">default: false</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  <strong>Hover State:</strong> Reactive boolean property that is <code>true</code> when the pointer is over the shape. Can be referenced in dynamic expressions (e.g. <code>fill="ref.id.isHovered ? '#38bdf8' : '#1e293b'"</code>).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">isPressed</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>read-only boolean</code></span>
                    <span class="api-pill default-pill">default: false</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  <strong>Active Press State:</strong> Reactive boolean property that is <code>true</code> while the primary pointer button is held down over the shape.
                </div>
              </div>

              <div class="api-item" style="border-left: 3px solid var(--accent); background: var(--code-bg);">
                <div class="api-item-header">
                  <code class="api-name">Stage Properties (Tip)</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill"><code>global stage reference</code></span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Inside any shape expression, you can also access global reactive properties from the parent stage, including <code>ref.main.mouseX</code>, <code>ref.main.mouseY</code>, <code>ref.main.width</code>, <code>ref.main.height</code>, and <code>ref.main.fps</code>.
                </div>
              </div>
            </div>
    `;
  }
}
customElements.define('docs-api-events', DocsApiEvents);
