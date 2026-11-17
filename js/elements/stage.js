// Frame number, counted by every Stage.render(): per-frame state (_failedFrame, a layer's update frame) is stored as
// the frame it belongs to, so it never needs a reset
pxl._frame = 0;

// Default styles of stages, variables and shapes, in a cascade layer so that any page CSS wins over them, also CSS in
// the page's own cascade layers: the <style> goes first, and the layer declared first ranks lowest.
// :state(fallback): see Stage.markFallbackWidth().
// Shapes and groups draw on the canvas, not as elements: content written inside them (<pxl-text>{label}</pxl-text>
// in JSX) would otherwise appear as page text through the layer's <slot>. Content placed directly in a layer
// (accessible text, buttons) stays visible.
pxl.DEFAULT_STYLES = `@layer pxl {
  pxl-stage { display: block; position: relative; width: 100%; }
  pxl-stage:state(fallback) { contain: inline-size; contain-intrinsic-inline-size: 300px; min-width: 0; }
  pxl-var, pxl-group, pxl-circle, pxl-ellipse, pxl-rect, pxl-line, pxl-polyline, pxl-text, pxl-grid { display: none; }
}`;

// Once per document, and once per shadow root that holds a stage (document styles don't reach into it)
pxl.addDefaultStyles = function(root) {
  if (root.querySelector('style[data-pxl]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-pxl', '');
  style.textContent = pxl.DEFAULT_STYLES;
  (root === document ? document.head : root).prepend(style);
};

pxl.addDefaultStyles(document);

pxl.Stage = class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio', 'alwaysrender', 'id']; }

  // Pointer events handled by the stage's InteractionEngine (its handleEvent)
  static POINTER_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave', 'click'];

  constructor() {
    super();
    this._layers = [];
    this._variables = []; // stage-level <pxl-var>: inside the stage, outside every layer
    this._isOrderDirty = false;
    this._isUpdatePending = false;
    this._isSizePending = true;
    this._isVisible = true;
    this.unit = 0;
    this._dpr = 1;
    this._resizeObserver = null;
    this._intersectionObserver = null;
    this._parsedRatio = 16 / 9;
    this._internals = null; // ElementInternals, attached when the stage first needs the fallback width
    this.refKey = null;
    this._isRegistered = false; // connectedCallback has run: id changes from now on move the registry entry

    // Published as ref.<id>.* once per second by pxl.perf's timer; renderAvg / renderMax are strings with 2 decimals
    this.attributeValues = {
      mouseX: 500, mouseY: 500, isHovered: false, width: 1000, height: 1000 / this._parsedRatio,
      fps: 0, renderAvg: '0.00', renderMax: '0.00'
    };
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });

    // Performance metrics
    this.perfFrames = 0;
    this.perfAccumulated = 0;
    this.perfMax = 0;

    this._frameCallback = (t) => {
      this._isUpdatePending = false;
      this.render(t / 1000);
    };

    this.interaction = new pxl.InteractionEngine(this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'id') {
      if (this._isRegistered) pxl.renameNode(this, oldValue, newValue);
    } else if (name === 'ratio') {
      // Bare or removed ratio falls back to the default 16 / 9
      this._parsedRatio = (newValue === null || newValue === '') ? 16 / 9 : pxl.parseAttributeValue(newValue);
      this.style.aspectRatio = this._parsedRatio;
      this.attributeValues.height = 1000 / this._parsedRatio;
      if (this.refKey) pxl.broadcast(this.refKey);
    } else if (name === 'alwaysrender') {
      if (this.isAlwaysRender()) {
        this._intersectionObserver?.disconnect();
        this._intersectionObserver = null;
        this._isVisible = true;
        this.requestRender();
      } else if (this.isConnected) {
        this.observeVisibility();
      }
    }
  }

  connectedCallback() {
    this._isVisible = true;
    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this.refKey = `ref.${this.id}`;
      pxl.broadcast(this.refKey);
    }
    this._isRegistered = true;

    // display, position and width come from pxl.DEFAULT_STYLES; the aspect ratio stays inline, because the
    // coordinate system depends on it
    const root = this.getRootNode();
    if (root instanceof ShadowRoot) pxl.addDefaultStyles(root);
    this.style.aspectRatio = this._parsedRatio;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    try {
      this._resizeObserver.observe(this, { box: 'device-pixel-content-box' });
    } catch (e) {
      this._resizeObserver.observe(this, { box: 'content-box' }); // Safari: no device-pixel-content-box
    }

    for (const type of pxl.Stage.POINTER_EVENTS) this.addEventListener(type, this.interaction);
    pxl.perf.registerStage(this);

    if (!this.isAlwaysRender()) this.observeVisibility();

    // A ResizeObserver needn't report an element that stays 0 × 0, so the width is also checked once here
    requestAnimationFrame(() => {
      if (this.isConnected && this.clientWidth === 0) this.markFallbackWidth();
    });
  }

  disconnectedCallback() {
    this._isRegistered = false;
    if (this.id && pxl.nodes[this.id] === this.attributeValues) delete pxl.nodes[this.id];
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = null;
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
    this._isUpdatePending = false;
    this._layers = [];
    this._variables = [];

    for (const type of pxl.Stage.POINTER_EVENTS) this.removeEventListener(type, this.interaction);
    pxl.perf.unregisterStage(this);

    // Checked again in the new place
    this._internals?.states.delete('fallback');
  }

  // A stage that is laid out but 0 px wide sits in a parent that sizes itself to its content (a centered flex or grid
  // item, inline-block, an absolute card): its layers are absolutely positioned and give it no width. The fallback
  // state makes it report 300 px like <canvas>. Only such stages get it: on every stage, that width would also keep
  // the flex and grid containers around a stage from shrinking below it.
  markFallbackWidth() {
    if (this.getClientRects().length === 0) return; // hidden (display: none): checked when it is shown
    try {
      this._internals ??= this.attachInternals();
      this._internals.states.add('fallback');
    } catch (e) {
      // Older browsers have no custom states (or only --dashed names): the stage stays 0 wide, as before
    }
  }

  // Bare attribute or "true": render even when scrolled out of view
  isAlwaysRender() {
    const value = this.getAttribute('alwaysrender');
    return value === 'true' || value === '';
  }

  // Pauses rendering while the stage is out of view
  observeVisibility() {
    if (this._intersectionObserver) return;
    this._intersectionObserver = new IntersectionObserver((entries) => {
      this._isVisible = entries[0].isIntersecting;
      if (this._isVisible) this.requestRender();
    });
    this._intersectionObserver.observe(this);
  }

  registerLayer(layer) {
    if (this._layers.includes(layer)) return;
    this._layers.push(layer);
    this._isOrderDirty = true;
    if (this._isSizePending) return;
    layer.resize(this.clientWidth, this.clientHeight, this._dpr);
    this.requestRender();
  }

  unregisterLayer(layer) {
    pxl.removeFromArray(this._layers, layer);
    this.requestRender();
  }

  registerVariable(variable) {
    if (this._variables.includes(variable)) return;
    this._variables.push(variable);
    this._isOrderDirty = true;
    this.requestRender();
  }

  unregisterVariable(variable) {
    pxl.removeFromArray(this._variables, variable);
  }

  resize() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w === 0) {
      this.markFallbackWidth();
      return;
    }

    this.unit = w / 1000;
    this.attributeValues.height = 1000 / this._parsedRatio;
    if (this.refKey) pxl.broadcast(this.refKey);

    this._dpr = window.devicePixelRatio;
    this._isSizePending = false;

    for (let i = 0; i < this._layers.length; i++) {
      this._layers[i].resize(w, h, this._dpr);
    }
    this.render(performance.now() / 1000);
  }

  invalidateLayers() {
    for (let i = 0; i < this._layers.length; i++) this._layers[i].invalidate();
  }

  requestRender() {
    if (!this._isVisible || this._isSizePending || this._isUpdatePending) return;
    this._isUpdatePending = true;
    requestAnimationFrame(this._frameCallback);
  }

  // Two phases: every layer evaluates first (update), then the layers draw. A reader drawn before its target then
  // sees the target's value of this frame, whatever the DOM order (readers that also use t excepted: they read
  // their target when they are evaluated).
  render(t) {
    const start = performance.now();
    pxl._frame++;

    // Pointer first: broadcast the stage's pointer values, hit-test against the picture on screen, update the
    // hover / press states and run the handlers. Their readers are then drawn in this frame, not the next one
    // (design/2026-11-17_pointer_frame_order_plan.md).
    this.interaction.process();

    if (this._isOrderDirty) {
      this._layers.sort(pxl.sortByDOMPosition);
      this._variables.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    // Stage-level variables first, so readers in every layer see this frame's value.
    // They have no layer heartbeat: the stage keeps the loop running while one is animated.
    let isVariableAnimated = false;
    for (let i = 0; i < this._variables.length; i++) {
      const variable = this._variables[i];
      variable.update(t);
      if (variable.isAnimated) isVariableAnimated = true;
    }
    if (isVariableAnimated) this.requestRender();

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      if (layer.isDirty || layer.isAnimated) layer.update(t);
    }
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      if (layer.needsRender()) layer.render(this.unit, t);
    }

    const ms = performance.now() - start;
    this.perfAccumulated += ms;
    if (ms > this.perfMax) this.perfMax = ms;
    this.perfFrames++;
  }
};

customElements.define('pxl-stage', pxl.Stage);
