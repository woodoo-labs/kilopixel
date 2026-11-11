# One-Time Task: Bring Prototypes from This Laptop's `scratch/`

Written 2026-11-11 on the other laptop, for Claude Code (or the user) on this one. Delete this file when done.

## Background

`scratch/` is git-ignored, so each laptop has its own. Since commit `e80cbcb`:

- Prototypes and measurement scripts that a plan relies on live in `design/prototypes/<plan>/` (committed). Rule "Prototypes worth keeping" in `.claude/CLAUDE.md`.
- Plans and TODO name a missing scratch file only as history, marked `(not kept)`. 80 lines are marked; many of those files were made on **this** laptop and may still be here.
- `scratch/` itself is not synced and stays git-ignored. Only files a plan needs move out of it.

## Steps

1. Pull (`git fetch`, `git status`, pull after the user's OK; see "Working on Another Machine" in CLAUDE.md).
2. List the `(not kept)` files that exist on this laptop:

   ```bash
   grep -rhoE 'scratch/[A-Za-z0-9_./-]+' design .agents | sed 's/[.,)`]*$//' | sort -u | while read f; do [ -e "$f" ] && echo "$f"; done
   ```

3. Show the list to the user and ask which to keep. Likely worth it: `scratch/frameworks/` (React / Vue prototypes, `FINDINGS.md`), `scratch/text_box/`, `scratch/safe_render/`, `scratch/polyline_shapes/` (the spline variants A–F of the 2026-10-23 plan), `scratch/stage_sizing_prototype.html`, `scratch/mask_fill_stroke.html`, `scratch/isolation_bench.html`. Old one-off benches of implemented plans can stay behind.
4. For each file to keep:
   - Copy it to `design/prototypes/<plan>/`, where `<plan>` is the plan's file name without `_plan.md` / `_note.md` (the plan that names the file; if several do, the newest open one).
   - Fix paths inside it: pages use dev-server paths (`/dist/pxl.js`, `/docs/css/docs.css`), Node scripts reach the repo with `../../../`. Files it loads from `scratch/` move along or get the new path. Don't copy engine builds (`pxl_before_*.js` and the like): name the commit instead (`git show <commit>:dist/pxl.js`).
   - Replace the link in the plans / TODO with the new path and remove `(not kept)` from that line if nothing else on it is missing.
   - Open pages on the dev server (console clean) or run Node scripts once.
5. `node tools/check_plans.js` must report no problems.
6. Delete this file, commit (e.g. `docs(design): prototypes from the second laptop`), push after the user's OK.
