// =========================================================================
// Expression Scope & Time Drivers
// =========================================================================

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

pxl.scope.clamp = (v, low, high) => Math.max(low, Math.min(high, v));
pxl.scope.lerp  = (a, b, alpha) => a + (b - a) * alpha;
pxl.scope.map   = (v, inMin, inMax, outMin, outMax) => (v - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;

// The scope's names, destructured at the top of every compiled function. Built at the first compile: every engine
// file that adds names (this one, gradient.js, compositing.js) has loaded by then, since they all load before the first
// customElements.define(), which may compile (a stage upgraded while the bundle runs compiles its ratio).
pxl._scopeKeys = null;
pxl.scopeKeys = function() {
  if (pxl._scopeKeys === null) pxl._scopeKeys = Object.keys(pxl.scope).join(', ');
  return pxl._scopeKeys;
};

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

// Static expressions: the compiled function, or null for a string that failed. The function runs again each time the
// string is parsed (pxl.evaluateStatic()), so every element gets its own result: a cached result would put every
// element with x="random() * 1000" at the same place. Compiling is the cost the cache saves.
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
// (design/done/2026-11-02_string_literals_in_expressions_plan.md). Even indices are code, odd indices are literals with
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

// Rewrites shared by attribute expressions and pxl-on-* handlers, applied to code only (quoted text stays as written):
// ref.a.b → ref.a?.b (the referenced element may not be connected yet), only in expressions: handlers assign through
// ref (pxl.handlerRef), and JavaScript can't assign to an optional chain;
// toLocal( → pxl.toLocal(this, (the caller is the element the code belongs to)
pxl.rewriteExpression = function(str, isHandler = false) {
  const parts = pxl.splitStringLiterals(str);
  for (let i = 0; i < parts.length; i += 2) {
    if (!isHandler) parts[i] = parts[i].replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.');
    parts[i] = parts[i].replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
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
      console.warn(`[pxl] toLocal(): '${match[2]}' is not available. Use one of ${pxl.toLocalProperties.join(', ')}. ` +
        `To copy a frame, map rotate, scalex, scaley and skewx: ${str}`);
    }
  }
};

// Turns a non-empty attribute string into a static value (number, boolean, string)
// or a compiled function. Cheap checks run first; most attributes never reach the compiler.
// CSS hsl() / hsla() with % on saturation and lightness, comma or space syntax: "hsl(200, 50%, 40%)", "hsl(200deg 50% 40% / 0.5)"
pxl.CSS_HSL_REGEX = /^hsla?\(\s*-?[\d.]+(?:deg)?(?:\s*,\s*|\s+)[\d.]+%(?:\s*,\s*|\s+)[\d.]+%(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;
pxl.CSS_COLOR_FUNCTION_REGEX = /^(?:hwb|lab|lch|oklab|oklch|color)\([^()]*\)$/i;

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

    // Static CSS colors, kept as text: compiling one costs about 90 µs, which a color that changes in every frame
    // (fill={`hsl(${h}, 50%, 50%)`} from framework state) would pay each time, filling the expression cache.
    // "rgba(124, 211, 15, 0.8)"; "hsl(200, 50%, 40%)" with % (Kilopixel's own hsl(200, 50, 40) is an expression);
    // the CSS color functions Kilopixel doesn't define (oklch(), lab(), color(), …), without nested parentheses.
    if (/^(rgb|rgba)\([\d\s.,%]+\)$/i.test(value) || pxl.CSS_HSL_REGEX.test(value) || pxl.CSS_COLOR_FUNCTION_REGEX.test(value)) {
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
  const staticFn = pxl.staticCache.get(str);
  if (staticFn !== undefined) return staticFn === null ? str : pxl.evaluateStatic(staticFn, str);
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
    // toLocal() results also depend on the containers above both elements (UpdateScheduler.buildOrder())
    const usesToLocal = /\btoLocal\(/.test(unquoted);
    if (usesToLocal) pxl.checkToLocalProperties(str); // reads the full string: the property name is a string
    const source = pxl.rewriteExpression(parts.join(''));

    // The ids it reads: the stage evaluates it after them, and when one of them changed
    const sourceIds = [];
    const refRegex = /\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = refRegex.exec(unquoted)) !== null) {
      if (!sourceIds.includes(match[1])) sourceIds.push(match[1]);
    }
    const hasVars = sourceIds.length > 0;

    // A plain expression gets a return; code with its own return statements is used as written
    const code = /\breturn\b/.test(unquoted) ? source : `return ${source};`;

    if (isAnimated || hasVars) {
      // The outer function runs once (destructures the scope); the returned closure runs per evaluation
      const fn = new Function('scope', 'ref', `
        const { ${pxl.scopeKeys()} } = scope;
        let t;
        const _d = new Date();
        ${pxl.timeDrivers}
        return function(_t) {
          t = _t;
          ${code}
        };
      `)(pxl.scope, pxl.nodes);

      fn.isTimeDependent = isAnimated;
      fn.sourceIds = sourceIds;
      fn.usesToLocal = usesToLocal;
      pxl.addReadIds(sourceIds);

      pxl.cacheExpression(pxl.animationCache, str, fn);
      return fn;
    }

    // Static: compiled once, evaluated for every element that uses the string
    const fn = new Function('scope', `
      const { ${pxl.scopeKeys()} } = scope;
      return function() {
        ${code}
      };
    `)(pxl.scope);
    pxl.cacheExpression(pxl.staticCache, str, fn);
    return pxl.evaluateStatic(fn, str);
  } catch (e) {
    pxl.rejectExpression(str, e);
    return str;
  }
};

// A static expression's value for one element; an undefined result keeps the source string
pxl.evaluateStatic = function(fn, str) {
  try {
    const result = fn();
    return result !== undefined ? result : str;
  } catch (e) {
    pxl.rejectExpression(str, e);
    return str;
  }
};

// A string that doesn't compile or throws when evaluated (foo + 1) warns once and is text from then on
pxl.rejectExpression = function(str, error) {
  pxl.cacheExpression(pxl.staticCache, str, null);
  console.warn(`[pxl] failed to compile expression, used as text instead: ${str}`, error);
};

// =========================================================================
// Template Attributes: Text Where Only ${…} Is Code
// =========================================================================
// A template attribute (static templateAttributes: Text's text) is never guessed at like other values: everything is
// text, ${…} is code, and \${ writes a literal ${. The engine splits the value itself instead of wrapping it in
// JavaScript backticks, so backslashes and backticks in the text stay as written.
// Design: design/done/2026-11-27_text_template_plan.md

// Index of the } that closes the code part starting at `from`, or -1. Quoted strings (with their escapes) and nested
// template literals are skipped, so a } or ${ inside them doesn't end the part.
pxl.findTemplateEnd = function(str, from) {
  let depth = 0;
  for (let i = from; i < str.length; i++) {
    const char = str[i];
    if (char === '\'' || char === '"' || char === '`') {
      for (i++; i < str.length && str[i] !== char; i++) {
        if (str[i] === '\\') {
          i++;
        } else if (char === '`' && str[i] === '$' && str[i + 1] === '{') {
          const end = pxl.findTemplateEnd(str, i + 2);
          if (end < 0) return -1;
          i = end;
        }
      }
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
};

// The text itself when it has no code part. Otherwise one compiled function (cached like any expression, animated or
// reactive by its parts): each part in turn, and an undefined, null or NaN part makes the result null, so the text
// draws nothing until every part is defined; else the text with the parts joined in. The text between the parts goes
// into the generated code as JSON string literals, which the expression checks and rewrites skip as quoted text.
pxl.parseTemplate = function(str) {
  const texts = [];
  const codes = [];
  let text = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && str[i + 1] === '$' && str[i + 2] === '{') {
      text += '${';
      i += 3;
    } else if (str[i] === '$' && str[i + 1] === '{') {
      const end = pxl.findTemplateEnd(str, i + 2);
      const code = end < 0 ? '' : str.slice(i + 2, end).trim();
      if (code === '') {
        console.warn(`[pxl] template with ${end < 0 ? 'an unclosed ${' : 'an empty ${}'}, shown as text: ${str}`);
        return str;
      }
      texts.push(text);
      codes.push(code);
      text = '';
      i = end + 1;
    } else {
      text += str[i];
      i++;
    }
  }
  if (codes.length === 0) return text;
  texts.push(text);

  let source = '';
  let joined = JSON.stringify(texts[0]);
  for (let p = 0; p < codes.length; p++) {
    source += `const _p${p} = (${codes[p]});\n` +
      `if (_p${p} === undefined || _p${p} === null || _p${p} !== _p${p}) return null;\n`;
    joined += ` + _p${p} + ${JSON.stringify(texts[p + 1])}`;
  }
  source += `return ${joined};`;
  const compiled = pxl.compileExpression(source);
  // A part that doesn't compile: compileExpression warned and returned its source; the value is shown as written
  return compiled === source ? str : compiled;
};
