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
| `examples/test*.html` | Manual test pages (there are no automated tests) |
| `scratch/` | Temporary files, gitignored |
| `dist/`, `docs/js/pxl.min.js`, `docs/download/*` | **Build output.** Never edit by hand; they are committed |

## Workflow

- **Approval before edits:** before changing any project file outside `scratch/`, describe what you will change and wait for an explicit OK. A code preview is not required. Reading, searching, running the dev server and writing to `scratch/` need no approval.
- **Build:** run `node build.js` after changing anything in `js/` (not after `.html` / `.md`-only changes). It runs Terser through `npx`; never install packages locally or create `node_modules` (use `npx` or a global install).
- **Keep the reference in sync:** when engine behavior or an attribute changes, update `.agents/KILOPIXEL.md` in the same change, plus the affected docs pages and examples.
- **Plan bigger changes first:** for non-trivial engine work, write a plan in `design/` and agree on it before implementing.
- **Verify in the browser:** the dev server is `node tools/serve.js` (launch config `kilopixel`, http://localhost:8124, `/` redirects to `/docs/`). Check docs pages and `examples/` there, including the console.
- **Temporary files** (helper scripts, dumps, screenshots, visual prototypes) go in `scratch/`, not the project root. Don't delete them afterwards; the user cleans up.
- **Commits:** only when asked. Conventional style `type(scope): summary`, e.g. `feat(polyline): …`, `fix(arrows): …`, `docs(circle, ellipse): …`, `docs(design): …`, `refactor(engine): …`.

## Working Style

- **Pragmatic over engineered:** measure before optimizing (e.g. a micro-benchmark against the 16.7 ms frame budget) and judge edge cases by whether real users would hit them. Lead with real bugs and cheap, high-impact fixes; label micro-optimizations as such; give a concrete use case when proposing an API change.
- **Show, don't only tell:** for geometry and visual questions, build a small prototype page in `scratch/` and show it in the browser. The user understands faster from pictures.

## Engine Code Rules

- **Only `pxl` is global.** Classes are expressions on the namespace (`pxl.Line = class Line extends pxl.Shape`); internals go on `pxl._*`. `build.js` refuses top-level `class` / `const` / `let` / `var` / `function`.
- **Zero allocations in per-frame paths:** pre-allocated records and typed arrays, as in the existing shapes.
- **No defensive fallbacks** for attribute values (`alpha !== undefined`, `shadowblur || 0`): every attribute is initialized from `static defaults`.
- **Public vs. internal:** some behavior in KILOPIXEL.md is internal on purpose (e.g. `ref.<id>.pN`). Don't document it in `docs/` unless the user decides to.

## Documentation Pages

- Read `docs/DOCS_STANDARDS.md` before creating or changing a docs page, and follow it (layout, colors, IDs, snippet formatting, no inline styles, neutral tone).
- The newest pages are the reference implementations: `polyline.html`, `circle.html`, `ellipse.html`, `line.html`.
- Ask before adding new CSS rules to `docs/css/docs.css`.

## English & Language Coach

The user is improving their English. Unless paused, start each response with a short **English & Phrasing Notes** section: noticeable typos, grammar fixes and more natural phrasing from the user's last message. Skip it when there is nothing worth noting. If the user asks to pause it, leave it out until they ask to resume.
