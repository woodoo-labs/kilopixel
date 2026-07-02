class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio']; }

  constructor() {
    super();
    this.layers = [];
    this.isOrderDirty = false;
    this.isUpdatePending = false;
    
    this._interactiveElements = [];
    this.isInteractiveOrderDirty = false;
    this._hoveredElements = [];
    this._hitStack = new Array(50);
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
    this._lastMove = false;
    this._isMouseDirty = false;
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
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
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
    this.addEventListener('pointerdown', this);
    this.addEventListener('pointerup', this);
    this.addEventListener('pointerenter', this);
    this.addEventListener('pointerleave', this);
    this.addEventListener('click', this);

    pxl.perf?.registerStage(this);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
    this.isUpdatePending = false;
    this.layers = [];
    
    this.removeEventListener('pointermove', this);
    this.removeEventListener('pointerdown', this);
    this.removeEventListener('pointerup', this);
    this.removeEventListener('pointerenter', this);
    this.removeEventListener('pointerleave', this);
    this.removeEventListener('click', this);

    pxl.perf?.unregisterStage(this);
  }

  handleEvent(e) {
    switch (e.type) {
      case 'pointermove':
        if (this.unit === 0) return;
        this.attributeValues.mouseX = e.offsetX / this.unit;
        this.attributeValues.mouseY = e.offsetY / this.unit;
        this._isMouseDirty = true;
        this._lastMove = true;
        this.requestRender();
        break;
      case 'pointerdown':
        this._lastDown = true;
        if (this._interactiveElements.length > 0) this.requestRender();
        break;
      case 'pointerup':
        this._lastUp = true;
        if (this._interactiveElements.length > 0) this.requestRender();
        break;
      case 'click':
        this._lastClick = true;
        if (this._interactiveElements.length > 0) this.requestRender();
        break;
      case 'pointerenter':
        this.attributeValues.isHovered = true;
        this._isMouseDirty = true;
        this.requestRender();
        break;
      case 'pointerleave':
        this.attributeValues.isHovered = false;
        this._isMouseDirty = true;
        this.requestRender();
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

    if (this._isMouseDirty) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this._isMouseDirty = false;
    }

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

    this.processHitTesting();

    if (pxl.perf && start - pxl.perf.lastUpdate >= 1000) {
      pxl.perf.lastUpdate = start;
      pxl.perf.publish();
    }
  }

  processHitTesting() {
    const elements = this._interactiveElements;
    const len = elements.length;
    if (len === 0) return;

    if (this.isInteractiveOrderDirty) {
      elements.sort(pxl.sortByDOMPosition || ((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1));
      this.isInteractiveOrderDirty = false;
    }

    const ctx = pxl.dummyCtx;
    pxl._hitX = this.attributeValues.mouseX * this.unit;
    pxl._hitY = this.attributeValues.mouseY * this.unit;

    let hitEl = null;

    if (this.attributeValues.isHovered) {
      for (let i = len - 1; i >= 0; i--) {
        const el = elements[i];
        if (!el.draw) continue;
        
        let curr = el;
        let isHidden = false;
        let stackLen = 0;

        while (curr && curr !== this) {
          if (curr.attributeValues) {
            if (curr.attributeValues.hidden) {
              isHidden = true;
              break;
            }
            this._hitStack[stackLen++] = curr;
          }
          curr = curr.parentElement;
        }

        if (isHidden) continue;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        for (let j = stackLen - 1; j >= 0; j--) {
          pxl.applyContextState(ctx, this.unit, this._hitStack[j].attributeValues);
        }

        pxl._hitResult = false;
        ctx.beginPath();
        el.draw(ctx, this.unit, 0);
        ctx.restore();

        if (pxl._hitResult) {
          hitEl = el;
          break;
        }
      }
    }

    // Process Leaves
    for (let i = this._hoveredElements.length - 1; i >= 0; i--) {
      const prevHovered = this._hoveredElements[i];
      if (prevHovered !== hitEl) {
        if (prevHovered._compiledOnLeave) prevHovered._compiledOnLeave();
        pxl.removeFromArray(this._hoveredElements, prevHovered);
      }
    }

    // Process Hovers
    if (hitEl && !this._hoveredElements.includes(hitEl)) {
      this._hoveredElements.push(hitEl);
      if (hitEl._compiledOnHover) hitEl._compiledOnHover();
    }

    // Update Cursor
    this.style.cursor = hitEl ? 'pointer' : 'default';

    if (hitEl) {
      if (this._lastMove && hitEl._compiledOnMove) hitEl._compiledOnMove();
      if (this._lastClick && hitEl._compiledOnClick) hitEl._compiledOnClick();
      if (this._lastDown && hitEl._compiledOnDown) hitEl._compiledOnDown();
      if (this._lastUp && hitEl._compiledOnUp) hitEl._compiledOnUp();
    }

    // Reset event flags
    this._lastMove = false;
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
  }
}

customElements.define('pxl-stage', Stage);