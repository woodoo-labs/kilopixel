// A sketch (2026-11-27, minified 1,327 B) of the template parser of design/done/2026-11-27_text_template_plan.md §3.2, written like engine code, so its
// minified size can be measured. Not the final code. compileExpression is the engine's.
pxl.TEMPLATE_PREFIX = '\u0000template:';

// Index of the } that closes the code part starting at `from`, or -1. Quotes and nested templates are skipped.
pxl.findTemplateEnd = function(str, from) {
  let depth = 0;
  for (let i = from; i < str.length; i++) {
    const char = str[i];
    if (char === '\'' || char === '"' || char === '`') {
      for (i++; i < str.length && str[i] !== char; i++) {
        if (str[i] === '\\') i++;
        else if (char === '`' && str[i] === '$' && str[i + 1] === '{') {
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

// Text where only ${…} is code. Returns the string itself, or a function with the flags of a compiled expression.
pxl.parseTemplate = function(str) {
  if (!str.includes('${')) return str;
  const key = pxl.TEMPLATE_PREFIX + str;
  if (pxl.animationCache.has(key)) return pxl.animationCache.get(key);
  const texts = [];
  const parts = [];
  let text = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && str[i + 1] === '$' && str[i + 2] === '{') {
      text += '${';
      i += 3;
    } else if (str[i] === '$' && str[i + 1] === '{') {
      const end = pxl.findTemplateEnd(str, i + 2);
      const code = end < 0 ? '' : str.slice(i + 2, end).trim();
      const part = code === '' ? undefined : pxl.compileExpression(code);
      if (part === undefined || part === code) {
        console.warn(`[pxl] template "${str}" doesn't compile; shown as text`);
        return str;
      }
      texts.push(text);
      parts.push(part);
      text = '';
      i = end + 1;
    } else {
      text += str[i++];
    }
  }
  texts.push(text);
  if (parts.length === 0) return text;

  const count = parts.length;
  const fn = function(t) {
    let result = texts[0];
    for (let p = 0; p < count; p++) {
      const part = parts[p];
      const value = typeof part === 'function' ? part.call(this, t) : part;
      if (value === undefined || value === null || Number.isNaN(value)) return null;
      result += value + texts[p + 1];
    }
    return result;
  };
  fn.isTimeDependent = parts.some((part) => part.isTimeDependent === true);
  fn.sourceIds = [...new Set(parts.flatMap((part) => part.sourceIds || []))];
  fn.usesToLocal = parts.some((part) => part.usesToLocal === true);
  pxl.cacheExpression(pxl.animationCache, key, fn);
  return fn;
};
