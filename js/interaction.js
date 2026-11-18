// =========================================================================
// Declarative Event System (Dummy Context)
// =========================================================================
// 1×1 canvas, used only for its context (hit testing never paints)
pxl.dummyCtx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
pxl._hitX = 0;
pxl._hitY = 0;
pxl._hitResult = false;

// fill() / stroke() test the hit point instead of painting: a shape's own draw() becomes its hit test
pxl.dummyCtx.fill = function() { if (this.isPointInPath(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };
pxl.dummyCtx.stroke = function() { if (this.isPointInStroke(pxl._hitX, pxl._hitY)) pxl._hitResult = true; };

// =========================================================================
// isPressed Readers (Hand Cursor)
// =========================================================================
// Ids whose isPressed an expression or handler reads: the pointer shows a hand over those shapes
pxl._pressableIds = new Set();
pxl._pressedRefRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\??\.isPressed\b/g;

// Compile time only: finds ref.<id>.isPressed in an attribute string or handler
pxl.trackPressedRefs = function(source) {
  if (typeof source !== 'string' || source.indexOf('.isPressed') === -1) return;
  const re = pxl._pressedRefRegex;
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(source)) !== null) pxl._pressableIds.add(match[1]);
};

// =========================================================================
// InteractionEngine: hit testing, hover / press states, handlers
// =========================================================================
// Every shape is hit-tested, like elements in the DOM (design/2026-10-30_framework_compatibility_plan.md §22, §23).
// CSS pointer-events: none takes a shape, or a group or layer with everything inside it, out of hit testing.
// While the pointer rests, the hit test runs at most this often (ms); any pointer event tests at once
pxl.RESTING_HIT_INTERVAL = 100;

pxl.InteractionEngine = class InteractionEngine {
  constructor(stage) {
    this.stage = stage;
    this._hoveredElements = [];
    this._pressedElement = null;
    this._lastCursor = '';
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
    this._lastMove = false;
    this._isMouseDirty = false;
    this._lastHitTime = -1e9; // performance.now() of the last hit test (process())
  }

  // A shape that leaves the DOM while it is hovered or pressed gives up its states
  releaseElement(el) {
    if (this._hoveredElements.includes(el)) {
      pxl.removeFromArray(this._hoveredElements, el);
      el.attributeValues.isHovered = false;
      if (el.refKey) pxl.broadcast(el.refKey);
    }
    if (this._pressedElement === el) {
      this._pressedElement = null;
      el.attributeValues.isPressed = false;
      if (el.refKey) pxl.broadcast(el.refKey);
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
        this.stage.requestRender();
        break;
      case 'pointerup':
        this._lastUp = true;
        this.stage.requestRender();
        break;
      case 'click':
        this._lastClick = true;
        this.stage.requestRender();
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

  // Calls a pxl-on-* handler. A handler that throws is logged and doesn't end process(): the event flags are still
  // reset and the hover list stays right, so the event isn't delivered again in every later frame.
  callHandler(el, event) {
    const handler = el.handlers[event];
    if (!handler) return;
    try {
      handler();
    } catch (error) {
      console.error(`[pxl] <${el.localName}${el.id ? ` id="${el.id}"` : ''}> pxl-on-${event} failed:`, error);
    }
  }

  // --- Hit Testing ---

  // The topmost shape under the point (x, y) in stage units, or null. Walks the layers and their children in reverse
  // drawing order, so no list of shapes has to be kept or sorted; hidden layers and groups are skipped with
  // everything inside them. Uses the values of the last update: the picture on screen.
  findShapeAt(x, y) {
    pxl._hitX = x * this.stage.unit;
    pxl._hitY = y * this.stage.unit;
    const layers = this.stage.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.attributeValues.hidden) continue;
      // A layer is a real box on the page: CSS can take it out (pointer-events, display, visibility). Few layers,
      // so reading them costs little; groups and shapes are only read when a shape could be hit (they inherit).
      const css = layer.cssStyle();
      if (css.pointerEvents === 'none' || css.display === 'none' || css.visibility === 'hidden') continue;
      const hit = this.findShapeIn(layer, x, y);
      if (hit) return hit;
    }
    return null;
  }

  findShapeIn(container, x, y) {
    const children = container.childList;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.attributeValues.hidden) continue;
      if (child.childList !== null) {
        // A group (also a layer nested in a layer, which the engine doesn't really support)
        const hit = this.findShapeIn(child, x, y);
        if (hit) return hit;
      } else if (child.draw && this.hitsShape(child, x, y)) {
        return child;
      }
    }
    return null;
  }

  // The box check first (cheap, rules out almost every shape), then the shape's CSS pointer-events (inherited from
  // its groups and layer), then the exact test: the shape's own drawing on pxl.dummyCtx, with its global matrix.
  // A shape that throws here is not hit; the dummy context is restored either way.
  // save() / restore() only around the exact test: about 1 µs per pair, which every shape would pay otherwise.
  hitsShape(shape, x, y) {
    try {
      if (!shape.mayContainPoint(x, y) || shape.cssStyle().pointerEvents === 'none') return false;
    } catch (error) {
      shape.reportError(error); // a custom getBoundingBox() that throws
      return false;
    }
    const ctx = pxl.dummyCtx;
    pxl._hitResult = false;
    ctx.save();
    try {
      const m = shape.getGlobalMatrix(), u = this.stage.unit;
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4] * u, m[5] * u);
      ctx.beginPath();
      // Shapes that can't express their hit area as a path (e.g. text) provide hitTest()
      if (shape.hitTest) shape.hitTest(ctx, u);
      else shape.draw(ctx, u, 0);
    } catch (error) {
      shape.reportError(error);
      return false;
    } finally {
      ctx.restore();
    }
    return pxl._hitResult;
  }

  // Start of every frame (Stage.render()): pointer values, hit test, hover / press states, handlers
  process() {
    const pointerChanged = this._isMouseDirty || this._lastDown || this._lastUp || this._lastClick;
    if (this._isMouseDirty) {
      if (this.stage.refKey) pxl.broadcast(this.stage.refKey);
      this._isMouseDirty = false;
    }

    // A resting pointer is tested again at most every RESTING_HIT_INTERVAL ms: shapes may move under it, but a page
    // with many animated shapes shouldn't pay the walk in every frame (0.4–1 ms per 1,000 shapes, measured with
    // design/prototypes/2026-10-30_framework_compatibility/hit_walk_bench.html)
    const values = this.stage.attributeValues;
    const now = performance.now();
    let hitEl = null;
    if (values.isHovered) {
      if (pointerChanged || now - this._lastHitTime >= pxl.RESTING_HIT_INTERVAL) {
        hitEl = this.findShapeAt(values.mouseX, values.mouseY);
        this._lastHitTime = now;
      } else if (this._hoveredElements.length > 0) {
        hitEl = this._hoveredElements[0];
      }
    }

    // Process Leaves
    for (let i = this._hoveredElements.length - 1; i >= 0; i--) {
      const prevHovered = this._hoveredElements[i];
      if (prevHovered !== hitEl) {
        prevHovered.attributeValues.isHovered = false;
        if (prevHovered.refKey) pxl.broadcast(prevHovered.refKey);
        this.callHandler(prevHovered, 'leave');
        pxl.removeFromArray(this._hoveredElements, prevHovered);
      }
    }

    // Process Enters
    if (hitEl && !this._hoveredElements.includes(hitEl)) {
      this._hoveredElements.push(hitEl);
      hitEl.attributeValues.isHovered = true;
      if (hitEl.refKey) pxl.broadcast(hitEl.refKey);
      this.callHandler(hitEl, 'enter');
    }

    // Update Cursor: hand only for clickable elements (DOM write only on change)
    const cursor = (hitEl && hitEl.isClickable()) ? 'pointer' : 'default';
    if (cursor !== this._lastCursor) {
      this.stage.style.cursor = cursor;
      this._lastCursor = cursor;
    }

    if (hitEl) {
      if (this._lastMove) this.callHandler(hitEl, 'move');
      if (this._lastClick) this.callHandler(hitEl, 'click');

      if (this._lastDown) {
        hitEl.attributeValues.isPressed = true;
        this._pressedElement = hitEl;
        if (hitEl.refKey) pxl.broadcast(hitEl.refKey);
        this.callHandler(hitEl, 'down');
      }
    }

    if (this._lastUp) {
      const released = this._pressedElement;
      if (released) {
        released.attributeValues.isPressed = false;
        if (released.refKey) pxl.broadcast(released.refKey);
        this._pressedElement = null;
      }
      if (hitEl) this.callHandler(hitEl, 'up');
    }

    // Reset event flags
    this._lastMove = false;
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
  }
};
