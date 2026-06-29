class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio']; }

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
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'ratio') this.style.aspectRatio = pxl.parseAttributeValue(newValue);
  }

  connectedCallback() {
    this.attributeValues = { mouseX: 500, mouseY: 500, isHovered: false, width: 1000, height: 1000, fps: 0, renderAvg: 0, renderMax: 0 };
    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      pxl.broadcast(this._refKey);
    }

    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
    this.style.aspectRatio ||= '16 / 9';

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this, { box: 'device-pixel-content-box' });

    this.addEventListener('pointermove', this);
    this.addEventListener('pointerenter', this);
    this.addEventListener('pointerleave', this);

    pxl.perf?.registerStage(this);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
    this.isUpdatePending = false;
    this.layers = [];
    
    this.removeEventListener('pointermove', this);
    this.removeEventListener('pointerenter', this);
    this.removeEventListener('pointerleave', this);

    pxl.perf?.unregisterStage(this);
  }

  handleEvent(e) {
    switch (e.type) {
      case 'pointermove':
        if (this.unit === 0) return;
        this.attributeValues.mouseX = e.offsetX / this.unit;
        this.attributeValues.mouseY = e.offsetY / this.unit;
        if (this._refKey) pxl.broadcast(this._refKey);
        break;
      case 'pointerenter':
        this.attributeValues.isHovered = true;
        if (this._refKey) pxl.broadcast(this._refKey);
        break;
      case 'pointerleave':
        this.attributeValues.isHovered = false;
        if (this._refKey) pxl.broadcast(this._refKey);
        break;
    }
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
    this.attributeValues.height = h / this.unit;
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
    if (this.isSizePending || this.isUpdatePending) return;
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
      if (layer.isDirty) layer.render(this.unit, t);
    }

    const ms = performance.now() - start;
    this.perfAccumulated += ms;
    if (ms > this.perfMax) this.perfMax = ms;
    this.perfFrames++;

    if (pxl.perf && start - pxl.perf.lastUpdate >= 1000) {
      pxl.perf.lastUpdate = start;
      pxl.perf.publish();
    }
  }
}

customElements.define('pxl-stage', Stage);