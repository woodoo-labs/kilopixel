/** Kilopixel Framework v0.1.0 */
window.pxl = { version: '0.1.0' };

// =========================================================================
// Generic Utilities
// =========================================================================

// Removes an item by swapping in the last element (order is not kept, no allocation)
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

// Subscribers per ref key: { 'ref.id': [element, …] }
pxl._subscriptions = {};

// Element id → its attributeValues, read by expressions as ref.<id>.<name>
pxl.nodes = {};

pxl.broadcast = function(fullKey) {
  const subs = pxl._subscriptions[fullKey];
  if (subs) {
    // Backwards: a subscriber may unsubscribe itself during the loop
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i].variableChangedCallback(fullKey);
    }
  }
};

pxl.subscribeToVariable = function(fullKey, element) {
  if (!pxl._subscriptions[fullKey]) pxl._subscriptions[fullKey] = [];
  if (!pxl._subscriptions[fullKey].includes(element)) {
    pxl._subscriptions[fullKey].push(element);
  }
};

pxl.unsubscribeFromVariable = function(fullKey, element) {
  const subs = pxl._subscriptions[fullKey];
  if (!subs) return;

  pxl.removeFromArray(subs, element);
  if (subs.length === 0) delete pxl._subscriptions[fullKey]; // keeps the map small for debugging
};

pxl.clearAllVariableSubscriptions = function(element) {
  // Snapshot of the keys: unsubscribing deletes empty keys while we loop
  const trackedKeys = Object.keys(pxl._subscriptions);
  for (let i = 0; i < trackedKeys.length; i++) {
    pxl.unsubscribeFromVariable(trackedKeys[i], element);
  }
};

// =========================================================================
// Attribute Compilation
// =========================================================================

// Attributes that follow the HTML presence rule: a bare attribute (<pxl-polyline closed>) means true
pxl.BOOLEAN_ATTRIBUTES = new Set(['hidden', 'closed', 'smooth', 'pie', 'anticlockwise', 'labels']);

// Resolves a bare ('') or removed (null) attribute: bare boolean = true, bare <pxl-var> value = '',
// otherwise the class default (design/2026-10-17_attribute_defaults_and_state_isolation_plan.md)
pxl.resolveEmptyAttribute = function(element, name, newValue) {
  if (newValue === '') {
    if (pxl.BOOLEAN_ATTRIBUTES.has(name)) return true;
    if (name === 'value') return ''; // only <pxl-var> has a value attribute
  }
  const value = element.constructor.defaults[name];
  return value === undefined ? null : value;
};

pxl.compileAttribute = function(element, name, newValue) {
  const parsed = (newValue === null || newValue === '')
    ? pxl.resolveEmptyAttribute(element, name, newValue)
    : pxl.parseAttributeValue(newValue);
  element.attributeExpressions[name] = parsed;

  // Register shapes whose isHovered / isPressed is read here. Time-dependent expressions never
  // subscribe to ref.*, so their references are sticky (never lazily unregistered).
  pxl.trackInteractiveRefs(newValue, typeof parsed === 'function' && parsed.isTimeDependent === true);

  if (typeof parsed === 'function') {
    if (parsed.isTimeDependent) {
      // Evaluated every frame (evaluateAnimations)
      if (!element.animatedAttributeKeys.includes(name)) element.animatedAttributeKeys.push(name);
      pxl.removeFromArray(element.reactiveAttributeKeys, name);
      pxl.removeFromArray(element.toLocalAttributeKeys, name);
    } else {
      // Evaluated when a ref.* dependency broadcasts. Functions are only compiled for time or refs,
      // so a reactive function always has variableDependencies.
      pxl.removeFromArray(element.animatedAttributeKeys, name);
      if (!element.reactiveAttributeKeys.includes(name)) element.reactiveAttributeKeys.push(name);

      // toLocal results also depend on the element's own space (re-evaluated by broadcastGlobalMatrixChange)
      if (parsed.usesToLocal) {
        if (!element.toLocalAttributeKeys.includes(name)) element.toLocalAttributeKeys.push(name);
      } else {
        pxl.removeFromArray(element.toLocalAttributeKeys, name);
      }

      const deps = parsed.variableDependencies;
      for (let i = 0; i < deps.length; i++) {
        pxl.subscribeToVariable(deps[i], element);
      }

      // Not connected yet: connectedCallback evaluates it
      if (element.isConnected) {
        element.attributeValues[name] = parsed.call(element, 0);
      }
    }
  } else {
    pxl.removeFromArray(element.animatedAttributeKeys, name);
    pxl.removeFromArray(element.reactiveAttributeKeys, name);
    pxl.removeFromArray(element.toLocalAttributeKeys, name);
    element.attributeValues[name] = parsed;
  }
};

// Re-evaluates toLocal() attributes after the element's own space moved (an ancestor's matrix changed).
// Returns a bitmask: 1 = values changed, 2 = matrix dirtied (setLocalMatrixDirty already walked the subtree).
pxl.evaluateToLocalAttributes = function(element) {
  let result = 0;
  const keys = element.toLocalAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const newVal = element.attributeExpressions[key].call(element, 0);
    if (element.attributeValues[key] !== newVal) {
      element.attributeValues[key] = newVal;
      result |= 1;
      if (pxl.isSpatialKey(key)) result |= 2;
    }
  }

  if (result & 2) element.setLocalMatrixDirty();
  if (result & 1) element.parentLayer?.invalidate();
  return result;
};

// Re-evaluates the reactive attributes that depend on varName.
// Returns a bitmask: 1 = varName is still needed, 2 = values changed.
pxl.evaluateAttributesForVariable = function(element, varName) {
  let result = 0;
  let matrixDirtied = false;
  const keys = element.reactiveAttributeKeys;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const fn = element.attributeExpressions[key];

    if (fn.variableDependencies.includes(varName)) {
      result |= 1;
      const newVal = fn.call(element, 0);
      if (element.attributeValues[key] !== newVal) {
        element.attributeValues[key] = newVal;
        result |= 2;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }
  }

  if (matrixDirtied) element.setLocalMatrixDirty();
  return result;
};

pxl.restoreVariableSubscriptions = function(element) {
  const keys = element.reactiveAttributeKeys;
  for (let i = 0; i < keys.length; i++) {
    const deps = element.attributeExpressions[keys[i]].variableDependencies;
    for (let j = 0; j < deps.length; j++) {
      pxl.subscribeToVariable(deps[j], element);
    }
  }
};

// =========================================================================
// pxl.Matrix: 2D affine matrices [a, b, c, d, tx, ty], written into existing arrays
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

// toLocal(ref.target, prop) in expressions (the compiler adds the caller): the target's frame
// in the caller's parent space, the space of the caller's own x / y.
pxl.toLocal = function(caller, targetObj, prop) {
  if (!targetObj) return 0; // ref.<id> of an element that isn't connected yet

  const targetNode = targetObj.$node;
  if (!targetNode.getGlobalMatrix) return 0; // pxl-stage: no frame

  const callerParentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;

  // d = inverse(caller parent global) × target global
  pxl.Matrix.invert(pxl._scratchMatrixA, callerParentGlobal);
  const d = pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetNode.getGlobalMatrix());

  // The target's offset (dx, dy) in the caller's space; the translation d[4], d[5] already includes it
  const { dx, dy } = targetNode.attributeValues;
  const tdx = d[0] * dx + d[2] * dy;
  const tdy = d[1] * dx + d[3] * dy;

  if (prop === 'x')      return d[4] - tdx;
  if (prop === 'y')      return d[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return d[4];
  if (prop === 'ty')     return d[5];
  if (prop === 'rotate') return Math.atan2(d[1], d[0]) * 180 / Math.PI;
  if (prop === 'scale' || prop === 'scalex') return Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  if (prop === 'scaley') return Math.sqrt(d[2] * d[2] + d[3] * d[3]);

  return 0;
};

// =========================================================================
// Expression Scope & Time Drivers
// =========================================================================

// Names available in every expression (created once, passed to each compiled function)
pxl.scope = Object.create(null);

// Math constants and methods, usable in expressions without the Math. prefix.
// Hardcoded whitelist of standard names to prevent polyfill contamination.
for (const prop of [
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2',
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
  'cbrt', 'ceil', 'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor',
  'fround', 'hypot', 'imul', 'log', 'log10', 'log1p', 'log2', 'max',
  'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt',
  'tan', 'tanh', 'trunc'
]) {
  pxl.scope[prop] = Math[prop];
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

// Color stops for all gradient types: ['red', 'blue'] (evenly spaced) or [0, 'red', 1, 'blue']
pxl.parseStops = function(colorsArray) {
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
};

pxl.scope.linear = (direction, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  if (typeof direction === 'number') {
    return { isGradient: true, type: 'linear', angle: direction, stops };
  }
  if (direction) {
    return { isGradient: true, type: 'linear', x1: direction[0], y1: direction[1], x2: direction[2], y2: direction[3], stops };
  }
  return { isGradient: true, type: 'linear', angle: 0, stops };
};

pxl.scope.radial = (config, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
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
  const stops = pxl.parseStops(colorsArray);
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

// Time drivers: source code, injected into every compiled expression (they read its `t`)
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

pxl.timeDriverRegex = new RegExp(`(^|[^.])\\bt\\b|\\b(${Object.keys(pxl.drivers).join('|')})\\s*\\(`);

// =========================================================================
// Expression Compiler
// =========================================================================

// Compiled functions (time-dependent or reactive), shared by every element using the same string
pxl.animationCache = new Map();

// Results of static expressions, evaluated once
pxl.staticCache = new Map();

// Rewrites shared by attribute expressions and on* handlers:
// ref.a.b → ref.a?.b (the referenced element may not be connected yet),
// toLocal( → pxl.toLocal(this, (the caller is the element the code belongs to)
pxl.rewriteExpression = function(str) {
  return str
    .replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.')
    .replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
};

// Turns a non-empty attribute string into a static value (number, boolean, string)
// or a compiled function. Cheap checks run first; most attributes never reach the compiler.
pxl.parseAttributeValue = function(value) {
  const firstChar = value[0];

  // Hex colors: "#ff0000", "#fff"
  if (firstChar === '#') return value;

  // Template literals always compile
  if (firstChar === '`') return pxl.compileExpression(value);

  // Words: "red", "none", "true", "t", "Hello World"
  if ((firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z')) {
    if (/^[a-zA-Z\s]+$/.test(value)) {
      if (value === 't') return pxl.compileExpression(value);
      if (value === 'true') return true;
      if (value === 'false') return false;

      // Math constants: "PI", "E"
      if (Object.prototype.hasOwnProperty.call(pxl.scope, value) && typeof pxl.scope[value] === 'number') {
        return pxl.scope[value];
      }
      return value;
    }

    // Static CSS colors: "rgba(124, 211, 15, 0.8)"
    if (/^(rgb|rgba)\([\d\s.,%]+\)$/i.test(value)) {
      return value;
    }
  }

  // A single quoted string: "'Hello loop(2) World'"
  if ((firstChar === '\'' || firstChar === '"') && value[value.length - 1] === firstChar) {
    if (value.indexOf(firstChar, 1) === value.length - 1) {
      return value.slice(1, -1);
    }
  }

  // Numbers: "100", "-50", "0.25", ".5"
  const num = Number(value);
  if (!Number.isNaN(num)) return num;

  // Anything that looks like math, time, refs or code: "100 * 2", "loop(2)", "ref.a.x"
  if (/(^|[^.])\bt\b|\bref\.|\btoLocal\(|\(|\[|(?:\d\s*[-+*/%<>=!&|]|[-+*/%<>=!&|]\s*\d)|['"`]\s*\+|\+\s*['"`]/.test(value)) {
    return pxl.compileExpression(value);
  }

  return value;
};

pxl.compileExpression = function(str) {
  if (pxl.staticCache.has(str)) return pxl.staticCache.get(str);
  if (pxl.animationCache.has(str)) return pxl.animationCache.get(str);

  try {
    // CSS percentages aren't valid JavaScript: hsl(120, 50%, 40%) → hsl(120, '50%', '40%')
    let source = str;
    if (source.includes('%') && source[0] !== '`') {
      source = source.replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, '\'$1%\'$2');
    }

    const isAnimated = pxl.timeDriverRegex.test(source);
    // toLocal readers are also re-evaluated when their own space moves (design/2026-10-26_tolocal_fix_plan.md)
    const usesToLocal = /\btoLocal\(/.test(source);
    source = pxl.rewriteExpression(source);

    const deps = [];
    const refRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = refRegex.exec(source)) !== null) {
      const fullKey = `ref.${match[1]}`;
      if (!deps.includes(fullKey)) deps.push(fullKey);
    }
    const hasVars = deps.length > 0;

    // A plain expression gets a return; code with its own return statements is used as written
    const code = /\breturn\b/.test(source) ? source : `return ${source};`;

    if (isAnimated || hasVars) {
      // The outer function runs once (destructures the scope); the returned closure runs per evaluation
      const fn = new Function('scope', 'ref', `
        const { ${pxl.scopeKeys} } = scope;
        let t;
        const _d = new Date();
        ${pxl.timeDrivers}
        return function(_t) {
          t = _t;
          ${code}
        };
      `)(pxl.scope, pxl.nodes);

      fn.isTimeDependent = isAnimated;
      if (hasVars) fn.variableDependencies = deps;
      if (usesToLocal) fn.usesToLocal = true;

      pxl.animationCache.set(str, fn);
      return fn;
    }

    // Static: evaluated once
    const result = new Function('scope', `
      const { ${pxl.scopeKeys} } = scope;
      ${code}
    `)(pxl.scope);
    const val = (result !== undefined) ? result : str;
    pxl.staticCache.set(str, val);
    return val;
  } catch (e) {
    pxl.staticCache.set(str, str);
    console.warn(`Failed to compile expression, returned string instead: ${str}`, e);
    return str;
  }
};

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
// Auto-Registration for Interactive States
// (design/2026-10-15_interactive_state_auto_registration_plan.md)
// =========================================================================
pxl.INTERACTIVE_STATES = ['isHovered', 'isPressed'];
pxl._interactiveStateRegex = new RegExp(
  `\\bref\\.([a-zA-Z_$][a-zA-Z0-9_$]*)\\??\\.(${pxl.INTERACTIVE_STATES.join('|')})\\b`, 'g'
);
pxl._interactiveIds = new Set(); // ids whose shapes must be hit-tested
pxl._pressableIds = new Set();   // ids whose isPressed is referenced (hand cursor)
pxl._stickyIds = new Set();      // ids read without a subscription (time-dependent expressions, on* handlers)

// Compile time only: finds ref.<id>.isHovered / isPressed in an attribute string and registers the referenced shape.
pxl.trackInteractiveRefs = function(source, sticky) {
  if (typeof source !== 'string' || source.indexOf('.is') === -1) return;
  const re = pxl._interactiveStateRegex;
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    const id = match[1];
    pxl._interactiveIds.add(id);
    if (match[2] === 'isPressed') pxl._pressableIds.add(id);
    if (sticky) pxl._stickyIds.add(id);
    const node = pxl.nodes[id]?.$node; // already connected? Otherwise Shape.connectedCallback registers it.
    if (node && node.draw && node.stage) node.stage.interaction.registerElement(node);
  }
};

pxl.InteractionEngine = class InteractionEngine {
  constructor(stage) {
    this.stage = stage;
    this._interactiveElements = [];
    this._isOrderDirty = false;
    this._hoveredElements = [];
    this._pressedElement = null;
    this._hitStack = new Array(50);
    this._lastCursor = '';
    this._lastClick = false;
    this._lastDown = false;
    this._lastUp = false;
    this._lastMove = false;
    this._isMouseDirty = false;
  }

  registerElement(el) {
    if (!this._interactiveElements.includes(el)) {
      this._interactiveElements.push(el);
      this._isOrderDirty = true;
    }
  }

  // Lazy unregister, called on leave / release after the state broadcast (subscribers have
  // re-evaluated and dropped stale subscriptions): nobody reads this element's states any more.
  releaseIfUnused(el) {
    if (el.hasEventHandlers() || pxl._stickyIds.has(el.id)) return;
    const subs = el.refKey ? pxl._subscriptions[el.refKey] : null;
    if (!subs || subs.length === 0) this.unregisterElement(el);
  }

  unregisterElement(el) {
    pxl.removeFromArray(this._interactiveElements, el);

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
      if (this.stage.refKey) pxl.broadcast(this.stage.refKey);
      this._isMouseDirty = false;
    }

    const elements = this._interactiveElements;
    const len = elements.length;
    if (len === 0) return;

    if (this._isOrderDirty) {
      elements.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
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

        // Spatial transforms only: alpha, blend, filter and shadows don't affect isPointInPath
        for (let j = stackLen - 1; j >= 0; j--) {
          pxl.applyTransformState(ctx, this.stage.unit, this._hitStack[j].attributeValues);
        }

        pxl._hitResult = false;
        ctx.beginPath();
        // Shapes that can't express their hit area as a path (e.g. text) provide hitTest()
        if (el.hitTest) el.hitTest(ctx, this.stage.unit);
        else el.draw(ctx, this.stage.unit, 0);
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
        if (prevHovered.refKey) pxl.broadcast(prevHovered.refKey);
        if (prevHovered.handlers.leave) prevHovered.handlers.leave();
        pxl.removeFromArray(this._hoveredElements, prevHovered);
        this.releaseIfUnused(prevHovered);
      }
    }

    // Process Enters
    if (hitEl && !this._hoveredElements.includes(hitEl)) {
      this._hoveredElements.push(hitEl);
      hitEl.attributeValues.isHovered = true;
      if (hitEl.refKey) pxl.broadcast(hitEl.refKey);
      if (hitEl.handlers.enter) hitEl.handlers.enter();
    }

    // Update Cursor: hand only for clickable elements (DOM write only on change)
    const cursor = (hitEl && hitEl.isClickable()) ? 'pointer' : 'default';
    if (cursor !== this._lastCursor) {
      this.stage.style.cursor = cursor;
      this._lastCursor = cursor;
    }

    if (hitEl) {
      if (this._lastMove && hitEl.handlers.move) hitEl.handlers.move();
      if (this._lastClick && hitEl.handlers.click) hitEl.handlers.click();

      if (this._lastDown) {
        hitEl.attributeValues.isPressed = true;
        this._pressedElement = hitEl;
        if (hitEl.refKey) pxl.broadcast(hitEl.refKey);
        if (hitEl.handlers.down) hitEl.handlers.down();
      }
    }

    if (this._lastUp) {
      const released = this._pressedElement;
      if (released) {
        released.attributeValues.isPressed = false;
        if (released.refKey) pxl.broadcast(released.refKey);
        this._pressedElement = null;
      }
      if (hitEl && hitEl.handlers.up) hitEl.handlers.up();
      if (released) this.releaseIfUnused(released);
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

// Radial gradient radius: a number is a logical length; a string is the distance from the center (x, y)
// to a side, a perimeter point or a CSS keyword of the bounding box (w × h)
pxl.resolveRadius = function(r, x, y, w, h, u) {
  if (typeof r === 'number') return Math.abs(r * u);

  // Sides: perpendicular distance
  if (r === 'top')    return Math.abs(y * h * u);
  if (r === 'bottom') return Math.abs((1 - y) * h * u);
  if (r === 'left')   return Math.abs(x * w * u);
  if (r === 'right')  return Math.abs((1 - x) * w * u);

  // Perimeter points (corners, edge midpoints): straight distance
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w * u, dy = (y - pxl.anchorY[r]) * h * u;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // CSS keywords
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

// Same order as pxl.Matrix.updateLocal: translate(x, y) → rotate → scale → skew → translate(dx, dy)
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

// Scales the px values written by the filter helpers (blur(5) → 'blur(5px)') by the unit u
pxl.scaleResponsiveFilter = function(filterStr, u) {
  return filterStr.replace(/(-?\d+\.?\d*)px/g, (match, val) => (parseFloat(val) * u) + 'px');
};

pxl.applyContextState = function(ctx, u, attributeValues, node) {
  pxl.applyTransformState(ctx, u, attributeValues);

  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = attributeValues;

  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }

  if (filter !== 'none') {
    ctx.filter = node.resolveFilter(filter, u);
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
// Arc Angles (circle, ellipse)
// =========================================================================

// End angle in radians: sweep (relative to start) wins over end; neither means a full turn
pxl.arcEndRadians = function(startRadians, end, sweep) {
  if (sweep !== null) return startRadians + sweep * Math.PI / 180;
  if (end !== null) return end * Math.PI / 180;
  return startRadians + Math.PI * 2;
};

pxl.isFullTurn = function(startRadians, endRadians) {
  return Math.abs(endRadians - startRadians) >= Math.PI * 2 - 1e-4;
};

// =========================================================================
// Arrowhead Geometry (design/2026-10-14_unified_arrowhead_geometry_plan.md)
// =========================================================================
pxl.ARROW_COS30 = Math.cos(Math.PI / 6); // arrowhead half-angle is 30°
pxl.ARROW_SIN30 = 0.5;
pxl.ARROW_K_DEPTH = 0.6;                 // min shaft depth inside a filled head, as fraction of head length

// Per-arrow-end record, allocated once per shape and reused every frame. All fields start as doubles
// so V8 keeps one stable hidden class for every arrow shape.
pxl.createArrowRecord = function() {
  return { size: NaN, len: NaN, tipAdvance: NaN, inset: NaN, tipX: NaN, tipY: NaN, dirX: NaN, dirY: NaN };
};

// =========================================================================
// Stroke & Line Dash Helpers
// =========================================================================
pxl._emptyDash = [];

// Solid line: null (default), 'none' or 0
pxl.hasLineDash = function(linedash) {
  return !!linedash && linedash !== 'none' && linedash !== '0';
};

// =========================================================================
// Geometry Parsing
// =========================================================================
// Splits "x,y; x,y; …" into coordinate strings [x0, y0, x1, y1, …]. Commas and semicolons
// inside parentheses belong to the expression: min(a, b) stays one coordinate.
pxl.parsePointsIntoArray = function(str, targetArray) {
  targetArray.length = 0;
  let start = 0;
  let depth = 0;
  let currentX = null;
  const input = str + ';'; // the last point ends like all others

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      if (char === ',') {
        currentX = input.substring(start, i).trim();
        start = i + 1;
      } else if (char === ';') {
        const currentY = input.substring(start, i).trim();
        if (currentX !== null && currentX !== '' && currentY !== '') {
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

// Publishes fps, renderAvg and renderMax of every stage once per second (ref.<stageId>.*)
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
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const values = stage.attributeValues;
      values.fps = stage.perfFrames;
      values.renderAvg = (stage.perfFrames > 0 ? stage.perfAccumulated / stage.perfFrames : 0).toFixed(2);
      values.renderMax = stage.perfMax.toFixed(2);
      if (stage.refKey) pxl.broadcast(stage.refKey);

      // Reset counters for the next interval
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;
    }
  }
};

pxl.Stage = class Stage extends HTMLElement {
  static get observedAttributes() { return ['ratio', 'alwaysrender']; }

  // Pointer events handled by the stage's InteractionEngine (its handleEvent)
  static POINTER_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave', 'click'];

  constructor() {
    super();
    this._layers = [];
    this._isOrderDirty = false;
    this._isUpdatePending = false;
    this._isSizePending = true;
    this._isVisible = true;
    this.unit = 0;
    this._dpr = 1;
    this._resizeObserver = null;
    this._intersectionObserver = null;
    this._parsedRatio = 16 / 9;
    this.refKey = null;

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

    this._frameCallback = (t) => {
      this._isUpdatePending = false;
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

    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
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
  }

  disconnectedCallback() {
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = null;
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
    this._isUpdatePending = false;
    this._layers = [];

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

  resize() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w === 0) return;

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

  requestRender() {
    if (!this._isVisible || this._isSizePending || this._isUpdatePending) return;
    this._isUpdatePending = true;
    requestAnimationFrame(this._frameCallback);
  }

  render(t) {
    const start = performance.now();

    if (this._isOrderDirty) {
      this._layers.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
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

pxl.PxlNode = class PxlNode extends HTMLElement {
  // Attribute defaults per class (read-only). Subclasses extend them: { ...Parent.defaults, ... }.
  // Also used to resolve bare / removed attributes (pxl.resolveEmptyAttribute).
  static defaults = {};

  constructor() {
    super();
    this.attributeExpressions = {};
    this.attributeValues = {};
    Object.defineProperty(this.attributeValues, 'set', { value: (k, v) => this.setAttribute(k, v), enumerable: false, writable: false });
    Object.defineProperty(this.attributeValues, '$node', { value: this, enumerable: false, writable: false });
    // Drawn origin in the parent space: dx / dy are applied after rotate / scale / skew, so it's the local matrix translation
    Object.defineProperty(this.attributeValues, 'tx', { get: () => this.getLocalMatrix()[4], enumerable: false });
    Object.defineProperty(this.attributeValues, 'ty', { get: () => this.getLocalMatrix()[5], enumerable: false });
    Object.assign(this.attributeExpressions, this.constructor.defaults);
    Object.assign(this.attributeValues, this.constructor.defaults);

    this.animatedAttributeKeys = [];
    this.reactiveAttributeKeys = [];
    this.toLocalAttributeKeys = []; // reactive keys using toLocal(): also depend on this element's own space
    this.isAnimated = false;

    // Set in connectedCallback
    this.parentLayer = null;
    this.parentContainer = null;
    this.refKey = null;

    // Matrices are recomputed lazily: a version counter per matrix tells children when to recompute theirs
    this._localMatrix = pxl.Matrix.create();
    this._globalMatrix = pxl.Matrix.create();
    this._isLocalMatrixDirty = true;
    this._localMatrixVersion = 0;
    this._lastLocalMatrixVersion = -1;
    this._globalMatrixVersion = 0;
    this._lastParentMatrixVersion = -1;

    // Scaled filter string, cached per (filter, u) by resolveFilter() (layers and shapes)
    this._lastFilterRaw = null;
    this._lastFilterU = 0;
    this._cachedFilterScaled = 'none';
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    pxl.compileAttribute(this, name, newValue);
    this.isAnimated = this.animatedAttributeKeys.length > 0;
    if (pxl.isSpatialKey(name)) {
      this.setLocalMatrixDirty();
    }
    if (this.refKey) pxl.broadcast(this.refKey);
    this.parentLayer?.invalidate();
  }

  connectedCallback() {
    this.parentLayer = this.closest('pxl-layer');
    this.parentContainer = this.parentElement.closest('pxl-group, pxl-layer');
    this._lastParentMatrixVersion = -1; // a new parent's version may equal the old one's
    this.parentContainer?.registerChild(this);
    pxl.restoreVariableSubscriptions(this);

    // Reactive attributes are evaluated now: their refs and toLocal() need the element in the DOM
    const keys = this.reactiveAttributeKeys;
    let matrixDirtied = false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.attributeExpressions[key].call(this, 0);
      if (this.attributeValues[key] !== newVal) {
        this.attributeValues[key] = newVal;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }
    if (matrixDirtied) {
      this.setLocalMatrixDirty();
      this.parentLayer?.invalidate();
    }

    if (this.id) {
      pxl.nodes[this.id] = this.attributeValues;
      this.refKey = `ref.${this.id}`;
      // Broadcast arrival so any elements initialized earlier can successfully re-evaluate
      pxl.broadcast(this.refKey);
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
      if (this.refKey) pxl.broadcast(this.refKey);
      this.parentLayer?.invalidate();
    }
  }

  evaluateAnimations(t) {
    let animatedValuesChanged = false;
    let matrixDirtied = false;
    const keys = this.animatedAttributeKeys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const newVal = this.attributeExpressions[key].call(this, t);
      if (this.attributeValues[key] !== newVal) {
        this.attributeValues[key] = newVal;
        animatedValuesChanged = true;
        if (pxl.isSpatialKey(key)) matrixDirtied = true;
      }
    }

    if (matrixDirtied) this.setLocalMatrixDirty();

    if (this.refKey && animatedValuesChanged && pxl._subscriptions[this.refKey]) {
      pxl.broadcast(this.refKey);
    }

    if (this.isAnimated) this.parentLayer?.invalidate();

    return animatedValuesChanged;
  }

  // Filter string with the helpers' px values scaled by u (layers: CSS filter, shapes: ctx.filter)
  resolveFilter(filter, u) {
    const filterStr = Array.isArray(filter) ? filter.join(' ') : filter;
    if (this._lastFilterRaw !== filterStr || this._lastFilterU !== u) {
      this._lastFilterRaw = filterStr;
      this._lastFilterU = u;
      this._cachedFilterScaled = pxl.scaleResponsiveFilter(filterStr, u);
    }
    return this._cachedFilterScaled;
  }

  // --- Spatial Reactivity ---

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

        // The child's own space moved: its toLocal() results are stale (design/2026-10-26_tolocal_fix_plan.md).
        // If re-evaluating moves the child, setLocalMatrixDirty() has already walked its subtree.
        let walked = false;
        if (child.toLocalAttributeKeys.length > 0) {
          walked = (pxl.evaluateToLocalAttributes(child) & 2) !== 0;
        }

        // Broadcast the child if someone is explicitly tracking its global matrix
        if (child.refKey && subs[child.refKey] && subs[child.refKey].length > 0) {
          pxl.broadcast(child.refKey);
        }

        // Walk on: deeper elements may be tracked or read toLocal() too
        if (!walked) child.broadcastGlobalMatrixChange();
      }
    }
  }

  // --- Lazy Matrices ---

  getLocalMatrix() {
    if (this._isLocalMatrixDirty) {
      const v = this.attributeValues;
      const sX = v.scale !== 1 ? v.scale : v.scalex;
      const sY = v.scale !== 1 ? v.scale : v.scaley;
      pxl.Matrix.updateLocal(this._localMatrix, v.x, v.y, v.dx, v.dy, v.rotate, sX, sY, v.skewx, v.skewy);
      this._isLocalMatrixDirty = false;
      this._localMatrixVersion++;
    }
    return this._localMatrix;
  }

  getGlobalMatrix() {
    const local = this.getLocalMatrix();
    let isDirty = this._lastLocalMatrixVersion !== this._localMatrixVersion;
    this._lastLocalMatrixVersion = this._localMatrixVersion;

    if (this.parentContainer) {
      const parentGlobal = this.parentContainer.getGlobalMatrix(); // updates the parent's version first
      const parentVersion = this.parentContainer._globalMatrixVersion;
      if (this._lastParentMatrixVersion !== parentVersion) {
        this._lastParentMatrixVersion = parentVersion;
        isDirty = true;
      }
      if (isDirty) pxl.Matrix.multiply(this._globalMatrix, parentGlobal, local);
    } else if (isDirty) {
      this._globalMatrix.set(local);
    }

    if (isDirty) this._globalMatrixVersion++;
    return this._globalMatrix;
  }
};


pxl.Layer = class Layer extends pxl.PxlNode {
  static get observedAttributes() {
    return [
      'x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy',
      'alpha', 'blend', 'filter', 'hidden'
    ];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    alpha: 1, blend: 'source-over', filter: 'none', hidden: false
  };

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position

    this.isDirty = true;
    this._isCanvasEmpty = false;
    this.stage = null;
    this._dpr = 1; // set by the stage

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    this._ctx = this._canvas.getContext('2d');

    // Compositing is CSS on the canvas element; only written when it changes
    this._lastAlpha = null;
    this._lastBlend = null;
    this._lastAppliedFilter = 'none';
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';

    if (!this.contains(this._canvas)) this.appendChild(this._canvas);
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
    this._isOrderDirty = true;
    this.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.invalidate();
  }

  // Called by the layer itself and by everything inside it
  invalidate() {
    this.isDirty = true;
    // A hidden layer renders once more to clear its canvas, then stays idle
    if (this.attributeExpressions.hidden && this._isCanvasEmpty) return;
    this.stage?.requestRender();
  }

  // Called by the stage on every resize (also when the window moves to a screen with another pixel ratio).
  // Setting the canvas size resets the context, so the DPR scale is applied again.
  resize(w, h, dpr) {
    this._dpr = dpr;
    this._canvas.width = Math.floor(w * dpr);
    this._canvas.height = Math.floor(h * dpr);
    this._ctx.scale(dpr, dpr);
    this.invalidate();
  }

  render(u, t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    const { alpha, blend, filter, hidden } = this.attributeValues;

    if (this._lastAlpha !== alpha) {
      this._canvas.style.opacity = alpha;
      this._lastAlpha = alpha;
    }

    const cssBlend = blend === 'source-over' ? 'normal' : (blend === 'lighter' ? 'plus-lighter' : blend);
    if (this._lastBlend !== cssBlend) {
      this._canvas.style.mixBlendMode = cssBlend;
      this._lastBlend = cssBlend;
    }

    const filterStr = filter === 'none' ? 'none' : this.resolveFilter(filter, u);
    if (this._lastAppliedFilter !== filterStr) {
      this._canvas.style.filter = filterStr;
      this._lastAppliedFilter = filterStr;
    }

    // CSS-only fast path: only compositing is animated, so the pixels stay the same
    let transformsAnimated = false;
    let compositingAnimated = false;
    for (let i = 0; i < this.animatedAttributeKeys.length; i++) {
      const k = this.animatedAttributeKeys[i];
      if (pxl.isSpatialKey(k)) transformsAnimated = true;
      if (k === 'alpha' || k === 'blend' || k === 'filter') compositingAnimated = true;
    }

    if (compositingAnimated && !transformsAnimated && !this.isDirty) {
      if (this.isAnimated) this.stage.requestRender();
      return;
    }

    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width / this._dpr, this._canvas.height / this._dpr);
    this.isDirty = false;

    if (hidden) {
      this._isCanvasEmpty = true;
      if (this.isAnimated) this.stage.requestRender();
      return;
    }

    this._isCanvasEmpty = false;

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasTransformChanges = x || y || dx || dy || rotate ||
                                scale !== 1 || scalex !== 1 || scaley !== 1 ||
                                skewx || skewy;

    if (hasTransformChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasTransformChanges) ctx.restore();

    // Heartbeat: an animated layer asks for the next frame (without isDirty, so the CSS-only path stays possible)
    if (this.isAnimated) this.stage.requestRender();
  }
};
customElements.define('pxl-layer', pxl.Layer);
pxl.Group = class Group extends pxl.PxlNode {
  static get observedAttributes() {
    return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'hidden'];
  }

  static defaults = { x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, hidden: false };

  constructor() {
    super();
    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position
  }

  registerChild(child) {
    if (!this.childList.includes(child)) {
      this.childList.push(child);
      this._isOrderDirty = true;
      this.parentLayer?.invalidate();
    }
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  // Draws into the parent layer's canvas
  render(ctx, u, t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
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
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasStateChanges) ctx.restore();
  }
};
customElements.define('pxl-group', pxl.Group);

pxl.Shape = class Shape extends pxl.PxlNode {
  static get observedAttributes() {
    return [
      'x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy',
      'fill', 'stroke', 'strokewidth', 'linecap', 'linejoin', 'miterlimit', 'linedash', 'dashoffset',
      'alpha', 'blend', 'mask', 'filter', 'shadowcolor', 'shadowblur', 'shadowx', 'shadowy', 'hidden',
      'onclick', 'onenter', 'onleave', 'ondown', 'onup', 'onmove'
    ];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0,
    fill: null, stroke: null, strokewidth: 1, linecap: 'butt', linejoin: 'miter', miterlimit: 10, linedash: null, dashoffset: 0,
    alpha: 1, blend: 'source-over', mask: 'none', filter: 'none', shadowcolor: null, shadowblur: 0, shadowx: 0, shadowy: 0, hidden: false,
    isHovered: false, isPressed: false
  };

  // Event attribute → its key in this.handlers
  static HANDLER_EVENTS = { onclick: 'click', onenter: 'enter', onleave: 'leave', ondown: 'down', onup: 'up', onmove: 'move' };

  constructor() {
    super();
    this.stage = null; // set in connectedCallback

    // Reused by getBoundingBox() every frame
    this.boundingBox = { left: 0, right: 0, top: 0, bottom: 0 };

    // Gradient cache per slot: [0] = fill, [1] = stroke (createGradient)
    this._gradCache = [
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null },
      { config: null, u: 0, bl: 0, bt: 0, br: 0, bb: 0, grad: null }
    ];

    // Scaled dash pattern, cached per (linedash, u) by applyLineDash()
    this._lastDash = null;
    this._lastDashU = 0;
    this._scaledDash = [];

    // Compiled on* handlers, called by the InteractionEngine
    this.handlers = { click: null, enter: null, leave: null, down: null, up: null, move: null };
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    const event = pxl.Shape.HANDLER_EVENTS[name];
    if (event) {
      // Removed or empty: no handler. Not unregistered here (a handler may remove itself during
      // InteractionEngine.process()); releaseIfUnused() unregisters the shape on its next leave / release.
      let compiled = null;
      if (newValue) {
        // Handlers are plain JavaScript and never subscribe to ref.*, so their state references are sticky
        pxl.trackInteractiveRefs(newValue, true);
        compiled = new Function('scope', 'ref', `
          const { ${pxl.scopeKeys} } = scope;
          return function() {
            ${pxl.rewriteExpression(newValue)}
          };
        `)(pxl.scope, pxl.nodes).bind(this);
      }

      this.handlers[event] = compiled;
      if (compiled) this.stage?.interaction.registerElement(this);
      return;
    }

    super.attributeChangedCallback(name, oldValue, newValue);
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();

    // Register if it has handlers, or if another element reads its isHovered / isPressed
    if (this.hasEventHandlers() || (this.id && pxl._interactiveIds.has(this.id))) {
      this.stage?.interaction.registerElement(this);
    }
  }

  hasEventHandlers() {
    const h = this.handlers;
    return !!(h.click || h.enter || h.leave || h.down || h.up || h.move);
  }

  // Hand cursor only for elements that react to clicks or presses
  isClickable() {
    const h = this.handlers;
    return !!(h.click || h.down || h.up) || (!!this.id && pxl._pressableIds.has(this.id));
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

    // save / restore only when the shape changes the context state
    if (hasStateChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues, this);
      this.draw(ctx, u, t);
      ctx.restore();
    } else {
      this.draw(ctx, u, t);
    }
  }

  // Custom shapes override this (gradients are sized to it); without it, gradients collapse to a point
  getBoundingBox() {
    console.warn(`[pxl] Warning: Subclass ${this.constructor.name} does not implement getBoundingBox(). Fallback to zeroed bounding box.`);
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

    // Reuse while the descriptor, the unit and the bounding box are unchanged
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

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = (box.left + width * styleValue.cx) * u;
      const gcy = (box.top + height * styleValue.cy) * u;
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
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

  // Sets all stroke-related context state (style, width, caps, joins, dash).
  // Shared by path-based shapes (via applyStyle) and non-path shapes like Text (strokeText).
  applyStrokeState(ctx, u) {
    const { stroke, strokewidth, linecap, linejoin, miterlimit } = this.attributeValues;

    ctx.strokeStyle = this.createGradient(ctx, u, stroke, 1);

    ctx.lineWidth = strokewidth * u;
    ctx.lineCap = linecap;
    ctx.lineJoin = linejoin;
    ctx.miterLimit = miterlimit;

    this.applyLineDash(ctx, u);
  }

  // Dash pattern scaled by u; the scaled array is cached per (linedash, u)
  applyLineDash(ctx, u) {
    const { linedash, dashoffset } = this.attributeValues;
    if (!pxl.hasLineDash(linedash)) {
      ctx.setLineDash(pxl._emptyDash);
      ctx.lineDashOffset = 0;
      return;
    }

    if (this._lastDash !== linedash || this._lastDashU !== u) {
      this._lastDash = linedash;
      this._lastDashU = u;

      const scaled = this._scaledDash;
      if (typeof linedash === 'number') {
        scaled.length = 1;
        scaled[0] = linedash * u;
      } else if (Array.isArray(linedash)) {
        scaled.length = linedash.length;
        for (let i = 0; i < linedash.length; i++) {
          scaled[i] = linedash[i] * u;
        }
      }
    }

    ctx.setLineDash(this._scaledDash);
    ctx.lineDashOffset = dashoffset * u;
  }

  hasFill() {
    const { fill } = this.attributeValues;
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  isStroked() {
    const { stroke, strokewidth } = this.attributeValues;
    return !!stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;
  }

  applyStyle(ctx, u) {
    if (this.hasFill()) {
      ctx.fillStyle = this.createGradient(ctx, u, this.attributeValues.fill, 0);
      ctx.fill();
    }

    if (this.isStroked()) {
      this.applyStrokeState(ctx, u);
      ctx.stroke();
    }
  }

  // --- Arrowheads ---
  // Geometry: design/2026-10-14_unified_arrowhead_geometry_plan.md
  // All distances are in context units (logical value × u).

  // Resolves one arrow end into distances along the path and writes them into the pre-allocated rec.
  // Returns true if this end has an arrowhead.
  resolveArrow(rec, attrValue, u) {
    const { strokewidth, linecap, linejoin, arrowstyle } = this.attributeValues;
    const size = (attrValue === 'auto' ? strokewidth * 3.6 : attrValue) * u;

    if (!(size > 0)) {
      rec.size = 0;
      return false;
    }

    const sw = strokewidth * u;
    const len = size * pxl.ARROW_COS30;
    const capExt = (linecap === 'butt') ? 0 : sw * 0.5;

    rec.size = size;
    rec.len = len;

    if (arrowstyle === 'line') {
      // How far the stroked chevron corner reaches beyond its path vertex.
      // Miter tips are always sharp: drawArrows lifts a low miterlimit for the chevron.
      const joinExt = (linejoin === 'round') ? sw * 0.5
                    : (linejoin === 'bevel') ? sw * 0.25
                    : sw;
      rec.tipAdvance = capExt - joinExt;
      rec.inset = joinExt;
    } else {
      // Shallowest depth (behind the tip) at which the shaft's visible end fits inside the 30° wedge.
      const minDepth = (linecap === 'butt') ? sw * pxl.ARROW_COS30
                     : (linecap === 'square') ? sw * (pxl.ARROW_COS30 + 0.5)
                     : sw;
      // Heads narrower than the stroke clamp to the base line: continuous in size and strokewidth.
      const depth = Math.min(Math.max(minDepth, pxl.ARROW_K_DEPTH * len), len + capExt);
      rec.tipAdvance = capExt;
      rec.inset = depth - capExt;
    }
    return true;
  }

  // Points rec away from the path end (px, py) along the vector (vx, vy) and places the tip.
  // Returns the length of (vx, vy).
  aimArrow(rec, px, py, vx, vy) {
    const length = Math.sqrt(vx * vx + vy * vy);
    rec.dirX = (length > 0) ? vx / length : 1;
    rec.dirY = (length > 0) ? vy / length : 0;
    rec.tipX = px + rec.dirX * rec.tipAdvance;
    rec.tipY = py + rec.dirY * rec.tipAdvance;
    return length;
  }

  // Draws both arrowheads in one path. Expects stroke state to be applied already.
  drawArrows(ctx, u, recA, recB) {
    const isLine = this.attributeValues.arrowstyle === 'line';

    ctx.beginPath();
    if (recA.size > 0) this.traceArrow(ctx, recA, isLine);
    if (recB.size > 0) this.traceArrow(ctx, recB, isLine);

    if (isLine) {
      // A 60° miter needs a limit of 2 (1 / sin 30°); a lower path miterlimit must not blunt the tip.
      // 4 leaves headroom for float rounding. Not restored: stroke state is always set before stroking.
      if (ctx.miterLimit < 4) ctx.miterLimit = 4;

      // Chevrons are always solid
      const hasDash = pxl.hasLineDash(this.attributeValues.linedash);
      if (hasDash) ctx.setLineDash(pxl._emptyDash);
      ctx.stroke();
      if (hasDash) this.applyLineDash(ctx, u);
    } else {
      const originalFill = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.fillStyle = originalFill;
    }
  }

  traceArrow(ctx, rec, isLine) {
    const { size, tipX, tipY, dirX, dirY } = rec;
    // Wings: direction rotated by ±30°, pointing back from the tip
    const cx = size * dirX * pxl.ARROW_COS30, cy = size * dirY * pxl.ARROW_COS30;
    const sx = size * dirX * pxl.ARROW_SIN30, sy = size * dirY * pxl.ARROW_SIN30;
    const wing1X = tipX - cx - sy, wing1Y = tipY - cy + sx;
    const wing2X = tipX - cx + sy, wing2Y = tipY - cy - sx;

    if (isLine) {
      ctx.moveTo(wing1X, wing1Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(wing2X, wing2Y);
    } else {
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(wing1X, wing1Y);
      ctx.lineTo(wing2X, wing2Y);
      ctx.closePath();
    }
  }
};
pxl.Circle = class Circle extends pxl.Shape {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'r', 'ir', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise',
      'arrowstart', 'arrowend', 'arrowstyle'
    ];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    r: 0, ir: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false,
    arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { r, ir, start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.attributeValues;

    const safeR = Math.max(0, r);
    const safeIR = Math.max(0, ir);

    if (safeR === 0 && safeIR === 0) return;

    const isPie = pie === true;
    const isAnti = anticlockwise === true;
    const isClosed = closed === true;

    const startRadians = start * Math.PI / 180;
    const endRadians = pxl.arcEndRadians(startRadians, end, sweep);
    const isFull = pxl.isFullTurn(startRadians, endRadians);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // Arrowheads (open arcs only)
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = safeR > 0 && safeIR === 0 && !isPie && !isClosed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const radius = safeR * u;
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimArcArrow(arrowStart, radius, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimArcArrow(arrowEnd, radius, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    if (drawShaft) {
      ctx.beginPath();
      ctx.arc(0, 0, safeR * u, drawStartRadians, drawEndRadians, isAnti);

      if (safeIR > 0) {
        if (isFull) {
          ctx.moveTo((safeIR * u) * Math.cos(drawEndRadians), (safeIR * u) * Math.sin(drawEndRadians));
        }
        ctx.arc(0, 0, safeIR * u, drawEndRadians, drawStartRadians, !isAnti);
        ctx.closePath();
      } else if (isPie && !isFull) {
        ctx.lineTo(0, 0);
        ctx.closePath();
      } else if ((isFull && !hasArrows) || isClosed) {
        ctx.closePath();
      }

      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasArrows) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Aims an arrow at the arc end at angle `radians`; `inward` (±1) is the angle direction into the arc.
  // Direction is the chord from the arc point one head length in, back to the end, so the head's
  // base sits on the arc. Returns the inset as an angle (straight distance from the end, like all arrowheads).
  aimArcArrow(rec, radius, radians, inward) {
    const px = radius * Math.cos(radians), py = radius * Math.sin(radians);
    const baseRadians = radians + inward * 2 * Math.asin(Math.min(rec.len, 2 * radius) / (2 * radius));
    this.aimArrow(rec, px, py, px - radius * Math.cos(baseRadians), py - radius * Math.sin(baseRadians));
    return 2 * Math.asin(Math.min(rec.inset, 2 * radius) / (2 * radius));
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
};
customElements.define('pxl-circle', pxl.Circle);

pxl.Ellipse = class Ellipse extends pxl.Shape {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'rx', 'ry', 'irx', 'iry', 'start', 'end', 'sweep', 'pie', 'closed', 'anticlockwise',
      'arrowstart', 'arrowend', 'arrowstyle'
    ];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    rx: 0, ry: 0, irx: 0, iry: 0, start: 0, end: null, sweep: null, pie: false, closed: false, anticlockwise: false,
    arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { rx, ry, irx, iry, start, end, sweep, pie, closed, anticlockwise, arrowstart, arrowend } = this.attributeValues;

    const safeRX = Math.max(0, rx);
    const safeRY = Math.max(0, ry);
    const safeIRX = Math.max(0, irx);
    const safeIRY = Math.max(0, iry);

    if (safeRX === 0 && safeRY === 0 && safeIRX === 0 && safeIRY === 0) return;

    const isPie = pie === true;
    const isClosed = closed === true;
    const isAnti = anticlockwise === true;
    const hasInner = safeIRX > 0 || safeIRY > 0;

    const startRadians = start * Math.PI / 180;
    const endRadians = pxl.arcEndRadians(startRadians, end, sweep);
    const isFull = pxl.isFullTurn(startRadians, endRadians);

    let drawStartRadians = startRadians;
    let drawEndRadians = endRadians;

    // Arrowheads (open arcs only)
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = safeRX > 0 && safeRY > 0 && !hasInner && !isPie && !isClosed && this.isStroked();
    const hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);
    const hasArrows = hasStart || hasEnd;
    let drawShaft = true;

    if (hasArrows) {
      const radiusX = safeRX * u, radiusY = safeRY * u;
      const travel = isAnti ? -1 : 1; // direction of increasing arc position
      let startInsetRadians = 0, endInsetRadians = 0;

      if (hasStart) {
        startInsetRadians = this.aimEllipseArrow(arrowStart, radiusX, radiusY, startRadians, travel);
      }
      if (hasEnd) {
        endInsetRadians = this.aimEllipseArrow(arrowEnd, radiusX, radiusY, endRadians, -travel);
      }

      // Skip the arc if both insets would cross each other
      drawShaft = startInsetRadians + endInsetRadians < Math.abs(endRadians - startRadians);
      drawStartRadians += travel * startInsetRadians;
      drawEndRadians -= travel * endInsetRadians;
    }

    if (drawShaft) {
      ctx.beginPath();
      ctx.ellipse(0, 0, safeRX * u, safeRY * u, 0, drawStartRadians, drawEndRadians, isAnti);

      if (hasInner) {
        if (isFull) {
          ctx.moveTo((safeIRX * u) * Math.cos(drawEndRadians), (safeIRY * u) * Math.sin(drawEndRadians));
        }
        ctx.ellipse(0, 0, safeIRX * u, safeIRY * u, 0, drawEndRadians, drawStartRadians, !isAnti);
        ctx.closePath();
      } else if (isPie && !isFull) {
        ctx.lineTo(0, 0);
        ctx.closePath();
      } else if ((isFull && !hasArrows) || isClosed) {
        ctx.closePath();
      }

      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasArrows) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Aims an arrow at the arc end at parameter `radians`; `inward` (±1) is the parameter direction into the arc.
  // Direction is the chord from the curve point one head length in, back to the end. Returns the inset as a parameter offset.
  aimEllipseArrow(rec, radiusX, radiusY, radians, inward) {
    const px = radiusX * Math.cos(radians), py = radiusY * Math.sin(radians);
    const baseRadians = radians + inward * this.parameterOffset(radiusX, radiusY, radians, inward, rec.len);
    this.aimArrow(rec, px, py, px - radiusX * Math.cos(baseRadians), py - radiusY * Math.sin(baseRadians));
    return this.parameterOffset(radiusX, radiusY, radians, inward, rec.inset);
  }

  // Parameter offset (towards `inward`) where the arc is `distance` away from `radians` in a straight line.
  // Bisection: a local estimate fails at the tip of thin ellipses, where the curve turns fast.
  parameterOffset(radiusX, radiusY, radians, inward, distance) {
    const cos = Math.cos(radians), sin = Math.sin(radians);
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, target = radians + inward * mid;
      const x = radiusX * (Math.cos(target) - cos), y = radiusY * (Math.sin(target) - sin);
      if (x * x + y * y > distance * distance) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  getBoundingBox() {
    const { rx, ry } = this.attributeValues;
    this.boundingBox.left = -rx;
    this.boundingBox.right = rx;
    this.boundingBox.top = -ry;
    this.boundingBox.bottom = ry;
    return this.boundingBox;
  }
};
customElements.define('pxl-ellipse', pxl.Ellipse);

pxl.Rect = class Rect extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'w', 'h', 'r', 'r1', 'r2', 'r3', 'r4', 'anchor']; }

  static defaults = { ...pxl.Shape.defaults, w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };

  constructor() {
    super();
    this._radii = [0, 0, 0, 0]; // reused by roundRect() every frame
  }

  draw(ctx, u, t) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.attributeValues;

    const startX = -w * pxl.anchorX[anchor] * u;
    const startY = -h * pxl.anchorY[anchor] * u;

    // r is the radius of every corner that has no r1 … r4 of its own
    const baseR = r ?? 0;
    const rad1 = r1 ?? baseR;
    const rad2 = r2 ?? baseR;
    const rad3 = r3 ?? baseR;
    const rad4 = r4 ?? baseR;

    ctx.beginPath();
    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      this._radii[0] = rad1 * u;
      this._radii[1] = rad2 * u;
      this._radii[2] = rad3 * u;
      this._radii[3] = rad4 * u;
      ctx.roundRect(startX, startY, w * u, h * u, this._radii);
    } else {
      ctx.rect(startX, startY, w * u, h * u);
    }
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { w, h, anchor } = this.attributeValues;
    const ax = pxl.anchorX[anchor];
    const ay = pxl.anchorY[anchor];

    this.boundingBox.left = -w * ax;
    this.boundingBox.right = w * (1 - ax);
    this.boundingBox.top = -h * ay;
    this.boundingBox.bottom = h * (1 - ay);
    return this.boundingBox;
  }
};
customElements.define('pxl-rect', pxl.Rect);

pxl.Line = class Line extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2', 'arrowstart', 'arrowend', 'arrowstyle']; }

  static defaults = { ...pxl.Shape.defaults, x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  constructor() {
    super();
    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();
  }

  draw(ctx, u, t) {
    const { x1, y1, x2, y2, arrowstart, arrowend } = this.attributeValues;
    const startX = x1 * u, startY = y1 * u;
    const endX = x2 * u, endY = y2 * u;

    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const isStroked = this.isStroked();
    const hasStart = isStroked && this.resolveArrow(arrowStart, arrowstart, u);
    const hasEnd = isStroked && this.resolveArrow(arrowEnd, arrowend, u);

    if (!hasStart && !hasEnd) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      this.applyStyle(ctx, u);
      return;
    }

    let length = 0;
    if (hasStart) length = this.aimArrow(arrowStart, startX, startY, startX - endX, startY - endY);
    if (hasEnd)   length = this.aimArrow(arrowEnd, endX, endY, endX - startX, endY - startY);

    const startInset = hasStart ? arrowStart.inset : 0;
    const endInset = hasEnd ? arrowEnd.inset : 0;

    // Shaft is trimmed along the line; skipped if both insets would cross each other
    if (startInset + endInset < length) {
      const dirX = (endX - startX) / length, dirY = (endY - startY) / length;
      ctx.beginPath();
      ctx.moveTo(startX + dirX * startInset, startY + dirY * startInset);
      ctx.lineTo(endX - dirX * endInset, endY - dirY * endInset);
      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  getBoundingBox() {
    const { x1, y1, x2, y2 } = this.attributeValues;
    this.boundingBox.left = Math.min(x1, x2);
    this.boundingBox.right = Math.max(x1, x2);
    this.boundingBox.top = Math.min(y1, y2);
    this.boundingBox.bottom = Math.max(y1, y2);
    return this.boundingBox;
  }
};
customElements.define('pxl-line', pxl.Line);

pxl.Polyline = class Polyline extends pxl.Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'points', 'closed', 'smooth', 'mode', 'arrowstart', 'arrowend', 'arrowstyle'];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    closed: false, smooth: false, mode: 'absolute', arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
  };

  constructor() {
    super();
    this._pointCount = 0;
    this._rawParts = []; // parser output, reused

    // Each coordinate is its own attribute p0, p1, … (keys built once per points change);
    // draw() copies their values, scaled by u, into flatCache
    this._flatCache = new Float32Array(0);
    this._pointKeys = [];

    this._arrowStart = pxl.createArrowRecord();
    this._arrowEnd = pxl.createArrowRecord();

    // Reused buffers for trimming the first / last spline segment
    this._segment = new Float64Array(8);  // p1, cp1, cp2, p2
    this._split = new Float64Array(10);   // q0, r0, s, r1, q2
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'points') {
      if (oldValue === newValue) return;

      // Removed (null) or bare (''): no points
      pxl.parsePointsIntoArray(newValue ?? '', this._rawParts);
      const count = this._rawParts.length;
      this.clearPoints(count);
      this._pointCount = count;

      this._flatCache = new Float32Array(this._pointCount);
      this._pointKeys.length = this._pointCount;

      for (let i = 0; i < this._pointCount; i++) {
        const key = `p${i}`;
        this._pointKeys[i] = key;
        pxl.compileAttribute(this, key, this._rawParts[i]);
      }

      this.isAnimated = this.animatedAttributeKeys.length > 0;
      // Readers of ref.<id>.pN update like for any other attribute
      if (this.refKey) pxl.broadcast(this.refKey);
      this.parentLayer?.invalidate();
    } else {
      super.attributeChangedCallback(name, oldValue, newValue);
    }
  }

  // Keys below keepCount keep their value until recompiled: animated coordinates are only evaluated
  // in the next frame, so ref.<id>.pN readers would otherwise see undefined in between.
  clearPoints(keepCount) {
    for (let i = 0; i < this._pointCount; i++) {
      const key = this._pointKeys[i];
      pxl.removeFromArray(this.animatedAttributeKeys, key);
      pxl.removeFromArray(this.reactiveAttributeKeys, key);
      pxl.removeFromArray(this.toLocalAttributeKeys, key);
      if (i >= keepCount) {
        delete this.attributeExpressions[key];
        delete this.attributeValues[key];
      }
    }
    this._pointCount = 0;
  }

  draw(ctx, u, t) {
    if (this._pointCount < 4) return;

    const { smooth, arrowstart, arrowend } = this.attributeValues;
    const closed = this.attributeValues.closed === true;
    const pts = this._flatCache;
    const len = this._pointCount / 2;

    for (let i = 0; i < this._pointCount; i++) {
      pts[i] = this.attributeValues[this._pointKeys[i]] * u;
    }

    if (this.attributeValues.mode === 'relative') {
      for (let i = 2; i < this._pointCount; i++) {
        pts[i] += pts[i - 2];
      }
    }

    // Arrowheads only apply to open strokes
    const arrowStart = this._arrowStart, arrowEnd = this._arrowEnd;
    const canHaveArrows = !closed && this.isStroked();
    let hasStart = canHaveArrows && this.resolveArrow(arrowStart, arrowstart, u);
    let hasEnd = canHaveArrows && this.resolveArrow(arrowEnd, arrowend, u);

    // Arrows sit on the first / last point with a distinct neighbour: zero-length end segments are skipped
    let first = 0, last = len - 1;
    if (hasStart || hasEnd) {
      while (first < last && this.isSamePoint(first, first + 1)) first++;
      while (last > first && this.isSamePoint(last, last - 1)) last--;
      if (first === last) {
        hasStart = hasEnd = false;
        first = 0;
        last = len - 1;
      }
    }

    // A smooth curve through only 2 points (with free ends) is a straight line
    const isSmooth = smooth !== false && smooth !== null && last - first > 1;

    if (isSmooth) {
      const k3 = (typeof smooth === 'number' ? smooth : 1) / 3;
      this.traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last);
      this.applyStyle(ctx, u);
    } else if (this.traceStraight(ctx, closed, hasStart, hasEnd, first, last)) {
      this.applyStyle(ctx, u);
    } else {
      this.applyStrokeState(ctx, u);
    }

    if (hasStart || hasEnd) this.drawArrows(ctx, u, arrowStart, arrowEnd);
  }

  // Draws points first..last. Returns false if the shaft is skipped (single segment shorter than both arrow insets).
  traceStraight(ctx, closed, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const f = first * 2, l = last * 2;
    let startX = pts[f], startY = pts[f + 1];
    let endX = pts[l], endY = pts[l + 1];

    // flatCache is never mutated: only the drawn end points are trimmed, each within its own segment
    let startInset = 0, endInset = 0, firstLength = 0;
    if (hasStart) {
      const a = this._arrowStart;
      firstLength = this.aimArrow(a, startX, startY, startX - pts[f + 2], startY - pts[f + 3]);
      startInset = Math.min(a.inset, firstLength);
      startX -= a.dirX * startInset;
      startY -= a.dirY * startInset;
    }
    if (hasEnd) {
      const b = this._arrowEnd;
      const lastLength = this.aimArrow(b, endX, endY, endX - pts[l - 2], endY - pts[l - 1]);
      endInset = Math.min(b.inset, lastLength);
      endX -= b.dirX * endInset;
      endY -= b.dirY * endInset;
    }
    if (last - first === 1 && hasStart && hasEnd && startInset + endInset >= firstLength) return false;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = f + 2; i < l; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineTo(endX, endY);
    if (closed) ctx.closePath();
    return true;
  }

  // Centripetal Catmull-Rom through points first..last (design/2026-10-23_smooth_polyline_spline_plan.md).
  // `k3` is smooth / 3. Arrows imply an open path with >= 2 segments between first and last.
  traceSmooth(ctx, len, closed, k3, hasStart, hasEnd, first, last) {
    const pts = this._flatCache;
    const segment = this._segment, split = this._split;

    let from = first;
    const to = closed ? len : last;     // segments from..to-1

    ctx.beginPath();

    // First segment, trimmed from the front
    if (hasStart) {
      const a = this._arrowStart;
      this.loadSegment(from, len, closed, k3);
      // Direction: chord from the curve point one head length in, back to the start
      this.splitSegment(this.trimParameter(a.len, false));
      this.aimArrow(a, segment[0], segment[1], segment[0] - split[4], segment[1] - split[5]);
      this.splitSegment(this.trimParameter(a.inset, false));
      ctx.moveTo(split[4], split[5]);
      ctx.bezierCurveTo(split[6], split[7], split[8], split[9], segment[6], segment[7]);
      from++;
    } else {
      ctx.moveTo(pts[first * 2], pts[first * 2 + 1]);
    }

    // Hot loop: the same segment loader as the arrow trimming, so both always agree
    const end = hasEnd ? to - 1 : to;
    for (let i = from; i < end; i++) {
      this.loadSegment(i, len, closed, k3);
      ctx.bezierCurveTo(segment[2], segment[3], segment[4], segment[5], segment[6], segment[7]);
    }

    // Last segment, trimmed from the back
    if (hasEnd) {
      const b = this._arrowEnd;
      this.loadSegment(to - 1, len, closed, k3);
      this.splitSegment(this.trimParameter(b.len, true));
      this.aimArrow(b, segment[6], segment[7], segment[6] - split[4], segment[7] - split[5]);
      this.splitSegment(this.trimParameter(b.inset, true));
      ctx.bezierCurveTo(split[0], split[1], split[2], split[3], split[4], split[5]);
    }

    if (closed) ctx.closePath();
  }

  // Loads segment i (point A = i to point B = i + 1) as a cubic Bézier into this._segment.
  // Centripetal handles (D3 curveCatmullRom), scaled by k3 = smooth / 3. On a closed path neighbours wrap around;
  // on an open path a missing neighbour (free end) counts as a zero-length side: no handle.
  loadSegment(i, len, closed, k3) {
    const pts = this._flatCache, segment = this._segment;
    const a = i, b = closed ? (i + 1) % len : i + 1;
    const p = closed ? (a - 1 + len) % len : a - 1;   // neighbour before A
    const q = closed ? (b + 1) % len : b + 1;         // neighbour after B

    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const abx = bx - ax, aby = by - ay;
    const dAB = Math.sqrt(abx * abx + aby * aby), rAB = Math.sqrt(dAB);

    let pax = 0, pay = 0, dPA = 0, bqx = 0, bqy = 0, dBQ = 0;
    if (p >= 0) {
      pax = ax - pts[p * 2]; pay = ay - pts[p * 2 + 1];
      dPA = Math.sqrt(pax * pax + pay * pay);
    }
    if (q < len) {
      bqx = pts[q * 2] - bx; bqy = pts[q * 2 + 1] - by;
      dBQ = Math.sqrt(bqx * bqx + bqy * bqy);
    }
    const rPA = Math.sqrt(dPA), rBQ = Math.sqrt(dBQ);

    // Tangent at A: dPA·AB + dAB·PA; at B: dAB·BQ + dBQ·AB. A zero-length side gets no handle (corner, free end).
    const fa = rPA > 1e-6 ? k3 / (rPA * (rPA + rAB)) : 0;
    const fb = rBQ > 1e-6 ? k3 / (rBQ * (rAB + rBQ)) : 0;

    segment[0] = ax;
    segment[1] = ay;
    segment[2] = ax + (dPA * abx + dAB * pax) * fa;
    segment[3] = ay + (dPA * aby + dAB * pay) * fa;
    segment[4] = bx - (dAB * bqx + dBQ * abx) * fb;
    segment[5] = by - (dAB * bqy + dBQ * aby) * fb;
    segment[6] = bx;
    segment[7] = by;
  }

  // Curve parameter on this._segment where the curve is `dist` away from its start (or end) in a straight line,
  // like all arrowhead trims. Bisection: free ends leave the end point slowly, so a chord estimate trims too little.
  trimParameter(dist, fromEnd) {
    const g = this._segment;
    const ex = fromEnd ? g[6] : g[0], ey = fromEnd ? g[7] : g[1];
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      const x = a * g[0] + b * g[2] + c * g[4] + e * g[6] - ex;
      const y = a * g[1] + b * g[3] + c * g[5] + e * g[7] - ey;
      if ((x * x + y * y > dist * dist) === fromEnd) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }

  // Points closer than 0.01 px count as the same (zero-length end segments for arrows)
  isSamePoint(i, j) {
    const pts = this._flatCache;
    return Math.abs(pts[i * 2] - pts[j * 2]) < 0.01 && Math.abs(pts[i * 2 + 1] - pts[j * 2 + 1]) < 0.01;
  }

  // de Casteljau split of this._segment at t. Left part: p1, q0, r0, s. Right part: s, r1, q2, p2.
  splitSegment(t) {
    const g = this._segment, out = this._split;
    const q0x = g[0] + (g[2] - g[0]) * t, q0y = g[1] + (g[3] - g[1]) * t;
    const q1x = g[2] + (g[4] - g[2]) * t, q1y = g[3] + (g[5] - g[3]) * t;
    const q2x = g[4] + (g[6] - g[4]) * t, q2y = g[5] + (g[7] - g[5]) * t;
    const r0x = q0x + (q1x - q0x) * t,    r0y = q0y + (q1y - q0y) * t;
    const r1x = q1x + (q2x - q1x) * t,    r1y = q1y + (q2y - q1y) * t;

    out[0] = q0x; out[1] = q0y;
    out[2] = r0x; out[3] = r0y;
    out[4] = r0x + (r1x - r0x) * t;
    out[5] = r0y + (r1y - r0y) * t;
    out[6] = r1x; out[7] = r1y;
    out[8] = q2x; out[9] = q2y;
  }

  getBoundingBox() {
    if (this._pointCount < 4) {
      this.boundingBox.left = 0;
      this.boundingBox.right = 0;
      this.boundingBox.top = 0;
      this.boundingBox.bottom = 0;
      return this.boundingBox;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let currentX = 0, currentY = 0;
    const isRelative = this.attributeValues.mode === 'relative';

    for (let i = 0; i < this._pointCount; i += 2) {
      const px = this.attributeValues[this._pointKeys[i]];
      const py = this.attributeValues[this._pointKeys[i + 1]];

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
};
customElements.define('pxl-polyline', pxl.Polyline);

pxl.Text = class Text extends pxl.Shape {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'text', 'size', 'font', 'align', 'baseline', 'weight', 'fontstyle', 'maxwidth',
      'direction', 'width', 'lineheight', 'letterspacing', 'reveal'
    ];
  }

  static defaults = {
    ...pxl.Shape.defaults,
    text: '', size: 16, font: 'sans-serif', align: 'start',
    baseline: 'alphabetic', weight: 'normal', fontstyle: 'normal',
    maxwidth: 0, direction: null, width: 0, lineheight: 1.2,
    letterspacing: 0, reveal: null
  };

  constructor() {
    super();
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
    this._startY = 0;
    this._hasInk = false; // true only if the last draw() painted something (used by hitTest)
  }

  // Three caches, each rebuilt only when its inputs change: font string → line layout → bounding box
  draw(ctx, u, t) {
    const {
      text, size, font, align, baseline, weight, fontstyle, maxwidth,
      direction, width, lineheight, letterspacing, reveal
    } = this.attributeValues;

    this._hasInk = false;

    // null / undefined: a ref that isn't connected yet
    if (text === null || text === undefined || text === '') return;

    // --- 1. Font string ---
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

    // Context state is set every time: measuring and drawing both depend on it
    ctx.font = this._cachedFontString;
    ctx.letterSpacing = this._cachedLetterSpacingString;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.direction = direction || 'inherit';

    // --- 2. Line layout (word wrap when width > 0) ---
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

      // reveal counts characters of the whole text
      this._totalChars = textStr.length;

      this._lastText = text;
      this._lastWidth = width;
    }

    // --- 3. Bounding box and first baseline ---
    if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline ||
        this._lastLineheight !== lineheight || this._lastDirection !== direction) {
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

    // --- Drawing ---

    // Typewriter reveal: 0 = nothing, 1 = everything
    let charsRemaining = Infinity;
    if (reveal !== null && reveal >= 0) {
      charsRemaining = Math.floor(reveal * (this._totalChars + 1));
      if (charsRemaining <= 0) return;
    }

    const hasFill = this.hasFill();
    const hasStroke = this.isStroked();
    if (!hasFill && !hasStroke) return;

    if (hasFill) ctx.fillStyle = this.createGradient(ctx, u, this.attributeValues.fill, 0);
    if (hasStroke) this.applyStrokeState(ctx, u);

    this._hasInk = true;

    const pxWidth = maxwidth > 0 ? maxwidth * u : undefined;
    for (let i = 0; i < this._lines.length; i++) {
      if (charsRemaining <= 0) break;

      let lineStr = this._lines[i];
      if (lineStr.length > charsRemaining) {
        lineStr = lineStr.substring(0, charsRemaining);
      }

      const yOffset = this._startY + (i * size * lineheight);

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

  // Glyphs can't be turned into a path, so the hit area is the bounding box from the last draw()
  hitTest(ctx, u) {
    if (!this._hasInk) return; // nothing visible: empty text, reveal hides all, no fill and no stroke

    const b = this.boundingBox;
    const pad = this.isStroked() ? this.attributeValues.strokewidth / 2 : 0;
    ctx.rect((b.left - pad) * u, (b.top - pad) * u, (b.right - b.left + 2 * pad) * u, (b.bottom - b.top + 2 * pad) * u);
    ctx.fill(); // intercepted on pxl.dummyCtx (isPointInPath)
  }
};
customElements.define('pxl-text', pxl.Text);

pxl.Grid = class Grid extends pxl.Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'step', 'major', 'labels', 'labelsize'];
  }

  static defaults = { ...pxl.Shape.defaults, step: 50, major: 0, labels: false, labelsize: 12 };

  draw(ctx, u, t) {
    const { step, major, labels, labelsize, strokewidth } = this.attributeValues;
    if (step <= 0) return; // the line loops would never end

    // Visible area: the four stage corners mapped into the grid's own space
    const m = pxl.Matrix.invert(pxl._scratchMatrixA, this.getGlobalMatrix());
    const w = this.stage.attributeValues.width, h = this.stage.attributeValues.height;
    const x0 = m[4], y0 = m[5];                                       // (0, 0)
    const x1 = m[0] * w + m[4], y1 = m[1] * w + m[5];                 // (w, 0)
    const x2 = m[2] * h + m[4], y2 = m[3] * h + m[5];                 // (0, h)
    const x3 = m[0] * w + m[2] * h + m[4], y3 = m[1] * w + m[3] * h + m[5]; // (w, h)
    let minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
    let minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);

    // The visible area is the bounding box (gradients span what is visible)
    this.boundingBox.left = minX;
    this.boundingBox.right = maxX;
    this.boundingBox.top = minY;
    this.boundingBox.bottom = maxY;

    // One extra step on every side, then snapped to the grid
    minX -= step; maxX += step;
    minY -= step; maxY += step;
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // Minor lines
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

    // Major lines: every major-th line, twice as thick
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

    // Coordinates at the major intersections, in the fill color (or the stroke color without fill)
    if (labels && major > 0) {
      ctx.fillStyle = this.hasFill() ? this.createGradient(ctx, u, this.attributeValues.fill, 0) : ctx.strokeStyle;
      ctx.font = `${labelsize * u}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0px';

      const majorStep = step * major;
      const startMajorX = Math.floor(minX / majorStep) * majorStep;
      const endMajorX = Math.ceil(maxX / majorStep) * majorStep;
      const startMajorY = Math.floor(minY / majorStep) * majorStep;
      const endMajorY = Math.ceil(maxY / majorStep) * majorStep;

      for (let x = startMajorX; x <= endMajorX; x += majorStep) {
        for (let y = startMajorY; y <= endMajorY; y += majorStep) {
          ctx.fillText(`${x},${y}`, x * u, y * u);
        }
      }
    }
  }

  // Set in draw(): the visible area
  getBoundingBox() {
    return this.boundingBox;
  }
};
customElements.define('pxl-grid', pxl.Grid);

pxl.Variable = class Variable extends pxl.PxlNode {
  static get observedAttributes() { return ['value']; }

  static defaults = { value: 0 };

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);
  }
};
customElements.define('pxl-var', pxl.Variable);

