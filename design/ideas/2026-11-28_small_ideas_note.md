# Small Ideas Without a Plan: Paint Order, Shapes as Page Elements

- **Status**: 💬 **Discussion** (2026-11-28, parked until after release 0.1; former TODO items §14 and §45, no plan yet)

Two ideas that were TODO items without a plan, parked here so that the TODO list shows only the work for release 0.1
(group D of `design/2026-11-27_release_0_1_plan.md`). Each needs its own plan when it is picked up: §1 `paintorder`,
§2 shapes as page elements (position, focus, accessibility). Nothing is decided for either.

---

## 1. Paint Order (`paintorder`)

- `paintorder="stroke"` like SVG `paint-order`: the stroke under the fill, so only its outer half shows (readable text
  on busy backgrounds). All path shapes; text draws all strokes, then all fills.
- **Builds on** isolated compositing (built, `design/done/2026-11-01_isolated_shape_compositing_plan.md`): with it,
  the order is a swap of two calls in the scratch canvas. Comparison:
  `design/prototypes/2026-11-01_isolated_shape_compositing/paint_order_text.html`.

## 2. Shapes as Page Elements: Position, Focus, Accessibility

- `getBoundingClientRect()` of a shape is empty (tooltips need a workaround).
- Clickable shapes get no keyboard focus or roles.
- CSS `:hover` never matches a shape (a custom state?).
- Each needs its own plan. Background: `design/done/2026-10-30_framework_compatibility_plan.md` §23.6, §26.2.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-28: written from TODO items §14 and §45, which were removed when the work after 0.1 was parked.
