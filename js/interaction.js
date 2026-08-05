// =========================================================================
// Declarative Event System (Dummy Context)
// =========================================================================
const dummyCanvas = document.createElement('canvas');
dummyCanvas.width = 1;
dummyCanvas.height = 1;
pxl.dummyCtx = dummyCanvas.getContext('2d');
pxl._hitX = 0;
pxl._hitY = 0;
pxl._hitResult = false;

// Global interceptors - these never trigger GC!
pxl.dummyCtx.fill = function() { if (this.isPointInPath(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
pxl.dummyCtx.stroke = function() { if (this.isPointInStroke(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };

pxl.InteractionEngine = class {
  constructor(stage) {
    this.stage = stage;
    this._interactiveElements = [];
    this.isInteractiveOrderDirty = false;
    this._hoveredElements = [];
    this._pressedElement = null;
    this._hitStack = new Array(50);
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
    this._lastMove = false;
    this._isMouseDirty = false;
  }

  registerElement(el) {
    if (!this._interactiveElements.includes(el)) {
      this._interactiveElements.push(el);
      this.isInteractiveOrderDirty = true;
    }
  }

  unregisterElement(el) {
    pxl.removeFromArray(this._interactiveElements, el);
    
    if (this._hoveredElements.includes(el)) {
      pxl.removeFromArray(this._hoveredElements, el);
      el.attributeValues.isHovered = false;
      if (el._refKey) pxl.broadcast(el._refKey);
    }
    if (this._pressedElement === el) {
      this._pressedElement = null;
      el.attributeValues.isPressed = false;
      if (el._refKey) pxl.broadcast(el._refKey);
    }
  }

  handleEvent(e) {
    switch (e.type) {
      case 'pointermove':
        if (this.stage.unit === 0) return;
        this.stage.attributeValues.mouseX = e.offsetX / this.stage.unit;
        this.stage.attributeValues.mouseY = e.offsetY / this.stage.unit;
        this._isMouseDirty = true;
        this._lastMove = true;
        this.stage.requestRender();
        break;
      case 'pointerdown':
        this._lastDown = true;
        if (this._interactiveElements.length > 0) this.stage.requestRender();
        break;
      case 'pointerup':
        this._lastUp = true;
        if (this._interactiveElements.length > 0) this.stage.requestRender();
        break;
      case 'click':
        this._lastClick = true;
        if (this._interactiveElements.length > 0) this.stage.requestRender();
        break;
      case 'pointerenter':
        this.stage.attributeValues.isHovered = true;
        this._isMouseDirty = true;
        this.stage.requestRender();
        break;
      case 'pointerleave':
        this.stage.attributeValues.isHovered = false;
        this._isMouseDirty = true;
        this.stage.requestRender();
        break;
    }
  }

  process() {
    if (this._isMouseDirty) {
      if (this.stage._refKey) pxl.broadcast(this.stage._refKey);
      this._isMouseDirty = false;
    }

    const elements = this._interactiveElements;
    const len = elements.length;
    if (len === 0) return;

    if (this.isInteractiveOrderDirty) {
      elements.sort(pxl.sortByDOMPosition || ((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1));
      this.isInteractiveOrderDirty = false;
    }

    const ctx = pxl.dummyCtx;
    pxl._hitX = this.stage.attributeValues.mouseX * this.stage.unit;
    pxl._hitY = this.stage.attributeValues.mouseY * this.stage.unit;

    let hitEl = null;

    if (this.stage.attributeValues.isHovered) {
      for (let i = len - 1; i >= 0; i--) {
        const el = elements[i];
        if (!el.draw) continue;
        
        let curr = el;
        let isHidden = false;
        let stackLen = 0;

        while (curr && curr !== this.stage) {
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
          pxl.applyContextState(ctx, this.stage.unit, this._hitStack[j].attributeValues, this._hitStack[j]);
        }

        pxl._hitResult = false;
        ctx.beginPath();
        el.draw(ctx, this.stage.unit, 0);
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
        prevHovered.attributeValues.isHovered = false;
        if (prevHovered._refKey) pxl.broadcast(prevHovered._refKey);
        if (prevHovered._compiledOnLeave) prevHovered._compiledOnLeave();
        pxl.removeFromArray(this._hoveredElements, prevHovered);
      }
    }

    // Process Enters
    if (hitEl && !this._hoveredElements.includes(hitEl)) {
      this._hoveredElements.push(hitEl);
      hitEl.attributeValues.isHovered = true;
      if (hitEl._refKey) pxl.broadcast(hitEl._refKey);
      if (hitEl._compiledOnEnter) hitEl._compiledOnEnter();
    }

    // Update Cursor
    this.stage.style.cursor = hitEl ? 'pointer' : 'default';

    if (hitEl) {
      if (this._lastMove && hitEl._compiledOnMove) hitEl._compiledOnMove();
      if (this._lastClick && hitEl._compiledOnClick) hitEl._compiledOnClick();
      
      if (this._lastDown) {
        hitEl.attributeValues.isPressed = true;
        this._pressedElement = hitEl;
        if (hitEl._refKey) pxl.broadcast(hitEl._refKey);
        if (hitEl._compiledOnDown) hitEl._compiledOnDown();
      }
    }

    if (this._lastUp) {
      if (this._pressedElement) {
        this._pressedElement.attributeValues.isPressed = false;
        if (this._pressedElement._refKey) pxl.broadcast(this._pressedElement._refKey);
        this._pressedElement = null;
      }
      if (hitEl && hitEl._compiledOnUp) hitEl._compiledOnUp();
    }

    // Reset event flags
    this._lastMove = false;
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
  }
};
