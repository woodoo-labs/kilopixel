pxl.Stage = class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio', 'alwaysrender']; }

  // Pointer events handled by the stage's InteractionEngine (its handleEvent)
  static POINTER_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave', 'click'];

  constructor() {
    super();
    this.layers = [];
    this.isOrderDirty = false;
    this.isUpdatePending = false;
    this.isSizePending = true;
    this.isVisible = true;
    this.unit = 0;
    this.dpr = 1;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this._parsedRatio = 16 / 9;
    this._refKey = null;

    // Published as ref.<id>.*; renderAvg / renderMax are strings with 2 decimals (pxl.perf.publish)
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

    this.frameCallback = (t) => {
      this.isUpdatePending = false;
      this.render(t / 1000);
    };

    this.interaction = new pxl.InteractionEngine(this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'ratio') {
      // Bare or removed ratio falls back to the default 16 / 9
      this._parsedRatio = (newValue === null || newValue === '') ? 16 / 9 : pxl.parseAttributeValue(newValue);
      this.style.aspectRatio = this._parsedRatio;
      this.attributeValues.height = 1000 / this._parsedRatio;
      if (this._refKey) pxl.broadcast(this._refKey);
    } else if (name === 'alwaysrender') {
      if (this.isAlwaysRender()) {
        this.intersectionObserver?.disconnect();
        this.intersectionObserver = null;
        this.isVisible = true;
        this.requestRender();
      } else if (this.isConnected) {
        this.observeVisibility();
      }
    }
  }

  connectedCallback() {
    this.isVisible = true;
    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      pxl.broadcast(this._refKey);
    }

    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
    this.style.aspectRatio = this._parsedRatio;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    try {
      this.resizeObserver.observe(this, { box: 'device-pixel-content-box' });
    } catch (e) {
      this.resizeObserver.observe(this, { box: 'content-box' }); // Safari: no device-pixel-content-box
    }

    for (const type of pxl.Stage.POINTER_EVENTS) this.addEventListener(type, this.interaction);
    pxl.perf.registerStage(this);

    if (!this.isAlwaysRender()) this.observeVisibility();
  }

  disconnectedCallback() {
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
    this.isUpdatePending = false;
    this.layers = [];

    for (const type of pxl.Stage.POINTER_EVENTS) this.removeEventListener(type, this.interaction);
    pxl.perf.unregisterStage(this);
  }

  // Bare attribute or "true": render even when scrolled out of view
  isAlwaysRender() {
    const value = this.getAttribute('alwaysrender');
    return value === 'true' || value === '';
  }

  // Pauses rendering while the stage is out of view
  observeVisibility() {
    if (this.intersectionObserver) return;
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.isVisible = entries[0].isIntersecting;
      if (this.isVisible) this.requestRender();
    });
    this.intersectionObserver.observe(this);
  }

  registerLayer(layer) {
    if (this.layers.includes(layer)) return;
    this.layers.push(layer);
    this.isOrderDirty = true;
    if (this.isSizePending) return;
    layer.resize(this.clientWidth, this.clientHeight, this.dpr);
    this.requestRender();
  }

  unregisterLayer(layer) {
    pxl.removeFromArray(this.layers, layer);
    this.requestRender();
  }

  resize() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w === 0) return;

    this.unit = w / 1000;
    this.attributeValues.height = 1000 / this._parsedRatio;
    if (this._refKey) pxl.broadcast(this._refKey);

    this.dpr = window.devicePixelRatio;
    this.isSizePending = false;

    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].resize(w, h, this.dpr);
    }
    this.render(performance.now() / 1000);
  }

  requestRender() {
    if (!this.isVisible || this.isSizePending || this.isUpdatePending) return;
    this.isUpdatePending = true;
    requestAnimationFrame(this.frameCallback);
  }

  render(t) {
    const start = performance.now();

    if (this.isOrderDirty) {
      this.layers.sort(pxl.sortByDOMPosition);
      this.isOrderDirty = false;
    }

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.isDirty || layer.isAnimated) layer.render(this.unit, t);
    }

    const ms = performance.now() - start;
    this.perfAccumulated += ms;
    if (ms > this.perfMax) this.perfMax = ms;
    this.perfFrames++;

    this.interaction.process();

    if (start - pxl.perf.lastUpdate >= 1000) {
      pxl.perf.lastUpdate = start;
      pxl.perf.publish();
    }
  }
};

customElements.define('pxl-stage', pxl.Stage);
