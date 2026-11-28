# Design Decisions

The plans behind Kilopixel: why something is built the way it is, which options were weighed, what was measured. The
language is described in `.agents/KILOPIXEL.md`, the engine in `.agents/ENGINE.md`, the open work in
`.agents/TODO.md`. This page holds the rules for plans and the TODO list; `node tools/check_plans.js` checks them.

| Folder | Holds |
|---|---|
| `design/` | open plans (being discussed, proposed or decided), each with a TODO item |
| `design/ideas/` | parked plans and notes: open, without a TODO item |
| `design/done/` | implemented plans |
| `design/archive/` | superseded and dropped plans |
| `design/prototypes/<plan>/` | prototypes and measurement scripts a plan relies on, the folder named like the plan without `_plan` / `_note` |

**Closed plans are history.** A plan in `design/done/` or `design/archive/` isn't changed after it closes, and its
links may point to where a file was at the time. File names are unique and dated, so a moved plan is found by its
name; the checker doesn't check closed plans.

## Sizes of a Change

Sized before starting, and named when the change is described for approval:

- **Small** (a fix, an attribute, a docs page, a refactor inside one file): no plan. A commit with a clear message and
  a test; the message records the why, the measurements and anything left open.
- **Feature** (a new element or expression function, a behavior that spans files): a short plan, agreed before
  building: the problem, the options, the decision and why, the tests. About 2 pages; measurements as a table, not as
  a narrative.
- **Architecture** (the frame, reactivity, the DOM and framework contract, anything that changes what pages may rely
  on): a full plan with options, measurements and prototypes.

## A Plan

- **Name:** `YYYY-MM-DD_<topic>_plan.md`, or `_note.md` for notes.
- **Status line** right after the title, at most 200 characters:
  `- **Status**: 🟡 **Proposed** (date of the last change, one short clause)`. Six words:
  - 💬 **Discussion**: ideas, nothing decided
  - 🟡 **Proposed**: complete plan, waiting for a decision
  - 🟢 **Decided**: agreed, not built yet
  - ✅ **Implemented**
  - ⚪ **Superseded by** `<file>`
  - ⚪ **Dropped**: decided not to do it. Never for "not built yet" (that is 🟡 or 🟢).
- **Summary** of at most 5 lines after the status line (what, decided or not, what's next): a reader who stops there
  knows enough.
- **A decision record, not a work diary:** no log of every step, no code that the commit will contain. A `## Log` at
  the end (newest first, one line per status change) is optional: git has the history.

## Life of a Plan

1. **New:** 🟡 or 💬 in `design/` with a TODO item, or in `design/ideas/` without one. Picking up a parked plan moves
   it to `design/` and adds the item; parking it again does the opposite.
2. **Decided:** 🟢 in the plan and in its TODO item.
3. **Implemented:** ✅ with the date; the plan moves to `design/done/` in the build's commit, and its TODO item is
   removed (or keeps only what is left, e.g. docs). A short `## Built (YYYY-MM-DD)` section (the commit, deviations
   from the plan with the reason, what is left) is welcome, not required: the commit message holds the details.
4. **Replaced or dropped:** ⚪, the plan moves to `design/archive/`, its TODO item is removed.

When a plan moves, the links to it are fixed in the live files: `.agents/`, `.claude/CLAUDE.md`, open and parked
plans, comments in `js/` and `tests/`. Other plans aren't updated when one changes: an open plan is checked against the
code when it is picked up, and its date says how old it is.

## TODO List

`.agents/TODO.md` lists open work only, next first, one short item each: a `## Title`, the status, the plan, one or
two lines on what is next or open; at most 800 characters. The details belong in the plan. Items have no numbers:
other files name the plan, or an item without a plan by its title (`TODO "Shape Filters in Safari"`).

## Prototypes

A prototype or measurement script that a plan relies on is copied to `design/prototypes/<plan>/` in the same change
(paths inside it: absolute dev-server paths like `/dist/pxl.js`; Node scripts reach the repo with `../../../`). A
generated file that is large is committed as its generator. Plans, TODO and KILOPIXEL.md link only committed files; a
`scratch/` file may only be named as history, marked "(not kept)". Old engine builds aren't copied: name the commit
(`git show <commit>:dist/pxl.js`). `design/prototypes/` is also the place for work in progress needed on the other
laptop.
