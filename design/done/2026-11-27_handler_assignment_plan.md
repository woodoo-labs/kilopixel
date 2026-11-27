# Assignment in Handlers Instead of `set()`

- **Status**: ✅ **Implemented** (2026-11-27, §10: handlers assign through their own `ref`; `set()` removed)
- **Date**: 2026-11-27
- **Related**: `design/done/2026-10-30_framework_compatibility_plan.md` (§24: properties, one `setValue()` path, P4 literal `text`, P6 `set()` through the property), `design/archive/events_implementation_plan.md` (where `set()` came from), `design/archive/variable_implementation_plan.md` (`ref` as a plain object, the `?.` rewrite), `design/ideas/2026-11-27_scoped_names_note.md` (would change how `ref` finds an element), `.claude/CLAUDE.md` "Engine Code Rules" (used through HTML and the DOM)
- **Target Implementation**: `js/interaction.js` (`pxl.compileHandler`), `js/compiler.js` (`pxl.rewriteExpression`), `js/engine.js` (`pxl.setFromRef`), `js/elements/node.js`, `js/elements/stage.js`, `tests/frameworks.html`, `tests/index.html`, `examples/test32.html`, `examples/test33.html`, `examples/test37.html`, `.agents/KILOPIXEL.md`, `.agents/ENGINE.md`, `.claude/CLAUDE.md`

---

## 1. Goal

A handler changes another element with plain JavaScript assignment, and `ref.<id>.set()` goes away:

```html
<!-- today -->
pxl-on-click="ref.counter.set('value', ref.counter.value + 1)"
<!-- after -->
pxl-on-click="ref.counter.value++"
```

`ref.<id>.set()` is the one Kilopixel-specific call left for using a scene (CLAUDE.md "Used through HTML and the DOM"). Assignment does what the element's property does (`el.value = …`), so nothing new has to be learned. Docs pages don't use `set()`; it appears in three example pages, two test pages and the references.

## 2. Today

- **Assignment is a SyntaxError.** Handlers are compiled with `pxl.rewriteExpression()`, which turns `ref.a.b` into `ref.a?.b`, and JavaScript doesn't allow assigning to an optional chain. `ref.box.r += 10` throws "Invalid left-hand side in assignment" from `attributeChangedCallback()` (uncaught, without the element's name), and the handler isn't added.
- **Without the rewrite it would fail silently.** `ref.<id>` is the element's plain `values` object (`pxl.nodes[id]`); a write there changes the number but marks nothing changed, so readers don't update and nothing redraws.
- **`set(name, value)`** (`pxl.setFromRef()`, hidden on `values` in `node.js` and `stage.js`): a string goes through `setAttribute()` (compiled like the attribute), any other value through the property; an unknown name warns once per element type and name (`pxl._unknownSetNames`) and is still set as an attribute.
- **Why `set()` exists:** it is as old as the engine (2026-06-29). Back then `ref` had to be a plain object for fast reads in every frame (the earlier Proxies were removed for that), the `?.` rewrite made assignment impossible, and elements had no properties: `setAttribute()` was the only way to change a value. Properties came on 2026-11-19 (framework plan §24), and with them a write path that handles change tracking, redraws and unchanged values. That makes this change small.
- **Already works:** `this.r += 10` in a handler (`this` is the element, every attribute is a property).

## 3. Design

### 3.1 A `ref` of Its Own for Handlers

Handlers are compiled separately from attribute expressions (`pxl.compileHandler()`), so they can get a different `ref` without touching the per-frame path:

- **Expressions are unchanged:** they keep `ref` = `pxl.nodes` (the plain `values` objects) and the `?.` rewrite. Reads in every frame stay plain property reads.
- **Handlers get `pxl.handlerRef`:** `ref.<id>` returns a wrapper around that element's `values`, created on first use and kept in a field of the element (set to `null` in the constructor). Reads go to `values` as today (`ref.box.r`, `isHovered`, `tx`, `pN`, a stage's `mouseX`); writes go to the element (§3.2).
- **No `?.` in handlers:** `pxl.compileHandler()` uses only the `toLocal(` part of the rewrite. Assignment then compiles (§3.4 for missing ids).
- **`toLocal()` in handlers** keeps working: `pxl.toLocal()` reads `targetObj.$node`, which the wrapper passes through.

A `Proxy` is the simplest wrapper (one shared handler object, one `Proxy` per element on first use). Handlers run once per event (`pxl-on-move` at most once per frame), so its cost doesn't matter; it never appears in an expression.

### 3.2 What an Assignment Does

`ref.<id>.<name> = value` in a handler does exactly what `element.<name> = value` does (language §3.7): numbers, booleans, arrays and gradient objects are stored as they are; `null` / `undefined` reset to the default; a function warns; strings are compiled like the attribute, **except `text`, which is literal** (D1). Compound forms work because they read through the wrapper and write through the property: `ref.counter.value++`, `ref.box.r += 10`, `ref.box.r *= 1.1`.

The attribute path stays the standard DOM one: `setAttribute()` on the element (`this.setAttribute(…)` for the handler's own element, `document.getElementById(…).setAttribute(…)` for another) compiles any string, `text` included. The wrapper has no `setAttribute()`: `ref.<id>` holds values, not the element.

### 3.3 Names That Can't Be Assigned

(2026-11-27: built with a list per class instead of the rule below, and the assignment returns `false`, §10.2.)

A name is assignable when the element has it both as a value and as a property (`name in values && name in element`): its attributes, including `hidden`. Everything else warns once per element type and name and changes nothing:

- states and readouts: `isHovered`, `isPressed`, `tx`, `ty`, `pN`, a stage's `mouseX`, `mouseY`, `width`, `height`, `fps`, `renderAvg`, `renderMax`;
- names the element doesn't have (a typo, a renamed attribute: the case `set()` warns about today, framework plan T-N1);
- hyphenated names (`pxl-on-click`): attributes only, as everywhere (D4).

The rule allocates nothing and needs no list per class.

### 3.4 Ids That Don't Exist

Without `?.`, `ref.nope.x` in a handler throws a `TypeError`. `pxl.compileHandler()` already catches and logs it with the element and the attribute (`[pxl] <pxl-rect id="btn"> pxl-on-click failed: …`), and the event's other listeners still run. In expressions a missing id must stay `undefined` (an expression runs before its target connects); in a handler, the targets are connected by the time someone clicks, so a missing id is a typo or a removed element, and an error that names it is more useful than a silent `NaN` (D3). An author who expects a missing element writes `ref.tooltip?.x` for a read; assignment to it then needs an `if (ref.tooltip)`.

### 3.5 What Doesn't Change

- Attribute expressions: same `ref`, same speed, same `?.` rewrite. An assignment inside an attribute expression stays a SyntaxError (warned, used as text): expressions have no side effects.
- Scripts outside handlers change elements through the DOM (`getElementById('box').r = 50`, `setAttribute()`), as documented.
- `pxl.nodes` stays internal.

## 4. Behavior After the Change

| Handler code | Result |
|---|---|
| `ref.counter.value++` | the variable counts up; readers update in the next frame |
| `ref.box.r += 10` | `r` grows by 10 (an animated `r` becomes static, as with the property today) |
| `ref.box.x = '500 + sin(t) * 100'` | `x` becomes animated (strings compile, like `el.x = …`) |
| `ref.label.text = 'Level 2-3'` | shows `Level 2-3` (literal, D1) |
| `ref.box.fill = null` | `fill` back to its default |
| `ref.box.isHovered = true` | warning once, nothing changes |
| `ref.box.raduis = 5` | warning once, nothing changes |
| `ref.nope.x = 5` | `TypeError`, logged with the handler's element; other listeners run |
| `ref.box.set('r', 5)` | `TypeError` (`set` is gone, D2): logged the same way |
| `x="ref.box.r = 5"` (an attribute) | SyntaxError: warned, used as text (unchanged) |

## 5. Cost

(2026-11-27: the real build is larger than the sketch, §10.3.)

- Per frame: nothing. Expressions don't see the wrapper.
- Per element: one field; one `Proxy` the first time a handler reads `ref.<id>` of it.
- Per event: one `Proxy` get per `ref.<id>` access in the handler, a few nanoseconds.
- Code: about 30 lines in `interaction.js`, minus `pxl.setFromRef()` and the two hidden `set` properties. Measured 2026-11-27 with a sketch of the change applied to `dist/pxl.js` and minified like the build, `scratch/size_handler_assignment/measure.js` (not kept): `pxl.min.js` +1 byte (75,326 → 75,327), gzipped +71 bytes (22,599 → 22,670). The sizes in the docs (~74KB, ~22KB gzipped) stay the same.

## 6. Tests

In `tests/frameworks.html` (the DOM contract; replaces the two `set()` tests, T-N1 moves to assignment) or `tests/index.html` (engine):

- `ref.<id>.value++` on a `<pxl-var>`: a reader updates in the next frame; the layer redraws.
- `+=` on a shape attribute; a number stays a number (no compile); an array stays the same array.
- A string compiles (`x` becomes animated); `text` stays literal (`'Level 2-3'`, `'Q1 - 2024'`).
- `null` resets to the default.
- A state (`isHovered`), a readout (`tx`, a stage's `fps`) and an unknown name each warn once per element type and name and change nothing.
- An unknown id throws inside the handler and is logged with the element's name; a second listener on the same event still runs.
- `toLocal(ref.x, 'x')` in a handler (the existing test at `tests/index.html` line 152).
- `ref.<id>.set` is `undefined` in handlers and in `pxl.nodes`.
- Expressions: a reader of `ref.<id>` still reads `undefined` before its target connects (`?.` kept).

After the build: `node tools/run_tests.js --tests`, then `--smoke` and one smoke page with the real mouse (handlers are interaction, CLAUDE.md "Tests").

## 7. Docs and Examples

| File | Change |
|---|---|
| `.agents/KILOPIXEL.md` | §3.6 "Setting from handlers" rewritten (assignment, §3.2–§3.4 in short); §8.2 handlers: their `ref` assigns; §8.1 and §11.8 examples shortened |
| `.agents/ENGINE.md` | §2 (`values` without hidden `set`), `pxl.setFromRef()` replaced by the handler `ref`, §8.7 handlers |
| `.claude/CLAUDE.md` | "Used through HTML and the DOM": the clause "`ref.<id>.set()` is the one exception today" removed |
| `examples/test32.html`, `test33.html`, `test37.html` | 34 handler lines: `ref.val1.set('value', v)` → `ref.val1.value = v`, `ref.clicks.set('value', ref.clicks.value + 1)` → `ref.clicks.value++` |
| `tests/index.html` | two handlers (lines 152, 2515) |
| `docs/` | nothing uses `set()`. Optional: `docs/frameworks.html` or an events section could show one handler with assignment |

Open plans that mention `set()` (`design/2026-09-30_path_element_plan.md` §7 test case 6) get a Log line when this is built.

## 8. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | What an assigned string does | (a) like the property: compiled, except `text`, which is literal / (b) like the attribute: always compiled (`set()` today) | **Decided 2026-11-27: (a).** One rule (`ref.x.n = v` is `el.n = v`); data in `text` (`ref.label.text = ref.input.value`) is never run as code and never breaks on `Q1 - 2024`. A label that should follow a value is written declaratively (`text="…ref.score.value…"`), which needs no handler; a new expression from a handler or script goes through the DOM: `document.getElementById('label').setAttribute('text', …)` compiles it like any attribute |
| D2 | Keep `set()` | remove / keep as a second way | **Decided 2026-11-27: remove.** With (a) it only differs for `text` and hyphenated names, and the project is pre-release (no backwards compatibility) |
| D3 | Missing ids in handlers | (a) no `?.`: a `TypeError`, logged with the element / (b) rewrite only reads (needs to tell assignment targets from reads in the source: fragile) | **Decided 2026-11-27: (a)** |
| D4 | Assigning handlers (`pxl-on-click`) from a handler | not through `ref` (DOM: `getElementById(…).setAttribute(…)`) / through `ref.x['pxl-on-click']` | **Decided 2026-11-27: not through `ref`.** Rare, and handler attributes are attribute-only everywhere |

## 9. Steps

1. Decide D1–D4: done 2026-11-27 (§8).
2. Engine: `pxl.handlerRef`, the wrapper and its field, `pxl.compileHandler()` without `?.`; remove `pxl.setFromRef()`, `pxl._unknownSetNames` (the warning moves to the wrapper) and the hidden `set` in `node.js` and `stage.js`. Build.
3. Tests (§6), examples and the two test handlers (§7).
4. KILOPIXEL.md, ENGINE.md, CLAUDE.md; housekeeping (CLAUDE.md "Plans and TODO" rule 6); `## 10. Built (date)`.

`feat(engine)!: assign in handlers (ref.counter.value++); remove ref.<id>.set()`

## 10. Built (2026-11-27)

### 10.1 What Was Built

- `js/interaction.js`: `pxl.handlerRef`, a `Proxy` over `pxl.nodes` whose `ref.<id>` returns the element's `assigningRef` (a `Proxy` over its `values`, created on first use; `undefined` for an unknown id); the shared trap object `pxl.ASSIGNING_REF` (`set` only: reads go to `values`); `pxl._assignableNames` (a `Set` per class) and `pxl._unassignableNames` (warned names); `pxl.compileHandler()` compiles with `pxl.rewriteExpression(source, true)` and `pxl.handlerRef`.
- `js/compiler.js`: `pxl.rewriteExpression(str, isHandler = false)`: handlers keep `ref.a.b`; `toLocal(` is rewritten in both.
- `js/elements/node.js`, `js/elements/stage.js`: the field `assigningRef` (`null`); the hidden `set` on `values` removed.
- `js/engine.js`: `pxl.setFromRef()` and `pxl._unknownSetNames` removed.
- Examples: 64 `set()` calls in `examples/test32.html` (55), `test33.html` (5), `test37.html` (4) rewritten as assignments (§7 counted 34 lines; several lines held two calls). `ref.x.set('value', ref.x.value + 1)` became `ref.x.value++`; strings such as `'hsl(350, 100, 60)'` and `'brightness(150)'` compile through the property as they did through `setAttribute()`.
- References: `.agents/KILOPIXEL.md` §3.6 (setting from handlers), §8.1 and §11.8 examples, §8.2 (handler `ref`, missing ids); `.agents/ENGINE.md` §2, §3 step 5, §4.1, §4.5, §8.7; `.claude/CLAUDE.md` "Used through HTML and the DOM" no longer names an exception.

### 10.2 Deviations and Decisions During the Build

- **Assignable names: the class's `observedAttributes` without `id` and hyphenated names,** cached as a `Set` per class on the first assignment, instead of §3.3's `name in values && name in element`. The stage keeps `ratio` and `alwaysrender` out of its `values` (they are attributes with their own accessors), so the rule of §3.3 would have refused `ref.main.ratio = '2 / 1'`, which `set()` allowed.
- **`id` can't be assigned** (§3.3 didn't mention it): renaming an element from a handler through `ref` is no use case, and the DOM path stays (`this.id = …`).
- **A refused assignment returns `false`,** not `true` (§3.3 said "changes nothing"). `tx`, `ty` and `$node` are non-configurable properties of `values` without a setter; a `Proxy` trap that reports them as assigned throws a `TypeError` (found by the T-N1 test). Handlers are compiled as sloppy-mode code, so `false` fails silently after the warning.
- **One rewrite function with a flag** (`isHandler`) instead of a second one, so the `toLocal(` rewrite stays in one place.
- **Field name `assigningRef`,** no underscore: `node.js` and `stage.js` declare it, `interaction.js` writes it (CLAUDE.md "Leading `_` = ownership").

### 10.3 Tests and Measurements

- `tests/frameworks.html`: "handlers assign through ref like the property" (`++` on a `<pxl-var>` with a reader, `+=`, an array, a string that compiles, literal `text` `'Q1 - 2024'`, `null` to the default, no attribute written, at most one cache entry); "an unknown id throws, logged with the element; the other listeners still run; set() is gone"; T-N1 rewritten: an unknown name, a state, a readout, `id` and a stage readout each warn once and change nothing, a stage's `ratio` is assigned. Both `set()` tests removed.
- `tests/unit.html`: `rewriteExpression(…, true)` keeps `ref.a.b` and rewrites `toLocal(`.
- `tests/index.html`: the two handlers (`toLocal()` in a handler, a handler that removes itself) assign instead of calling `set()`.
- Size: `pxl.min.js` 73.77 KB, gzipped 22.20 KB, from 73.56 KB and 22.07 KB: about +220 bytes minified and +130 bytes gzipped, more than the sketch of §5 (+1 / +71 bytes) because of the name list per class and the longer warning. The sizes in the docs (~74KB, ~22KB) are unchanged.

### 10.4 Left

Nothing. Optional: a handler with assignment in `docs/frameworks.html` or an events section of the docs.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: ✅ built (§10); moved to `design/done/`; §3.3 and §5 notes point to §10.
- 2026-11-27: 🟢 Decided: D1 (a), D2 remove `set()`, D3 (a), D4 not through `ref`, as recommended.
- 2026-11-27: §3.2 and D1: expressions keep the standard path, `setAttribute()` on the element.
- 2026-11-27: written after the review of the session; D1–D4 open.
