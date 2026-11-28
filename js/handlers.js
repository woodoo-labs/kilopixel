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

// The ref of handlers: ref.<id> reads the element's values like an expression does, and an assignment
// (ref.counter.value++, ref.box.r += 10) goes through the element's property, so it is tracked and redrawn like
// el.r = 10. Expressions keep pxl.nodes, the plain values: this wrapper never runs in a frame.
// Design: design/done/2026-11-27_handler_assignment_plan.md
pxl.handlerRef = new Proxy(pxl.nodes, {
  get(nodes, id) {
    const values = nodes[id];
    if (values === undefined) return undefined;
    const element = values.$node;
    element.assigningRef ??= new Proxy(values, pxl.ASSIGNING_REF);
    return element.assigningRef;
  }
});

// The element's attributes can be assigned (a Set per class, built on first use); states, readouts (tx, pN, a
// stage's mouseX), id, handler attributes and unknown names warn once per element type and name
pxl._assignableNames = new Map();
pxl._unassignableNames = new Set();
pxl.ASSIGNING_REF = {
  set(values, name, value) {
    const element = values.$node;
    const Class = element.constructor;
    let names = pxl._assignableNames.get(Class);
    if (names === undefined) {
      names = new Set(Class.observedAttributes.filter((key) => key !== 'id' && !key.includes('-')));
      pxl._assignableNames.set(Class, names);
    }
    if (names.has(name)) {
      element[name] = value;
      return true;
    }
    const key = `${element.localName} ${String(name)}`;
    if (!pxl._unassignableNames.has(key)) {
      pxl._unassignableNames.add(key);
      console.warn(`[pxl] ${pxl.describe(element)}: ref.<id>.${String(name)} can't be assigned (not an attribute)`);
    }
    // Not assigned. Handlers are sloppy-mode code, so false fails silently after the warning; true would throw for
    // tx, ty and $node (fixed getters on values: a Proxy may not report them as assigned)
    return false;
  }
};

// Compiles a handler with the expression scope (Math names, colors, …), its own ref (pxl.handlerRef) and `this`
// bound to the element. A handler that throws is logged with its element and attribute; the event's other listeners
// still run.
pxl.compileHandler = function(element, name, source) {
  const handler = new Function('scope', 'ref', `
    const { ${pxl.scopeKeys} } = scope;
    return function() {
      ${pxl.rewriteExpression(source, true)}
    };
  `)(pxl.scope, pxl.handlerRef);
  return function() {
    try {
      handler.call(element);
    } catch (error) {
      console.error(`[pxl] ${pxl.describe(element)} ${name} failed:`, error);
    }
  };
};
