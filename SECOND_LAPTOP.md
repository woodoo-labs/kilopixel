# Setting Up the Second Laptop

Written 2026-11-22 on the first laptop. The general rules are in `.claude/CLAUDE.md` ("Working on Another Machine"); this
note is the step-by-step version. Commands are for PowerShell, run in the project folder unless a step says otherwise.

## 1. What the Laptop Needs

| Tool | Why | Check |
|---|---|---|
| Git | the code; only git syncs between the laptops | `git --version` |
| Node.js 22 or later (24 on the first laptop and in CI) | build, dev server, all tests | `node --version` |
| Chrome or Edge | the headless test run and the page sweep (Edge comes with Windows) | — |
| Internet | the first build (`npx` downloads Terser and bestzip), the smoke tests, `npm ci` | — |
| Firefox (optional) | only for the Firefox comparison scripts in `design/prototypes/2026-11-20_custom_shapes/firefox/` | — |

Not needed: Python, the `gh` CLI, a global `node_modules`.

## 2. Install Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

Then close and reopen the terminal (and the Claude app, so its shells see the new `PATH`), and check:

```powershell
node --version
```

It must print `v22` or higher. `npm` and `npx` come with Node.

## 3. Get the Code Up to Date

If the project isn't on this laptop yet:

```powershell
git clone https://github.com/woodoo-labs/kilopixel.git
```

If it is, look at what's new before pulling:

```powershell
git fetch
```

```powershell
git status
```

```powershell
git pull
```

The first `git push` from this laptop opens a GitHub sign-in window (Git Credential Manager).

## 4. Line Endings, Once per Laptop

The repository uses LF everywhere (`.gitattributes`). A working copy older than that file may still have CRLF files.
Check:

```powershell
git ls-files --eol | Select-String "w/crlf"
```

If that prints anything and you have no uncommitted work, rewrite the working copy once:

```powershell
git rm -r --cached -q . ; git reset -q --hard HEAD
```

## 5. The TypeScript Test Packages

Only `tests/types/` has npm packages (about 70 MB, ignored by git). Install them once, and again whenever
`tests/types/package-lock.json` changed in a pull:

```powershell
cd tests/types; npm ci; cd ../..
```

The smoke pages in `tests/smoke/` load React, Vue and Tailwind from CDNs and need no install.

## 6. Build and Run the Tests

The first build downloads Terser through `npx`. If npx asks "Ok to proceed?", answer `y`.

```powershell
node build.js
```

The full run (build checks, all test pages headless, the sweep of every docs and example page) must end with
"All passed.":

```powershell
node tools/run_tests.js
```

The other runs:

| Command | What it runs | When |
|---|---|---|
| `node tools/run_tests.js --tests` | build checks and the quick test pages (a few seconds) | after every engine change |
| `node tools/run_tests.js` | everything above, plus the scaling page and the page sweep | before every commit |
| `node tools/run_tests.js --smoke` | the React, Vue and Tailwind pages (needs internet) | after changes to events, hit testing, cursor or properties |
| `node tools/run_tests.js --types` | the TypeScript definitions against the real framework types (needs step 5) | after changes to attributes or `tools/build_types.js` |
| `node tools/run_tests.js --page docs/x.html` | one page's console, headless | when checking one page |

If no browser is found, set `PXL_BROWSER` to the path of `chrome.exe` or `msedge.exe`.

## 7. The Dev Server

```powershell
node tools/serve.js
```

Then open http://localhost:8124 (the docs; tests at http://localhost:8124/tests/). In the Claude desktop app, the
launch configuration `kilopixel` (`.claude/launch.json`) starts the same server in the browser pane.

## 8. What Doesn't Sync

- `scratch/`: temporary files, different on each laptop. The demo and viewer pages made there on the first laptop
  (for example `scratch/step5/demo.html`) don't exist here. What a plan needs is committed in `design/prototypes/`.
- `.claude/worktrees/` and Claude's memory: per laptop. Rules that must hold on both laptops are in
  `.claude/CLAUDE.md`, so nothing is lost; the memory only held two small reminders.
- `node_modules/` in `tests/types/`: install it with step 5.

## 9. Where the Work Stands (2026-11-22)

- Last commit: `6051eb3` (custom shapes docs). The test run on GitHub Actions passes on every push.
- The custom shapes plan (`design/2026-11-20_custom_shapes_plan.md`) is built through step 6: custom shapes work and
  are documented on `docs/custom-shapes.html`.
- Next: step 7, `<pxl-polygon>` as the first new shape written this way (`.agents/TODO.md` §47).
- Open: checking the drawing at the stage's scale in Safari, which needs a Mac or an iPhone (plan §9 step 1).

Delete this note when the second laptop is set up, or keep it for the next one.
