// =========================================================================
// Hit Test Context
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
// Handlers: pxl-on-* Attributes Are Listeners
// =========================================================================
// Handler attribute → the DOM event it listens to. Not on…: onclick is the browser's own handler attribute, and
// frameworks treat on… names as their own listeners (design/done/2026-10-30_framework_compatibility_plan.md §4.3).
// A handler is an ordinary listener on its shape or group: the engine only dispatches DOM events.
pxl.HANDLER_EVENTS = {
  'pxl-on-click': 'click', 'pxl-on-enter': 'pointerenter', 'pxl-on-leave': 'pointerleave',
  'pxl-on-down': 'pointerdown', 'pxl-on-up': 'pointerup', 'pxl-on-move': 'pointermove'
};

// The handlers record of a shape or group: one listener (or null) per event type
pxl.createHandlers = function() {
  return { click: null, pointerenter: null, pointerleave: null, pointerdown: null, pointerup: null, pointermove: null };
};

// Compiles a handler with the expression scope (ref, Math names, colors, …) and `this` bound to the element.
// A handler that throws is logged with its element and attribute; the event's other listeners still run.
pxl.compileHandler = function(element, name, source) {
  const handler = new Function('scope', 'ref', `
    const { ${pxl.scopeKeys} } = scope;
    return function() {
      ${pxl.rewriteExpression(source)}
    };
  `)(pxl.scope, pxl.nodes);
  return function() {
    try {
      handler.call(element);
    } catch (error) {
      console.error(`[pxl] <${element.localName}${element.id ? ` id="${element.id}"` : ''}> ${name} failed:`, error);
    }
  };
};

// =========================================================================
// DOM Events on Shapes
// =========================================================================
// Fields copied from the browser's event into Kilopixel's events (MouseEvent ignores the pointer fields)
pxl.EVENT_INIT_KEYS = [
  'screenX', 'screenY', 'clientX', 'clientY', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey', 'button', 'buttons',
  'detail', 'movementX', 'movementY', 'pointerId', 'pointerType', 'isPrimary', 'width', 'height', 'pressure',
  'tangentialPressure', 'tiltX', 'tiltY', 'twist'
];

// Boundary events in the browser's order: out, leave, over, enter; the pointer events first, then their mouse
// versions (React onMouseEnter, Vue @mouseenter, Angular (mouseenter) listen to those)
pxl.BOUNDARY_EVENTS = [
  ['pointerout', 'pointerleave', 'pointerover', 'pointerenter'],
  ['mouseout', 'mouseleave', 'mouseover', 'mouseenter']
];

// A shape or group: the nodes that get events and hover / press states. Layers fill the stage and get none.
pxl.isShapeOrGroup = function(node) {
  return node !== null && !(node instanceof pxl.Layer);
};

// =========================================================================
// InteractionEngine: hit testing, hover / press states, DOM events
// =========================================================================
// Every shape is hit-tested, like elements in the DOM (design/done/2026-10-30_framework_compatibility_plan.md §22, §23).
// CSS pointer-events: none takes a shape, or a group or layer with everything inside it, out of hit testing.
// While the pointer rests, the hit test runs at most this often (ms); any pointer event tests at once
pxl.RESTING_HIT_INTERVAL = 100;

pxl.InteractionEngine = class InteractionEngine {
  constructor(stage) {
    this.stage = stage;

    // The innermost hovered and pressed node: a shape, or the group left over when that shape was removed.
    // Its groups up to the layer share the state.
    this._hovered = null;
    this._pressed = null;

    // Click target (plan §23, E7): the nearest shape or group that holds both the press and the release
    this._isPressStarted = false; // a press arrived since the last release
    this._isClickDecided = false; // the release decided the target of the next click
    this._clickTarget = null;
    this._isReleaseListening = false; // window listens for a release outside the stage while a press is held
    this._onWindowRelease = (e) => {
      if (!pxl.InteractionEngine.isSecondary(e) && !e.composedPath().includes(this.stage)) this.cancelPress();
    };

    this._cursor = ''; // written on the layer canvases
    this._isMouseDirty = false;
    this._isMoved = false; // a browser pointermove arrived since the last frame
    this._isOverCanvas = true; // false while the pointer is over HTML content inside a layer
    this._captured = null; // a shape or group that holds pointer capture: the browser sends it its events itself
    this._lastHitTime = -1e9; // performance.now() of the last hit test in process()
    this._moveX = 0; // movementX / Y of the browser's moves since the last Kilopixel move
    this._moveY = 0;
    this._queuedMoveX = 0;
    this._queuedMoveY = 0;

    // Hit test of a press, release or click when it arrives, kept for its position until the pointer moves or a
    // frame runs: one click brings up to five browser events at the same place
    this._cacheX = NaN;
    this._cacheY = NaN;
    this._cacheFrame = -1;
    this._cacheHit = null;

    // Kilopixel's events: collected during a hit test and dispatched after it (listeners may change or remove
    // shapes); the arrays grow once and are reused
    this._queueTypes = [];
    this._queueTargets = [];
    this._queueRelated = [];
    this._queueLength = 0;
    this._isFlushing = false;
    this._native = null; // the browser's last event: copied into Kilopixel's events
    this._dispatching = null; // the event Kilopixel dispatches right now: the stage ignores it when it bubbles past
    this._init = pxl.InteractionEngine.createInit();
    this._x = 0; // position of the last event read by readPosition(), in stage units
    this._y = 0;
  }

  static createInit() {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, relatedTarget: null };
    for (const key of pxl.EVENT_INIT_KEYS) init[key] = undefined;
    return init;
  }

  // Touch points after the first: they get their own press, release and click, but mouseX, hover and isPressed
  // follow the primary pointer. A synthetic event without pointerType counts as primary.
  static isSecondary(e) {
    return e.isPrimary === false && e.pointerType !== '';
  }

  // --- Browser Events ---

  handleEvent(e) {
    if (e === this._dispatching) return; // Kilopixel's own event, bubbling through the stage
    const type = e.type;
    const isSecondary = pxl.InteractionEngine.isSecondary(e);
    // The browser's events over the canvases arrive retargeted to their layer (the canvas is in its shadow root).
    // Any other target is an element inside the stage: a shape that holds pointer capture, shape.click(), HTML
    // content placed in a layer. Those events already have their target and pass unchanged.
    const isFromCanvas = e.target === this.stage || e.target instanceof pxl.Layer;

    switch (type) {
      case 'pointermove':
        if (isSecondary) return;
        this._native = e;
        this._moveX += e.movementX;
        this._moveY += e.movementY;
        this._cacheFrame = -1;
        this._isOverCanvas = isFromCanvas || this._captured !== null;
        this.setPointer(e, isFromCanvas);
        this._isMouseDirty = true; // any move tests again in the next frame, also without a new position
        this._isMoved = true;
        this.stage.requestRender();
        return;
      case 'pointerenter':
        this.stage.values.isHovered = true;
        this._isMouseDirty = true;
        this.stage.requestRender();
        return;
      case 'pointerleave':
        this.stage.values.isHovered = false;
        this._isMouseDirty = true;
        this.stage.requestRender();
        return;
      case 'pointerout': {
        // The pointer leaves the stage: its shapes and groups get their leave events now, before the browser's
        // pointerout reaches the page (React's order: shape, group, layer), not in the next frame
        const to = e.relatedTarget;
        if (isSecondary || !isFromCanvas || (to !== null && this.stage.contains(to))) return;
        this._native = e;
        this.stage.values.isHovered = false;
        this._isMouseDirty = true;
        this.hover(null);
        this.updateCursor();
        this.flush();
        this.stage.requestRender();
        return;
      }
      case 'gotpointercapture':
        if (!isSecondary && !isFromCanvas) this._captured = e.target;
        return;
      case 'lostpointercapture':
        if (this._captured === e.target) this._captured = null;
        return;
      case 'pointercancel':
        // Touch scrolling cancels the pointer: a release without pxl-on-up and click (E8)
        if (!isSecondary) this.cancelPress();
        return;
    }

    // pointerdown, pointerup, mousedown, mouseup, click, dblclick, contextmenu: hit-tested when they arrive (D4)
    if (!isFromCanvas) {
      if (type === 'pointerup' && !isSecondary) this.cancelPress(); // the release of a captured pointer
      return;
    }
    if (this.stage.unit === 0) return;
    if (isSecondary) {
      const hit = this.hitAt(e);
      if (hit !== null) this.redispatch(e, hit);
      return;
    }
    this._native = e;
    let target;
    if (type === 'pointerdown' || type === 'pointerup') {
      // A tap may come without a move before it: the pointer moves here, and the hover change (enter events)
      // comes before the press, as in the DOM
      if (this.setPointer(e, true)) this.stage.requestRender();
      target = this.hitAt(e);
      this.hover(target);
      this.updateCursor();
      if (type === 'pointerdown') {
        this.press(target);
      } else {
        // E7: a click goes to the nearest shape or group that holds both the press and the release; pressed on one
        // shape and released on another, the browser's click passes to the stage
        this._isClickDecided = this._isPressStarted;
        this._clickTarget = this._isPressStarted ? this.commonNode(this._pressed, target) : null;
        this._isPressStarted = false;
        this.endPress();
      }
      this.flush();
    } else if (type === 'click') {
      // A click without a press on this stage (a synthetic click) goes to the shape under it
      target = this._isClickDecided ? this._clickTarget : this.hitAt(e);
      this._isClickDecided = false;
      this._clickTarget = null;
      this._cacheFrame = -1;
    } else {
      target = this.hitAt(e);
    }
    if (target !== null && target.isConnected) this.redispatch(e, target);
  }

  // Reads the event's position in stage units into this._x / this._y; false while the stage has no size.
  // Over the canvas, offsetX is relative to the stage. Any other target (a captured shape is display: none, its
  // offsetX equals clientX) is measured against the stage's box.
  readPosition(e, isFromCanvas) {
    const unit = this.stage.unit;
    if (unit === 0) return false;
    if (isFromCanvas) {
      this._x = e.offsetX / unit;
      this._y = e.offsetY / unit;
    } else {
      const rect = this.stage.getBoundingClientRect();
      this._x = (e.clientX - rect.left - this.stage.clientLeft) / unit;
      this._y = (e.clientY - rect.top - this.stage.clientTop) / unit;
    }
    return true;
  }

  // Moves the stage's pointer (mouseX / mouseY) to the event; true if it changed
  setPointer(e, isFromCanvas) {
    if (!this.readPosition(e, isFromCanvas)) return false;
    const values = this.stage.values;
    if (values.mouseX === this._x && values.mouseY === this._y) return false;
    values.mouseX = this._x;
    values.mouseY = this._y;
    this._isMouseDirty = true;
    return true;
  }

  // The topmost shape under a press, release or click, at the event's own position
  hitAt(e) {
    this.readPosition(e, true);
    const hit = this._cacheHit;
    if (this._x === this._cacheX && this._y === this._cacheY && this._cacheFrame === pxl._frame &&
        (hit === null || hit.isConnected)) {
      return hit;
    }
    this._cacheX = this._x;
    this._cacheY = this._y;
    this._cacheFrame = pxl._frame;
    this._cacheHit = this.findShapeAt(this._x, this._y);
    return this._cacheHit;
  }

  // --- States ---

  setState(node, key, value) {
    if (node.values[key] === value) return;
    node.values[key] = value;
    pxl.markChanged(node);
  }

  // Sets a state on node and its groups, up to (not including) stop or the layer
  setChain(node, stop, key, value) {
    for (let n = node; pxl.isShapeOrGroup(n) && n !== stop; n = n.parentContainer) this.setState(n, key, value);
  }

  // The nearest shape or group that contains both a and b, or null
  commonNode(a, b) {
    if (a === null || b === null) return null;
    for (let n = a; pxl.isShapeOrGroup(n); n = n.parentContainer) {
      if (n.contains(b)) return n;
    }
    return null;
  }

  // The pointer is now over next (a shape, or null): isHovered on the nodes left and entered, and their boundary
  // events (E6). Moving between shapes of one group leaves and enters nothing on the group. relatedTarget is the
  // node left or entered, or the shape's layer for empty space.
  // Over empty space the layer is the element under the pointer, as in the DOM: moving onto a shape, the layer gets
  // pointerout / mouseout first (relatedTarget: the shape), and moving off it, pointerover / mouseover after the leave
  // events. The browser sends neither (the pointer stays on the same canvas). React needs them: it builds
  // onPointerEnter / onPointerLeave only from the out events and ignores an over event whose relatedTarget is an
  // element it rendered, such as the layer (found with a React 19 page, plan §23.8).
  hover(next) {
    const prev = this._hovered;
    if (prev === next) return;
    this._hovered = next;
    const from = prev !== null ? prev : next.parentLayer;
    const to = next !== null ? next : prev.parentLayer;
    for (let k = 0; k < 2; k++) {
      const types = pxl.BOUNDARY_EVENTS[k], isPointer = k === 0;
      if (prev !== null) {
        this.queue(types[0], prev, to);
        for (let n = prev; pxl.isShapeOrGroup(n) && !(next !== null && n.contains(next)); n = n.parentContainer) {
          if (isPointer) this.setState(n, 'isHovered', false);
          this.queue(types[1], n, to);
        }
      } else {
        this.queue(types[0], from, next); // the layer, left for the shape
      }
      if (next === null) this.queue(types[2], to, prev); // the layer, entered from the shape
      if (next !== null) {
        this.queue(types[2], next, from);
        // Enter events go from the outermost node entered down to the shape: counted first, then filled backwards
        let count = 0;
        for (let n = next; pxl.isShapeOrGroup(n) && !(prev !== null && n.contains(prev)); n = n.parentContainer) count++;
        let i = this._queueLength + count;
        this._queueLength = i;
        for (let n = next; count > 0; count--, n = n.parentContainer) {
          if (isPointer) this.setState(n, 'isHovered', true);
          i--;
          this._queueTypes[i] = types[3];
          this._queueTargets[i] = n;
          this._queueRelated[i] = from;
        }
      }
    }
  }

  // A press starts on target (a shape, or null over empty space): isPressed on it and its groups
  press(target) {
    this.endPress();
    this._isPressStarted = true;
    this._isClickDecided = false;
    if (target === null) return;
    this._pressed = target;
    this.setChain(target, null, 'isPressed', true);
    // A release outside the stage doesn't reach it: window tells. Listening only while a press is held.
    window.addEventListener('pointerup', this._onWindowRelease, true);
    window.addEventListener('pointercancel', this._onWindowRelease, true);
    this._isReleaseListening = true;
  }

  endPress() {
    if (this._pressed !== null) {
      this.setChain(this._pressed, null, 'isPressed', false);
      this._pressed = null;
    }
    if (this._isReleaseListening) {
      window.removeEventListener('pointerup', this._onWindowRelease, true);
      window.removeEventListener('pointercancel', this._onWindowRelease, true);
      this._isReleaseListening = false;
    }
  }

  // Released outside the stage, cancelled or released under pointer capture: no click from Kilopixel
  cancelPress() {
    this.endPress();
    this._isPressStarted = false;
    this._isClickDecided = false;
    this._clickTarget = null;
  }

  // A shape or group that leaves the DOM gives up hover and press. The state passes to its nearest group that is
  // still in the page, which stays hovered or pressed without new enter events.
  releaseElement(el) {
    if (this._hovered !== null && el.contains(this._hovered)) this._hovered = this.release(this._hovered, el, 'isHovered');
    if (this._pressed !== null && el.contains(this._pressed)) this._pressed = this.release(this._pressed, el, 'isPressed');
    if (this._captured !== null && el.contains(this._captured)) this._captured = null;
    if (this._clickTarget !== null && el.contains(this._clickTarget)) this._clickTarget = null;
  }

  release(node, removed, key) {
    const parent = removed.parentContainer;
    this.setChain(node, parent, key, false);
    return pxl.isShapeOrGroup(parent) && parent.isConnected ? parent : null;
  }

  // The stage left the page: every state is cleared, without events (the DOM sends none to removed elements)
  reset() {
    if (this._hovered !== null) this.setChain(this._hovered, null, 'isHovered', false);
    this._hovered = null;
    this.cancelPress();
    this._captured = null;
    this._native = null;
    this._cacheHit = null;
    this._cacheFrame = -1;
    this.updateCursor(); // nothing hovered: removes the cursor from the canvases
    for (let i = 0; i < this._queueLength; i++) {
      this._queueTargets[i] = null;
      this._queueRelated[i] = null;
    }
    this._queueLength = 0;
  }

  // The hovered shape's CSS cursor (inherited from its groups and layer; [pxl-on-click] gives the hand, see
  // pxl.defaultStyles()), read in every hit test, so a class change shows while the pointer rests on the shape.
  // Written on the layer canvases, in their shadow roots, where no framework style binding overwrites it; '' (empty
  // space, or auto) removes it, so page CSS applies.
  updateCursor() {
    let cursor = '';
    if (this._hovered !== null) {
      cursor = this._hovered.cssStyle().cursor;
      if (cursor === 'auto') cursor = '';
    }
    if (cursor === this._cursor) return;
    this._cursor = cursor;
    const layers = this.stage.layers;
    for (let i = 0; i < layers.length; i++) layers[i].setCursor(cursor);
  }

  // --- Dispatch ---

  queue(type, target, related) {
    const i = this._queueLength++;
    this._queueTypes[i] = type;
    this._queueTargets[i] = target;
    this._queueRelated[i] = related;
  }

  // Dispatches the queued events. A listener that causes more events (a hover change, a dispatch on the canvas)
  // adds them to the queue, and this loop dispatches them too.
  flush() {
    if (this._isFlushing) return;
    this._isFlushing = true;
    for (let i = 0; i < this._queueLength; i++) {
      this.dispatch(this._queueTypes[i], this._queueTargets[i], this._queueRelated[i], this._native, null);
      this._queueTargets[i] = null; // no references kept to elements that may be removed
      this._queueRelated[i] = null;
    }
    this._queueLength = 0;
    this._isFlushing = false;
  }

  // Stops the browser's event at the stage and dispatches the same event on target instead: every listener sees one
  // event, with the shape as target (D4). preventDefault() on Kilopixel's event is passed on to the browser's.
  redispatch(e, target) {
    e.stopPropagation();
    if (!this.dispatch(e.type, target, null, e, e.constructor)) e.preventDefault();
  }

  // One new event object per dispatch, as the browser does: event fields are read-only, and frameworks and user
  // code may keep the object. The init object is reused. Returns false if a listener called preventDefault().
  dispatch(type, target, related, source, EventClass) {
    const init = this._init;
    if (source !== null) {
      const keys = pxl.EVENT_INIT_KEYS;
      for (let i = 0; i < keys.length; i++) init[keys[i]] = source[keys[i]];
    }
    if (type === 'pointermove' || type === 'mousemove') {
      // The browser's moves since the last frame, summed: drag code that adds up movementX loses nothing
      init.movementX = this._queuedMoveX;
      init.movementY = this._queuedMoveY;
    }
    // Enter and leave don't bubble and can't be cancelled; every other type does both
    const bubbles = type !== 'pointerenter' && type !== 'pointerleave' && type !== 'mouseenter' && type !== 'mouseleave';
    init.bubbles = bubbles;
    init.cancelable = bubbles;
    init.relatedTarget = related;
    if (EventClass === null) EventClass = type.charCodeAt(0) === 112 ? PointerEvent : MouseEvent; // 'p'ointer…
    const event = new EventClass(type, init);
    init.relatedTarget = null;
    const previous = this._dispatching;
    this._dispatching = event;
    const result = target.dispatchEvent(event); // a listener that throws is reported by the browser
    this._dispatching = previous;
    return result;
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
      if (layer.values.hidden) continue;
      // A layer is a real box on the page: CSS can hide it (display, visibility). Few layers, so reading them costs
      // little. Its pointer-events is not checked here: the shapes inherit it, and a shape with pointer-events: auto
      // inside a layer with none is hit, as in the DOM. Shapes are only read when they could be hit.
      const css = layer.cssStyle();
      if (css.display === 'none' || css.visibility === 'hidden') continue;
      const hit = this.findShapeIn(layer, x, y);
      if (hit) return hit;
    }
    return null;
  }

  findShapeIn(container, x, y) {
    const children = container.childList;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.values.hidden) continue;
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
      // In logical units, like the layer: the global matrix scaled by u
      const m = shape.getGlobalMatrix(), u = this.stage.unit;
      ctx.setTransform(m[0] * u, m[1] * u, m[2] * u, m[3] * u, m[4] * u, m[5] * u);
      ctx.beginPath();
      // Shapes that can't express their hit area as a path (e.g. text) provide hitTest()
      if (shape.hitTest) shape.hitTest(ctx);
      else shape.draw(ctx);
    } catch (error) {
      shape.reportError(error);
      return false;
    } finally {
      ctx.restore();
    }
    return pxl._hitResult;
  }

  // --- Frame ---

  // Start of every frame (Stage.render()): the stage's pointer values, the hit test, hover states with their
  // boundary events, and one move event on the shape under a moving pointer. Presses, releases and clicks are
  // handled when they arrive (handleEvent()). Touches no layer: only readers of a changed state redraw.
  process() {
    const values = this.stage.values;
    const isPointerChanged = this._isMouseDirty;
    if (isPointerChanged) {
      pxl.markChanged(this.stage);
      this._isMouseDirty = false;
    }

    if (!values.isHovered || !this._isOverCanvas) {
      this.hover(null);
      this.updateCursor();
    } else {
      // A resting pointer is tested again at most every RESTING_HIT_INTERVAL ms: shapes may move under it, but a page
      // with many animated shapes shouldn't pay the walk in every frame (0.4–1 ms per 1,000 shapes, measured with
      // design/prototypes/2026-10-30_framework_compatibility/hit_walk_bench.html)
      const now = performance.now();
      if (isPointerChanged || now - this._lastHitTime >= pxl.RESTING_HIT_INTERVAL) {
        this._lastHitTime = now;
        this.hover(this.findShapeAt(values.mouseX, values.mouseY));
        this.updateCursor();
      }
    }

    // One move per frame on the shape under the pointer, like the browser's own frame-aligned moves. While a shape
    // holds pointer capture, the browser sends the moves to it itself.
    if (this._isMoved) {
      if (this._hovered !== null && this._captured === null) {
        this._queuedMoveX = this._moveX;
        this._queuedMoveY = this._moveY;
        this.queue('pointermove', this._hovered, null);
        this.queue('mousemove', this._hovered, null);
      }
      this._moveX = 0;
      this._moveY = 0;
      this._isMoved = false;
    }
    this.flush();
  }
};
