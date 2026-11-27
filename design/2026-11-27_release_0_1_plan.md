# Release 0.1: Scope

- **Status**: 🟢 **Decided** (2026-11-27, R1–R5 as recommended, text centered by default; next: plans for A1 and B1, §6)
- **Date**: 2026-11-27
- **Related**: `.agents/TODO.md` (every item below keeps its own entry), `.claude/CLAUDE.md` ("Pre-release", "Commits"), `design/done/2026-11-02_string_literals_in_expressions_plan.md` (today's rules for text in attributes), `design/2026-10-01_tween_animation_plan.md`
- **Prototype**: `design/prototypes/2026-11-27_release_0_1/text_survey.js` (counts every `text="…"` value and every attribute value with backticks in `docs/`, `examples/`, `tests/`; §4.1)

---

## 1. What 0.1 Means

The first public release: a versioned `pxl.min.js` on npm and a CDN, the docs site complete for what is in it, announced. From then on people build pages on it, and every change of the API costs them something.

The rule for the scope follows from that:

1. **A decision that would break pages later** is made before 0.1 (group A). Before the release it is free.
2. **What users look for on the first day** is built before 0.1 (group B).
3. **The release itself**: package, AI index, docs (group C).
4. **Everything that only adds** waits (group D): adding never breaks a page.

## 2. The Groups

### A. Decide Before 0.1

| # | Item | Question | State |
|---|---|---|---|
| A1 | Text as a template | `text` read as a template where only `${…}` is code, instead of today's guessing between text and code | **built 2026-11-27**: `design/done/2026-11-27_text_template_plan.md` |
| A2 | Default text alignment (with A1) | keep `start` / `alphabetic`, or `center` / `middle` like every other shape | **built 2026-11-27: `center` / `middle`** (R3), with A1; moves every label that relies on the default by about 14 px |
| A3 | TODO §42 negative sweep | the sign of `sweep` becomes the direction (today `sweep="-90"` draws three quarters) | 🟡, D1–D5 with recommendations and a prototype |
| A4 | TODO §49 shape filters in Safari | a fallback for `blur()` / `dropShadow()` on shapes, or a documented limit | 💬 |
| A5 | Release policy | what changes on release day (R5, §6) | **decided 2026-11-27** (R5); applied on release day |

A1 and A2 both change every label: decided together, they cost one migration of the pages instead of two.

### B. Build for 0.1

| # | Item | Why | Note |
|---|---|---|---|
| B1 | TODO §3 animation started by events | nothing can be animated once after a click today | **decided 2026-11-27** (R2): reactive values first, §5; the tween plan is rewritten before building |
| B2 | TODO §1 `<pxl-path>` | icons and SVG paths are the first thing many users try | plan exists; its code predates the custom-shape form (`static defaults`, `draw(ctx)` without `u`) |
| B3 | TODO §9 `<pxl-image>` | images are a basic need | no plan yet; late loading is analysed in `design/done/2026-11-06_text_box_accuracy_plan.md` §7 |

### C. The Release Itself

| # | Item | Note |
|---|---|---|
| C1 | TODO §43 `llms.txt` / `llms-full.txt` | generated from `.agents/KILOPIXEL.md` by `build.js`; decided |
| C2 | TODO §44 npm package | `exports`, `sideEffects`, typings; the smoke pages for Svelte and Lit with it |
| C3 | Docs: the pages marked "soon" in the sidebar | Stage, Layer, Group; Transforms (one page for Center & Offset, Zoom & Scale, Rotate & Skew, R4; the sidebar gets one entry when it is written); Grid; Expressions, Referencing, Events, Animation: 9 pages, the largest part of 0.1 |
| C4 | TODO §12 arrows page | one section left ("Rules & Edge Cases"), after A3 |
| C5 | Text docs | the `docs/text.html` section on what `text` accepts, now for templates (A1); the former quoting convention is not needed (built with A1; the section with a demo comes with the Expressions page, C3) |

### D. After 0.1

TODO §7 plot, §8 `maxfps`, §14 `paintorder`, §23 polygon, §28 `space`, §38 `smoothstyle`, §45 accessibility (focus, roles, `getBoundingClientRect()`), the parked ideas in `design/ideas/`. Independent of the release: sorting the example pages (an overview page, `scratch/examples_overview/index.html` (not kept), was built on 2026-11-27).

## 3. Order

1. **A first:** its decisions change what B and C build (A1 and A2 change every text on the docs pages C3 writes; A3 changes the arrows page C4 documents).
2. **B and C in parallel:** each item is its own plan and change. C3 can start with the pages A doesn't touch (Stage, Layer, Group).
3. **Release** (C1, C2 last): when §7 holds.

## 4. A1 in Detail: Text as a Template

### 4.1 Today, Counted

The survey script counts 711 `text="…"` values on the docs, example and test pages:

| Kind | Count | Example |
|---|---|---|
| single-quoted text | 463 | `text="'Solid Triangle'"` |
| expression (concatenation, ternary, `ref`, `t`) | 141 | `` text="'arrowstart=&quot;' + ref.sec1Poly.arrowstart + '&quot;'" `` |
| backtick template | 36 | `` text="`x = ${ref.sec5Circle.x}`" `` |
| backticks for an apostrophe | 6 | `` text="`In the Line's Space:`" `` |
| plain words | 40 | `text="Button"` |
| other plain text (digits, punctuation, `\n`) | 25 | `text="Hello Kilopixel!"` |

**About 90 % of all labels carry quoting syntax** (646 of 711): quotes around plain text "to be safe", quotes inside concatenations inside an HTML attribute, backticks. The rules behind it (language §3.1, seven steps) are what the docs keep explaining, and the docs still want a quoting convention for snippets.

Other attributes hardly use templates: of all attribute values with backticks, 42 are `text`, one is the custom Gauge's `label` (`docs/custom-shapes.html`), one is a color argument inside a filter expression (`examples/test18.html`, where `rgba(0, 0, 0, ref.shadow.value)` works without one). Filters keep backticks only for `url(#id)` without a helper (language §5.3).

### 4.2 The Idea

For `<pxl-text>` `text` (the attribute), the value is always text, and only `${…}` parts are code:

```html
<pxl-text text="Level 2-3"></pxl-text>                          <!-- text, never compiled -->
<pxl-text text="Score: ${ref.score.value} / 3"></pxl-text>      <!-- live; only ${…} is code -->
<pxl-text text="arrowstart=&quot;${ref.sec1Poly.arrowstart}&quot;"></pxl-text>
<pxl-text text="${ref.btn.isHovered ? 'On' : 'Off'}"></pxl-text>
```

Every other attribute keeps today's rules; the `text` property stays literal (no template: framework data is never code).

### 4.3 Edge Cases

| Case | Proposed behavior |
|---|---|
| A value without `${` | a static string, never compiled, no cache entry (cheaper than today) |
| Backslashes (`C:\temp`, `\u`) | literal. The engine splits the value itself (code inside `${…}` found with the brace and quote tracking of `pxl.splitStringLiterals()`); it does not wrap it in backticks, so JavaScript's escape rules (an error on `\u`, a lost `\p`) never apply. A written `\n` keeps its meaning: the text shape breaks the line there, as today |
| Backticks and quotes in the text | literal: `text="Use `npm ci` here"`, `text="It's done"` |
| A literal `${` | escaped as `\${` (the only escape) |
| Quotes inside `${…}` | single quotes, as in every attribute expression (HTML ends the attribute at `"`); `&quot;` outside `${…}` for a literal double quote |
| `${…}` unbalanced or not compiling (`${ref.a.b`) | one warning, the whole value shown as text (as today for a value that doesn't compile) |
| A part that is `undefined` or `null` (a `ref` not connected yet, a missing id) | the text draws nothing until every part is defined, like a polyline with an invalid coordinate: no "Score: undefined" flash in the first frame. `NaN` the same (it comes from arithmetic on `undefined`). Decided (R1) |
| Numbers, booleans, arrays in a part | `String()` of them (`2`, `true`, `1,2`) |
| `t` in a part | animated, as any expression with `t`; `ref` only: reactive |
| `text="ref.score.value"` (an expression without `${}`) | shows the words: becomes `text="${ref.score.value}"`. The one surprise for authors used to "every attribute is an expression", so §3.1 says it first |
| `setAttribute('text', data)` from a script | a template like the attribute. Data that may contain `${` goes through the property (`el.text = data`), which is literal |
| Server-rendered HTML with user data in `text` | `${` in the data runs as code (today any data that looks like code does: §3.7 already warns). Escape `${` or set the property |
| Frameworks | a static attribute (Vue `text="…"`, Angular `text="…"`) is a template; a binding (`:text`, `[text]`, React `text={…}`) sets the property: literal. Documented in `docs/frameworks.html` |
| `reveal`, wrapping, measuring | on the resulting string, as with a template today |
| Custom shapes with text attributes (the Gauge's `label`) | today's rules. Later, if wanted: a class lists its template attributes (`static templates = ['label']`) |
| `<pxl-var>` `value` | today's rules (a variable holds numbers as often as text) |

### 4.4 The Real Win

- **No quoting syntax for labels.** 646 of 711 values lose their quotes, backticks or `' + … + '` chains; what is left is the text, with `${…}` where a value goes in. The most common attribute an author types after `x` and `y` becomes plain HTML text.
- **A whole class of bugs goes away for text:** `Level 2-3`, `Q1 - 2024`, `Lives: 2 / 3`, `Press return` can't be compiled by accident, and no label depends on whether it happens to look like code.
- **One rule instead of seven for text:** "text is text; `${…}` inserts a value". Language §3.1 then only concerns the other attributes, and a quoting convention for the docs has nothing left to decide.
- **Safer by default:** a label from data never runs unless it contains `${`.

Not a win: nothing changes for numbers, colors, gradients and filters (they rarely need templates, §4.1), for framework bindings (the property is literal already) or for speed (a label is compiled once either way).

**The cost:** `text` is the one attribute with its own reading rule, and an author who writes `text="ref.score.value"` sees the words; about 640 values on the pages are rewritten (mostly mechanical: 463 quotes removed, 42 backticks removed; the 141 expressions by a script with a check by eye); the parser tests for text in `tests/unit.html` change. Without A1, C5 is still needed.

## 5. B1 in Detail: Animation Started by Events

`design/2026-10-01_tween_animation_plan.md` specifies `tween(duration, ease, delay)`, which runs once **from page load**. It has no way to start from a click, which is the gap for interaction. The core for that is a function that smooths a reactive value toward its target, with state per attribute:

```html
<pxl-var id="menu" value="0"></pxl-var>
<pxl-rect x="spring(ref.menu.value ? 300 : 0)" …></pxl-rect>        <!-- moves whenever the target changes -->
<pxl-circle … pxl-on-click="ref.menu.value = 1 - ref.menu.value"></pxl-circle>
```

The handler only changes a variable (assignment works since 2026-11-27); every hover, toggle, menu and button state then animates. A time-based variant (`ease(target, duration, curve)`) next to the physical `spring()`, and `tween()` from load as the smaller second part. The tween plan is rewritten around this before building (R2).

## 6. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| R1 | A1 text as a template | yes / no; and for an `undefined` part: draw nothing / empty string | **Decided 2026-11-27: yes, draw nothing.** the win is on every label (§4.4); "draw nothing" matches polylines and avoids a flash |
| R2 | B1 core | `spring()` / `ease()` on reactive values first, `tween()` from load second / the tween plan as written | **Decided 2026-11-27: reactive values first** |
| R3 | A2 together with A1 | decide the alignment in the same change as A1 / separately | **Decided 2026-11-27: together, and `center` / `middle`** (like every other shape: `x`, `y` is the center): one migration of every label |
| R4 | C3 size | 11 pages / merge the three transformation pages into one "Transforms" page (9 pages) / fewer pages for 0.1 with the rest marked "soon" | **Decided 2026-11-27: merge.** The three share one model (center, offset, transform order: language §2) |
| R5 | Release policy | from 0.1: a `CHANGELOG.md`; changes that break pages allowed in 0.x minor versions, each in the changelog; CLAUDE.md "Pre-release" and the "Commits" rule on `!` updated on release day | **Decided 2026-11-27: as listed.** Semver allows breaking changes before 1.0, the changelog makes them visible |

## 7. Done When

- Every item of A is decided (and built where the decision changes the engine), B and C are built.
- No "soon" entry left in the docs sidebar for a 0.1 page.
- `node tools/run_tests.js` (with `--smoke` and `--types`) passes; the docs sweep is clean.
- The package is published, the CDN link in `docs/installation.html` points to the version, the release policy (R5) is in effect.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: A1 and A2 built (`design/done/2026-11-27_text_template_plan.md`).
- 2026-11-27: 🟢 Decided: R1 (template, draw nothing), R2 (reactive values first), R3 (with A1, `center` / `middle`), R4 (9 pages), R5 (as listed). the TODO items on default alignment and on quoted text in the docs merged into one item, built the same day.
- 2026-11-27: written; text survey kept in `design/prototypes/2026-11-27_release_0_1/`.
