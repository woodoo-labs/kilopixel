# TypeScript Definition Tests

Checks the generated definitions in `dist/types/` (made by `tools/build_types.js` during `node build.js`) against the
real types of each framework. Plan: `design/2026-10-30_framework_compatibility_plan.md` §27.

## Setup, Once per Laptop

```bash
npm ci
```

in this folder. It installs exactly the versions in `package-lock.json` (TypeScript, `@types/react`, Preact, Solid with
`@solidjs/web`, Vue with `vue-tsc`, Svelte with `svelte-check`, about 70 MB) into `node_modules/`, which git ignores.
Run it again when the lock file changed in a pull. Add or update a package only with the user's OK, and commit the
lock file (CLAUDE.md "Build").

## Running

- `node tools/run_tests.js --types` (with `--verbose` to list every check), or `node tests/types/check.js`.
- Not part of the normal run (`node tools/run_tests.js`, `--tests`) or of CI.

## How It Works

`check.js` copies the definitions into `kilopixel/` here (ignored by git): TypeScript finds `react`, `vue`, … from the
folder of the file that imports them, so they must sit inside the project, as they do in a user's project. Then:

| Check | Tool | Fixture |
|---|---|---|
| `kilopixel.d.ts`, no framework (also Angular) | `tsc -p tsconfig.core.json` | `fixtures/core.ts` |
| React 19 | `tsc -p tsconfig.react.json` | `fixtures/react.tsx` |
| Preact 11 | `tsc -p tsconfig.preact.json` | `fixtures/preact.tsx` |
| Solid 2 | `tsc -p tsconfig.solid.json` | `fixtures/solid.tsx` |
| Vue 3 | `vue-tsc --noEmit -p tsconfig.vue.json` | `fixtures/vue/Scene.vue` |
| Svelte 5 | `svelte-check` | `fixtures/svelte/Scene.svelte`, `fixtures/svelte/Wrong.svelte` |

Each fixture uses the elements correctly (it must compile) and wrongly, marked `@ts-expect-error` (or
`@vue-expect-error`): a marked line that compiles fails the check. `svelte-check` has no such comments in markup, so
`Wrong.svelte` must give exactly the errors `check.js` lists (`SVELTE_EXPECTED`). A Svelte fixture needs
`<script lang="ts">`, or its markup isn't type-checked.
