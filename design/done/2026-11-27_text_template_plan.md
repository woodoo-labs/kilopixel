# Text as a Template, Centered by Default

- **Status**: ✅ **Implemented** (2026-11-27, §13: `text` is a template, text centered by default, every page migrated)
- **Date**: 2026-11-27
- **Related**: `design/2026-11-27_release_0_1_plan.md` (§4: the analysis, the counts, the edge cases; R1, R3), `design/done/2026-11-02_string_literals_in_expressions_plan.md` (today's rules for strings in expressions), `design/done/2026-10-30_framework_compatibility_plan.md` §24 (P4: the `text` property is literal)
- **Target Implementation**: `js/compiler.js` (the template parser), `js/engine.js` (`pxl.compileAttribute`), `js/elements/node.js` (`static templateAttributes`), `js/elements/shapes/text.js` (defaults), `tests/unit.html`, `tests/index.html`, `tests/render.html`, every page with `<pxl-text>` in `docs/`, `examples/`, `tests/`, `.agents/KILOPIXEL.md`, `.agents/ENGINE.md`, `docs/text.html`, `docs/js/api-tabs.js`, `docs/DOCS_STANDARDS.md`
- **Prototypes**: `design/prototypes/2026-11-27_release_0_1/text_survey.js` (the kinds of `text` values), `design/prototypes/2026-11-27_text_template/text_alignment_survey.js` (labels that rely on the default alignment)

---

## 1. Goal

Two changes to `<pxl-text>`, decided together because both touch every label (release plan R1, R3):

1. **The `text` attribute is a template:** everything is text, only `${…}` is code.

   ```html
   <pxl-text text="Level 2-3"></pxl-text>
   <pxl-text text="Score: ${ref.score.value} / 3"></pxl-text>
   ```

2. **Centered by default:** `align="center"`, `baseline="middle"`, so `x`, `y` is the center of the text, as for every other shape.

## 2. Today

- `text` goes through `pxl.parseAttributeValue()` like every attribute (language §3.1, seven steps). Plain words stay text; quoted text loses its quotes; backticks, operators next to digits, parentheses and `ref.` make it code. 646 of the 711 values on the pages carry quotes, backticks or `' + … + '` (release plan §4.1).
- The `text` property is literal (`Text.text` setter: `pxl.storeValue()`, never compiled).
- `Text.defaults`: `align: 'start'`, `baseline: 'alphabetic'` (the canvas defaults). `layout()` already centers a block of several lines for `baseline="middle"` (`startY = -totalBlockHeight / 2`).
- `null` / `undefined` / `''` as the value: `layout()` returns false, nothing is drawn or hit.

## 3. Design: The Template

### 3.1 Which Attributes

`static templateAttributes = []` on `pxl.PxlNode` (every class has the field, no defensive check); `pxl.Text` sets `['text']`. `pxl.compileAttribute()` reads a name in that list with `pxl.parseTemplate()` instead of `pxl.parseAttributeValue()`. A custom shape can list its own text attributes (the Gauge's `label` in `docs/custom-shapes.html`, D1).

### 3.2 Parsing (`pxl.parseTemplate(str)`)

(2026-11-27: built with one generated function per template and a scanner of its own, §13.2.)

The engine scans the value itself; it does not wrap it in JavaScript backticks, so JavaScript's escape rules never apply to the text.

1. Scan for `${`. `\${` is the only escape: it becomes a literal `${`. Every other character, backslashes and backticks included, stays as written. A written `\n` stays two characters; the text shape breaks the line there, as today.
2. A code part runs from `${` to its matching `}`. Quotes and nested templates inside it are skipped like in `pxl.splitStringLiterals()` (whose scanner the parser shares), so `${a ? '}' : `x${b}`}` ends at the right brace.
3. **No code part:** the result is the static string. Nothing is compiled, nothing is cached.
4. **Code parts:** each is compiled with `pxl.compileExpression()` (the same scope, `ref`, `t`, `toLocal()`, caches and warnings as any expression; a static part such as `${1 + 1}` comes back as a value). The template becomes one function with the union of their flags (`isTimeDependent`, `sourceIds`, `usesToLocal`), so it is animated, reactive or static like any attribute (ENGINE.md §4.2 applies unchanged). One function per distinct template string, cached under its own key (so `"${a}"` as a template and `"a"` as an expression never share an entry).
5. **Evaluation:** each part's value; if any is `undefined`, `null` or `NaN`, the result is `null` and the text draws nothing and isn't hit until every part is defined (release plan R1; like a polyline with an invalid coordinate). Otherwise the static parts and `String(value)` of each part, joined.
6. **Errors:** an unclosed `${`, an empty `${}` or a part that doesn't compile: one warning (the existing compile warning), and the whole value is shown as text, as written.

Joining allocates a string per evaluation, like a backtick template today; a static template never evaluates again, a reactive one only when a source changed.

### 3.3 What Stays

- The `text` **property** stays literal (P4): frameworks bind data to it, and data is never code, not even `${`.
- Rule A: bare or removed `text` is `''` (the default), as today.
- Every other attribute keeps language §3.1, including backticks where they are needed (`filter="`url(#f)`"`).
- `<pxl-var>` `value` keeps today's rules (it holds numbers as often as text).

## 4. Design: Centered by Default

- `Text.defaults`: `align: 'center'`, `baseline: 'middle'`. Bare or removed `align` / `baseline` give these (Rule A).
- `middle` is the canvas's `middle` (the middle of the em box), not the middle of the glyphs' box: a label doesn't jump when its text changes from `ace` to `Ag` (D3). A block of several lines is centered as a whole (`layout()` does that already).
- `direction` only matters for `start` / `end`; with `center` it changes nothing, as in CSS.
- `<pxl-grid>` labels draw with their own settings: unchanged.

## 5. Behavior After the Change

| `text="…"` | Shows |
|---|---|
| `Hello` | Hello |
| `Level 2-3` | Level 2-3 (today: compiled, a warning) |
| `'Add'` | 'Add', with the quotes (today: Add) |
| `It's done` | It's done |
| `` Use `npm ci` `` | Use `npm ci` |
| `C:\temp` | C:\temp |
| `Line 1\nLine 2` | two lines |
| `Score: ${ref.score.value} / 3` | Score: 2 / 3, updated when `score` changes |
| `${ref.btn.isHovered ? 'On' : 'Off'}` | On / Off |
| `${t.toFixed(1)} s` | 1.4 s, every frame |
| `${ref.missing.x}` | nothing (an `undefined` part) |
| `Price: \${price}` | Price: ${price} |
| `Total: ${ref.a.value +` | Total: ${ref.a.value + (as text, one warning) |
| `ref.score.value` | ref.score.value (the words: write `${ref.score.value}`) |

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Quotes inside `${…}` | single quotes; HTML ends the attribute at `"`, so a literal `"` in the text is `&quot;` (the HTML parser turns it into `"` before the engine sees it) |
| `}` or `${` inside a string within a code part | skipped by the scanner (§3.2 step 2) |
| `$` without `{`, `{` without `$` | text |
| A whole value `${expr}` | a string, `String(expr)`: `${2}` shows 2 |
| `setAttribute('text', data)` | a template; data that may contain `${` goes through the property (`el.text = data`), which is literal. Language §3.7 says so next to the existing warning about code in strings |
| Server-rendered HTML with user data in `text` | `${` in the data runs as code. Better than today (anything that looks like code runs), not zero: escape `${` as `\${`, or set the property |
| Vue `text="…"`, Angular `text="…"` (static) | a template; `:text`, `[text]`, React `text={…}` set the property: literal |
| `reveal` | counts the characters of the joined string; while a part is undefined, nothing to reveal |
| Text that changes every frame (`${t}`) | the line layout is rebuilt in every frame, as with a backtick template today |
| A custom shape's template attribute | its `draw()` receives the joined string or `null` (D1) |

## 7. Migration

(2026-11-27: the real counts, with the docs snippets, are in §13.1.)

Counted on the docs, example and test pages (the two survey scripts):

| | Count | Rewrite |
|---|---|---|
| `text` in single quotes | 463 | remove the quotes; a literal `${` becomes `\${` |
| backtick templates, backticks for an apostrophe | 42 | remove the backticks |
| expressions (concatenation, ternary, `ref`, `t`) | 141 | a concatenation of quoted strings and code becomes a template (`'x = ' + ref.a.x` → `x = ${ref.a.x}`); anything else is wrapped whole (`${…}`), which always gives the same value |
| plain text | 65 | none, unless it contains `${` |
| `<pxl-text>` without `align` / without `baseline` | 168 / 405 of 715 | `align="start"` / `baseline="alphabetic"` added: they keep their exact position |
| `align="center"` / `baseline="middle"` written | 404 / 97 | removed: now the default |
| `<pxl-text>` in the code snippets of docs pages (escaped HTML: `text.html` 14, `frameworks.html` 4, `linear.html` 2, `fill.html` 1) | 21 | by the same script, which also reads the escaped form; framework snippets with a binding (`text={label}`, `:text`) stay |
| `setAttribute('text', …)` in scripts, `<pxl-text>` made with `createElement()` in tests | 2 / 2 | by hand (the script reads markup only) |
| `design/prototypes/` pages with `<pxl-text>` | 25 | **not migrated**: prototypes are history and load `/dist/pxl.js`, so after the build they show quotes and centered labels; their status lines name the commit they were made with where it matters |
| open plans with quoted labels in examples (`design/ideas/2026-10-30_space_attribute_plan.md`, `design/ideas/2026-09-29_pxl-clip_element_plan.md`) | 2 | a Log line each (CLAUDE.md "Plans and TODO" rule 6) |

A script (kept in `design/prototypes/2026-11-27_text_template/`) does the mechanical rows and prints every expression it rewrote for a check by eye. That the pages look the same afterwards is checked by the render tests, the sweep (a value that stopped compiling would warn) and by eye on the docs pages. The alignment rows keep every label in place; on the docs pages, labels that would look right centered lose their `align="start"` / `baseline="alphabetic"` when C3 of the release plan rewrites them (D2).

## 8. Tests

- `tests/unit.html`, `pxl.parseTemplate()` as a table: plain text, quotes, backticks, backslashes, `\n`, `\${`, one and several parts, a whole value `${…}`, a static part `${1 + 1}`, quotes and braces inside a part, a nested template, unclosed `${`, empty `${}`, a part that doesn't compile (warning, text as written).
- `tests/index.html`: a reactive template updates in the next frame after its source; a template with `t` is animated; an `undefined` part draws nothing and isn't hit, then appears when the target connects; Rule A for `text` (bare, removed); the property stays literal (`el.text = '${1}'` shows `${1}`); `setAttribute('text', …)` is a template; a custom shape with `static templateAttributes`.
- `tests/render.html`: a text with default alignment is centered on its `x`, `y` (pixel probes left / right and above / below); `align="start"` still draws from `x`.
- `tests/unit.html` "Rule A for every attribute": the new defaults of `align` and `baseline`.
- The parser tests of language §3.1 that used `text` values move to another attribute or to the template table.

Existing tests that change (checked 2026-11-27; all pass today):

| Test | Why | Change |
|---|---|---|
| `tests/render.html` "text: drawn from x on the alphabetic baseline by default" | the default changes | becomes "centered on x, y by default"; a second test keeps `align="start"` `baseline="alphabetic"` drawing from `x` on the baseline |
| `tests/render.html` "width wraps … with the alphabetic baseline the last line sits on y" | relies on the default baseline | the script adds `baseline="alphabetic"`; the title stays true. A new test: with the default `middle` a block of lines is centered on `y` |
| `tests/unit.html` "pxl-text: a string set as the text property is text …; the attribute still compiles" | `setAttribute('text', "'a' + 'b'")` gave `ab`; now it shows the quotes | the attribute half becomes `${'a' + 'b'}` → `ab`, plus `'a' + 'b'` → literal |
| `tests/unit.html` "Rule A for every attribute" | generated from `static defaults` | nothing: it follows the new defaults by itself |
| `tests/index.html` text box, hit testing and isolation tests (`tbChain`, "text with its box", the isolated-box tests) | positions computed with the old defaults | the script adds `align` / `baseline` in their markup; the two `createElement('pxl-text')` cases copy attributes and need nothing; checked by running them |
| `tests/index.html` `setAttribute('text', 'one\\ntwo\\nthree')` | no `${` | nothing: a static string, the line breaks as before |
| `tests/types/` (`text.text = 'Q1 - 2024'`, `text.text = 42`) | the property | nothing; the generated typings list the same keywords for `align` / `baseline` |
| `tests/smoke/` (React `text={label}`, Vue `:text="label"`) | bindings set the property | nothing; they already check that `alert(1)` as a label is shown, not run |

Tests that are missing today and come with the build: every row of §5 and §6 that has none (the template table in `unit.html`; the `undefined` part, reactive and animated templates, `\${`, the property staying literal in `index.html`; centered by default in `render.html`). The migrated pages need no tests of their own: the sweep catches a label that stopped compiling (it warns), and the render tests cover the alignment.

## 9. Docs

(2026-11-27: built differently for `docs/text.html`, §13.2.)

- `.agents/KILOPIXEL.md`: §3.1 (`text` and template attributes are read differently, first line), §3.2 (text in expressions), §11.6 (`text` row; `align`, `baseline` defaults), §12 (`static templateAttributes`), §14 (pitfalls: quoting text is gone; `text="ref.x"` shows the words), every example with `text`.
- `.agents/ENGINE.md`: §3 (the template parser), `Text` defaults.
- `docs/text.html`: a section "What `text` Accepts" (plain text, `${…}`, `\${`, `\n`, `undefined` parts, the property); alignment section updated for the new default.
- `docs/js/api-tabs.js`: the `text`, `align`, `baseline` entries; `docs/frameworks.html`: a static attribute is a template, a binding is literal.
- `docs/DOCS_STANDARDS.md`: snippets write labels without quotes.
- `.agents/KILOPIXEL.md`: its three examples with quoted labels (§8.1 button `text="'Add'"` among them).
- `tests/` page introductions and section comments that describe the old default or quoting (render.html "With the alphabetic baseline a text block grows upward").

## 10. Cost

About 50 lines in `js/compiler.js` (scanner shared with `pxl.splitStringLiterals()`, the parser, the joining function), a few in `engine.js`, `node.js` and `text.js`. Per frame: nothing new (a template is evaluated when an expression would be).

Measured 2026-11-27 (`design/prototypes/2026-11-27_text_template/`):

- **Size:** the parser sketch (`parser_sketch.js`) minifies to 1,327 bytes, about 680 gzipped on its own (less inside the bundle): `pxl.min.js` from about 73.8 to 75 KB. No code goes away; the other attributes keep §3.1.
- **Parsing a label** (in the browser, `pxl.parseAttributeValue()` today vs. the template's `includes('${')`): plain text 250 ns → under 1 ns, a quoted label 47 → 10 ns. Not noticeable either way; a page with 50 labels saves about 10 µs.
- **Compiling:** about 94 µs for each distinct expression, once (the compile cache). With one function per `${…}` part (the sketch), a template with two parts compiles twice where today's backtick template compiles once.
- **Evaluating** (`evaluation_bench.js`, Node, two parts, the value changing every time): today's backtick template 3.3 ns, the sketch's loop over part functions 33 ns. Only labels whose value changes are evaluated, and measuring and drawing the changed text (`measureText()`, `fillText()`) costs microseconds, so 1,000 changing labels would add 0.03 ms to a 16.7 ms frame.
- **Build note:** generating one function per template (the parts inlined, each checked for `undefined` / `null` / `NaN`, then joined) instead of the loop keeps both compiling and evaluating as today, for slightly more parser code. The build takes that form if it stays small.

## 11. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Template attributes for custom shapes | `static templateAttributes` on every class, documented in language §12 / `text` only, hard-wired | **Decided 2026-11-27: `static templateAttributes`.** The Gauge's `label` already wants it, and it costs one field |
| D2 | Alignment migration | the script adds `align="start"` / `baseline="alphabetic"` where a label relied on the default (pixel-identical), docs tidied when rewritten / every page by hand now | **Decided 2026-11-27: the script.** 490 labels by hand is a week of work and risks moving labels; the docs pages are rewritten for 0.1 anyway |
| D3 | What `middle` centers | the canvas `middle` (em box) / the glyphs' box | **Decided 2026-11-27: the canvas `middle`.** Stable while the text changes; the glyphs' box would move a counter that goes from 9 to 10 |
| D4 | Expressions in the migration | readable templates where the pattern is a plain concatenation, `${…}` around the rest / `${…}` around all 141 | **Decided 2026-11-27: readable where possible.** The pages are what authors copy |

## 12. Steps

1. Decide D1–D4: done 2026-11-27 (§11).
2. Engine: `pxl.parseTemplate()`, `static templateAttributes`, `compileAttribute()`, `Text` defaults; tests (§8). Build.
3. Migration script and run (§7); `node tools/run_tests.js`; check the docs pages by eye.
4. References and docs (§9); housekeeping; `## 13. Built (date)`.

Steps 2 and 3 go into one commit: between them every page with a quoted label would show its quotes.

## 13. Built (2026-11-27)

### 13.1 What Was Built

- `js/compiler.js`: `pxl.findTemplateEnd()`, `pxl.parseTemplate()`.
- `js/engine.js`: `pxl.compileAttribute()` reads a name in `static templateAttributes` with `pxl.parseTemplate()`; `pxl.defineAccessors()` gives a template attribute a literal string setter, `pxl.setLiteral()`.
- `js/elements/node.js`: `static templateAttributes = []`. `js/elements/shapes/text.js`: `static templateAttributes = ['text']`, defaults `align: 'center'`, `baseline: 'middle'`; its own `text` getter and setter removed (the generic template accessor does the same).
- Migration (`design/prototypes/2026-11-27_text_template/migrate.js`): 738 `<pxl-text>` tags on the docs, example and test pages, the escaped docs snippets included. `text`: 466 quoted values, 42 backtick templates, 94 concatenations turned into templates, 47 other expressions wrapped in `${…}` (a code block with `return` as `${(() => { … })()}`). Alignment: `align="start"` added 166 times and `baseline="alphabetic"` 405 times where a label relied on the old default; `align="center"` removed 419 times, `baseline="middle"` 114 times. The script compared all 636 changed values in markup with the old engine (`git show HEAD:dist/pxl.js`) and the new one, run in Node with the same fake `ref` values: none differs. By hand: the benchmark's generated labels (`examples/benchmark.html`), a test's `'<pxl-text …' + …` string (left as it is: the box test doesn't depend on alignment), and one prose mention `&lt;pxl-text&gt;` the first run had turned into a tag.
- Docs: `docs/text.html` (the quoting callout replaced by "Text Is Text, ${…} Is Code"; section 2 describes the new defaults and its demo starts centered; reference entries for `text`, `align`, `baseline`), `docs/frameworks.html` (the property is literal, the attribute a template), `docs/installation.html` (sizes). `.agents/KILOPIXEL.md` §3.1 (templates first), §3.2, §3.7, §8.1, §11.6, §12, §13, §14; `.agents/ENGINE.md` §3, §4.5.

### 13.2 Deviations and Decisions During the Build

- **One generated function per template** (the build note of §10) instead of one function per part: each part as `const _p0 = (code); if (…) return null;`, then the joined string, compiled by `pxl.compileExpression()`. Caching, rewrites, flags and warnings are those of any expression, and evaluating costs what a backtick template costs. The text between the parts goes in as JSON string literals, which `pxl.splitStringLiterals()` skips.
- **A scanner of its own** (`pxl.findTemplateEnd()`) instead of sharing `pxl.splitStringLiterals()` (§3.2 step 2): that one splits whole expressions into code and strings; finding one closing brace is 20 lines on its own.
- **A part that doesn't compile:** `compileExpression()` warns (with the generated source) and returns it; `parseTemplate()` then returns the value as written.
- **Static templates** (`${1 + 1}`) come back as their string; an undefined static part as `null`.
- **Template accessors generic, not in `Text`:** `pxl.defineAccessors()` gives every template attribute the literal setter, so a custom shape's `label` behaves like `text` without code of its own (D1).
- **No new docs section with a demo** (§9): the reference entry and the callout on `docs/text.html` explain templates; a section with controls belongs to the Expressions page of the release plan (C3), which covers `${…}` for all of Kilopixel.
- **The first migration run overlapped two removals** on one line (`align="center" baseline="middle"`) and broke some tags; the script was fixed (removals merged, emptied lines dropped) and run again on the committed pages (`--from-head`), the four pages edited by hand at that point redone separately.
- **Not migrated:** 25 pages in `design/prototypes/` (history; they load `/dist/pxl.js` and now show quotes and centered labels), `tests/smoke/react.html` (`htm` bindings set properties).

### 13.3 Tests and Measurements

- `tests/unit.html` "Templates": two tables (text as written, `\${`; static parts, `undefined` / `null` / `NaN` → `null`), animated and reactive parts with text that looks like code around them, the three warnings; the text property stays literal also with `${`, the attribute is a template; a custom shape's `static templateAttributes`.
- `tests/index.html` "Text templates": an `undefined` part draws nothing and isn't hit, then appears when its target connects and follows it; a part with `t`; `setAttribute()` and the property. "safe render: a hidden shape …" now expects the string `'200'` (a template's value is a string).
- `tests/render.html`: centered on `x`, `y` by default; a block of lines centered on `y`; `align="start"` `baseline="alphabetic"` still draw from `x` on the baseline.
- Size: `pxl.min.js` 74.92 KB, gzipped 22.61 KB (before: 73.77 KB, 22.20 KB). The docs say ~75KB, ~23KB gzipped.
- `node tools/run_tests.js`: all passed, the sweep of 82 pages without console messages. By eye: `docs/mapping.html`, `docs/text.html`, `docs/arrows.html`.

### 13.4 Left

- The Expressions page (release plan C3) explains `${…}` with a demo.
- On the docs pages, labels that look right centered can drop the `align="start"` / `baseline="alphabetic"` the migration added, when the pages are rewritten (D2).

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: ✅ built (§13); moved to `design/done/`; §3.2, §7 and §9 notes point to §13.
- 2026-11-27: §7–§9: tests that change, snippets, prototypes and open plans counted.
- 2026-11-27: §10: size and speed measured (sketch and benchmark kept in the prototypes folder).
- 2026-11-27: 🟢 Decided: D1–D4 as recommended.
- 2026-11-27: written; alignment survey in `design/prototypes/2026-11-27_text_template/`.
