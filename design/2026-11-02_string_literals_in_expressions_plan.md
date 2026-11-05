# String Literals in Expressions

- **Status**: 🟡 **Proposed** (2026-11-02). The code in §3 was drafted and checked in Node (§3.6); implementation postponed. Open decisions in §7.
- **Date**: 2026-11-02
- **Related**: `design/archive/quote-aware-percent-sanitizer.md` (2026-07-13, never implemented; this plan covers its case), `docs/text.html` (`text` attribute: when to quote)
- **Target Implementation**: `js/compiler.js` (`rewriteExpression`, `compileExpression`, `parseAttributeValue`)
- **Tests** (committed): `tests/index.html`, new section "Expression compiler: string literals"

---

## 1. Problem

The compiler treats an attribute expression as one piece of text. Its regexes also match inside string literals, so words in quoted text change the code. Results of the current `js/compiler.js` (run in Node):

| Value | Renders | Expected |
|---|---|---|
| `'Press return: ' + ref.score.value` | nothing (`undefined`) | `Press return: 5` |
| `'ref.score.value = ' + ref.score.value` | `ref.score?.value = 5` | `ref.score.value = 5` |
| `` `ref.angle.value = ${ref.angle.value}` `` | `ref.angle?.value = 45` | `ref.angle.value = 45` |
| `` `Press return: ${ref.score.value}` `` | nothing (`undefined`) | `Press return: 5` |
| `` `press return` `` | `` `press return` `` (with backticks) | `press return` |
| `` `wait t seconds` `` | correct, but re-evaluated every frame | static |
| `radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])` | SyntaxError, raw string | gradient |
| `'It\'s'` | `'It\'s'` (raw, with quotes) | `It's` |

These already work and must keep working: `'rotate = ref.angle.value'` (a single quoted string is unwrapped and never compiled) and `` `rotate = ${ref.angle.value}` `` (→ `rotate = 45`).

What users write is normal: plain text without quotes, single quotes when text looks like code, backticks for apostrophes and `${…}` values (`docs/text.html`, `docs/mapping.html`). Most of it works. It breaks as soon as quoted text and a value are in one expression (`+`, `${…}`, a function call), and there is no rule we could document to avoid it other than "don't use certain words in your text". Realistic cases: a readout that shows an expression next to its value (`` `ref.angle.value = ${ref.angle.value}` ``, as on the mapping page), a game label (`` `Press return: ${ref.score.value}` ``).

The original repro, `` `rotate = ref.angle.value` `` without `${…}` (`scratch/draw_order_var_first_check.html`), is an unusual way to write text (single quotes are the convention), but it has the same cause.

---

## 2. Cause

Each regex in the compile path runs over the whole expression, strings included:

| Step | Regex | Effect inside a string |
|---|---|---|
| CSS % sanitizer (`compileExpression`) | `/(\d+(?:\.\d+)?)%(\s*[,)])/g` | `80%,` → `'80%',` breaks the surrounding string |
| Time dependency (`pxl.timeDriverRegex`) | `t`, `loop(`, `wave(`, … | text with a lone `t` becomes animated |
| `toLocal` detection | `/\btoLocal\(/` | marks the expression as a `toLocal` reader |
| `pxl.rewriteExpression` | `ref.a.b` → `ref.a?.b`, `toLocal(` → `pxl.toLocal(this, ` | changes the displayed text |
| Dependency extraction | `/\bref\.(id)/g` | extra dependency, extra re-evaluations |
| Return detector | `/\breturn\b/` | no `return` is added, the expression yields `undefined` |

The escaped apostrophe is a separate cause in `parseAttributeValue`: a value is treated as a single string when the first matching quote after the opening one is the last character. In `'It\'s'` the escaped `'` comes first, so the check fails. Nothing else in the value looks like code, so it is returned unchanged. That branch also never reads escapes: `'a\nb'` keeps the backslash (the text shape turns a typed `\n` into a line break, so this goes unnoticed there).

---

## 3. Fix

### 3.1 Split an expression into code and string literals

A new helper scans the expression once and returns its parts: even indices are code, odd indices are literals with their quotes. Code inside a template literal's `${…}` is code again; nested braces in it (an object literal) are counted.

```js
// Splits an expression into code and string literals, so rewrites and checks can skip quoted text.
// Even indices are code, odd indices are literals with their quotes. In a template literal, the
// code inside ${…} is code again: 'a' + `b${x}c` → ['', "'a'", ' + ', '`b${', 'x', '}c`', ''].
// Regex literals and comments aren't recognized; attribute expressions don't use them.
pxl.splitStringLiterals = function(str) {
  const parts = [];
  // One entry per open ${…}: the depth of { } inside it, so its own } can be told apart
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
        end++;
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
```

It runs at compile time only (once per distinct attribute string; results are cached), so the allocations don't matter. An unterminated string simply runs to the end.

The `${…}` tracking (`templateDepths`) is needed even though template literals mostly work today: if a whole template literal counted as text, `${ref.angle.value}` would get no `?.` rewrite and no dependency, so `` `Angle: ${ref.angle.value}` `` would compile as static and never update. Skipping only `'…'` and `"…"` would save about 12 lines but leave the template cases in §1 broken.

### 3.2 `pxl.rewriteExpression`: rewrite code parts only

```js
pxl.rewriteExpression = function(str) {
  const parts = pxl.splitStringLiterals(str);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i]
      .replace(/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, 'ref.$1?.')
      .replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
  }
  return parts.join('');
};
```

`on*` handlers (`js/elements/shape.js`) use the same function and get the fix too.

### 3.3 `compileExpression`: checks read code without strings

Split once at the start and build `unquoted`, the code parts joined with spaces (strings removed; the name `code` is already taken further down). Then:

- **% sanitizer:** applied to the code parts only, then joined back into `source`. The `includes('%')` check and the `source[0] !== '`'` guard are no longer needed: the text of a template literal is skipped, and `${…}` in it is code like anywhere else.
- **Time dependency, `toLocal` detection, `ref.` dependencies, `return` detector:** test `unquoted` instead of `source`.
- `pxl.checkToLocalProperties(str)` keeps reading the full string, because the property name is a string.

```js
  try {
    // The checks below read only the code outside string literals, so words in quoted text don't count
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
    if (usesToLocal) pxl.checkToLocalProperties(str);
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
    // … unchanged from here
```

The rewrite comment above `pxl.rewriteExpression` gets "applied to code only (quoted text stays as written)".

### 3.4 `parseAttributeValue`: escapes in a quoted string

```js
// A single quoted string: "'Hello loop(2) World'". With a backslash ('It\'s'), JavaScript reads the escapes.
if ((firstChar === '\'' || firstChar === '"') && value[value.length - 1] === firstChar) {
  if (value.includes('\\')) return pxl.compileExpression(value);
  if (value.indexOf(firstChar, 1) === value.length - 1) return value.slice(1, -1);
}
```

The value is static, so it is evaluated once and cached. Consequence: escapes now mean what they mean in JavaScript (`'a\nb'` contains a real line break, which the text shape already handles; `'C:\dir'` loses its backslash). Pre-release, no compatibility needed.

### 3.5 Size and performance

- In the draft: 65 lines added, 17 removed in `js/compiler.js` (about 48 more), most of them the splitter.
- Per frame: nothing changes. The splitter runs once per distinct expression string; values like `100`, `red`, `'Hello'` never reach it.
- At runtime it is slightly faster: text such as `` `wait t seconds` `` is no longer animated, and `ref` text inside strings no longer adds dependencies.

### 3.6 Draft check (Node, 2026-11-02)

The code in §3.1–3.4 was applied to a copy of `js/compiler.js` and run in Node with a stub `pxl.nodes` (`scratch/compiler_string_literals.js` and `.diff` in the worktree `epic-tharp-ffec3e`; scratch is git-ignored, so this plan holds all the code). Results:

- Every row of §1 renders the expected text; the gradient compiles without a SyntaxError.
- Unchanged: `hsl(t * 36, 80%, 50%)`, `hsla((t/5)%360, 100%, 60%, 0.5)`, `` `hsl(${t * 36}, 80%, 50%)` ``, `toLocal(ref.score, 'x') + 1` (still a `toLocal` reader with dependency `ref.score`), `'Hello'`, `t * 100 % 1000`, `'rotate = ref.angle.value'`, `` `rotate = ${ref.angle.value}` ``.
- Splitter edge cases: nested template literals (`` `a${`in${y}`}b` ``), an object literal in `${…}`, an escaped quote, an unterminated string.

Not yet checked: the browser (build, `tests/index.html`, docs pages).

---

## 4. Out of Scope

- **Unquoted text that looks like code** (`text="Wait (2 min)"`): the final regex in `parseAttributeValue` still sends it to the compiler, which warns and returns the raw string. This is the documented reason to quote text (`docs/text.html`).
- **`text='"It's"'`** (HTML single-quoted attribute) already works; nothing to change. Not used in the docs: a different HTML quote style in one snippet catches the eye.
- **`'It's'`** (unescaped apostrophe in single quotes) stays raw text with its quotes. It isn't valid JavaScript, and `'a' + 'b'` also starts and ends with `'`, so the parser can't simply strip the outer quotes. Use backticks or `\'`.
- **`docs/mapping.html`** keeps `` text="`In the Ring's Space:`" ``: backticks for an apostrophe are the convention (§5), not a workaround.
- **`design/archive/quote-aware-percent-sanitizer.md`**: set its status to "Superseded by `2026-11-02_string_literals_in_expressions_plan.md`".

---

## 5. Docs and Reference

- `.agents/KILOPIXEL.md`, compiler section: pipeline step 4 (quoted strings with escapes), compile steps 2–6 (they skip string literals), new helper `pxl.splitStringLiterals`; the `on*` handler line.
- `docs/text.html`: possibly a new section on what the `text` attribute accepts and how to write each case. Today the rules are only in the Element Reference row ("Wrap in single quotes if the content contains arithmetic operators…"). To be decided, together with the section's place (e.g. before "3. Line Breaks", since that section already uses `\n` in quoted text). Content:
  - **Plain text without quotes:** `text="Hello World"`, `text="In the Ring's Space:"`, as long as nothing looks like code.
  - **Single quotes** when the text looks like code (operators, parentheses, a lone `t`): `text="'Wait (2 - 3 min)'"`.
  - **Apostrophes in quoted text:** backticks (`` text="`It's (almost) done`" ``) or an escape like in JavaScript (`'It\'s'`).
  - **Text with values:** `` text="`Angle: ${ref.angle.value}°`" `` or `'Angle: ' + ref.angle.value`; words inside the quotes stay text.
  - Possibly a short table "you write → it shows", built with live examples like the other sections.
  - The Element Reference row then shortens to a link to the new section.
- `docs/DOCS_STANDARDS.md` (optional): the same quoting convention for snippets on all docs pages: no quotes for plain text, single quotes when it looks like code, backticks for apostrophes and values.
- Build: `node build.js`, then update the `~NNKB` size in `docs/installation.html` and the `.agents/KILOPIXEL.md` header.

---

## 6. Tests

New section "Expression compiler: string literals" in `tests/index.html`. The tests call `pxl.parseAttributeValue` and `pxl.rewriteExpression` directly and use the existing `ecVar` (`<pxl-var>`) as the reference:

| Test | Value | Expected |
|---|---|---|
| `ref` text in a string joined with a value | `'ref.ecVar.value = ' + ref.ecVar.value` | text keeps `ref.ecVar.value`, value is current |
| `ref` text next to `${…}` | `` `ref.ecVar.value = ${ref.ecVar.value}` `` | text keeps `ref.ecVar.value`, value is current |
| `ref` text in a template literal | `` `rotate = ref.ecVar.value` `` | `rotate = ref.ecVar.value`, no dependency |
| `${…}` stays reactive | `` `value: ${ref.ecVar.value}` `` | function with dependency `ref.ecVar`; follows a change of `ecVar` |
| `return` in a string | `'Press return: ' + ref.ecVar.value`, `` `Press return: ${ref.ecVar.value}` ``, `` `press return` `` | the text, not `undefined` / backticks |
| Already working forms | `'rotate = ref.ecVar.value'`, `` `rotate = ${ref.ecVar.value}` `` | unchanged |
| `t` in a string | `` `wait t seconds` `` | static string, not a function |
| % inside a quoted color | `radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])` | gradient object, no warning |
| % outside strings still works | `hsl(t * 36, 80%, 50%)` | function returning `hsl(…,80%,50%)` |
| Escaped quotes | `'It\'s'`, `"say \"hi\""` | `It's`, `say "hi"` |
| Rewrite mix | `` ref.a.b + 'ref.a.b' + `${ref.c.d} ref.e.f` `` | `` ref.a?.b + 'ref.a.b' + `${ref.c?.d} ref.e.f` `` |
| Nested braces in `${…}` | `` `${ {a: ref.ecVar.value}.a } ref.x.y` `` | value, then literal `ref.x.y` |

Verification: all tests in `tests/index.html` pass; `docs/text.html`, `docs/mapping.html` and the gradient pages show no console warnings.

---

## 7. Open Decisions

- Implement as in §3 (all checks skip strings), or only the rewrite and the escapes (§3.1, 3.2, 3.4)? Recommended: all of §3; the `return` check is the case where text disappears.
- `docs/text.html`: new section on what the `text` attribute accepts (§5), and where.
- `docs/DOCS_STANDARDS.md`: quoting convention for snippets (§5).
