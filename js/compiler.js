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
  const [x1, y1, x2, y2] = direction;
  return { isGradient: true, type: 'linear', x1, y1, x2, y2, stops };
};

pxl.scope.radial = (config, colorsArray) => {
  const stops = _parseStops(colorsArray);
  const a = config;
  const len = a.length;

  let x0 = 0.5, y0 = 0.5, ex0 = 0.5, ey0 = 0.5;
  let x1 = 0.5, y1 = 0.5, ex1 = 0.5, ey1 = 0.5;

  if (len === 2) {
    ex1 = a[0]; ey1 = a[1];
  } else if (len === 4) {
    x1 = a[0]; y1 = a[1]; ex1 = a[2]; ey1 = a[3];
    x0 = x1; y0 = y1;
  } else if (len === 6) {
    x0 = a[0]; y0 = a[1]; x1 = a[2]; y1 = a[3]; ex1 = a[4]; ey1 = a[5];
    ex0 = x0; ey0 = y0;
  } else if (len >= 8) {
    x0 = a[0]; y0 = a[1]; ex0 = a[2]; ey0 = a[3];
    x1 = a[4]; y1 = a[5]; ex1 = a[6]; ey1 = a[7];
  }

  return { isGradient: true, type: 'radial', x0, y0, ex0, ey0, x1, y1, ex1, ey1, stops };
};

pxl.scope.conic = (angleOrConfig, colorsArray) => {
  const stops = _parseStops(colorsArray);
  let startAngle = 0, cx = 0.5, cy = 0.5;
  if (typeof angleOrConfig === 'number') startAngle = angleOrConfig;
  else if (Array.isArray(angleOrConfig)) [startAngle, cx, cy] = angleOrConfig;
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
