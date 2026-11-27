# Scoped Names for `ref.*` (`name`)

- **Status**: 💬 **Discussion** (2026-11-27, parked: global ids kept; for a native `<pxl-repeat>` or a user who needs it)
- **Date**: 2026-11-27
- **Related**: `design/done/2026-11-20_evaluation_model_plan.md` (D8 there: global ids kept, §10.4), `design/done/2026-10-30_framework_compatibility_plan.md` (§8.2: global ids, stage-scoped ids or a `name` attribute)
- **Target Implementation**: `js/compiler.js`, `js/engine.js`, `js/elements/node.js`, `js/elements/stage.js`

---

## 1. Problem

`ref.<id>` reads an element by its global id. An HTML id must be unique in the document (`getElementById()`, CSS `#x`, `<label for>`, validators), so markup that is repeated can't refer to its own parts by a fixed id. The case is narrow but real: a shape read through `ref.*` inside repeated markup, such as a label reading its own box's hover in a React `.map`, a Vue `v-for`, an Angular `@for` or a copied snippet:

```html
<!-- With ids: each item generates its id and builds the expression from the same string -->
<pxl-rect [attr.id]="'bg' + i" …></pxl-rect>
<pxl-text [attr.fill]="'ref.bg' + i + '.isHovered ? 1 : 0'" …></pxl-text>

<!-- With names: written as plain text -->
<pxl-rect name="bg" …></pxl-rect>
<pxl-text fill="ref.bg.isHovered ? 1 : 0" …></pxl-text>
```

Frameworks can generate ids, and `docs/frameworks.html` tells them to. Plain HTML can't: a native `<pxl-repeat count="…">` (copies with an `index` variable) would need names, or a dynamic `ref['bg' + index]`.

Most shapes are never read through `ref.*` and have neither an id nor a name; for them nothing changes.

## 2. Design Worked Out

- **`name` replaces `id` for `ref.*`;** `id` is plain HTML again. Duplicates of `name` are valid HTML (radio groups, `form.elements`).
- **Lookup, nearest first,** from the reader outward:
  1. the reader itself (`zoom="ref.btn.isHovered ? 1.05 : 1"` on a group named `btn` finds that group);
  2. each ancestor in turn: first the ancestor itself, then its subtree;
  3. after the stage, the whole page.

  A stage is an ordinary container: there is no separate stage scope, and a name used once on the page is found from any stage. Step 1 and "the ancestor itself" matter: without them, a rect inside a group named `btn` would search only the group's descendants, go up to the layer, find every `btn` there and follow the first, so every copy of a button would light up when the first is hovered.
- **A tie** (several matches at the nearest level, e.g. a reader in the layer outside all buttons): the first in DOM order, and one warning naming the container and suggesting a wrapping `<pxl-group>` or a qualified path.
- **Qualified paths:** `ref.item3.bar.x`. Each further part is looked up anywhere below the previous one, so only the parts that remove an ambiguity are written (`ref.stage1.dot.x`, not every layer and group). The first part that isn't a name is a value; without one the path is the element (`toLocal(ref.item3.bar, 'x')`).
- **A name can't be a value name** (an attribute, `isHovered`, a stage value such as `mouseX`): a warning, and it isn't registered.
- **`name` is observed:** frameworks set attributes after insertion (Angular, Alpine, htmx), which makes the readers resolve again. Keyed lists move items by disconnecting and connecting them, which resolves again too.
- **Repeated items need an element of their own:** `<ng-container>`, React fragments and Vue's `<template v-for>` render none, so the names of all items would be siblings and tie. The tie warning and the frameworks docs would say so.

## 3. Cost

- A page-wide map from name to elements. A reader resolves its paths once when it collects its sources (under option B of the evaluation model: when `pxl._orderVersion` changed) and keeps direct references, so a frame costs the same as with ids.
- Estimate: 40–60 lines plus the warnings, not prototyped.
- Migration: every docs page, example and test that uses `id` for `ref.*`; mechanical, pre-release.

## 4. Why Parked

Global ids stay (evaluation model §10.4): one lookup rule that every web developer already knows, no migration, and the corner cases above (self and ancestors first, ties, value names) don't exist. Picking this up makes sense together with a native `<pxl-repeat>`, or when a user's repeated components need it.

**Open if picked up:** whether `ref.x` should find a nearby `name` first and a global `id` otherwise (no migration, but two lookup rules), or `name` only.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: written from the evaluation model discussion (D8 there) and parked: global ids kept.
