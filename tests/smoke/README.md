# Framework Smoke Pages

Kilopixel in real frameworks, loaded the way a page without a build step loads it: Kilopixel as a script tag
(`/dist/pxl.min.js`), the framework from a CDN. They complement `tests/frameworks.html`, which tests the DOM contract
with plain DOM calls: a framework can have its own rules that no contract test knows (React builds `onPointerEnter`
only from `pointerout`, found here on 2026-11-19). Plan: `design/2026-10-30_framework_compatibility_plan.md` §12, §25;
results and history: `design/prototypes/2026-10-30_framework_compatibility/FINDINGS.md`.

| Page | Framework | Tests |
|---|---|---|
| `react.html` | React 19.1.0 with htm, from esm.sh | the shared scene checks (`checks.js`) |
| `vue.html` | Vue 3.5.13 with the template compiler, from jsDelivr | the shared scene checks (`checks.js`) |
| `tailwind.html` | Tailwind CSS 4.1.7 browser build, plain HTML | its own: utilities on stages, layers, groups and shapes, cursor classes |

## Running Them

- **Headless:** `node tools/run_tests.js --smoke` (add `--verbose` to list every test). Needs internet. Not part of
  the normal run (`node tools/run_tests.js`, `--tests`) or of CI: a CDN outage must not fail those.
- **In the browser:** through the dev server, e.g. http://localhost:8124/tests/smoke/vue.html. The tests run when the
  page loads, like the other test pages (`tests/runner.js`); `?grep=text` runs a subset, `?grep=skip` none, to try
  the scene with the mouse.
- **Real mouse:** worth doing after changes to interaction: hover the blue button from empty space, over its label and
  out (its fill turns darker while hovered), click it, click a shape. The browser pane must be visible: a hidden pane
  leaves stages unsized.

## The Shared Scene

`checks.js` describes the scene every framework page renders in its own syntax (two instances of one component), how
a page registers its instances (`window.smoke.instances`), and the checks: properties (numbers, arrays, literal text,
expression strings, colors and points from state), events on shapes and groups (clicks, `stopPropagation()`, enter /
leave from empty space and from another shape, the cursor) and mount / unmount. A new framework page renders the same
scene and calls `runSceneChecks()` from a classic script, so it also reports when its framework can't load.

## Adding a Framework

Copy `vue.html` (template-based) or `react.html` (JSX-like with htm), keep the ids, the initial state and the
`data-state` element as described in `checks.js`, and register both instances. Candidates from plan §12: Preact, Lit
(also a stage in a shadow root), Solid, Alpine, htmx; Svelte 5 needs its compiler in the page. Angular needs a build:
an npm app in `tests/smoke/angular/` (its `node_modules` ignored by git, `npm ci` on each laptop), skipped on
2026-11-19 for now (framework plan §28).
