# Kilopixel

Declarative, reactive HTML5 Canvas engine built on Web Components (`<pxl-stage>`, `<pxl-layer>`, `<pxl-circle>`, …). Zero dependencies, one classic `<script>`, no build step for users.

**Pre-release:** nothing is published yet. Backwards compatibility is not required: prefer the cleanest API and implementation, and update affected docs pages and examples in the same change instead of keeping legacy code paths.

## Where Things Are

| Path | What |
|---|---|
| `.agents/KILOPIXEL.md` | Complete technical reference (architecture, compiler, every element and attribute). Read the relevant sections before engine or docs work. |
| `.agents/TODO.md` | Roadmap and open design questions |
| `.agents/AGENTS.md` | Rules for Google Antigravity, kept in case it is used again. Ignore it: this file is authoritative. When a rule changes here, mention whether AGENTS.md should get the same change |
| `js/` | Engine source. Build order is the `files` list in `build.js` |
| `docs/` | Public documentation site. Rules: `docs/DOCS_STANDARDS.md` |
| `design/` | Plans and notes, named `YYYY-MM-DD_<topic>_plan.md` (or `_note.md`) |
| `tests/index.html` | Automated engine tests in the browser (`http://localhost:8124/tests/`); result in the tab title and `window.kilopixelTests` |
| `examples/test*.html` | Manual demo and test pages |
| `scratch/` | Temporary files, gitignored |
| `dist/`, `docs/js/pxl.min.js`, `docs/download/*` | **Build output.** Never edit by hand; they are committed |

## Workflow

- **Approval before edits:** before changing any project file outside `scratch/`, describe what you will change and wait for an explicit OK. A code preview is not required. Reading, searching, running the dev server and writing to `scratch/` need no approval.
- **Build:** run `node build.js` after changing anything in `js/` (not after `.html` / `.md`-only changes). It runs Terser through `npx`; never install packages locally or create `node_modules` (use `npx` or a global install).
- **File size after a build:** update the `~NNKB` size of `pxl.min.js` (the build's "Minified size", rounded to whole KB) in `docs/installation.html` (section 1 text and download button) and in the header line of `.agents/KILOPIXEL.md`.
- **Keep the reference in sync:** when engine behavior or an attribute changes, update `.agents/KILOPIXEL.md` in the same change, plus the affected docs pages and examples.
- **Plan bigger changes first:** for non-trivial engine work, write a plan in `design/` and agree on it before implementing.
- **Verify in the browser:** the dev server is `node tools/serve.js` (launch config `kilopixel`, http://localhost:8124, `/` redirects to `/docs/`). Check docs pages and `examples/` there, including the console.
- **Engine tests:** after every engine change and build, open `tests/index.html`; all tests must pass. Every engine fix gets a test there (committed, unlike `scratch/`).
- **Line endings:** LF everywhere, set by `.gitattributes`. Don't change it per file.
- **Temporary files** (helper scripts, dumps, screenshots, visual prototypes) go in `scratch/`, not the project root. Don't delete them afterwards; the user cleans up.
- **Commits:** only when asked. Conventional style `type(scope): summary`, e.g. `feat(polyline): …`, `fix(arrows): …`, `docs(circle, ellipse): …`, `docs(design): …`, `refactor(engine): …`.

## Working on Another Machine

The user works on two Windows laptops. When a session starts on a machine that hasn't pulled for a while, or when the user asks to sync:
1. `git fetch` and `git status`; show what's new and pull only after the user's OK.
2. **Line endings, once per machine:** if `git ls-files --eol` shows working files as `w/crlf`, the copy predates `.gitattributes`. With no uncommitted work, rewrite them once: `git rm -r --cached -q . && git reset -q --hard HEAD`.
3. Start the dev server and open `tests/index.html`; the tab title must show all tests passed.

## Working Style

- **Pragmatic over engineered:** measure before optimizing (e.g. a micro-benchmark against the 16.7 ms frame budget) and judge edge cases by whether real users would hit them. Lead with real bugs and cheap, high-impact fixes; label micro-optimizations as such; give a concrete use case when proposing an API change.
- **Show, don't only tell:** for geometry and visual questions, build a small prototype page in `scratch/` and show it in the browser. The user understands faster from pictures.

## Engine Code Rules

- **Only `pxl` is global.** Classes are expressions on the namespace (`pxl.Line = class Line extends pxl.Shape`); internals go on `pxl._*`. `build.js` refuses top-level `class` / `const` / `let` / `var` / `function`.
- **Zero allocations in per-frame paths:** pre-allocated records and typed arrays, as in the existing shapes.
- **No defensive fallbacks** for attribute values (`alpha !== undefined`, `shadowblur || 0`): every attribute is initialized from `static defaults`.
- **Public vs. internal:** some behavior in KILOPIXEL.md is internal on purpose (e.g. `ref.<id>.pN`). Don't document it in `docs/` unless the user decides to.

## Engine Code Style

Decided 2026-10-27 (`design/2026-10-27_engine_cleanup_inventory_note.md` §2). The newest code (`line.js`, `polyline.js`, `matrix.js`) is the reference.

- **`pxl.` inside namespace functions:** `pxl.*` functions refer to other parts as `pxl.x`, never `this.x` (works when a function is passed around). Class and object methods use `this` as usual.
- **Fields in the constructor:** every field an object will ever have is set in its constructor (stable hidden classes, one place to see the state). Helpers that cache on a node (`pxl.applyLineDash`, `pxl.resolveFilter`) have their fields declared by the owning class.
- **Leading `_`:** used only inside its own class or file. No `_` = read by other classes or users. Applies to new code; existing names referenced in the design history stay.
- **Invalid user values:** guard only where an invalid value would throw or freeze (e.g. `step <= 0` in the grid), with a short comment. Otherwise no guard (an invalid value may simply draw nothing).
- **Reuse helpers instead of repeating checks:** `pxl.sortByDOMPosition`, `pxl.rewriteExpression`, `pxl.hasLineDash`, `hasFill()` / `isStroked()`, `pxl.arcEndRadians`.
- **Comments explain why**, in plain sentences. No history (git has it), no CAPS labels, no "zero-GC" / "highly optimized" tags; mention allocation only where the choice isn't obvious. Sections: `// ===` banners between top-level parts of a file, `// --- Section ---` inside classes and long methods.
- **Formatting:** 2 spaces, single quotes, `function(` without space, camelCase. `observedAttributes` / `defaults` longer than ~120 characters are split over lines, grouped like the KILOPIXEL.md tables. Deliberate alignment (`if (prop === 'x')      return …`) is fine; there is no auto-formatter. `.editorconfig` sets indentation, LF and trimming; `build.js` refuses trailing whitespace.

## Documentation Pages

- Read `docs/DOCS_STANDARDS.md` before creating or changing a docs page, and follow it (layout, colors, IDs, snippet formatting, no inline styles, neutral tone).
- The newest pages are the reference implementations: `polyline.html`, `circle.html`, `ellipse.html`, `line.html`.
- Ask before adding new CSS rules to `docs/css/docs.css`.

## English & Language Coach

The user is improving their English. Unless paused, start each response with a short **English & Phrasing Notes** section: noticeable typos, grammar fixes and more natural phrasing from the user's last message. Skip it when there is nothing worth noting. If the user asks to pause it, leave it out until they ask to resume.
