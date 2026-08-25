// Web Component: Docs API Styling Tab
class DocsApiStyling extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
            <div class="api-list">
              <div class="api-subheading">Color & Visibility</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">fill</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">color | gradient | expr</span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Fill color as a standard CSS color string (e.g. <code>fill="blue"</code>, <code>fill="#3b82f6"</code>, or <code>fill="rgba(59, 130, 246, 0.5)"</code>). Expressions with math and gradients are also fully supported.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">stroke</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">color | gradient | expr</span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Stroke color as a CSS string (e.g. <code>stroke="#3b82f6"</code>) or a dynamic expression (e.g. <code>stroke="ref.id.isHovered ? 'blue' : 'red'"</code>).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">hidden</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">false | true</span>
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
                    <span class="api-pill values-pill">number &gt;= 0 | expr</span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Border thickness.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">linecap</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">'butt' | 'round' | 'square'</span>
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
                    <span class="api-pill values-pill">'miter' | 'round' | 'bevel'</span>
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
                    <span class="api-pill values-pill">number >= 1</span>
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
                    <span class="api-pill values-pill">[dash, gap, ...] | expr</span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Dash pattern array. Values scale responsively with the stage (e.g. <code>linedash="[10, 5]"</code> draws a dash of 10 followed by a gap of 5). Defaults to <code>null</code> (solid line).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">dashoffset</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number | expr</span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Phase shift offset of the line dash pattern. Animate with time <code>t</code> to create marching ants effects (e.g. <code>dashoffset="t * 20"</code>).
                </div>
              </div>

              <div class="api-subheading">Compositing & Effects</div>
              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">alpha</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">0–1 | expr</span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Overall alpha transparency (<code>0</code> = invisible, <code>1</code> = fully opaque).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">mask</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">'destination-in' | 'destination-out'...</span>
                    <span class="api-pill default-pill">default: 'none'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Mathematical clipping operation. Acts as a priority override for the blend attribute to enable native Canvas geometry masking. See the <a href="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation" target="_blank" rel="noopener noreferrer">MDN globalCompositeOperation Reference</a> for interactive visual examples.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">blend</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">'multiply' | 'screen' | 'overlay'...</span>
                    <span class="api-pill default-pill">default: 'source-over'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Supports all 15 safe color blend modes (e.g. <code>'multiply'</code>, <code>'screen'</code>, <code>'overlay'</code>) cross-compatible with CSS and Canvas. See the <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode" target="_blank" rel="noopener noreferrer">MDN mix-blend-mode Reference</a> for interactive visual examples.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">filter</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">array of functions | expr</span>
                    <span class="api-pill default-pill">default: 'none'</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Array of responsive visual filters (e.g. <code>filter="[blur(5), dropShadow(0, 0, 15, 'red')]"</code>). Values are unitless and scale responsively, so do not use <code>px</code> suffixes. Supports <code>blur</code>, <code>dropShadow</code>, <code>brightness</code>, <code>contrast</code>, <code>saturate</code>, <code>hueRotate</code>, <code>invert</code>, <code>grayscale</code>, <code>sepia</code>, and <code>opacity</code>.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowcolor</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">color | expr</span>
                    <span class="api-pill default-pill">default: null</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Native Canvas 2D shadow color (e.g. <code>#38bdf8</code> or <code>rgba(56, 189, 248, 0.8)</code>). Rendered via native Gaussian blur on the shape's alpha silhouette for high-performance glows and drop shadows. Defaults to <code>null</code> (no shadow).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowblur</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number &gt;= 0 | expr</span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Native shadow blur radius. Scales responsively with the stage.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">shadowx / shadowy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number | expr</span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Horizontal and vertical offset distance of the native shadow.
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
                    <span class="api-pill values-pill">number | expr</span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Center point of the shape in logical stage coordinates. This acts as the pivot origin for all other transformations (rotation, scaling, and skewing).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">dx / dy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number | expr</span>
                    <span class="api-pill default-pill">default: 0</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Offset from the center point. The shape will be visually moved, but the pivot origin stays locked at the center point.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">rotate</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number | expr</span>
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
                    <span class="api-pill values-pill">number | expr</span>
                    <span class="api-pill default-pill">default: 1</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Uniform or independent axis scaling factors. If <code>scale</code> is provided, it completely overrides both <code>scalex</code> and <code>scaley</code>.
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">skewx / skewy</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">number | expr</span>
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
                    <span class="api-pill values-pill">read-only JS getter</span>
                    <span class="api-pill default-pill">default: x + dx</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Total Coordinates: Read-only JS properties returning the combined total position (<code>x + dx</code> and <code>y + dy</code>).
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">script</span>
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
                    <span class="api-pill values-pill">read-only boolean</span>
                    <span class="api-pill default-pill">default: false</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Hover State: Reactive boolean property that is <code>true</code> when the pointer is over the shape. Can be referenced in dynamic expressions (e.g. <code>fill="ref.id.isHovered ? '#38bdf8' : '#1e293b'"</code>).
                </div>
              </div>

              <div class="api-item">
                <div class="api-item-header">
                  <code class="api-name">isPressed</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">read-only boolean</span>
                    <span class="api-pill default-pill">default: false</span>
                  </div>
                </div>
                <div class="api-item-desc">
                  Active Press State: Reactive boolean property that is <code>true</code> while the primary pointer button is held down over the shape.
                </div>
              </div>

              <div class="api-item" style="border-left: 3px solid var(--accent); background: var(--code-bg);">
                <div class="api-item-header">
                  <code class="api-name">Stage Properties (Tip)</code>
                  <div class="api-meta">
                    <span class="api-pill values-pill">global stage reference</span>
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
