class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio', 'alwaysrender']; }

  constructor() {
    super();
    this.layers = [];
    this.isOrderDirty = false;
    this.isUpdatePending = false;
    this.isSizePending = true;
    this.unit = 0;
    this.dpr = 1;
    this.resizeObserver = null;

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
      this._parsedRatio = pxl.parseAttributeValue(newValue);
      this.style.aspectRatio = this._parsedRatio;
      if (this.attributeValues) {
        this.attributeValues.height = 1000 / this._parsedRatio;
        if (this._refKey) pxl.broadcast(this._refKey);
      }
    } else if (name === 'alwaysrender') {
      const isAlwaysRender = newValue === 'true';
      if (isAlwaysRender) {
        if (this.intersectionObserver) {
          this.intersectionObserver.disconnect();
          this.intersectionObserver = null;
        }
        this.isVisible = true;
        this.requestRender();
      } else {
        if (!this.intersectionObserver && this.isConnected) {
          this.intersectionObserver = new IntersectionObserver((entries) => {
            this.isVisible = entries[0].isIntersecting;
            if (this.isVisible) this.requestRender();
          });
          this.intersectionObserver.observe(this);
        }
      }
    }
  }

  connectedCallback() {
    this.isVisible = true;
    this.attributeValues = { mouseX: 500, mouseY: 500, isHovered: false, width: 1000, height: 1000, fps: 0, renderAvg: 0, renderMax: 0 };
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      pxl.broadcast(this._refKey);
    }

    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
    this._parsedRatio ||= 16 / 9;
    this.style.aspectRatio = this._parsedRatio;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    try {
      this.resizeObserver.observe(this, { box: 'device-pixel-content-box' });
    } catch (e) {
      this.resizeObserver.observe(this, { box: 'content-box' });
    }

    this.addEventListener('pointermove', this.interaction);
    this.addEventListener('pointerdown', this.interaction);
    this.addEventListener('pointerup', this.interaction);
    this.addEventListener('pointerenter', this.interaction);
    this.addEventListener('pointerleave', this.interaction);
    this.addEventListener('click', this.interaction);

    pxl.perf?.registerStage(this);

    // Initial setup if not already handled by attributeChangedCallback
    if (this.getAttribute('alwaysrender') !== 'true' && !this.intersectionObserver) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.isVisible = entries[0].isIntersecting;
        if (this.isVisible) this.requestRender();
      });
      this.intersectionObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
    this.isUpdatePending = false;
    this.layers = [];
    
    this.removeEventListener('pointermove', this.interaction);
    this.removeEventListener('pointerdown', this.interaction);
    this.removeEventListener('pointerup', this.interaction);
    this.removeEventListener('pointerenter', this.interaction);
    this.removeEventListener('pointerleave', this.interaction);
    this.removeEventListener('click', this.interaction);

    pxl.perf?.unregisterStage(this);
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

    this.dpr = window.devicePixelRatio || 1;
    this.isSizePending = false;

    const len = this.layers.length;
    for (let i = 0; i < len; i++) {
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
      this.layers.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }

    const len = this.layers.length;
    for (let i = 0; i < len; i++) {
      const layer = this.layers[i];
      if (layer.isDirty || layer.isAnimated) layer.render(this.unit, t);
    }

    const ms = performance.now() - start;
    this.perfAccumulated += ms;
    if (ms > this.perfMax) this.perfMax = ms;
    this.perfFrames++;

    this.interaction.process();

    if (pxl.perf && start - pxl.perf.lastUpdate >= 1000) {
      pxl.perf.lastUpdate = start;
      pxl.perf.publish();
    }
  }
}

customElements.define('pxl-stage', Stage);