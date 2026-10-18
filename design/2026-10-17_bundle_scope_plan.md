# Bundle Scope: No Global Names Except `pxl`

- **Status**: 🟡 **Proposed** (helper cleanup done 2026-10-17, §1; revised 2026-10-18: pure namespace pattern instead of a wrapper, §3)
- **Date**: 2026-10-17 (revised 2026-10-18)
- **Related**: `design/2026-10-17_shape_authoring_plan.md` (custom shapes extend `pxl.Shape`), `.agents/TODO.md` §21
- **Target Implementation**: `build.js`, `js/elements/node.js`, `js/elements/stage.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/variable.js`, `js/elements/shape.js`, `js/elements/shapes/*.js`

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
4. **Bundler users are covered.** A classic file can be pulled into Vite / webpack projects as a side-effect import (`import './pxl.min.js'`).

**The one JavaScript-facing surface** is custom shapes (`class Star extends pxl.Shape`), an extension point rather than a scripting API. It works in classic scripts and modules alike, because `pxl` lives on `window`.

**Later, only if needed:** when Kilopixel is published on npm and TypeScript users ask for it, `build.js` can additionally emit a small `pxl.mjs` (same code, `export const Shape = pxl.Shape`, plus type definitions). An extra file, not a replacement.

---

## 3. Fix: Pure Namespace Pattern

Everything the engine defines lives on the one global object `pxl`. The classes become **class expressions assigned to the namespace**, exactly like the existing `pxl.InteractionEngine = class { … };` (`interaction.js`) and `pxl.Matrix = { … };` (`matrix.js`).

### 3.1 Class Definitions

```javascript
// node.js
pxl.PxlNode = class PxlNode extends HTMLElement { … };

// shape.js
pxl.Shape = class Shape extends pxl.PxlNode { … };

// shapes/line.js
pxl.Line = class Line extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, x1: 0, y1: 0, x2: 0, y2: 0, arrowstart: 0, arrowend: 0, arrowstyle: 'filled' };

  draw(ctx, u) { … }            // unchanged
  getBoundingBox() { … }        // unchanged
};

customElements.define('pxl-line', pxl.Line);
```

- **`class pxl.Line …` is not valid JavaScript** (a class declaration needs a plain name; verified: `SyntaxError: Unexpected token '.'`). The class **expression** `pxl.Line = class Line …` is the valid form.
- **The name after `class` stays.** It exists only inside the class body (no global), but keeps `pxl.Line.name === 'Line'` for DevTools and warnings (verified in Node: `typeof Line` → `undefined`, `pxl.Line.name` → `"Line"`).
- **Semicolon after the closing brace:** it is an assignment statement now.
- **Inside the class bodies nothing changes** (`this`, `super`, fields, methods). Only references to *other* classes get the prefix: `extends pxl.Shape`, `...pxl.Shape.defaults`, `customElements.define('pxl-line', pxl.Line)`.
- **`window.PxlNode = PxlNode;`** (`node.js`) is removed; `pxl.PxlNode` replaces it.

**Scope of the change** (counted 2026-10-18): 13 class definitions, 11 `customElements.define` calls, 7 `...Shape.defaults`, 1 `window.PxlNode`. Nothing else in the engine references the classes by name. Build order stays as it is (`node.js` before `shape.js` before the shapes), so every `pxl.X` exists when it is extended.

### 3.2 Build Check Against New Globals

The namespace pattern relies on discipline: a new top-level `const` or `class` would leak again. `build.js` checks the concatenated code and refuses to build:

```javascript
// Only `pxl` may be global: a top-level declaration would leak into every script on the page
const leak = code.match(/^(?:async\s+)?(?:class|const|let|var|function\*?)\s+([A-Za-z_$][\w$]*)/m);
if (leak) {
  console.error(`Error: top-level declaration "${leak[1]}" would become a global name. Define it on pxl instead.`);
  process.exit(1);
}
```

- Matches declarations at the **start of a line** only. Code inside functions and class bodies is indented, and the expression compiler's generated code (`const { … } = scope;`) is indented inside template strings, so neither triggers it.
- Top-level loops like `for (const prop of […])` are fine: their variables are block-scoped.

### 3.3 Minification

Class expressions are not top-level names, so Terser may shorten or drop their names. Class names appear in warnings (`${this.constructor.name}` in `Shape.getBoundingBox()`, the planned lowercase-key warning) and in DevTools. Add `--keep-classnames` to the Terser call to keep them readable (costs a few hundred bytes).

### 3.4 What Stays the Same

- **Compiled expressions and event handlers** are created with `new Function`, which runs in global scope. They only use what is passed in (`scope`, `ref`) and the global `pxl`, so they are unaffected.
- **Tag names** (`pxl-*`) are global by nature (custom element registry) and already namespaced by the prefix.
- **Docs and examples** don't use any engine class name in their scripts (checked 2026-10-17).
- **Raw source files** work too: nothing depends on the build wrapping anything.

### 3.5 Consequences

- **Debugger:** typing `pxl` in the console shows every class (`pxl.Circle`, `pxl.Shape`, …) next to the existing engine functions and state.
- **Custom shapes:** `class Star extends pxl.Shape` with `static defaults = { ...pxl.Shape.defaults, … }` (shape authoring plan). Built-in shapes use exactly the same form, so the built-ins are the template.
- **Scratch tools** that patch `Shape.prototype` at runtime (`scratch/save_restore/always_save.js`, `scratch/custom_shape/*`) switch to `pxl.Shape`.

---

## 4. Decisions

| Topic | Decision | Reason |
|---|---|---|
| Distribution | ✅ classic script, no ES module (§2) | No JavaScript API to import; synchronous upgrade in `<head>`; zero build step |
| How to hide the classes | ✅ pure namespace (`pxl.X = class X …`) | Consistent with `pxl.InteractionEngine` / `pxl.Matrix`; every class visible under `pxl` in the debugger; works with raw source files |
| IIFE wrapper in `build.js` (`(() => { … })();`) | ❌ considered, not chosen | One-line change with a built-in guarantee, but inconsistent with the existing namespace style, hides the classes from the debugger unless exported one by one, and only applies to the bundle |
| Protection against new leaks | ✅ build check (§3.2) | Replaces the wrapper's structural guarantee with a failing build |
| Readable class names | ✅ `--keep-classnames` (§3.3) | DevTools and warnings |
| `window.PxlNode` | ❌ removed | Replaced by `pxl.PxlNode`; nothing outside the bundle uses it |

---

## 5. Performance & GC

No runtime difference. `pxl.Shape` and the other prefixed references are looked up once, when a class is defined, never per frame. Minified size changes only by the kept class names.

---

## 6. Implementation Steps

1. `js/elements/node.js`, `stage.js`, `layer.js`, `group.js`, `variable.js`, `shape.js`, `shapes/*.js` — `class X extends Y {` → `pxl.X = class X extends pxl.Y {`, closing `};`, `...Shape.defaults` → `...pxl.Shape.defaults`, `customElements.define('pxl-…', pxl.X)`. `Stage` and `PxlNode` keep `extends HTMLElement`.
2. `js/elements/node.js` — remove `window.PxlNode = PxlNode;`.
3. `build.js` — build check (§3.2); `--keep-classnames` (§3.3).
4. `node build.js`.
5. Scratch tools to `pxl.Shape` (§3.5).
6. `.agents/KILOPIXEL.md` — Element Hierarchy (classes on `pxl`), Build System (only `pxl` is global, build check), custom shapes extend `pxl.Shape`, the ES module decision (§2) in short.

---

## 7. Test Plan

| # | Case | Expected |
|---|---|---|
| 1 | Classic scripts after the bundle: `class Circle {}`, `const Line = 1`, `var Grid = 1`, `function Stage() {}`, `const len = 10` | all run without errors |
| 2 | `Text === window.Text`, `document.createTextNode('a') instanceof Text` | `true`, `true` |
| 3 | Global names added by the bundle | only `pxl` |
| 4 | `pxl` in the console | all 13 classes listed; `pxl.Circle.name === 'Circle'` in the minified build |
| 5 | Temporarily add a top-level `const leakTest = 1;` to a source file | `node build.js` stops with the error message; remove it again |
| 6 | Custom `Star` with `class Star extends pxl.Shape` | works as in `scratch/custom_shape/test.html` |
| 7 | Expressions (`t`, `wave()`, `toLocal()`, `ref.*`) and event handlers | unchanged behaviour |
| 8 | Rule A unit tests and regression (`scratch/rule_a/unit.html`, `regress.html` against the previous bundle) | 20 / 20; identical values on all pages, no new console errors |
