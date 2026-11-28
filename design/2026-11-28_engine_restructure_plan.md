# Engine Restructure: Files by Feature

- **Status**: 🟢 **Decided** (2026-11-28, D1–D7 as recommended in §5; phase 1 built, §9; next: phase 2)
- **Date**: 2026-11-28
- **Related**: `design/done/2026-10-27_engine_cleanup_inventory_note.md` (the code style this keeps), `design/done/2026-11-20_evaluation_model_plan.md` (the scheduler that moves in phase 5), `design/done/2026-11-01_isolated_shape_compositing_plan.md` and `design/done/2026-11-26_isolation_box_plan.md` (the isolation code that moves in phase 3), `design/2026-11-12_layer_throttling_plan.md` (TODO §8: phase 1 builds the publishing step of its per-layer metrics, C2), `.claude/CLAUDE.md` "Engine Code Rules" and "Engine Code Style"
- **Target Implementation**: `build.js` (file list), `js/engine.js`, `js/compiler.js`, `js/interaction.js`, `js/graphics.js` (removed), `js/monitor.js`, `js/elements/stage.js`, `js/elements/node.js`, `js/elements/shape.js`, `js/elements/shapes/arc.js`, `js/elements/shapes/polyline.js`, `js/elements/shapes/text.js`, new `js/reactivity.js`, `js/gradient.js`, `js/compositing.js`, `js/handlers.js`; `tests/index.html`, `tests/frameworks.html`, `tests/unit.html`; `.agents/ENGINE.md`

---

## 1. Goal

Each engine feature lives in one file, so a reader who wants to understand or change gradients, handlers or the update phase opens one file instead of three or four. Nothing changes for authors: no attribute, tag, message or pixel. Each phase is a separate commit that the full test run checks.

Not a goal: fewer lines (the moves are about neutral), or a different class hierarchy (§8 lists those follow-ups).

## 2. Today

A code review on 2026-11-28 found the code consistent and well commented, but grouped by kind of code (scope, helpers, elements) rather than by feature. The small findings of that review are built (commits `0c12fb5`, `b7b4249`, `10228c1`, `1f02f63`, `1c01aca`, `5493ab8`). What is left is where code lives:

| Feature | Where it is now |
|---|---|
| Gradients | descriptors `linear()`, `radial()`, `conic()` and `pxl.parseStops` in `compiler.js`; `pxl.resolveRadius` and the anchor tables in `graphics.js`; cache records (`_gradCache`), `createGradient()` and `buildGradient()` in `shape.js` |
| Filters | the helpers `blur()`, `dropShadow()`, … in `compiler.js`; `pxl.scaleResponsiveFilter` and `pxl.checkCanvasFilter` in `graphics.js`; `resolveFilter()` in `node.js` |
| Handlers | `pxl.HANDLER_EVENTS`, `pxl.createHandlers`, `pxl.handlerRef`, `pxl.ASSIGNING_REF`, `pxl.compileHandler` in `interaction.js`, whose real subject is hit testing and DOM events; `setHandler()` in `node.js` |
| Reactivity | registry and versions (`pxl.nodes`, `pxl.markChanged`, `pxl.wakeReaders`, …) in `engine.js`; `isOutOfDate()` and friends in `node.js`; the scheduler (`readsId`, `addReader`, `updateReaders`, `buildOrder`, `addOrderNode`, `orderSources`, `pushContainers`, `evaluateOrder`, about 150 lines and six fields) in `stage.js` |
| List of all stages | `pxl.perf.stages` in `monitor.js`, also used as the stage registry by `pxl.wakeReaders()` and `pxl.fontsArrived()` |
| Performance values | the stage counts frames and time (`perfFrames`, `perfAccumulated`, `perfMax`); `monitor.js` reads them, writes `fps`, `renderAvg`, `renderMax` into the stage's values and resets them: one feature's state written from two files |
| `graphics.js` | a grab bag: most helpers have one caller (`pxl.parsePointsIntoArray`: polyline; `pxl.arcEndRadians`, `pxl.isFullTurn`: arc.js; line dash, arrow constants, compositing, isolation: shape.js) |

2026-11-28: the last two rows of the table are built away by phase 1 (§9).

`stage.js` does six jobs (DOM lifecycle, sizing, visibility, frame loop, scheduling, perf counters); the scheduler is the one that is a feature of its own.

## 3. Proposed Layout

Build order after all phases (new or changed files in bold):

| # | File | Contents |
|---|---|---|
| 1 | `js/engine.js` | `pxl` namespace and `pxl.scope` (empty), generic helpers, `pxl.describe()`, `pxl.TRANSFORM_DEFAULTS`, `pxl.isSpatialKey`, anchor tables (D3), attribute compilation bridge (`compileAttribute`, `storeValue`, `expressionsChanged`), property accessors |
| 2 | **`js/reactivity.js`** | registry and versions from `engine.js`; **`pxl.UpdateScheduler`**, the class the stage owns (phase 5) |
| 3 | `js/matrix.js` | unchanged |
| 4 | `js/compiler.js` | Math, color and utility scope entries, time drivers, `parseAttributeValue`, `compileExpression`, templates |
| 5 | **`js/gradient.js`** | `pxl.parseStops`, the scope entries `linear()`, `radial()`, `conic()`, `pxl.resolveRadius`, **`pxl.GradientSlot`** (cache and build of one fill or stroke gradient) |
| 6 | **`js/compositing.js`** | `pxl.hasTransform`, `pxl.applyTransformState`, `pxl.applyContextState`, `pxl.applyCompositingState`, the filter scope entries, `pxl.scaleResponsiveFilter`, `pxl.checkCanvasFilter`, the isolation scratch canvas (D1) |
| 7 | **`js/handlers.js`** | everything about `pxl-on-*` from `interaction.js` |
| 8 | `js/interaction.js` | hit test context, `pxl.InteractionEngine` |
| 9 | `js/monitor.js` | `pxl.perf`: only the 1-second timer, which calls `publishMetrics()` on every stage in `pxl.stages` |
| 10 | `js/elements/stage.js` | `pxl._frame`, **`pxl.stages`**, default styles, `pxl.Stage` without the scheduler, with its own frame counters and **`publishMetrics(seconds)`** |
| 11–15 | `js/elements/node.js` … `shape.js` | unchanged, except: `shape.js` takes the line dash helpers and the arrow constants (D4); `createGradient()` delegates to two `pxl.GradientSlot`s |
| 16–23 | `js/elements/shapes/*.js`, `variable.js` | `arc.js` takes `arcEndRadians` / `isFullTurn`, `polyline.js` takes the points parser |

`js/graphics.js` is gone. Estimated sizes: `engine.js` ~180 lines, `reactivity.js` ~260, `compiler.js` ~380, `gradient.js` ~170, `compositing.js` ~140, `handlers.js` ~80, `interaction.js` ~570, `stage.js` ~380, `shape.js` ~430.

Public names stay: every `pxl.*` function keeps its name, so `tests/unit.html` (which calls `pxl.resolveRadius`, `pxl.parseStops`, `pxl.arcEndRadians`, `pxl.parsePointsIntoArray`, `pxl.hasLineDash`, `pxl.scaleResponsiveFilter`, …), `tools/build_types.js` (`pxl.anchorX`) and `examples/test53.html` (`pxl.anchorX` in expressions) need no change.

## 4. Phases

Each phase: one commit, `node build.js`, `node tools/run_tests.js` (full), `node tools/check_plans.js`, ENGINE.md updated in the same commit. Phases 3 and 4 also run a pixel hash comparison over all shapes before and after, like the one for the ArcShape refactor (`1f02f63`), committed with phase 3 in a prototypes folder named after this plan.

1. **Stage registry and the monitor's interface.** `pxl.stages` in `stage.js`; a stage adds itself on connect and leaves on disconnect. `pxl.wakeReaders()` and `pxl.fontsArrived()` read it. `pxl.perf` keeps only its timer (`start()` when the first stage registers, `stop()` after the last) and, on each tick, calls `stage.publishMetrics(seconds)` for every stage in `pxl.stages`. The stage owns its counters (`perfFrames`, `perfAccumulated`, `perfMax` become `_perfFrames`, `_perfAccumulated`, `_perfMax`, read and reset only in `stage.js`) and writes `fps`, `renderAvg` and `renderMax` itself. Today `monitor.js` reads, resets and publishes the stage's counters from outside. This is the publishing step of the throttling plan's per-layer metrics (`design/2026-11-12_layer_throttling_plan.md` §5.3, C2): C2 then only adds the layers' own counters and has `publishMetrics()` publish them too, and its frame counting (D4) only changes when the stage counts a frame. Tests: `tests/frameworks.html` and `tests/index.html` check `pxl.stages` instead of `pxl.perf.stages`; the monitor test that sets the counters (`tests/index.html`, "monitor: …") uses the new field names. About 45 minutes.
2. **`handlers.js`.** A move from `interaction.js`, no code change. `setHandler()` stays a `PxlNode` method (it changes the element's own listeners). About 20 minutes.
3. **`graphics.js` dissolved.** `compositing.js` (D1), arc angles to `arc.js`, the points parser to `polyline.js`, line dash and arrow helpers to `shape.js` (D4), anchors per D3. The filter scope entries move to `compositing.js` (D2). About an hour.
4. **`gradient.js`.** The descriptors and `pxl.resolveRadius` move. The two cache records become `pxl.GradientSlot` objects with `resolve(ctx, value, box, strokewidth)` (today's `createGradient()` body) and the build (today's `buildGradient()`); `Shape.createGradient(ctx, value, slot)` stays as the one call shapes use and delegates. `tests/index.html` reads the slot's fields under their new names (two tests read `_gradCache[0].br` and `[1].sw`). About an hour.
5. **`reactivity.js` and the scheduler.** Registry and versions move from `engine.js`. The scheduler's six fields and eight methods become `pxl.UpdateScheduler`, created in the stage's constructor like `pxl.InteractionEngine` (`this.scheduler`). `Stage.runFrame()` calls `scheduler.evaluateSources(t)` before the walk and `scheduler.updateReaders()` after it; `disconnectedCallback()` calls `scheduler.reset()`. `pxl.wakeReaders()` asks `stage.scheduler.readsId(id)`; `collectSources()` calls `readerStage.scheduler.addReader(this)`. The element fields the stage writes today (`readerStage`, `listedIn`, `isOrderNode`) keep the stage as their value. Test: `tests/index.html` reads `stage.scheduler._readers`. About 1.5 hours.

The order goes from smallest to largest, so the first phases also show whether the build checks (`_` ownership) need anything special for moves.

## 5. Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | One file for transform, compositing, filters and isolation, or a separate `filter.js`? | **A** one `compositing.js`; **B** `compositing.js` + `filter.js` | **A**: all of it is canvas state a node sets before drawing (~140 lines); filters alone would be ~40 |
| D2 | Scope entries outside `compiler.js` (gradients, filters) and `pxl.scopeKeys` | **A** `pxl.scope` created in `engine.js`, entries added by their feature file, `pxl.scopeKeys` computed at the first compile; **B** keep every scope entry in `compiler.js`, move only the build side | **A**, with a unit test that every `pxl.scope` name is visible in a compiled expression. Today `pxl.scopeKeys` is computed when `compiler.js` loads: an entry added by a later file would silently be missing from every expression. Computing it at the first compile (all built-in files have loaded by then) removes that trap; B keeps the trap away by leaving gradient descriptors far from their build |
| D3 | Where do the anchor tables go? Used by rect's `anchor`, radial gradient radii, `tools/build_types.js`, `examples/test53.html` | **A** `engine.js` (shared box vocabulary); **B** `rect.js`; **C** `gradient.js` | **A**: two features use them; in B or C one feature would read the other's table |
| D4 | Arrow constants and helpers (`pxl.ARROW_*`, `pxl.arrowSize`, `pxl.createArrowRecord`) | **A** `shape.js`, next to the arrow methods; **B** an `arrows.js` with the methods too | **A** now: the methods are `Shape` methods on `this.values`; B belongs to the class-structure follow-up (§8) |
| D5 | Registry and versions: with the scheduler in `reactivity.js`, or stay in `engine.js`? | **A** `reactivity.js`; **B** stay | **A**: "who reads whom and when it is evaluated" in one file |
| D6 | The scheduler as a class owned by the stage, or `pxl.*` functions taking the stage? | **A** class (`stage.scheduler`); **B** functions | **A**: it owns six fields, which CLAUDE.md wants in a constructor; same pattern as `pxl.InteractionEngine` |
| D7 | Drawing with the cached local matrix (`ctx.transform(...getLocalMatrix())`) instead of `applyTransformState()`'s calls | **A** in this plan as phase 6; **B** its own plan | **B**: it changes behavior (canvas calls, possibly pixels) and needs a measurement against the frame budget; this plan only moves code |

**Decided 2026-11-28:** every decision as recommended: D1 A (one `compositing.js`), D2 A (`pxl.scope` in `engine.js`, `pxl.scopeKeys` at the first compile, with its unit test and the load-order rule of §6.3), D3 A (anchors in `engine.js`), D4 A (arrow helpers in `shape.js`), D5 A (registry and scheduler in `reactivity.js`), D6 A (`pxl.UpdateScheduler`, owned by the stage), D7 B (its own plan, §8).

## 6. Risks, Per-Frame Cost and Edge Cases

### 6.1 Moves

- **Load order.** `class … extends` and spread `static defaults` run at load: `arc.js` after `shape.js`, `gradient.js` before `shape.js` only if a class field needs it (none does: the slots are created in the constructor). D2 handles the scope. `build.js` fails on top-level declarations, so a moved helper that was written as a function declaration would be caught.
- **`_` ownership** (`build.js` checks it by name across files): fields move together with the code that uses them (`_gradCache` → the slot's own fields; the scheduler's `_order`, `_readers`, … → `pxl.UpdateScheduler`). The checker names any field that breaks the rule.
- **Tests that read internals:** the four lines named in phases 1, 4 and 5. Everything else calls `pxl.*` functions that keep their names.
- **Prototypes** in `design/prototypes/` that call moved internals (`option_b.patch`, the isolation box pages, `applyCompositingState` in the custom shapes patches) are history and run against the build of their time (`git show <commit>:dist/pxl.js`); not updated.
- **Bundle size:** about neutral (a class wrapper or two). Checked by `tools/check_build.js`.

### 6.2 Per-Frame Cost and Garbage Collection

Phases 1–3 add nothing per frame: phase 1's only new call, `publishMetrics()`, runs once per second per stage and does the work the monitor does today (`toFixed()` strings once a second); the frame counting in `Stage.render()` stays the same three lines. Phase 2's handlers run only on events. Phase 3 moves functions between files of one concatenated bundle, so the engine runs the same functions.

Phases 4 and 5 touch per-frame paths. Rules for them:

1. **The color fast path stays in `Shape.createGradient()`.** Almost every fill and stroke is a color (or `null`): the test for a descriptor runs before the slot is touched, so a color costs no extra call.
2. **`pxl.GradientSlot` sets every field in its constructor** (`config`, the four box values, `sw`, `grad`, `error`) and allocates nothing in `resolve()`: it gets the reused box record from `getBoundingBox()`.
3. **Moved per-frame code keeps its form:** indexed `for` loops, no `forEach` or arrow functions, no array destructuring, no new objects. Destructuring `this.values` is fine (it allocates nothing).
4. **Measured:** `tests/scaling.html` runs in every full test run; phases 4 and 5 also get a before / after run of `examples/benchmark.html`, accepted within its noise. The scheduler adds one property load per call (`stage.scheduler.…`); `updateReaders()` is still skipped entirely while nothing that anyone reads changed.

### 6.3 Edge Cases

| Phase | Case | What must hold |
|---|---|---|
| 1 | A stage moved in the DOM (disconnect, then connect) | It leaves `pxl.stages` and joins again, never twice; the timer may stop and start again, and the first publish after a start divides by the time since the start |
| 1 | A stage removed while the timer fires | The list changes at once: a removed stage is never published |
| 1 | Web fonts arrive while a stage is disconnected | Not in `pxl.stages`, so not invalidated; on reconnect its resize renders every layer anyway |
| 1 | The monitor test calls `pxl.perf.publish()` | The tick keeps that name |
| 4 | The fill slot also compares `strokewidth` (a fill rebuilds when the stroke width changes) | Moved as it is: a move doesn't change behavior |
| 4 | `paint()` for a fill or stroke that isn't set | Returns `null` (fixed in `a54e485`); the `null` test moves with the color fast path |
| 5 | An element moved from one stage to another | `listedIn` and `readerStage` both hold the stage, never the scheduler: the old scheduler drops a reader when `readerStage !== stage`, the new one adds it when `listedIn !== stage`; mixing stage and scheduler there would drop readers silently |
| 5 | A stage disconnected and inserted again | `scheduler.reset()` clears `isOrderNode` on its nodes and forces a new order, as `disconnectedCallback()` does today |
| D2 | The script placed after the markup | `customElements.define('pxl-stage')` upgrades the stages while the bundle still runs, and `ratio="16 / 9"` compiles: a `pxl.scopeKeys` computed at the first compile is computed then. Rule: every file that adds scope entries loads before the first `customElements.define()` (gradient.js 5 and compositing.js 6 come before stage.js 10); the unit test of D2 catches a break |
| all | `tools/build_types.js` runs the bundle in Node with a stubbed DOM | New files touch no DOM at load (the isolation canvas stays lazy); `handlers.js` builds its `Proxy` over `pxl.nodes` at load, so `reactivity.js` comes first (2 before 7) |

## 7. Docs

ENGINE.md only, in each phase: §1 (file table), §3 (scope), §4 (reactivity file names, the scheduler class), §6.1–§6.3 (compositing and gradients), §8.7 (handlers), §9, §10 (stage registry, the timer calling `publishMetrics()`). KILOPIXEL.md names only `pxl.anchorX` / `pxl.anchorY` (§11.3), which stay. No docs page describes engine files.

## 8. Not in This Plan

Class-structure follow-ups from the same review, each small, better as a second plan once the files have settled:

- A container base for layer and group (`childList`, `registerChild()` / `unregisterChild()`, the DOM sort, the child update loop).
- One home for what shapes and groups share as interactive nodes (handler attributes, `isHovered` / `isPressed`, `stage`, `releaseElement()`).
- The id registry and pending properties that `pxl.Stage` and `pxl.PxlNode` both implement.
- `stage` and `readerStage`: the same `closest('pxl-stage')` stored twice on shapes and groups.
- `Polyline.setPoints()` re-implements `valueChanged()` (and skips `affectsPixels()`).
- D7, drawing with the local matrix.
- Allocation of animated gradients: `linear(t * 30, ['red', 'blue'])` creates the colors array, the stops array, a stop object per color, the descriptor and a new `CanvasGradient`, per shape and frame (ENGINE.md accepts it, about 0.8 µs). The largest known garbage source in an animated scene; a plan of its own if a measurement shows it matters.

## 9. Phase 1 Built (2026-11-28)

As planned in §4, phase 1:

- **`js/elements/stage.js`:** `pxl.stages`, every connected stage; `connectedCallback()` adds the stage (if it isn't listed yet) and calls `pxl.perf.start()`, `disconnectedCallback()` removes it and calls `pxl.perf.stop()` when the list is empty. The counters are `_perfFrames`, `_perfAccumulated`, `_perfMax`, used only in `stage.js`. New method `publishMetrics(seconds)`: writes `fps`, `renderAvg`, `renderMax`, calls `pxl.markChanged()` on the stage, resets the counters.
- **`js/monitor.js`:** `pxl.perf` is `start()`, `stop()` and `publish()` (the tick: measures the seconds since the last tick, calls `publishMetrics(seconds)` on every stage); `stages`, `registerStage()` and `unregisterStage()` are gone.
- **`js/engine.js`** (`pxl.wakeReaders()`) and **`js/elements/shapes/text.js`** (`pxl.fontsArrived()`) read `pxl.stages`.
- **Deviation:** §4 had `start()` "when the first stage registers". Built: every stage connect calls `start()`, which returns at once while the timer runs, so the stage doesn't need to know whether it is the first. The rule that an empty list stops the timer lives in `stage.js`, next to the list.
- **Tests:** `tests/index.html` (the monitor test sets `_perfFrames`, … ; "publishMetrics() publishes the stage's own counters and starts counting anew"; "the timer runs while a stage is connected, every connected stage is in `pxl.stages` once"; the re-insert test reads `pxl.stages`), `tests/frameworks.html` (an unmounted stage leaves `pxl.stages`). Full test run passed.
- **Per frame:** unchanged (the same three counter lines in `render()`); `publishMetrics()` runs once per second per stage, as the monitor's loop did.
- **Docs:** ENGINE.md §1 (rows 6 and 7), §6.5 (late web fonts), §10.
- **Left:** phases 2–5. The throttling plan's C2 (TODO §8) can now add the layers' counters to `publishMetrics()`.

## Log

- 2026-11-28: phase 1 built (§9): `pxl.stages`, `pxl.perf` only the timer, `Stage.publishMetrics()`. Next: phase 2.
- 2026-11-28: decided: D1–D7 as recommended (§5). Next: phase 1.
- 2026-11-28: review for per-frame cost, garbage and edge cases: §6.2 (rules for phases 4 and 5), §6.3 (edge cases), animated gradients in §8. The review found the `paint()` bug fixed in `a54e485`.
- 2026-11-28: phase 1 also moves the monitor's publishing into the stage (`publishMetrics()`, counters owned by the stage), the step the throttling plan's C2 needs; that plan (TODO §8) stays after release 0.1.
- 2026-11-28: proposed after the code review of the same day; its small findings were built first.
