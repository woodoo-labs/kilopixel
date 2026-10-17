# Bundle Scope: No Global Names Except `pxl`

- **Status**: 🟡 **Proposed** (helper cleanup done 2026-10-17, §1; wrapper not implemented yet)
- **Date**: 2026-10-17
- **Related**: `design/2026-10-17_shape_authoring_plan.md` (custom shapes extend `pxl.Shape`), `.agents/TODO.md` §21
- **Target Implementation**: `build.js`, `js/elements/shape.js`, `js/elements/node.js`

---

## 1. Problem

`build.js` concatenates all source files into one classic script. Every top-level declaration becomes a **global name** shared by all scripts on the page. The bundle originally declared 18. The 5 internal helpers (`len`, `mathProps`, `driverNames`, `dummyCanvas`, `_parseStops`) were cleaned up on 2026-10-17: they are now loop-local, inlined, or on `pxl` (`pxl._parseStops`, `pxl.dummyCtx`), following the engine's `pxl.*` / `pxl._*` convention. **13 element classes remain global:**

`Stage`, `PxlNode`, `Layer`, `Group`, `Shape`, `Circle`, `Ellipse`, `Rect`, `Line`, `Polyline`, `Text`, `Grid`, `Variable`

Verified 2026-10-17 (each snippet as its own classic script after `pxl.min.js`):

### 1.1 User Scripts Fail with a SyntaxError

| User script | Before the helper cleanup | After the helper cleanup |
|---|---|---|
| `const len = 10`, `const mathProps = []` | ❌ `Identifier 'len' has already been declared` — the whole script doesn't run | ✅ |
| `class Circle {}` | ❌ same | ❌ still clashes |
| `const Line = 1` | ❌ same | ❌ still clashes |
| `var Grid = 1` | ❌ same | ❌ still clashes |
| `function Stage() {}` | ❌ same | ❌ still clashes |
| `let count = 0` | ✅ no clash | ✅ |

`Circle`, `Line`, `Grid`, `Stage` are typical names in drawing or game code. The error seems unrelated to Kilopixel.

### 1.2 `Text` Hides the DOM's `Text`

For every script after the bundle, a plain `Text` resolves to Kilopixel's text shape instead of the browser's `Text` (text nodes):
- `document.createTextNode('a') instanceof Text` → `false` (code checking for text nodes takes the wrong branch, e.g. editors, sanitizers, DOM utilities).
- `new Text('a')` creates a Kilopixel element instead of a text node.
- `window.Text` is still the DOM class, but plain `Text` no longer reaches it.

ES modules and bundled apps keep their own top-level names private (no SyntaxError), but a plain `Text` in their code still resolves to Kilopixel's.

---

## 2. Decision: Classic Script, Not an ES Module

Kilopixel's interface is **HTML plus standard DOM** (`setAttribute`, events). There is no Kilopixel-specific JavaScript API; loading the script registers the elements, and that's all a user needs. Distributing it as an ES module would bring little and cost something:

1. **Nothing to import.** ES modules are about `import { … }`; Kilopixel has no scripting API to import.
2. **Load timing.** `<script type="module">` is always deferred, so elements would only be defined after parsing. The docs standard loads `pxl.min.js` in `<head>` so elements upgrade during parsing (no flash of unstyled content, no layout shift).
3. **Zero build step.** A plain `<script src="pxl.min.js">` works everywhere: copied into a folder, from a CDN, in a CMS, from `file://`. Module scripts don't load from `file://` in most browsers.
4. **Bundler users are covered.** A wrapped classic file can be pulled into Vite / webpack projects as a side-effect import (`import './pxl.min.js'`).

**The one JavaScript-facing surface** is custom shapes (`class Star extends pxl.Shape`), an extension point rather than a scripting API. It works in classic scripts and modules alike, because `pxl` lives on `window`.

**Later, only if needed:** when Kilopixel is published on npm and TypeScript users ask for it, `build.js` can additionally emit a small `pxl.mjs` (same code, `export const Shape = pxl.Shape`, plus type definitions). An extra file, not a replacement.

---

## 3. Fix: Wrap the Bundle, Export via `pxl`

### 3.1 `build.js`

Wrap the concatenated source in a function, so all top-level declarations become private:

```javascript
code = `/** Kilopixel Framework v${VERSION} */\n(() => {\n${code}\n})();\n`;
```

- `window.pxl` is already assigned explicitly (`engine.js`), so it stays global.
- No `'use strict'` is added (classes are strict anyway; the rest keeps its current semantics).
- Source files are unchanged: inside the wrapper they still see each other's names.

### 3.2 Exports

Only what users need goes on `pxl`:

```javascript
// end of js/elements/shape.js
pxl.Shape = Shape; // base class for custom shapes (design/2026-10-17_shape_authoring_plan.md)
```

- `window.PxlNode = PxlNode` (`node.js`) is removed: nothing outside the bundle uses it. Non-shape custom elements are not a planned feature; export `pxl.PxlNode` only when one is.
- Built-in shape classes are not exported: they are reached through the DOM (`document.querySelector('pxl-circle')`, `customElements.get('pxl-circle')`).

### 3.3 Minification

Inside the wrapper, Terser may now mangle the class names (they are no longer global). Class names appear in warnings (`${this.constructor.name}` in `Shape.getBoundingBox()`, the planned lowercase-key warning) and in DevTools. Add `--keep-classnames` to the Terser call to keep today's readable names (costs a few hundred bytes; all other private names can still be mangled, which shrinks the bundle).

### 3.4 What Stays the Same

- **Compiled expressions and event handlers** are created with `new Function`, which always runs in global scope. They only use what is passed in (`scope`, `ref`) and the global `pxl` (`pxl.toLocal(this, …)`), so they are unaffected by the wrapper.
- **Tag names** (`pxl-*`) are global by nature (custom element registry) and already namespaced by the prefix.
- **Docs and examples** don't use any engine class name in their scripts (checked 2026-10-17).

### 3.5 Consequences for Other Plans

- **Shape authoring plan:** the template becomes `class Star extends pxl.Shape` with `static defaults = { ...pxl.Shape.defaults, … }`. Built-in shapes keep writing `Shape` (they live inside the wrapper).
- **Scratch tools** that patch `Shape.prototype` at runtime (`scratch/save_restore/always_save.js`, `scratch/custom_shape/*`) switch to `pxl.Shape`.

---

## 4. Performance & GC

No runtime difference: one extra function scope at load time. Minified size likely shrinks slightly (private top-level names can be mangled), minus the kept class names.

---

## 5. Implementation Steps

1. `build.js` — wrap the concatenated code (§3.1); add `--keep-classnames` to the Terser call (§3.3).
2. `js/elements/shape.js` — `pxl.Shape = Shape;`.
3. `js/elements/node.js` — remove `window.PxlNode = PxlNode;`.
4. `node build.js`.
5. Update the shape authoring plan template and the scratch tools to `pxl.Shape` (§3.5).
6. `.agents/KILOPIXEL.md` — Build System (wrapped bundle, only `pxl` is global), Source Files note, custom shapes extend `pxl.Shape`, the ES module decision (§2) in short.

---

## 6. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | Classic scripts after the bundle: `const len = 10`, `class Circle {}`, `const Line = 1`, `var Grid = 1`, `function Stage() {}` | all run without errors |
| 2 | `Text === window.Text`, `document.createTextNode('a') instanceof Text` | `true`, `true` |
| 3 | Only new global from the bundle | `pxl` (compare `Object.keys(window)` / global lexical names before and after loading) |
| 4 | Custom `Star` with `class Star extends pxl.Shape` | works as in `scratch/custom_shape/test.html` |
| 5 | Expressions (`t`, `wave()`, `toLocal()`, `ref.*`) and event handlers | unchanged behaviour |
| 6 | `getBoundingBox()` warning from a shape without it | shows the readable class name |
| 7 | Rule A unit tests and regression (`scratch/rule_a/unit.html`, `regress.html`) | 20 / 20; identical values on all pages, no new console errors |
