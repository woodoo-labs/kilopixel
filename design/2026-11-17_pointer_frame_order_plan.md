# Pointer Frame Order: Hit Testing Before the Update Phase

- **Status**: ✅ **Implemented** (2026-11-17; 3 engine tests, 115/115 pass; bundle size unchanged at 58.70 KB minified)
- **Date**: 2026-11-17
- **Related**: `design/2026-11-12_two_phase_frame_plan.md` (TODO §29: step 1 removed the lag for element sources, not for the pointer; §4 question 9 and §7.3 updated), `design/2026-11-15_per_frame_evaluation_plan.md` (TODO §40, §3.7 updated), `design/2026-10-30_framework_compatibility_plan.md` (TODO §30: §4.1 "When" and §15 updated; D4 hit-tests clicks against the same picture), `design/2026-11-12_layer_throttling_plan.md` (TODO §8: its §3.1 example, a circle on `ref.main.mouseX`, had the lag; its text needs no change), `design/2026-08-02_declarative_html_output_pxl_out_plan.md` (TODO §5, §3.3 updated), `design/2026-10-13_text_hit_testing_plan.md` (✅, history: its §3.4 reason no longer applies, the box is still right, §4)
- **Target Implementation**: `js/elements/stage.js` (`render()`), `tests/index.html`, `.agents/KILOPIXEL.md`
- **Prototypes**: `design/prototypes/2026-11-17_pointer_frame_order/frame_order.html` (drawn values per frame, frames per pointer move, frame time; the engine's order against the old one), `design/prototypes/2026-11-17_pointer_frame_order/gc_process.html` (heap growth of `process()` alone, headless with `--js-flags=--expose-gc --enable-precise-memory-info`)

---

## 1. Problem

Found in `examples/test29.html`: the green line of the mouse chain lags behind the green circles while the mouse moves. `Stage.render()` called `InteractionEngine.process()` as its last step, after every layer had drawn. `process()` does two things there:

- it broadcasts the stage's pointer values (`ref.<stage>.mouseX`, `mouseY`, `isHovered`) when a pointer event arrived;
- it hit-tests, sets `isHovered` / `isPressed`, broadcasts them and runs the `on*` handlers.

Whatever these change was drawn in the next frame. Measured with frames driven by hand (`frame_order.html`, section 1; the pointer moves before frame 1):

| Reader | Old order | `process()` first |
|---|---|---|
| `x1="ref.main.mouseX"` (no `t`): test29's green line, the two lines of `docs/index.html` | **+1 frame** | same frame |
| A `<pxl-var>` with `t` that reads `ref.main.mouseX`: test29's green circles | same frame | same frame |
| `fill="ref.btn.isHovered ? …"` (hover feedback without `t`) | **+1 frame** | same frame |
| Hover feedback with `t` (`… && t >= 0 ? …`) | **+1 frame** | same frame |
| `setAttribute()` in an `on*` handler | **+1 frame** | same frame |

Readers with `t` read `mouseX` directly when they are evaluated, after `pointermove` has set it, so they were current; readers without `t` waited for the broadcast at the end of the frame. In test29 the two kinds disagreed by one frame. Step 1 of the two-phase frame (2026-11-13) removed the lag for readers of elements; the pointer is a source that changes outside the update phase, so it kept it. No engine test noticed.

Pages that read the pointer or hover states: `docs/index.html`; `examples/test11`–`test14`, `test28`–`test33`, `test37`, `test47`, `test52`.

**Not part of this:** the system cursor is drawn by the graphics hardware; anything a browser draws reaches the screen about 1–3 frames after it, on every page. Hiding the cursor and drawing one in the canvas shows no lag.

## 2. Options

| | Change | Fixes |
|---|---|---|
| A | broadcast the stage's pointer values at the start of `render()`, hit-test after drawing as before | pointer readers only; hover feedback and handler effects stay one frame late; the pointer state is handled in two places |
| **B (built)** | call `process()` at the start of `render()`, after `pxl._frame++`, before the stage variables and the update phase | all five rows of §1 |

With B the hit test uses the values from the last update, which are the pixels on screen: the user points at what they see. Clicks hit-tested when they arrive (framework plan D4, not built yet) use the same picture.

## 3. Cost

`process()` is the same code, run once per frame as before; only its place in the frame moved. Measured 2026-11-17, Chrome, this laptop:

- **Frame time** (`frame_order.html` section 3: 800 animated circles, 200 rects whose fill reads their own `isHovered`, a mouse reader; best / median of 5 runs of 300 frames), in the browser pane before the build: old order 1.59 / 1.67 ms, B 1.51 / 1.59 ms with the pointer switching between two rects every frame; 1.51 / 1.60 against 1.51 / 1.55 ms with the pointer moving inside one rect. Equal within the run-to-run variation (headless after the build: 1.6–2.6 ms for both).
- **GC** (`gc_process.html`, headless, `gc()` and precise heap sizes, 10,000 calls, 200 interactive shapes): pointer over empty space 24 bytes, moving inside a shape 47–143 bytes (first rounds 3.3 and 5.9 KB of warm-up), a hover change in every call 19–126 KB, at most about 13 bytes per change. `process()` allocates nothing per frame; a hover change can cost a few bytes, the same in either order.
- **Frames per pointer move on an idle page** (`frame_order.html` section 2): the old order needed 2 frames per move (the broadcast after drawing dirtied a layer again, and the extra frame hit-tested a second time), B needs 1, with the same layer draws (1 for a move outside the button, 2 onto or off it). Pages that animate run one frame per vsync either way.
- **Code**: one call moved in `Stage.render()` with a 3-line comment; 58.70 KB minified and 17.43 KB gzipped, as before.

**`renderAvg` / `renderMax`** now include hit testing and the handlers: the call is after `start = performance.now()`. Before, it ran after the measurement.

## 4. Behavior That Changes

- Readers of the pointer, hover / press feedback and the effects of handlers are drawn in the frame of the event (§1).
- Elements added or changed in a handler are drawn in the same frame (two-phase plan §7.3 said "next frame").
- A handler that reads an animated value reads the value of the last frame, the one on screen; before, it read this frame's value. Not visible in practice.
- `<pxl-text>`: the hit test uses the box of its last draw, which is the text on screen. The text hit-testing plan (§3.4) gave the old order as the reason the box is fresh; the box is still the right one.
- In a throttled layer (`maxfps`, not built) the hit test still uses the values of the last update, which can be ahead of the pixels (throttling plan §3.2).

## 5. Tests

`tests/index.html`, section Interaction; all three failed against the build of commit `1e2f3e7` and pass now:

1. Readers of the stage pointer, a line without `t` and a circle through a `<pxl-var>` with `t`, are drawn at the new `mouseX` in the frame of the move.
2. Hover feedback without and with `t` is drawn in the frame the pointer enters or leaves.
3. A handler's `setAttribute()` is drawn in the frame of the click, and the layer is idle afterwards.

## 6. Found on the Way

- **Heap growth in the frame loop:** 600 hand-driven frames of the bench scene grow the heap by about 1.6–3.6 MB, in both orders and also without any pointer input (800 animated circles). Not caused by this change. Measured 2026-11-17 (`scratch/heap/` (not kept)): the engine's drawing and the canvas calls allocate nothing; the bytes are the values expressions return (12 B per decimal result, about 130–240 B per color or gradient built with `t`, about 400 B per animated filter). Even 800 animated colors cause one minor GC every 1.4 s of 0.4–1.0 ms, and the frame-time spikes are the same without any garbage. Nothing to fix.
- **`process()` costs about 0.22–0.32 ms per call with 200 interactive shapes** headless (software rendering, `isPointInPath` per shape), also over empty space. Unchanged by this plan; the frame time in the browser pane suggests less there.
