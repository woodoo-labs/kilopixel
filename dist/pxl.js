/** Kilopixel Framework v0.1.0 */
window.pxl = { version: '0.1.0' };

// =========================================================================
// Generic Utilities
// =========================================================================

pxl.removeFromArray = function(arr, item) {
  const idx = arr.indexOf(item);
  if (idx !== -1) {
    const lastIdx = arr.length - 1;
    if (idx !== lastIdx) arr[idx] = arr[lastIdx];
    arr.length--;
  }
};

pxl.sortByDOMPosition = function(a, b) {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1;
};

pxl.isSpatialKey = function(key) {
  return key === 'x' || key === 'y' || key === 'dx' || key === 'dy' || 
         key === 'rotate' || key === 'scale' || key === 'scalex' || 
         key === 'scaley' || key === 'skewx' || key === 'skewy';
};

// =========================================================================
// Reactivity Engine
// =========================================================================

// Centralized Pub-Sub Bus
pxl._subscriptions = {};

// The zero-cost plain object registry for DOM nodes
pxl.nodes = {};

pxl.broadcast = function(fullKey) {
  const subs = this._subscriptions[fullKey];
  if (subs) {
    // Loop backwards to support safe in-place unsubscribing (Zero-GC)
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};

// Proxies and global system variables have been removed in favor of explicit ref.* architecture

pxl.subscribeToVariable = function(fullKey, element) {
  if (!this._subscriptions[fullKey]) this._subscriptions[fullKey] = [];
  if (!this._subscriptions[fullKey].includes(element)) {
    this._subscriptions[fullKey].push(element);
  }
};

pxl.unsubscribeFromVariable = function(fullKey, element) {
  const subs = this._subscriptions[fullKey];
  if (!subs) return;

  // 1. Zero-GC Array Mutation using helper
  this.removeFromArray(subs, element);

  // 2. Dashboard Safeguard: Delete the key if the array is empty
  if (subs.length === 0) {
    delete this._subscriptions[fullKey];
  }
};

pxl.clearAllVariableSubscriptions = function(element) {
  // 1. Take a static snapshot of the current variables being tracked.
  const trackedKeys = Object.keys(this._subscriptions);
  const len = trackedKeys.length;

  // 2. Safely loop through the snapshot
  for (let i = 0; i < len; i++) {
    this.unsubscribeFromVariable(trackedKeys[i], element);
  }
};
// =========================================================================
// State Update Utilities for Web Components
// =========================================================================
pxl.compileAttribute = function(element, name, newValue) {
  const parsed = this.parseAttributeValue(newValue);
  element.attributeExpressions[name] = parsed;

  if (typeof parsed === 'function') {
    if (parsed.isTimeDependent) {
      // --- 60FPS Time Loop ---
      if (!element.animatedAttributeKeys.includes(name)) element.animatedAttributeKeys.push(name);
      this.removeFromArray(element.reactiveAttributeKeys, name);
    } else {
      // --- Reactive Variable Engine ---
      this.removeFromArray(element.animatedAttributeKeys, name);
      if (!element.reactiveAttributeKeys.includes(name)) element.reactiveAttributeKeys.push(name);

      // Globally subscribe the element to the variables it needs
      const deps = parsed.variableDependencies;
      if (deps) {
        const len = deps.length;
        for (let i = 0; i < len; i++) {
          this.subscribeToVariable(deps[i], element);
        }
      }
      
      // ONLY evaluate if we are connected to the DOM. If we aren't, connectedCallback will handle it.
      if (element.isConnected) {
        element.attributeValues[name] = parsed.call(element, 0);
      }
    }
  } else {
    // --- Static Primitive ---
    this.removeFromArray(element.animatedAttributeKeys, name);
    this.removeFromArray(element.reactiveAttributeKeys, name);
    element.attributeValues[name] = parsed;
  }
};

pxl.evaluateAttributesForVariable = function(element, varName) {
  let result = 0; // Bitmask: 1 = isVarStillNeeded, 2 = hasChanges
  let matrixDirtied = false;
  const len = element.reactiveAttributeKeys.length;

  for (let i = 0; i < len; i++) {
    const key = element.reactiveAttributeKeys[i];
    const fn = element.attributeExpressions[key];

    if (fn.variableDependencies?.includes(varName)) {
      result |= 1; // Flag bit 1
      const newVal = fn.call(element, 0);
      if (element.attributeValues[key] !== newVal) {
        element.attributeValues[key] = newVal;
        result |= 2; // Flag bit 2

        if (pxl.isSpatialKey(key)) {
          matrixDirtied = true;
        }
      }
    }
  }
  
  if (matrixDirtied) {
    element.setLocalMatrixDirty();
  }
  
  return result;
};

pxl.restoreVariableSubscriptions = function(element) {
  if (!element.reactiveAttributeKeys) return;
  const len = element.reactiveAttributeKeys.length;
  for (let i = 0; i < len; i++) {
    const key = element.reactiveAttributeKeys[i];
    const fn = element.attributeExpressions[key];
    const deps = fn?.variableDependencies;
    if (deps) {
      const depLen = deps.length;
      for (let j = 0; j < depLen; j++) {
        this.subscribeToVariable(deps[j], element);
      }
    }
  }
};



// =========================================================================
// pxl.Matrix - Zero-GC 2D Affine Engine
// =========================================================================

pxl.Matrix = {
  create: function() {
    return new Float32Array([1, 0, 0, 1, 0, 0]);
  },

  // Order: Translate(x,y) -> Rotate -> Scale -> Skew -> Translate(dx,dy)
  updateLocal: function(out, x, y, dx, dy, rotate, scalex, scaley, skewx, skewy) {
    if (rotate) {
      const rad = rotate * Math.PI / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      out[0] = c;  out[1] = s;
      out[2] = -s; out[3] = c;
    } else {
      out[0] = 1; out[1] = 0;
      out[2] = 0; out[3] = 1;
    }
    out[4] = x;
    out[5] = y;

    if (scalex !== 1 || scaley !== 1) {
      out[0] *= scalex; out[1] *= scalex;
      out[2] *= scaley; out[3] *= scaley;
    }
    if (skewx || skewy) {
      const sx = Math.tan(skewx * Math.PI / 180);
      const sy = Math.tan(skewy * Math.PI / 180);
      const a0 = out[0], a1 = out[1], a2 = out[2], a3 = out[3];
      out[0] = a0 + a2 * sy;
      out[1] = a1 + a3 * sy;
      out[2] = a0 * sx + a2;
      out[3] = a1 * sx + a3;
    }
    if (dx || dy) {
      out[4] += out[0] * dx + out[2] * dy;
      out[5] += out[1] * dx + out[3] * dy;
    }
    return out;
  },

  multiply: function(out, a, b) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];

    out[0] = a0 * b0 + a2 * b1;
    out[1] = a1 * b0 + a3 * b1;
    out[2] = a0 * b2 + a2 * b3;
    out[3] = a1 * b2 + a3 * b3;
    out[4] = a0 * b4 + a2 * b5 + a4;
    out[5] = a1 * b4 + a3 * b5 + a5;
    return out;
  },

  invert: function(out, a) {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    let det = a0 * a3 - a1 * a2;

    if (det === 0) {
      out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0;
      return out;
    }
    det = 1.0 / det;

    out[0] = a3 * det;
    out[1] = -a1 * det;
    out[2] = -a2 * det;
    out[3] = a0 * det;
    out[4] = (a2 * a5 - a3 * a4) * det;
    out[5] = (a1 * a4 - a0 * a5) * det;
    return out;
  }
};

pxl._scratchMatrixA = pxl.Matrix.create();
pxl._scratchMatrixB = pxl.Matrix.create();
pxl._identityMatrix = pxl.Matrix.create();

pxl.mapCoordinate = function(caller, targetObj, prop) {
  if (!targetObj || !caller) return 0;
  
  const targetNode = targetObj.$node || targetObj; 
  
  const callerParentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;
  
  const targetGlobal = targetNode.getGlobalMatrix ? targetNode.getGlobalMatrix() : null;
  if (!targetGlobal) return 0;

  // Delta = Invert(CallerParentGlobal) * TargetGlobal
  pxl.Matrix.invert(pxl._scratchMatrixA, callerParentGlobal);
  pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetGlobal);

  const dx = targetNode.attributeValues.dx;
  const dy = targetNode.attributeValues.dy;
  const tdx = pxl._scratchMatrixB[0] * dx + pxl._scratchMatrixB[2] * dy;
  const tdy = pxl._scratchMatrixB[1] * dx + pxl._scratchMatrixB[3] * dy;

  if (prop === 'x')      return pxl._scratchMatrixB[4] - tdx;
  if (prop === 'y')      return pxl._scratchMatrixB[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return pxl._scratchMatrixB[4];
  if (prop === 'ty')     return pxl._scratchMatrixB[5];
  if (prop === 'rotate') return Math.atan2(pxl._scratchMatrixB[1], pxl._scratchMatrixB[0]) * 180 / Math.PI;
  if (prop === 'scale' || prop === 'scalex') return Math.sqrt(pxl._scratchMatrixB[0]*pxl._scratchMatrixB[0] + pxl._scratchMatrixB[1]*pxl._scratchMatrixB[1]);
  if (prop === 'scaley') return Math.sqrt(pxl._scratchMatrixB[2]*pxl._scratchMatrixB[2] + pxl._scratchMatrixB[3]*pxl._scratchMatrixB[3]);
  
  return 0;
};

// =========================================================================
// Sandbox Engine Configuration & Drivers
// =========================================================================

// --- Pre-built Scope (real functions, created once, passed as argument) ---
pxl.scope = Object.create(null);

// Hardcoded whitelist of standard Math constants and methods to prevent polyfill contamination
const mathProps = [
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2',
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
  'cbrt', 'ceil', 'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor',
  'fround', 'hypot', 'imul', 'log', 'log10', 'log1p', 'log2', 'max',
  'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt',
  'tan', 'tanh', 'trunc'
];

const len = mathProps.length;
for (let i = 0; i < len; i++) {
  const prop = mathProps[i];
  if (Math[prop] !== undefined) {
    pxl.scope[prop] = Math[prop];
  }
}

pxl.scope.rgb  = (r, g, b) => `rgb(${r},${g},${b})`;
pxl.scope.rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
pxl.scope.hsl  = (h, s, l) => {
  const sf = typeof s === 'number' ? s + '%' : s;
  const lf = typeof l === 'number' ? l + '%' : l;
  return `hsl(${h},${sf},${lf})`;
};
pxl.scope.hsla = (h, s, l, a) => {
  const sf = typeof s === 'number' ? s + '%' : s;
  const lf = typeof l === 'number' ? l + '%' : l;
  return `hsla(${h},${sf},${lf},${a})`;
};

// CSS Filter Helpers
pxl.scope.blur       = (radius) => `blur(${radius}px)`;
pxl.scope.dropShadow = (x, y, blur, color) => `drop-shadow(${x}px ${y}px ${blur}px ${color || '#000'})`;
pxl.scope.brightness = (val) => `brightness(${val}%)`;
pxl.scope.contrast   = (val) => `contrast(${val}%)`;
pxl.scope.hueRotate  = (deg) => `hue-rotate(${deg}deg)`;
pxl.scope.invert     = (val) => `invert(${val}%)`;
pxl.scope.saturate   = (val) => `saturate(${val}%)`;
pxl.scope.grayscale  = (val) => `grayscale(${val}%)`;
pxl.scope.sepia      = (val) => `sepia(${val}%)`;
pxl.scope.opacity    = (val) => `opacity(${val}%)`;

pxl.scope.clamp = (v, low, high) => Math.max(low, Math.min(high, v));
pxl.scope.lerp  = (a, b, alpha) => a + (b - a) * alpha;
pxl.scope.map   = (v, inMin, inMax, outMin, outMax) => (v - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;

// Shared stop-parsing helper for all gradient types (zero duplication)
function _parseStops(colorsArray) {
  const stops = [];
  if (!Array.isArray(colorsArray) || colorsArray.length === 0) return stops;
  if (typeof colorsArray[0] === 'string') {
    const step = 1 / (colorsArray.length - 1 || 1);
    for (let i = 0; i < colorsArray.length; i++) {
      stops.push({ offset: i * step, color: colorsArray[i] });
    }
  } else {
    for (let i = 0; i < colorsArray.length; i += 2) {
      stops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
    }
  }
  return stops;
}

pxl.scope.linear = (direction, colorsArray) => {
  const stops = _parseStops(colorsArray);
  if (typeof direction === 'number') {
    return { isGradient: true, type: 'linear', angle: direction, stops };
  }
  if (direction) {
    return { isGradient: true, type: 'linear', x1: direction[0], y1: direction[1], x2: direction[2], y2: direction[3], stops };
  }
  return { isGradient: true, type: 'linear', angle: 0, stops };
};

pxl.scope.radial = (config, colorsArray) => {
  const stops = _parseStops(colorsArray);
  let x0 = 0.5, y0 = 0.5, r0 = 0;
  let x1 = 0.5, y1 = 0.5, r1 = 0.5;

  if (typeof config === 'number') {
    r1 = config;
  } else if (config) {
    const len = config.length;
    if (len === 1) {
      r1 = config[0];
    } else if (len === 3) {
      x0 = config[0]; y0 = config[1]; r1 = config[2];
      x1 = x0; y1 = y0;
    } else if (len >= 6) {
      x0 = config[0]; y0 = config[1]; r0 = config[2];
      x1 = config[3]; y1 = config[4]; r1 = config[5];
    }
  }

  return { isGradient: true, type: 'radial', x0, y0, r0, x1, y1, r1, stops };
};

pxl.scope.conic = (angleOrConfig, colorsArray) => {
  const stops = _parseStops(colorsArray);
  let startAngle = 0, cx = 0.5, cy = 0.5;
  if (typeof angleOrConfig === 'number') {
    startAngle = angleOrConfig;
  } else if (angleOrConfig) {
    startAngle = angleOrConfig[0] || 0;
    cx = angleOrConfig[1] ?? 0.5;
    cy = angleOrConfig[2] ?? 0.5;
  }
  return { isGradient: true, type: 'conic', startAngle, cx, cy, stops };
};

pxl.scopeKeys = Object.keys(pxl.scope).join(', ');

// --- Time Driver Registry (single source of truth) ---
pxl.drivers = {
  loop:   '(d) => (t % d) / d',
  yoyo:   '(d) => 1 - abs((t % (d * 2)) / d - 1)',
  wave:   '(d) => 0.5 - cos((t / d) * PI * 2) * 0.5',
  bounce: '(d) => abs(sin((t / d) * PI))',
  strobe: '(d) => (t % d < d * 0.5 ? 1 : 0)',
  glide:  '(d) => ((l) => l * l * (3 - 2 * l))((t % d) / d)',
  pulse:  '(d) => pow(sin((t / d) * PI), 6)',
  glitch: '(d) => abs(sin(floor(t / d) * 437.58)) % 1',
  time: `(u) => {
    _d.setTime(Date.now());
    if (u === 'ms') return _d.getMilliseconds();
    if (u === 's') return _d.getSeconds() + _d.getMilliseconds() / 1000;
    if (u === 'm') return _d.getMinutes() + _d.getSeconds() / 60;
    if (u === 'h') return _d.getHours() + _d.getMinutes() / 60;
    if (u === 'day') return _d.getDay();
    if (u === 'date') return _d.getDate();
    if (u === 'month') return _d.getMonth() + 1;
    if (u === 'year') return _d.getFullYear();
    return _d.getTime();
  }`
};

pxl.timeDrivers = Object.entries(pxl.drivers)
  .map(([name, body]) => `const ${name} = ${body};`)
  .join('\n');

const driverNames = Object.keys(pxl.drivers).join('|');
pxl.timeDriverRegex = new RegExp(`(^|[^.])\\bt\\b|\\b(${driverNames})\\s*\\(`);

// =========================================================================
// Expression Parser & Math Engine
// =========================================================================

// Stores compiled FUNCTIONS for 60fps animations
pxl.animationCache = new Map();

// Stores raw NUMBERS/STRINGS for instant startup 
pxl.staticCache = new Map();

// Parses strings into numbers or booleans. Calls compileExpression for static or animated Math expressions.
pxl.parseAttributeValue = function (value) {
  if (value === null || value === '') return value;

  const firstChar = value[0];

  // 1. FAST PATH: Hex Colors (e.g., "#ff0000", "#fff")
  if (firstChar === '#') return value;

  // 2. EXPLICIT JS PATH: Template Literals always compile dynamically
  if (firstChar === '`') return this.compileExpression(value);

  // 3. FAST PATH: Alphabetical Words & Keywords (e.g., "red", "none", "true", "t", "Hello World")
  if ((firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z')) {
    if (/^[a-zA-Z\s]+$/.test(value)) {
      if (value === 't') return this.compileExpression(value);
      if (value === 'true') return true;
      if (value === 'false') return false;
      
      // Fast path for raw Math constants (e.g. PI, E)
      if (Object.prototype.hasOwnProperty.call(this.scope, value) && typeof this.scope[value] === 'number') {
        return this.scope[value];
      }
      return value;
    }

    // Fast Path for static CSS color functions (e.g., "rgba(124, 211, 15, 0.8)")
    if (/^(rgb|rgba)\([\d\s.,%]+\)$/i.test(value)) {
      return value;
    }
  }

  // 3. FAST PATH: Pure String Literals (e.g., "'Hello loop(2) World'")
  if ((firstChar === "'" || firstChar === '"') && value[value.length - 1] === firstChar) {
    if (value.indexOf(firstChar, 1) === value.length - 1) {
      return value.slice(1, -1);
    }
  }

  // 4. FAST PATH: Pure Numbers (e.g., "100", "-50", "0.25", ".5")
  const num = Number(value);
  if (!Number.isNaN(num)) return num;

  // 5. SLOW PATH: Math & Animation Guard (e.g., "100 * 2", "loop(2)")
  if (/(^|[^.])\bt\b|\bref\.|\btoLocal\(|\(|\[|(?:\d\s*[-+*/%<>=!&|]|[-+*/%<>=!&|]\s*\d)|['"`]\s*\+|\+\s*['"`]/.test(value)) {
    return this.compileExpression(value);
  }

  return value;
};

pxl.compileExpression = function (str) {
  // 1. FAST LOOKUP: Check caches up front to minimize compiling overhead
  if (this.staticCache.has(str)) return this.staticCache.get(str);
  if (this.animationCache.has(str)) return this.animationCache.get(str);

  try {
    // 2. CSS PERCENTAGE SANITIZER: Safely convert illegal JS percentages to strings
    let sanitizedStr = str;
    if (sanitizedStr.includes('%') && sanitizedStr[0] !== '`') {
      sanitizedStr = sanitizedStr.replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, "'$1%'$2");
    }

    // 3. OPTIONAL CHAINING INJECTOR: Safely convert ref.player.x to ref.player?.x
    // This prevents fatal TypeErrors during initial eager evaluation before elements are connected to the DOM.
    sanitizedStr = sanitizedStr.replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
    
    // Detect 60fps timeline drivers OR self-referencing keyword
    // IMPORTANT: We must check this BEFORE replacing toLocal, because toLocal injects 'this'.
    const isAnimated = this.timeDriverRegex.test(sanitizedStr);

    // 4. MATRIX TRACKER INJECTOR
    sanitizedStr = sanitizedStr.replace(/\btoLocal\(/g, 'pxl.mapCoordinate(this, ');

    // Extract reactive variable dependencies
    const deps = [];
    const varRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = varRegex.exec(sanitizedStr)) !== null) {
      const fullKey = `ref.${match[1]}`;
      if (!deps.includes(fullKey)) deps.push(fullKey);
    }
    const hasVars = deps.length > 0;

    // SMART RETURN DETECTOR
    const code = /\breturn\b/.test(sanitizedStr) ? sanitizedStr : `return ${sanitizedStr};`;

    if (isAnimated || hasVars) {
      // --- ANIMATION PATH (Factory Closure Pattern) ---
      const fn = new Function('scope', 'ref', `
        const { ${this.scopeKeys} } = scope;
        let t;
        const _d = new Date();
        ${this.timeDrivers}
        return function(_t) {
          t = _t;
          ${code}
        };
      `)(this.scope, this.nodes);

      fn.isTimeDependent = isAnimated;
      if (hasVars) fn.variableDependencies = deps;

      this.animationCache.set(str, fn);
      return fn;

    } else {
      // --- STATIC PATH (Evaluated once, returns absolute numeric/string value) ---
      const result = new Function('scope', `
        const { ${this.scopeKeys} } = scope;
        ${code} 
      `)(this.scope);

      const val = (result !== undefined) ? result : str;

      this.staticCache.set(str, val);
      return val;
    }
  } catch (e) {
    this.staticCache.set(str, str);
    console.warn(`Failed to compile expression, returned string instead: ${str}`, e);
    return str;
  }
};

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

// =========================================================================
// Drawing & Transform Helpers
// =========================================================================
pxl.anchorX = { 
  'left': 0, 'right': 1, 'center': 0.5, 
  'top-left': 0, 'top-right': 1, 'bottom-left': 0, 'bottom-right': 1, 
  'top': 0.5, 'bottom': 0.5,
  'top-center': 0.5, 'bottom-center': 0.5,
  'left-center': 0, 'right-center': 1,
  'center-top': 0.5, 'center-bottom': 0.5,
  'center-left': 0, 'center-right': 1
};
pxl.anchorY = { 
  'top': 0, 'bottom': 1, 'center': 0.5, 
  'top-left': 0, 'top-right': 0, 'bottom-left': 1, 'bottom-right': 1, 
  'left': 0.5, 'right': 0.5,
  'top-center': 0, 'bottom-center': 1,
  'left-center': 0.5, 'right-center': 0.5,
  'center-top': 0, 'center-bottom': 1,
  'center-left': 0.5, 'center-right': 0.5
};

// Radial gradient radius resolver: number → absolute logical canvas units,
// string → anchor point distance or CSS dynamic keyword
pxl.resolveRadius = (r, x, y, w, h, u) => {
  if (typeof r === 'number') return Math.abs(r * u);

  // 1. Direct Side Edges (Perpendicular projection: 0 sqrt, 0 object lookups)
  if (r === 'top')    return Math.abs(y * h * u);
  if (r === 'bottom') return Math.abs((1 - y) * h * u);
  if (r === 'left')   return Math.abs(x * w * u);
  if (r === 'right')  return Math.abs((1 - x) * w * u);

  // 2. Perimeter Points (Euclidean distance to discrete vertex)
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w * u, dy = (y - pxl.anchorY[r]) * h * u;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 3. Dynamic CSS Keywords (Lazy evaluated bounds)
  const lx = x * w * u, rx = (1 - x) * w * u;
  const ty = y * h * u, by = (1 - y) * h * u;
  switch (r) {
    case 'closest-side':   return Math.max(0.001, Math.min(lx, rx, ty, by));
    case 'farthest-side':  return Math.max(lx, rx, ty, by);
    case 'closest-corner':
      return Math.max(0.001, Math.min(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by)));
    case 'farthest-corner':
      return Math.max(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by));
    default: return 0;
  }
};

pxl.applyTransformState = function(ctx, u, attributeValues) {
  const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = attributeValues;
  
  if (x || y) ctx.translate(x * u, y * u);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);
  
  const finalScaleX = scale !== 1 ? scale : scalex;
  const finalScaleY = scale !== 1 ? scale : scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx * u, dy * u);
};

pxl.scaleResponsiveFilter = function(filterStr, u) {
  // Only match and scale values explicitly suffixed with 'px' from pxl.scope helpers
  return filterStr.replace(/(-?\d+\.?\d*)px/g, (match, val) => {
    return (parseFloat(val) * u) + 'px';
  });
};

pxl.resolveFilter = function(node, filter, u) {
  if (!filter || filter === 'none') return 'none';
  
  const filterStr = Array.isArray(filter) ? filter.join(' ') : filter;
  if (node._lastFilterRaw !== filterStr || node._lastFilterU !== u) {
    node._lastFilterRaw = filterStr;
    node._lastFilterU = u;
    node._cachedFilterScaled = pxl.scaleResponsiveFilter(filterStr, u);
  }
  
  return node._cachedFilterScaled;
};

pxl.applyContextState = function(ctx, u, attributeValues, node) {
  pxl.applyTransformState(ctx, u, attributeValues);
  
  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = attributeValues;
  
  // 2. Rendering States
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  
  if (mask && mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }
  
  if (filter && filter !== 'none') {
    ctx.filter = pxl.resolveFilter(node, filter, u);
  }

  if (shadowcolor) {
    if (shadowcolor === 'none' || shadowcolor === 'transparent') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = shadowcolor;
      ctx.shadowBlur = shadowblur * u;
      ctx.shadowOffsetX = shadowx * u;
      ctx.shadowOffsetY = shadowy * u;
    }
  }
};

// =========================================================================
// Stroke & Line Dash Helpers
// =========================================================================
pxl._emptyDash = [];

pxl.applyLineDash = function(ctx, u, linedash, dashoffset, node) {
  if (!linedash || linedash === 'none' || linedash === 0 || linedash === '0') {
    ctx.setLineDash(pxl._emptyDash);
    ctx.lineDashOffset = 0;
    return;
  }

  if (node._lastDash !== linedash || node._lastDashU !== u) {
    node._lastDash = linedash;
    node._lastDashU = u;

    if (!node._scaledDash) node._scaledDash = [];

    if (typeof linedash === 'number') {
      node._scaledDash.length = 1;
      node._scaledDash[0] = linedash * u;
    } else if (Array.isArray(linedash)) {
      const len = linedash.length;
      node._scaledDash.length = len;
      for (let i = 0; i < len; i++) {
        node._scaledDash[i] = (Number.isFinite(linedash[i]) ? linedash[i] : 0) * u;
      }
    }
  }

  ctx.setLineDash((node._scaledDash && node._scaledDash.length > 0) ? node._scaledDash : pxl._emptyDash);
  
  let offset = parseFloat(dashoffset);
  ctx.lineDashOffset = Number.isFinite(offset) ? (offset * u) : 0;
};

// =========================================================================
// Geometry Parsing
// =========================================================================
// Smart Parser: Comma separates X/Y. Semicolon separates pairs.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  let start = 0;
  let depth = 0;
  let currentX = null;
  // Add a semicolon at the end to ensure the last point is processed
  const input = str + ";"; 

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    // Track parentheses so we don't split math functions like min(a, b)
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      if (char === ',') {
        // We found the end of X
        currentX = input.substring(start, i).trim();
        start = i + 1;
      } else if (char === ';') {
        // We found the end of Y
        const currentY = input.substring(start, i).trim();
        if (currentX !== null && currentX !== "" && currentY !== "") {
          targetArray.push(currentX, currentY);
        }
        currentX = null;
        start = i + 1;
      }
    }
  }
};

// =========================================================================
// Performance Monitor
// =========================================================================

pxl.perf = {
  stages: [],
  lastUpdate: 0,

  registerStage: function(stage) {
    if (!this.stages.includes(stage)) this.stages.push(stage);
  },

  unregisterStage: function(stage) {
    pxl.removeFromArray(this.stages, stage);
  },

  publish: function() {
    const len = this.stages.length;
    for (let i = 0; i < len; i++) {
      const stage = this.stages[i];
      
      if (stage.attributeValues) {
        stage.attributeValues.fps = stage.perfFrames;
        stage.attributeValues.renderAvg = (stage.perfFrames > 0 ? (stage.perfAccumulated / stage.perfFrames) : 0).toFixed(2);
        stage.attributeValues.renderMax = stage.perfMax.toFixed(2);
        if (stage._refKey) pxl.broadcast(stage._refKey);
      }

      // Reset counters for the next interval
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;
    }
  }
};

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
class PxlNode extends HTMLElement {
  constructor() {
    super();
    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, 'tx', { get: () => this.attributeValues.x + this.attributeValues.dx, enumerable: false });
    Object.defineProperty(this.attributeValues, 'ty', { get: () => this.attributeValues.y + this.attributeValues.dy, enumerable: false });

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
    this.isAnimated = false;
    
    // Zero-GC Lazy Matrix Tracking
    this.localMatrix = null;
    this.globalMatrix = null;
    this._isLocalMatrixDirty = false;
    this._globalMatrixVersion = 0;
    this._parentMatrixVersion = -1;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (pxl.isSpatialKey(name)) {
      this.setLocalMatrixDirty();
    }
    if (this._refKey) pxl.broadcast(this._refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);

    // ZERO-GC FIX: Initial evaluation of reactive attributes now that we have a spatial context
    const keys = this.reactiveAttributeKeys;
    if (keys) {
      const numKeys = keys.length;
      if (numKeys > 0) {
        for (let i = 0; i < numKeys; i++) {
          const key = keys[i];
          const newVal = this.attributeExpressions[key].call(this, 0);
          
          if (this.attributeValues[key] !== newVal) {
            this.attributeValues[key] = newVal;
            if (pxl.isSpatialKey(key)) {
              this.setLocalMatrixDirty();
            }
          }
        }
        if (this._isLocalMatrixDirty) {
          this.parentLayer?.invalidate();
        }
      }
    }

    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this._refKey = `ref.${this.id}`;
      // Broadcast arrival so any elements initialized earlier can successfully re-evaluate
      pxl.broadcast(this._refKey);
    }
  }

  disconnectedCallback() {
    if (this.id && pxl.nodes[this.id] === this.attributeValues) {
      delete pxl.nodes[this.id];
    }
    pxl.clearAllVariableSubscriptions(this);
    this.parentContainer?.unregisterChild(this);
  }

  variableChangedCallback(varName) {
    const result = pxl.evaluateAttributesForVariable(this, varName);

    if ((result & 1) === 0) pxl.unsubscribeFromVariable(varName, this);
    if ((result & 2) !== 0) {
      if (this._refKey) pxl.broadcast(this._refKey);
      this.parentLayer?.invalidate();
    }
  }

  evaluateAnimations(t) {
    let animatedValuesChanged = false;
    let matrixDirtied = false;
    const animLen = this.animatedAttributeKeys.length;
    if (animLen > 0) {
      for (let i = 0; i < animLen; i++) {
        const key = this.animatedAttributeKeys[i];
        const newVal = this.attributeExpressions[key].call(this, t);
        if (this.attributeValues[key] !== newVal) {
          this.attributeValues[key] = newVal;
          animatedValuesChanged = true;
          
          if (pxl.isSpatialKey(key)) {
            matrixDirtied = true;
          }
        }
      }
    }
    
    if (matrixDirtied) {
      this.setLocalMatrixDirty();
    }
    
    if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
      pxl.broadcast(this._refKey);
    }

    if (this.isAnimated) this.parentLayer?.invalidate();
    
    return animatedValuesChanged;
  }

  // --- Spatial Reactivity Cascade ---
  
  setLocalMatrixDirty() {
    this._isLocalMatrixDirty = true;
    this.broadcastGlobalMatrixChange();
  }

  broadcastGlobalMatrixChange() {
    if (this.childList) {
      const len = this.childList.length;
      const subs = pxl._subscriptions;
      for (let i = 0; i < len; i++) {
        const child = this.childList[i];
        
        // Broadcast the child if someone is explicitly tracking its global matrix
        if (child._refKey && subs[child._refKey] && subs[child._refKey].length > 0) {
          pxl.broadcast(child._refKey);
        }
        
        // Recursively push the matrix dirty flag down the DOM tree (zero-cost if no tracked children)
        if (typeof child.broadcastGlobalMatrixChange === 'function') {
          child.broadcastGlobalMatrixChange();
        }
      }
    }
  }

  // --- Lazy Matrix Tracking Getters ---

  getLocalMatrix() {
    if (!this.localMatrix) this.localMatrix = pxl.Matrix.create();
    
    if (this._isLocalMatrixDirty || !this._localMatrixVersion) {
      const v = this.attributeValues;
      const sX = v.scale !== 1 ? v.scale : v.scalex;
      const sY = v.scale !== 1 ? v.scale : v.scaley;
      
      pxl.Matrix.updateLocal(this.localMatrix, v.x, v.y, v.dx, v.dy, v.rotate, sX, sY, v.skewx, v.skewy);
      this._isLocalMatrixDirty = false;
      this._localMatrixVersion = (this._localMatrixVersion || 0) + 1; 
    }
    return this.localMatrix;
  }

  getGlobalMatrix() {
    if (!this.globalMatrix) this.globalMatrix = pxl.Matrix.create();

    this.getLocalMatrix(); // ensure local is clean

    let isDirty = false;

    if (this._lastLocalMatrixVersion !== this._localMatrixVersion) {
      this._lastLocalMatrixVersion = this._localMatrixVersion;
      isDirty = true;
    }

    if (this.parentContainer) {
      const parentGlobal = this.parentContainer.getGlobalMatrix(); // recursively updates parent!
      const parentVersion = this.parentContainer._globalMatrixVersion;

      if (this._lastParentMatrixVersion !== parentVersion) {
        this._lastParentMatrixVersion = parentVersion;
        isDirty = true;
      }

      if (isDirty) {
        pxl.Matrix.multiply(this.globalMatrix, parentGlobal, this.localMatrix);
        this._globalMatrixVersion = (this._globalMatrixVersion || 0) + 1;
      }
    } else {
      if (isDirty) {
        this.globalMatrix.set(this.localMatrix); 
        this._globalMatrixVersion = (this._globalMatrixVersion || 0) + 1;
      }
    }

    if (!this._globalMatrixVersion) this._globalMatrixVersion = 1;

    return this.globalMatrix;
  }
}

window.PxlNode = PxlNode;

class Layer extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'filter', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', filter: 'none', hidden: false });
    Object.assign(this.attributeValues, this.attributeExpressions);

    this.isDirty = true;
    this.isCanvasEmpty = false;
    this.stage = null;
    this.dpr = 1; // Overwritten by stage

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';

    if (!this.contains(this.canvas)) this.appendChild(this.canvas);
    this.stage = this.closest('pxl-stage');
    this.stage?.registerLayer(this);
    
    super.connectedCallback();
    this.invalidate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.unregisterLayer(this);
    this.stage = null;
    this.isDirty = false;
  }

  registerChild(child) {
    if (this.childList.includes(child)) return;
    this.childList.push(child);
    this.isOrderDirty = true; // Flag that a sort is needed
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }



  // called by layer and shapes
  invalidate() {
    this.isDirty = true;
    // If layer is hidden but not empty -> request render.
    if (this.attributeExpressions.hidden && this.isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // triggered by stage's resizeObserver
  resize(w, h, dpr) {
    // What if browser window is moved to different screen?
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.scale(dpr, dpr);
    this.invalidate();
  }

  render(u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }
    
    this.evaluateAnimations(t);

    const { alpha, blend, filter, hidden } = this.attributeValues;

    if (this._lastAlpha !== alpha) {
      this.canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }
    
    const cssBlend = blend === 'source-over' ? 'normal' : (blend === 'lighter' ? 'plus-lighter' : blend);
    if (this._lastBlend !== cssBlend) {
      this.canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    if (filter !== 'none' && filter !== null && filter !== undefined) {
      const filterStr = pxl.resolveFilter(this, filter, u);
      if (this._lastAppliedFilter !== filterStr) {
        this.canvas.style.filter = filterStr;
        this._lastAppliedFilter = filterStr;
      }
    } else if (this._lastAppliedFilter && this._lastAppliedFilter !== 'none') {
      this.canvas.style.filter = 'none';
      this._lastAppliedFilter = 'none';
    }

    // cssOnly Fast Path Check
    let _transformsAnimated = false;
    let _anyCompositingAnimated = false;
    for (let i = 0; i < this.animatedAttributeKeys.length; i++) {
      const k = this.animatedAttributeKeys[i];
      if (pxl.isSpatialKey(k)) {
        _transformsAnimated = true;
      }
      if (k === 'alpha' || k === 'blend' || k === 'filter') {
        _anyCompositingAnimated = true;
      }
    }

    if (_anyCompositingAnimated && !_transformsAnimated && !this.isDirty) {
      if (this.isAnimated) this.stage?.requestRender();
      return; // Skip canvas clear and child rendering!
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.isDirty = false;

    if (hidden) {
      this.isCanvasEmpty = true;
      if (this.isAnimated) this.stage?.requestRender();
      return;
    }

    this.isCanvasEmpty = false;
    
    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasTransformChanges = x || y || dx || dy || rotate || 
                                scale !== 1 || scalex !== 1 || scaley !== 1 || 
                                skewx || skewy;

    if (hasTransformChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    const len = this.childList.length;
    for (let i = 0; i < len; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasTransformChanges) ctx.restore();

    if (this.isAnimated) this.stage?.requestRender();
  }
}
customElements.define('pxl-layer', Layer);
class Group extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'hidden']; }

  constructor() {
    super();
    this.childList = []; // Groups or shapes
    this.isOrderDirty = false; // Tracks if children need sorting
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, hidden: false });
    Object.assign(this.attributeValues, this.attributeExpressions);
  }

  registerChild(child) {
    if (!this.childList.includes(child)) {
      this.childList.push(child);
      this.isOrderDirty = true; // Flag that a sort is needed
      this.parentLayer?.invalidate();
    }
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  render(ctx, u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scalex !== 1 || scaley !== 1 || 
                            skewx || skewy;

    if (hasStateChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    const len = this.childList.length;
    for (let i = 0; i < len; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasStateChanges) ctx.restore();
  }
}
customElements.define('pxl-group', Group);
// TODO
// Cache Paths?
class Shape extends PxlNode {
  static get observedAttributes() { return ['x', 'y', 'dx', 'dy', 'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'alpha', 'blend', 'mask', 'filter', 'shadowcolor', 'shadowblur', 'shadowx', 'shadowy', 'hidden', 'onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove']; }

  constructor() {
    super();
    Object.assign(this.attributeExpressions, { x: 0, y: 0, dx: 0, dy: 0, fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false, isHovered: false, isPressed: false });
    Object.assign(this.attributeValues, this.attributeExpressions);
    
    // Pre-allocated bounding box object (zero-GC)
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };
    
    // Dual-Slot Gradient Cache: [0] = fill, [1] = stroke (pre-allocated, zero-GC)
    this._gradCache = [
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null },
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null }
    ];
    
    this._compiledOnClick = null;
    this._compiledOnEnter = null;
    this._compiledOnLeave = null;
    this._compiledOnDown = null;
    this._compiledOnUp = null;
    this._compiledOnMove = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    if (name === 'onclick' || name === 'onenter' || name === 'onleave' || name === 'ondown' || name === 'onup' || name === 'onmove') {
      let sanitizedStr = newValue.replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
      const compiled = new Function('scope', 'ref', `
        const { ${pxl.scopeKeys} } = scope;
        return function() { 
          ${sanitizedStr} 
        };
      `)(pxl.scope, pxl.nodes).bind(this);

      if (name === 'onclick') this._compiledOnClick = compiled;
      if (name === 'onenter') this._compiledOnEnter = compiled;
      if (name === 'onleave') this._compiledOnLeave = compiled;
      if (name === 'ondown')  this._compiledOnDown = compiled;
      if (name === 'onup')    this._compiledOnUp = compiled;
      if (name === 'onmove')  this._compiledOnMove = compiled;
      
      this.stage?.interaction.registerElement(this);
      return;
    }

    super.attributeChangedCallback(name, oldValue, newValue);
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
    
    if (this._compiledOnClick || this._compiledOnEnter || this._compiledOnLeave || this._compiledOnDown || this._compiledOnUp || this._compiledOnMove) {
      this.stage?.interaction.registerElement(this);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.unregisterElement(this);
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, mask, filter, shadowcolor } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate || 
                            scale !== 1 || scalex !== 1 || scaley !== 1 || 
                            skewx || skewy || 
                            alpha !== 1 || blend !== 'source-over' || mask !== 'none' || filter !== 'none' ||
                            shadowcolor;

    // Global Pipeline Sandbox
    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues, this);
      this.draw(ctx, u, t);
      ctx.restore();
    } else {
      this.draw(ctx, u, t);
    }
  }

  getBoundingBox() {
    console.warn(`[pxl] Warning: Subclass ${this.constructor.name} does not implement getBoundingBox(). Fallback to zeroed bounding box.`);
    // Safe default for unknown shapes
    this.boundingBox.left = 0;
    this.boundingBox.right = 0;
    this.boundingBox.top = 0;
    this.boundingBox.bottom = 0;
    return this.boundingBox;
  }

  createGradient(ctx, u, styleValue, slot) {
    if (typeof styleValue !== 'object' || !styleValue.isGradient) {
      return styleValue;
    }

    const box = this.getBoundingBox();
    const c = this._gradCache[slot];

    // Dual-Slot Gradient Cache (bbox-aware)
    if (c.config === styleValue && c.u === u &&
        c.bl === box.left && c.bt === box.top &&
        c.br === box.right && c.bb === box.bottom) {
      return c.grad;
    }

    const width = box.right - box.left;
    const height = box.bottom - box.top;

    let grad;

    if (styleValue.type === 'linear') {
      let gx1, gy1, gx2, gy2;
      
      if (styleValue.angle !== undefined) {
        const bx = (box.left + box.right) / 2;
        const by = (box.top + box.bottom) / 2;
        const rad = styleValue.angle * Math.PI / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
        gx1 = (bx - distance * cosRad) * u;
        gy1 = (by - distance * sinRad) * u;
        gx2 = (bx + distance * cosRad) * u;
        gy2 = (by + distance * sinRad) * u;
      } else {
        gx1 = (box.left + width * styleValue.x1) * u;
        gy1 = (box.top + height * styleValue.y1) * u;
        gx2 = (box.left + width * styleValue.x2) * u;
        gy2 = (box.top + height * styleValue.y2) * u;
      }
      
      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const px0 = (box.left + width * styleValue.x0) * u;
      const py0 = (box.top + height * styleValue.y0) * u;
      const px1 = (box.left + width * styleValue.x1) * u;
      const py1 = (box.top + height * styleValue.y1) * u;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height, u);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height, u);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else if (styleValue.type === 'conic') {
      const gcx = (box.left + width * styleValue.cx) * u;
      const gcy = (box.top + height * styleValue.cy) * u;
      
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    if (grad) {
      const stops = styleValue.stops;
      const len = stops.length;
      for (let i = 0; i < len; i++) {
        grad.addColorStop(stops[i].offset, stops[i].color);
      }

      c.config = styleValue;
      c.u = u;
      c.bl = box.left;
      c.bt = box.top;
      c.br = box.right;
      c.bb = box.bottom;
      c.grad = grad;
      return grad;
    }

    return styleValue;
  }

  applyStyle(ctx, u) {
    const { fill, stroke, strokewidth, linecap, linejoin, miterlimit, linedash, dashoffset } = this.attributeValues;

    if (fill && fill !== 'none' && fill !== 'transparent') {
      ctx.fillStyle = this.createGradient(ctx, u, fill, 0);
      ctx.fill();
    }
    
    if (stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0) {
      ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);
      
      ctx.lineWidth = strokewidth * u;
      ctx.lineCap = linecap;
      ctx.lineJoin = linejoin;
      ctx.miterLimit = miterlimit;
      
      pxl.applyLineDash(ctx, u, linedash, dashoffset, this);
      
      ctx.stroke();
    }
  }

  drawArrow(ctx, u, tipX, tipY, tangent, size, style) {
    const phi = Math.PI / 6; // 30 degrees
    const wing1X = tipX - size * u * Math.cos(tangent - phi);
    const wing1Y = tipY - size * u * Math.sin(tangent - phi);
    const wing2X = tipX - size * u * Math.cos(tangent + phi);
    const wing2Y = tipY - size * u * Math.sin(tangent + phi);

    ctx.beginPath();
    if (style === 'line') {
      ctx.moveTo(wing1X, wing1Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(wing2X, wing2Y);
      ctx.stroke();
    } else {
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(wing1X, wing1Y);
      ctx.lineTo(wing2X, wing2Y);
      ctx.closePath();
      
      const originalFill = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle; 
      ctx.fill();
      ctx.fillStyle = originalFill;
    }
  }
}
class Circle extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'r', 'ir', 'start', 'end', 'sweep', 'pie', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { r: 0, ir: 0, start: 0, end: null, sweep: null, pie: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, pie, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;

    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= Math.PI * 1.99;

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0) {
      arrowStartTipX = r * Math.cos(startRadians) * u;
      arrowStartTipY = r * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, r * 2);
      const arrowStartDelta = 2 * Math.asin(clampL / (2 * r));
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      
      const basePointX = r * Math.cos(baseRadians) * u;
      const basePointY = r * Math.sin(baseRadians) * u;
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      arrowEndTipX = r * Math.cos(endRadians) * u;
      arrowEndTipY = r * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, r * 2);
      const arrowEndDelta = 2 * Math.asin(clampL / (2 * r));
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      
      const basePointX = r * Math.cos(baseRadians) * u;
      const basePointY = r * Math.sin(baseRadians) * u;
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.arc(0, 0, r * u, drawStartRadians, drawEndRadians, isAnti);

    if (ir > 0) {
      if (isFull) {
        ctx.moveTo((ir * u) * Math.cos(drawEndRadians), (ir * u) * Math.sin(drawEndRadians));
      }
      ctx.arc(0, 0, ir * u, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isPie && !isFull) {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if (isFull) {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
}
customElements.define('pxl-circle', Circle);

class Ellipse extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, pie, anticlockwise, strokewidth, arrowstart, arrowend, arrowstyle } = this.attributeValues;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;

    const startRadians = start * Math.PI / 180;
    
    let endRadians;
    if (sweep !== null) {
      endRadians = startRadians + (sweep * Math.PI / 180);
    } else if (end !== null) {
      endRadians = end * Math.PI / 180;
    } else {
      endRadians = startRadians + Math.PI * 2;
    }

    const isFull = Math.abs(endRadians - startRadians) >= Math.PI * 1.99;

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // --- ARROW OFFSET INTERCEPTION ---
    let arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0) {
      arrowStartTipX = rx * Math.cos(startRadians) * u;
      arrowStartTipY = ry * Math.sin(startRadians) * u;
      
      const clampL = Math.min(arrowStartSize * 0.75, Math.max(rx, ry));
      const dxStart = -rx * Math.sin(startRadians);
      const dyStart = ry * Math.cos(startRadians);
      const speedStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
      const arrowStartDelta = clampL / (speedStart || 1);
      
      const baseRadians = startRadians + (isAnti ? -arrowStartDelta : arrowStartDelta);
      const basePointX = rx * Math.cos(baseRadians) * u;
      const basePointY = ry * Math.sin(baseRadians) * u;
      
      arrowStartAngle = Math.atan2(arrowStartTipY - basePointY, arrowStartTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawStartRadians += isAnti ? -arrowStartDelta : arrowStartDelta; 
      }
    }

    let arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      arrowEndTipX = rx * Math.cos(endRadians) * u;
      arrowEndTipY = ry * Math.sin(endRadians) * u;
      
      const clampL = Math.min(arrowEndSize * 0.75, Math.max(rx, ry));
      const dxEnd = -rx * Math.sin(endRadians);
      const dyEnd = ry * Math.cos(endRadians);
      const speedEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
      const arrowEndDelta = clampL / (speedEnd || 1);
      
      const baseRadians = endRadians + (isAnti ? arrowEndDelta : -arrowEndDelta);
      const basePointX = rx * Math.cos(baseRadians) * u;
      const basePointY = ry * Math.sin(baseRadians) * u;
      
      arrowEndAngle = Math.atan2(arrowEndTipY - basePointY, arrowEndTipX - basePointX);

      if (arrowstyle === 'filled') {
        drawEndRadians += isAnti ? arrowEndDelta : -arrowEndDelta;
      }
    }

    // --- DRAW PATH ---
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * u, ry * u, 0, drawStartRadians, drawEndRadians, isAnti);

    if (irx > 0 || iry > 0) {
      if (isFull) {
        ctx.moveTo((irx * u) * Math.cos(drawEndRadians), (iry * u) * Math.sin(drawEndRadians));
      }
      ctx.ellipse(0, 0, irx * u, iry * u, 0, drawEndRadians, drawStartRadians, !isAnti);
      ctx.closePath();
    } else if (isPie && !isFull) {
      ctx.lineTo(0, 0);
      ctx.closePath();
    } else if (isFull) {
      ctx.closePath();
    }

    this.applyStyle(ctx, u);

    // --- DRAW ARROWS ---
    if (arrowStartSize > 0) {
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0) {
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
}
customElements.define('pxl-ellipse', Ellipse);

class Rect extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'w', 'h', 'r', 'r1', 'r2', 'r3', 'r4', 'anchor']; }

  constructor() {
    super();
    const defaults = { w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
    
    // Pre-allocated array for zero-allocation roundRect drawing
    this._radii = [0, 0, 0, 0];
  }

  draw(ctx, u, t) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.attributeValues;

    const ax = pxl.anchorX[anchor] ?? 0.5;
    const ay = pxl.anchorY[anchor] ?? 0.5;

    const startX = -w * ax * u;
    const startY = -h * ay * u;

    ctx.beginPath();
    
    // Core fallback logic: 'r' acts as the universal base radius
    const baseR = r || 0;
    const rad1 = r1 !== null ? r1 : baseR;
    const rad2 = r2 !== null ? r2 : baseR;
    const rad3 = r3 !== null ? r3 : baseR;
    const rad4 = r4 !== null ? r4 : baseR;

    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      this._radii[0] = rad1 * u;
      this._radii[1] = rad2 * u;
      this._radii[2] = rad3 * u;
      this._radii[3] = rad4 * u;
      
      // Some browsers require roundRect to be polyfilled, but modern ones support it natively.
      if (ctx.roundRect) {
        ctx.roundRect(startX, startY, w * u, h * u, this._radii);
      } else {
        ctx.rect(startX, startY, w * u, h * u);
      }
    } else {
      ctx.rect(startX, startY, w * u, h * u);
    }
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { w, h, anchor } = this.attributeValues;
    const ax = pxl.anchorX[anchor] ?? 0.5;
    const ay = pxl.anchorY[anchor] ?? 0.5;

    this.boundingBox.left = -w * ax;
    this.boundingBox.right = w * (1 - ax);
    this.boundingBox.top = -h * ay;
    this.boundingBox.bottom = h * (1 - ay);
    return this.boundingBox;
  }
}
customElements.define('pxl-rect', Rect);

class Line extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    const defaults = { x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { x1, y1, x2, y2, arrowstart, arrowend, arrowstyle, linecap, strokewidth } = this.attributeValues;

    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowStartSize <= 0 && arrowEndSize <= 0) {
      ctx.beginPath();
      ctx.moveTo(x1 * u, y1 * u);
      ctx.lineTo(x2 * u, y2 * u);
      this.applyStyle(ctx, u);
      return;
    }

    let lineStartX = x1 * u;
    let lineStartY = y1 * u;
    let lineEndX = x2 * u;
    let lineEndY = y2 * u;
    
    let arrowStartTipX = lineStartX, arrowStartTipY = lineStartY;
    let arrowEndTipX = lineEndX, arrowEndTipY = lineEndY;
    
    let arrowStartAngle = 0, arrowEndAngle = 0;
    const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

    if (arrowStartSize > 0) {
      arrowStartAngle = Math.atan2(y1 - y2, x1 - x2);
      arrowStartTipX += Math.cos(arrowStartAngle) * swOffset;
      arrowStartTipY += Math.sin(arrowStartAngle) * swOffset;
      if (arrowstyle === 'filled') {
        lineStartX -= Math.cos(arrowStartAngle) * arrowStartSize * u * 0.75;
        lineStartY -= Math.sin(arrowStartAngle) * arrowStartSize * u * 0.75;
      }
    }

    if (arrowEndSize > 0) {
      arrowEndAngle = Math.atan2(y2 - y1, x2 - x1);
      arrowEndTipX += Math.cos(arrowEndAngle) * swOffset;
      arrowEndTipY += Math.sin(arrowEndAngle) * swOffset;
      if (arrowstyle === 'filled') {
        lineEndX -= Math.cos(arrowEndAngle) * arrowEndSize * u * 0.75;
        lineEndY -= Math.sin(arrowEndAngle) * arrowEndSize * u * 0.75;
      }
    }

    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineEndX, lineEndY);
    this.applyStyle(ctx, u);

    if (arrowStartSize > 0) this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    if (arrowEndSize > 0) this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
  }

  getBoundingBox() {
    const { x1, y1, x2, y2 } = this.attributeValues;
    this.boundingBox.left = Math.min(x1, x2);
    this.boundingBox.right = Math.max(x1, x2);
    this.boundingBox.top = Math.min(y1, y2);
    this.boundingBox.bottom = Math.max(y1, y2);
    return this.boundingBox;
  }
}
customElements.define('pxl-line', Line);

class Polyline extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'points', 'closed', 'smooth', 'mode', 'arrowstart', 'arrowend', 'arrowstyle']; }

  constructor() {
    super();
    this.pointCount = 0;
    this.rawParts = []; // Reusable array for parser output
    
    // Highly optimized flat cache and pre-calculated string keys
    this.flatCache = new Float32Array(0); 
    this.pointKeys = [];
    
    const defaults = { closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'points') {
      if (oldValue === newValue) return;
      this.clearPoints();

      pxl.parsePointsIntoArray(newValue, this.rawParts);
      this.pointCount = this.rawParts.length;

      this.flatCache = new Float32Array(this.pointCount);
      this.pointKeys.length = this.pointCount;

      for (let i = 0; i < this.pointCount; i++) {
        const key = `p${i}`;
        this.pointKeys[i] = key;
        pxl.compileAttribute(this, key, this.rawParts[i]);
      }
      
      this.isAnimated = this.animatedAttributeKeys.length > 0;
      this.parentLayer?.invalidate();
    } else {
      super.attributeChangedCallback(name, oldValue, newValue);
    }
  }

  clearPoints() {
    for (let i = 0; i < this.pointCount; i++) {
      const key = this.pointKeys[i];
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      delete this.attributeExpressions[key];
      delete this.attributeValues[key];
    }
    this.pointCount = 0;
  }

  // variableChangedCallback — INHERITED from Shape. No override needed.

  draw(ctx, u, t) {
    if (this.pointCount < 4) return;

    const { closed, smooth, arrowstart, arrowend, arrowstyle, linecap, strokewidth } = this.attributeValues;
    const isSmooth = smooth !== false && smooth !== null;
    const tension = typeof smooth === 'number' ? smooth : 1;

    for (let i = 0; i < this.pointCount; i++) {
      this.flatCache[i] = this.attributeValues[this.pointKeys[i]] * u;
    }

    if (this.attributeValues.mode === 'relative') {
      for (let i = 2; i < this.pointCount; i++) {
        this.flatCache[i] += this.flatCache[i - 2];
      }
    }

    const len = this.pointCount / 2;

    // --- ARROW OFFSET INTERCEPTION ---
    let origLineStartX, origLineStartY, arrowStartTipX, arrowStartTipY, arrowStartAngle = 0;
    const arrowStartSize = (arrowstart === 'auto') ? (strokewidth * 3.6) : arrowstart;
    
    if (arrowStartSize > 0) {
      origLineStartX = this.flatCache[0]; 
      origLineStartY = this.flatCache[1];
      arrowStartTipX = origLineStartX; 
      arrowStartTipY = origLineStartY;

      arrowStartAngle = Math.atan2(this.flatCache[1] - this.flatCache[3], this.flatCache[0] - this.flatCache[2]);
      const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

      arrowStartTipX += Math.cos(arrowStartAngle) * swOffset;
      arrowStartTipY += Math.sin(arrowStartAngle) * swOffset;

      if (arrowstyle === 'filled') {
        this.flatCache[0] -= Math.cos(arrowStartAngle) * arrowStartSize * u * 0.75;
        this.flatCache[1] -= Math.sin(arrowStartAngle) * arrowStartSize * u * 0.75;
      }
    }

    let origLineEndX, origLineEndY, arrowEndTipX, arrowEndTipY, arrowEndAngle = 0;
    const arrowEndSize = (arrowend === 'auto') ? (strokewidth * 3.6) : arrowend;

    if (arrowEndSize > 0) {
      const lastX = this.pointCount - 2;
      const lastY = this.pointCount - 1;
      
      origLineEndX = this.flatCache[lastX]; 
      origLineEndY = this.flatCache[lastY];
      arrowEndTipX = origLineEndX; 
      arrowEndTipY = origLineEndY;

      arrowEndAngle = Math.atan2(this.flatCache[lastY] - this.flatCache[lastY - 2], this.flatCache[lastX] - this.flatCache[lastX - 2]);
      const swOffset = (linecap === 'square') ? (strokewidth / 2) * u : 0;

      arrowEndTipX += Math.cos(arrowEndAngle) * swOffset;
      arrowEndTipY += Math.sin(arrowEndAngle) * swOffset;

      if (arrowstyle === 'filled') {
        this.flatCache[lastX] -= Math.cos(arrowEndAngle) * arrowEndSize * u * 0.75;
        this.flatCache[lastY] -= Math.sin(arrowEndAngle) * arrowEndSize * u * 0.75;
      }
    }

    ctx.beginPath();
    ctx.moveTo(this.flatCache[0], this.flatCache[1]);

    if (!isSmooth) {
      for (let i = 1; i < len; i++) {
        ctx.lineTo(this.flatCache[i*2], this.flatCache[i*2+1]);
      }
    } else {
      const loopLen = closed ? len : len - 1;
      
      for (let i = 0; i < loopLen; i++) {
        const i0 = closed ? (i - 1 + len) % len : Math.max(i - 1, 0);
        const i1 = i;
        const i2 = (i + 1) % len;
        const i3 = closed ? (i + 2) % len : Math.min(i + 2, len - 1);

        const p0x = this.flatCache[i0*2], p0y = this.flatCache[i0*2+1];
        const p1x = this.flatCache[i1*2], p1y = this.flatCache[i1*2+1];
        const p2x = this.flatCache[i2*2], p2y = this.flatCache[i2*2+1];
        const p3x = this.flatCache[i3*2], p3y = this.flatCache[i3*2+1];

        const cp1x = p1x + (p2x - p0x) * (tension / 6);
        const cp1y = p1y + (p2y - p0y) * (tension / 6);
        const cp2x = p2x - (p3x - p1x) * (tension / 6);
        const cp2y = p2y - (p3y - p1y) * (tension / 6);

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
      }
    }
    
    if (closed) ctx.closePath();
    this.applyStyle(ctx, u);

    // --- CACHE RESTORE & DRAW ARROWS ---
    if (arrowStartSize > 0) {
      this.flatCache[0] = origLineStartX; 
      this.flatCache[1] = origLineStartY;
      this.drawArrow(ctx, u, arrowStartTipX, arrowStartTipY, arrowStartAngle, arrowStartSize, arrowstyle);
    }
    if (arrowEndSize > 0) {
      this.flatCache[this.pointCount - 2] = origLineEndX; 
      this.flatCache[this.pointCount - 1] = origLineEndY;
      this.drawArrow(ctx, u, arrowEndTipX, arrowEndTipY, arrowEndAngle, arrowEndSize, arrowstyle);
    }
  }

  getBoundingBox() {
    if (this.pointCount < 4) {
      this.boundingBox.left = 0;
      this.boundingBox.right = 0;
      this.boundingBox.top = 0;
      this.boundingBox.bottom = 0;
      return this.boundingBox;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.attributeValues.mode === 'relative';

    for (let i = 0; i < this.pointCount; i += 2) {
      const px = this.attributeValues[this.pointKeys[i]];
      const py = this.attributeValues[this.pointKeys[i+1]];
      
      if (isRelative && i > 0) {
        currentX += px;
        currentY += py;
      } else {
        currentX = px;
        currentY = py;
      }

      if (currentX < minX) minX = currentX;
      if (currentX > maxX) maxX = currentX;
      if (currentY < minY) minY = currentY;
      if (currentY > maxY) maxY = currentY;
    }
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;
    return this.boundingBox;
  }
}
customElements.define('pxl-polyline', Polyline);

class Text extends Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'text', 'size', 'font', 'align', 'baseline', 'weight', 'fontstyle', 'maxwidth', 'direction', 'width', 'lineheight', 'letterspacing', 'reveal'];
  }

  constructor() {
    super();
    const defaults = {
      text: '', size: 16, font: 'sans-serif', align: 'start', 
      baseline: 'alphabetic', weight: 'normal', fontstyle: 'normal', 
      maxwidth: 0, direction: null, width: 0, lineheight: 1.2,
      letterspacing: 0, reveal: null
    };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);

    this._cachedFontString = '';
    this._lastSize = 0;
    this._lastU = 0;
    this._lastFont = '';
    this._lastWeight = '';
    this._lastStyle = '';
    this._lastText = '';
    this._lastAlign = '';
    this._lastBaseline = '';
    this._lastWidth = 0;
    this._lastLineheight = 0;
    this._lastLetterspacing = 0;
    this._lastDirection = null;
    this._cachedLetterSpacingString = '0px';
    this._lines = [];
    this._totalChars = 0;
  }

  draw(ctx, u, t) {
    const { text, size, font, align, baseline, fill, stroke, strokewidth, weight, fontstyle, maxwidth, direction, width, lineheight, letterspacing, reveal } = this.attributeValues;

    // Skip drawing if there's no text content to render
    if (text === null || text === undefined || text === '') return;
    
    // ====================================================================
    // TIER 1: Font State Cache (String Building)
    // ====================================================================
    let tier1Dirty = false;
    if (
      this._lastSize !== size ||
      this._lastU !== u ||
      this._lastFont !== font ||
      this._lastWeight !== weight ||
      this._lastStyle !== fontstyle ||
      this._lastLetterspacing !== letterspacing
    ) {
      tier1Dirty = true;
      this._cachedFontString = `${fontstyle} ${weight} ${size * u}px ${font}`;
      this._cachedLetterSpacingString = (letterspacing * u) + 'px';

      this._lastSize = size;
      this._lastU = u;
      this._lastFont = font;
      this._lastWeight = weight;
      this._lastStyle = fontstyle;
      this._lastLetterspacing = letterspacing;
    }

    // Always apply context state for accurate measuring and drawing
    ctx.font = this._cachedFontString;
    ctx.letterSpacing = this._cachedLetterSpacingString;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (direction) ctx.direction = direction;

    // ====================================================================
    // TIER 2: Text Layout Cache (Heavy Auto-Wrap Algorithm)
    // ====================================================================
    let tier2Dirty = false;
    if (tier1Dirty || this._lastText !== text || this._lastWidth !== width) {
      tier2Dirty = true;
      
      const textStr = String(text).replace(/\\n/g, '\n');
      this._lines = [];

      if (width > 0) {
        const paragraphs = textStr.split('\n');
        for (let p = 0; p < paragraphs.length; p++) {
          const words = paragraphs[p].split(' ');
          let currentLine = words[0] || '';
          
          for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            if (ctx.measureText(testLine).width / u > width) {
              this._lines.push(currentLine);
              currentLine = words[i];
            } else {
              currentLine = testLine;
            }
          }
          this._lines.push(currentLine);
        }
      } else {
        this._lines = textStr.split('\n');
      }

      // Cache total character count for flawless reveal percentage math
      this._totalChars = textStr.length;

      this._lastText = text;
      this._lastWidth = width;
    }

    // ====================================================================
    // TIER 3: Bounding Box & Alignment Cache
    // ====================================================================
    if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline || this._lastLineheight !== lineheight || this._lastDirection !== direction) {
      let maxLeft = 0;
      let maxRight = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (let i = 0; i < this._lines.length; i++) {
        const metrics = ctx.measureText(this._lines[i]);
        if (metrics.actualBoundingBoxLeft > maxLeft) maxLeft = metrics.actualBoundingBoxLeft;
        if (metrics.actualBoundingBoxRight > maxRight) maxRight = metrics.actualBoundingBoxRight;
        if (i === 0) maxAscent = metrics.actualBoundingBoxAscent;
        if (i === this._lines.length - 1) maxDescent = metrics.actualBoundingBoxDescent;
      }

      this.boundingBox.left = -maxLeft / u;
      this.boundingBox.right = maxRight / u;

      const totalBlockHeight = Math.max(0, this._lines.length - 1) * (size * lineheight) * u;
      
      let startY = 0;
      if (baseline === 'middle') {
        startY = -totalBlockHeight / 2;
      } else if (baseline === 'bottom' || baseline === 'alphabetic' || baseline === 'ideographic') {
        startY = -totalBlockHeight;
      }

      this.boundingBox.top = (startY - maxAscent) / u;
      this.boundingBox.bottom = (startY + totalBlockHeight + maxDescent) / u;
      this._startY = startY / u;

      this._lastAlign = align;
      this._lastBaseline = baseline;
      this._lastLineheight = lineheight;
      this._lastDirection = direction;
    }

    // ====================================================================
    // RENDER LOOP
    // ====================================================================

    // Typewriter Reveal effect (Always Percentage 0.0 - 1.0)
    let charsRemaining = Infinity;
    if (reveal !== null && reveal >= 0) {
      charsRemaining = Math.floor(reveal * (this._totalChars + 1));
      
      // Fast-path bailout: If text is completely hidden, skip all gradients and loops
      if (charsRemaining <= 0) return;
    }

    const hasFill = fill && fill !== 'none' && fill !== 'transparent';
    const hasStroke = stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;

    if (!hasFill && !hasStroke) return;

    if (hasFill) ctx.fillStyle = this.createGradient(ctx, u, fill, 0);
    if (hasStroke) {
      ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);
      if (strokewidth !== 1) ctx.lineWidth = strokewidth * u;
    }

    // Unified Render Loop
    for (let i = 0; i < this._lines.length; i++) {
      if (charsRemaining <= 0) break;
      
      let lineStr = this._lines[i];
      if (lineStr.length > charsRemaining) {
        lineStr = lineStr.substring(0, charsRemaining);
      }

      const yOffset = this._startY + (i * size * lineheight);
      const pxWidth = maxwidth > 0 ? maxwidth * u : undefined;

      if (hasFill) {
        if (pxWidth) ctx.fillText(lineStr, 0, yOffset * u, pxWidth);
        else ctx.fillText(lineStr, 0, yOffset * u);
      }
      
      if (hasStroke) {
        if (pxWidth) ctx.strokeText(lineStr, 0, yOffset * u, pxWidth);
        else ctx.strokeText(lineStr, 0, yOffset * u);
      }

      charsRemaining -= (this._lines[i].length + 1); // +1 accounts for wrapped space/newline
    }
  }

  getBoundingBox() {
    return this.boundingBox;
  }
}
// Define the custom element tag name
customElements.define('pxl-text', Text);

class Grid extends Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'step', 'major', 'labels', 'labelsize'];
  }

  constructor() {
    super();
    const defaults = { step: 50, major: 0, labels: false, labelsize: 12 };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
  }

  draw(ctx, u, t) {
    const { step, major, labels, labelsize, strokewidth } = this.attributeValues;
    if (!step || step <= 0) return;

    // 1. Invert Global Matrix
    const globalMatrix = this.getGlobalMatrix();
    pxl.Matrix.invert(pxl._scratchMatrixA, globalMatrix);

    // 2. Identify the logical bounds of the Stage/Viewport
    const stageWidth = this.stage ? this.stage.attributeValues.width : 1000;
    const stageHeight = this.stage ? this.stage.attributeValues.height : 1000;

    // 3. Push 4 corners of the viewport through the Inverse Matrix
    let minX, maxX, minY, maxY;
    
    const addPoint = (sx, sy) => {
      const lx = pxl._scratchMatrixA[0] * sx + pxl._scratchMatrixA[2] * sy + pxl._scratchMatrixA[4];
      const ly = pxl._scratchMatrixA[1] * sx + pxl._scratchMatrixA[3] * sy + pxl._scratchMatrixA[5];
      if (minX === undefined) {
        minX = maxX = lx;
        minY = maxY = ly;
      } else {
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
      }
    };

    addPoint(0, 0);
    addPoint(stageWidth, 0);
    addPoint(0, stageHeight);
    addPoint(stageWidth, stageHeight);

    // Update dynamically tracked bounding box for gradients
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;

    // Expand drawing boundaries slightly for safety
    minX -= step; maxX += step;
    minY -= step; maxY += step;

    // Snap to grid
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // 4. Draw Minor Lines
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (major > 0 && Math.round(x / step) % major === 0) continue;
      ctx.moveTo(x * u, startY * u);
      ctx.lineTo(x * u, endY * u);
    }
    for (let y = startY; y <= endY; y += step) {
      if (major > 0 && Math.round(y / step) % major === 0) continue;
      ctx.moveTo(startX * u, y * u);
      ctx.lineTo(endX * u, y * u);
    }
    this.applyStyle(ctx, u);

    // 5. Draw Major Lines
    if (major > 0) {
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        if (Math.round(x / step) % major !== 0) continue;
        ctx.moveTo(x * u, startY * u);
        ctx.lineTo(x * u, endY * u);
      }
      for (let y = startY; y <= endY; y += step) {
        if (Math.round(y / step) % major !== 0) continue;
        ctx.moveTo(startX * u, y * u);
        ctx.lineTo(endX * u, y * u);
      }
      
      const originalLineWidth = ctx.lineWidth;
      ctx.lineWidth = (strokewidth * 2) * u;
      ctx.stroke();
      ctx.lineWidth = originalLineWidth;
    }

    // 6. Draw Intersection Wallpaper Labels
    if (labels && major > 0) {
      const fillAttr = this.attributeValues.fill;
      ctx.fillStyle = (fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent') 
                        ? this.createGradient(ctx, u, fillAttr, 0) 
                        : ctx.strokeStyle;
      ctx.font = `${labelsize * u}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const majorStep = step * major;
      const startX_major = Math.floor(minX / majorStep) * majorStep;
      const endX_major = Math.ceil(maxX / majorStep) * majorStep;
      const startY_major = Math.floor(minY / majorStep) * majorStep;
      const endY_major = Math.ceil(maxY / majorStep) * majorStep;

      for (let x = startX_major; x <= endX_major; x += majorStep) {
        for (let y = startY_major; y <= endY_major; y += majorStep) {
          ctx.fillText(`${x},${y}`, x * u, y * u);
        }
      }
    }
  }

  getBoundingBox() {
    return this.boundingBox;
  }
}

customElements.define('pxl-grid', Grid);

class Variable extends PxlNode {
  static get observedAttributes() { return ['value']; }

  constructor() {
    super();
    Object.assign(this.attributeExpressions, { value: 0 });
    Object.assign(this.attributeValues, this.attributeExpressions);
  }

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);
  }
}
customElements.define('pxl-var', Variable);

