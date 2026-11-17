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

// Entries kept per cache. A framework that rebuilds an expression string on every render (`x="${base} + sin(t)"`)
// would otherwise grow the caches without end. Dropping the oldest entry is safe: elements keep their compiled
// function, and the same string only compiles again.
pxl.COMPILE_CACHE_LIMIT = 2000;

pxl.cacheExpression = function(cache, source, value) {
  if (cache.size >= pxl.COMPILE_CACHE_LIMIT) cache.delete(cache.keys().next().value); // Maps keep insertion order
  cache.set(source, value);
};

// Splits an expression into code and string literals, so rewrites and checks can skip quoted text
// (design/2026-11-02_string_literals_in_expressions_plan.md). Even indices are code, odd indices are literals with
// their quotes. In a template literal, the code inside ${…} is code again: 'a' + `b${x}c` → ['', "'a'", ' + ', '`b${',
// 'x', '}c`', '']. Regex literals and comments aren't recognized; attribute expressions don't use them.
// Compile time only: it runs once per distinct string, so its allocations don't matter.
pxl.splitStringLiterals = function(str) {
  const parts = [];
  // One entry per open ${…}: the depth of { } inside it, so its own } can be told apart from an object literal's
  const templateDepths = [];
  let start = 0;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const depth = templateDepths.length;
    const endsTemplateCode = char === '}' && depth > 0 && templateDepths[depth - 1] === 0;
    if (char === '\'' || char === '"' || char === '`' || endsTemplateCode) {
      parts.push(str.slice(start, i));
      if (endsTemplateCode) templateDepths.pop();
      const quote = endsTemplateCode ? '`' : char;
      let end = i + 1;
      while (end < str.length && str[end] !== quote) {
        if (str[end] === '\\') end++;
        else if (quote === '`' && str[end] === '$' && str[end + 1] === '{') break;
        end++;
      }
      if (str[end] === '$') {
        end += 2;
        templateDepths.push(0);
      } else {
        end++; // an unterminated string runs to the end
      }
      parts.push(str.slice(i, end));
      start = i = end;
    } else {
      if (depth > 0 && char === '{') templateDepths[depth - 1]++;
      if (depth > 0 && char === '}') templateDepths[depth - 1]--;
      i++;
    }
  }
  parts.push(str.slice(start));
  return parts;
};

// Rewrites shared by attribute expressions and on* handlers, applied to code only (quoted text stays as written):
// ref.a.b → ref.a?.b (the referenced element may not be connected yet),
// toLocal( → pxl.toLocal(this, (the caller is the element the code belongs to)
pxl.rewriteExpression = function(str) {
  const parts = pxl.splitStringLiterals(str);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i]
      .replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.')
      .replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
  }
  return parts.join('');
};

// Warns about toLocal() property names that don't exist (e.g. 'skewy', which isn't unique, or a typo).
// Runs once per expression at compile time; pxl.toLocal itself returns 0 for them without logging,
// because it runs every frame. Names given as variables can't be checked here.
pxl.checkToLocalProperties = function(str) {
  const propRegex = /\btoLocal\([^,]*,\s*(['"])([^'"]*)\1\s*\)/g;
  let match;
  while ((match = propRegex.exec(str)) !== null) {
    if (!pxl.toLocalProperties.includes(match[2])) {
      console.warn(`toLocal(): '${match[2]}' is not available. Use one of ${pxl.toLocalProperties.join(', ')}. ` +
        `To copy a frame, map rotate, scalex, scaley and skewx: ${str}`);
    }
  }
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
    // The checks below read only the code outside string literals, so words in quoted text don't count
    // ('Press return: ' + …, a lone t, ref.a.b or 80% inside a string)
    const parts = pxl.splitStringLiterals(str);
    let unquoted = '';
    for (let i = 0; i < parts.length; i += 2) {
      // CSS percentages aren't valid JavaScript: hsl(120, 50%, 40%) → hsl(120, '50%', '40%')
      parts[i] = parts[i].replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, '\'$1%\'$2');
      unquoted += parts[i] + ' ';
    }

    const isAnimated = pxl.timeDriverRegex.test(unquoted);
    // toLocal readers are also re-evaluated when their own space moves (design/2026-10-26_tolocal_fix_plan.md)
    const usesToLocal = /\btoLocal\(/.test(unquoted);
    if (usesToLocal) pxl.checkToLocalProperties(str); // reads the full string: the property name is a string
    const source = pxl.rewriteExpression(parts.join(''));

    const deps = [];
    const refRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = refRegex.exec(unquoted)) !== null) {
      const fullKey = `ref.${match[1]}`;
      if (!deps.includes(fullKey)) deps.push(fullKey);
    }
    const hasVars = deps.length > 0;

    // A plain expression gets a return; code with its own return statements is used as written
    const code = /\breturn\b/.test(unquoted) ? source : `return ${source};`;

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

      pxl.cacheExpression(pxl.animationCache, str, fn);
      return fn;
    }

    // Static: evaluated once
    const result = new Function('scope', `
      const { ${pxl.scopeKeys} } = scope;
      ${code}
    `)(pxl.scope);
    const val = (result !== undefined) ? result : str;
    pxl.cacheExpression(pxl.staticCache, str, val);
    return val;
  } catch (e) {
    pxl.cacheExpression(pxl.staticCache, str, str);
    console.warn(`Failed to compile expression, returned string instead: ${str}`, e);
    return str;
  }
};
