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

pxl.scope.clamp = (v, low, high) => Math.max(low, Math.min(high, v));
pxl.scope.lerp  = (a, b, alpha) => a + (b - a) * alpha;
pxl.scope.map   = (v, inMin, inMax, outMin, outMax) => (v - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;

pxl.scope.linear = (direction, colorsArray) => {
  let x1, y1, x2, y2, angle;
  if (typeof direction === 'number') {
    angle = direction;
    const rad = direction * Math.PI / 180;
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const stretch = 1 / Math.max(absCos, absSin); // Perfectly hits the square bounding box edges
    x1 = (-Math.cos(rad) * stretch + 1) / 2;
    y1 = (-Math.sin(rad) * stretch + 1) / 2;
    x2 = (Math.cos(rad) * stretch + 1) / 2;
    y2 = (Math.sin(rad) * stretch + 1) / 2;
  } else if (Array.isArray(direction)) {
    [x1, y1, x2, y2] = direction;
  }

  const parsedStops = [];
  if (Array.isArray(colorsArray)) {
    if (typeof colorsArray[0] === 'string') {
      const step = 1 / (colorsArray.length - 1 || 1);
      for (let i = 0; i < colorsArray.length; i++) {
        parsedStops.push({ offset: i * step, color: colorsArray[i] });
      }
    } else {
      for (let i = 0; i < colorsArray.length; i += 2) {
        parsedStops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
      }
    }
  }
  return { isGradient: true, type: 'linear', x1, y1, x2, y2, angle, stops: parsedStops };
};

pxl.scope.radial = (radiusObj, colorsArray) => {
  let r = 1;
  let cx = 0.5, cy = 0.5;
  if (typeof radiusObj === 'number') r = radiusObj;
  else if (Array.isArray(radiusObj)) [cx, cy, r] = radiusObj;
  
  const parsedStops = [];
  if (Array.isArray(colorsArray)) {
    if (typeof colorsArray[0] === 'string') {
      const step = 1 / (colorsArray.length - 1 || 1);
      for (let i = 0; i < colorsArray.length; i++) {
        parsedStops.push({ offset: i * step, color: colorsArray[i] });
      }
    } else {
      for (let i = 0; i < colorsArray.length; i += 2) {
        parsedStops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
      }
    }
  }
  return { isGradient: true, type: 'radial', cx, cy, r, stops: parsedStops };
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
    if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%]+\)$/i.test(value)) {
      return value;
    }

    // Fast Path for static CSS filters
    if (/^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|opacity|saturate|sepia)\(/i.test(value)) {
      if (value.includes('${') || /\b(wave|loop|yoyo|bounce|strobe|glide|pulse|glitch)\b/.test(value)) {
        console.warn(`[pxl] Warning: Animated filters must be wrapped in backticks (\` \`). Ignoring invalid static string: ${value}`);
      }
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
  if (/(^|[^.])\bt\b|\bref\.|\(|\[|(?:\d\s*[-+*/%<>=!&|]|[-+*/%<>=!&|]\s*\d)|['"`]\s*\+|\+\s*['"`]/.test(value)) {
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
    if (sanitizedStr.includes('%')) {
      sanitizedStr = sanitizedStr.replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, "'$1%'$2");
    }

    // 3. OPTIONAL CHAINING INJECTOR: Safely convert ref.player.x to ref.player?.x
    // This prevents fatal TypeErrors during initial evaluation or typos, returning undefined/NaN gracefully.
    sanitizedStr = sanitizedStr.replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');

    // Detect 60fps timeline drivers
    const isAnimated = this.timeDriverRegex.test(sanitizedStr);

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
