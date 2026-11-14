# Handler Errors: A Throwing `on*` Handler Is Delivered Once

- **Status**: ✅ **Implemented** (2026-11-15; 2 engine tests, 88/88 pass; bundle size unchanged at 57.46 KB minified)
- **Date**: 2026-11-15
- **Related**: `design/2026-11-07_safe_shape_render_plan.md` (its §5.2 left handler errors to the browser and expected the next frame to be normal; this plan corrects that), `design/2026-10-30_framework_compatibility_plan.md` (D1 renames the handlers, D4 changes when `click` / `pointerdown` / `pointerup` are hit-tested; §5 below)
- **Target Implementation**: `js/interaction.js` (`callHandler`, `process`), `tests/index.html`, `.agents/KILOPIXEL.md`
- **Prototype**: `design/prototypes/2026-11-15_handler_errors/throwing_handler.html`

---

## 1. Problem

`InteractionEngine.process()` runs once per frame. It called the `on*` handlers directly and reset the event flags (`_lastClick`, `_lastDown`, `_lastUp`, `_lastMove`) in its last lines. A handler that threw left the method before that, with two effects:

| Handler | What stayed behind | Result |
|---|---|---|
| `onclick`, `ondown`, `onup`, `onmove` | The event flag stayed `true` | The event was delivered again in every later frame, to whatever shape was under the pointer |
| `onleave` | The shape stayed in `_hoveredElements` (it is removed after the handler call) | `onleave` ran again in every later frame |

`onenter` was not repeated (the shape is added to the hover list before the call), but it also skipped the rest of the frame: the cursor, and the other handlers.

### 1.1 Measured (Prototype, 2026-11-15, Before the Fix)

The prototype has two rects. The left `onclick` counts its calls and throws; the right one only counts.

| Action | Expected | Before | After |
|---|---|---|---|
| Click the left rect once, then move the pointer three times inside it | 1 call | **4 calls** | 1 call |
| Then move to the right rect without clicking | 0 calls of its `onclick` | **1 call** | 0 calls |
| Console | 1 error | 4 × `Uncaught Error: boom` | 1 × `[pxl] <pxl-rect id="bad"> onclick failed:` with the stack trace |

The second row is the serious one: a shape received a click that the user never made. In a real page that can be a "delete" or "buy" button next to a broken one.

---

## 2. Fix

One method in `InteractionEngine`; the six handler calls in `process()` go through it.

```js
callHandler(el, event) {
  const handler = el.handlers[event];
  if (!handler) return;
  try {
    handler();
  } catch (error) {
    console.error(`[pxl] <${el.localName}${el.id ? ` id="${el.id}"` : ''}> on${event} failed:`, error);
  }
}
```

After a failing handler, `process()` goes on as if the handler had returned: the hover list and the states are updated, the cursor is set, the other handlers of that frame run, and the flags are reset.

No per-frame cost: `try` / `catch` without a throw is free in today's engines (measured for the draw path in `design/2026-11-07_safe_shape_render_plan.md` §4), and handlers only run on pointer events.

---

## 3. Alternatives Not Chosen

| Alternative | Why not |
|---|---|
| Only reset the flags before the handlers run | Fixes the repeated click, but not `onleave` (the hover list), and a failing handler still skips the cursor and the other handlers of that frame |
| `PxlNode.reportError()` | Made for errors that repeat every frame: it prints "skipped", drops the stack trace and stops after 3 messages. A handler fails once per user action, and its author needs the stack |
| Let the error escape after cleaning up (`try` / `finally`) | The browser reports it as uncaught, as before, but only the first failing handler of a frame runs; the message doesn't name the element |
| `window.reportError(error)` | Behaves like an uncaught error (reaches `window.onerror` and error trackers), but can't name the element. Possible later if someone needs handler errors in an error tracker |

---

## 4. Tests

`tests/index.html`, both fail with the engine before the fix:

- **A throwing `onclick`** runs once for one click, is logged once with its element and attribute name, and a second shape under the pointer afterwards gets no click.
- **A throwing `onleave`** runs once, the shape is no longer hovered, and the `onenter` of the shape entered in the same frame still runs.

---

## 5. Not Part of This Plan

- **Hit position of `click` / `pointerdown` without a pointer move before it** (observed 2026-11-15, not confirmed on a touch device): `handleEvent` reads the pointer position only on `pointermove`, so these events are hit-tested at the last known position. A mouse always moves first; a tap on a touch screen may not. D4 of `design/2026-10-30_framework_compatibility_plan.md` (hit-test when the event arrives) reads the position from the event itself and would cover it. Test on a touch device when D4 is built.
- **Renamed handlers** (`pxl-on-click` …, D1 of the same plan): `callHandler()` builds the name in its message from the event (`on${event}`); change it with the rename.
