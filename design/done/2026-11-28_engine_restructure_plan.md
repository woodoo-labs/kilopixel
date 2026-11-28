# Engine Restructure: Files by Feature

- **Status**: ✅ **Implemented** (2026-11-28, phases 1–5 and 7 built, §9–§14; phases 6 and 8 and D8 parked in design/ideas/)
- **Date**: 2026-11-28
- **Related**: `design/done/2026-10-27_engine_cleanup_inventory_note.md` (the code style this keeps), `design/done/2026-11-20_evaluation_model_plan.md` (the scheduler that moves in phase 5), `design/done/2026-11-01_isolated_shape_compositing_plan.md` and `design/done/2026-11-26_isolation_box_plan.md` (the isolation code that moves in phase 3), `design/2026-11-12_layer_throttling_plan.md` (TODO §8: phase 1 builds the publishing step of its per-layer metrics, C2), `design/2026-10-30_space_attribute_plan.md` (TODO §28: the one transform path of §8 goes with it), `design/archive/2026-11-22_engine_structure_cleanup_plan.md` (the parked cleanup idea of 2026-11-22, merged here on 2026-11-28: its steps 2–4 are phases 6–8), `.claude/CLAUDE.md` "Engine Code Rules" and "Engine Code Style"
- **Target Implementation**: `build.js` (file list), `js/engine.js`, `js/compiler.js`, `js/interaction.js`, `js/graphics.js` (removed), `js/monitor.js`, `js/elements/stage.js`, `js/elements/node.js`, `js/elements/shape.js`, `js/elements/shapes/arc.js`, `js/elements/shapes/polyline.js`, `js/elements/shapes/text.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/variable.js`, new `js/reactivity.js`, `js/gradient.js`, `js/compositing.js`, `js/handlers.js`, `js/elements/base.js`, `js/elements/container.js`; `tests/index.html`, `tests/frameworks.html`, `tests/unit.html`; `.agents/ENGINE.md`
- **Prototypes**: `design/prototypes/2026-11-20_custom_shapes/transform_path/` (the measurement of the one transform path, §8, made for the custom shapes plan)

---

## 1. Goal

Each engine feature lives in one file, so a reader who wants to understand or change gradients, handlers or the update phase opens one file instead of three or four. Nothing changes for authors: no attribute, tag, message or pixel. Each phase is a separate commit that the full test run checks.

Phases 1–5 move code between files. Phases 6–8, merged from the parked cleanup idea, add two shared base classes and give every node its stage: less repeated code between the element classes, also without a change in behavior (the idea measured −1 to −1.5 KB for its class steps). Not a goal: fewer lines in phases 1–5 (the moves are about neutral).

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

2026-11-28: built away by phases 2–4 as well: *Handlers* (phase 2, §10: `js/handlers.js`; `setHandler()` stays a `PxlNode` method), *`graphics.js`* (phase 3, §11: removed), *Gradients* (phase 4, §12: `js/gradient.js`). *Filters*: the helpers, `pxl.scaleResponsiveFilter` and `pxl.checkCanvasFilter` are in `js/compositing.js` (phase 3); `resolveFilter()` stays a `PxlNode` method, since it caches per element. *Reactivity*: phase 5 (§13), `js/reactivity.js`.

The parked idea `design/archive/2026-11-22_engine_structure_cleanup_plan.md` (2026-11-22, from the custom shapes plan) had listed part of this before and is merged here: its step 1 is `pxl.describe()` (built, `1c01aca`); its steps 2–4 are phases 6–8; its step 5 split `interaction.js` too (handler compiling to `compiler.js`, here its own `handlers.js` in phase 2; hit testing to a file of its own, D8); its step 6, the one transform path, is in §8.

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

Phases 6–8 add `js/elements/base.js` (before `stage.js`, the base of `Stage` and `PxlNode`) and `js/elements/container.js` (after `node.js`, the base of `Layer` and `Group`).

`js/graphics.js` is gone. Estimated sizes: `engine.js` ~180 lines, `reactivity.js` ~260, `compiler.js` ~380, `gradient.js` ~170, `compositing.js` ~140, `handlers.js` ~80, `interaction.js` ~570, `stage.js` ~380, `shape.js` ~430.

Public names stay: every `pxl.*` function keeps its name, so `tests/unit.html` (which calls `pxl.resolveRadius`, `pxl.parseStops`, `pxl.arcEndRadians`, `pxl.parsePointsIntoArray`, `pxl.hasLineDash`, `pxl.scaleResponsiveFilter`, …), `tools/build_types.js` (`pxl.anchorX`) and `examples/test53.html` (`pxl.anchorX` in expressions) need no change.

## 4. Phases

Each phase: one commit, `node build.js`, `node tools/run_tests.js` (full), `node tools/check_plans.js`, ENGINE.md updated in the same commit. Phases 3 and 4 also run a pixel hash comparison over all shapes before and after, like the one for the ArcShape refactor (`1f02f63`), committed with phase 3 in a prototypes folder named after this plan.

1. **Stage registry and the monitor's interface.** `pxl.stages` in `stage.js`; a stage adds itself on connect and leaves on disconnect. `pxl.wakeReaders()` and `pxl.fontsArrived()` read it. `pxl.perf` keeps only its timer (`start()` when the first stage registers, `stop()` after the last) and, on each tick, calls `stage.publishMetrics(seconds)` for every stage in `pxl.stages`. The stage owns its counters (`perfFrames`, `perfAccumulated`, `perfMax` become `_perfFrames`, `_perfAccumulated`, `_perfMax`, read and reset only in `stage.js`) and writes `fps`, `renderAvg` and `renderMax` itself. Today `monitor.js` reads, resets and publishes the stage's counters from outside. This is the publishing step of the throttling plan's per-layer metrics (`design/2026-11-12_layer_throttling_plan.md` §5.3, C2): C2 then only adds the layers' own counters and has `publishMetrics()` publish them too, and its frame counting (D4) only changes when the stage counts a frame. Tests: `tests/frameworks.html` and `tests/index.html` check `pxl.stages` instead of `pxl.perf.stages`; the monitor test that sets the counters (`tests/index.html`, "monitor: …") uses the new field names. About 45 minutes.
2. **`handlers.js`.** A move from `interaction.js`, no code change. `setHandler()` stays a `PxlNode` method (it changes the element's own listeners). About 20 minutes.
3. **`graphics.js` dissolved.** `compositing.js` (D1), arc angles to `arc.js`, the points parser to `polyline.js`, line dash and arrow helpers to `shape.js` (D4), anchors per D3. The filter scope entries move to `compositing.js` (D2). About an hour.
4. **`gradient.js`.** The descriptors and `pxl.resolveRadius` move. The two cache records become `pxl.GradientSlot` objects with `resolve(ctx, value, box, strokewidth)` (today's `createGradient()` body) and the build (today's `buildGradient()`); `Shape.createGradient(ctx, value, slot)` stays as the one call shapes use and delegates. `tests/index.html` reads the slot's fields under their new names (two tests read `_gradCache[0].br` and `[1].sw`). About an hour.
5. **`reactivity.js` and the scheduler.** Registry and versions move from `engine.js`. The scheduler's six fields and eight methods become `pxl.UpdateScheduler`, created in the stage's constructor like `pxl.InteractionEngine` (`this.scheduler`). `Stage.runFrame()` calls `scheduler.evaluateSources(t)` before the walk and `scheduler.updateReaders()` after it; `disconnectedCallback()` calls `scheduler.reset()`. `pxl.wakeReaders()` asks `stage.scheduler.readsId(id)`; `collectSources()` calls `readerStage.scheduler.addReader(this)`. The element fields the stage writes today (`readerStage`, `listedIn`, `isOrderNode`) keep the stage as their value. Test: `tests/index.html` reads `stage.scheduler._readers`. About 1.5 hours.

6. **`pxl.BaseElement`** (`js/elements/base.js`), the base of `Stage` and `PxlNode`: `values` with the hidden `$node`, `assigningRef`, the id registry (`registeredId`, `_isRegistered`, `pxl.renameNode()` from `attributeChangedCallback()`), properties set before the upgrade (`_pendingProperties`, `pxl.takeOwnProperties()`, `pxl.setPendingProperties()`), and `attributeChangedCallback()` for unchanged values and `id`, passing other names on to the subclass. Methods on the class, so the fields stay in their class. Today `stage.js` repeats this in its constructor and three lifecycle methods. About an hour.
7. **`stage` and `releaseElement()` in `PxlNode`:** one `stage` field, set on connect and cleared on disconnect, for every node. It replaces `readerStage` (shapes, groups and layers look up the same `closest('pxl-stage')` a second time as `stage`), and the scheduler's `listedIn` compares with it. Removing a layer then releases hover and press in its own `disconnectedCallback()` (same states, no events). `Variable` uses `stage` today for "stage-level only": it gets a field of its own for that, and still registers with the stage only when stage-level. About an hour.
8. **`pxl.Container`** (`js/elements/container.js`), the base of `Layer` and `Group`: `childList`, the DOM sort, `registerChild()` / `unregisterChild()` (both invalidate `parentLayer`, which is the layer itself for a layer), the child update and draw loops (`pxl.hasTransform()` is shared already, `5493ab8`). About an hour.

*2026-11-28:* phases 6 and 8 are parked in `design/ideas/2026-11-28_element_base_classes_note.md` (about 15 and 12 shared lines, for a class level and lifecycle rules); phase 7 stays here, under discussion.

The order goes from smallest to largest, so the first phases also show whether the build checks (`_` ownership) need anything special for moves. Phases 6–8 come after phase 5, when the files have settled: phase 5 rewrites much of `stage.js`, and phase 7 renames the field the scheduler reads.

## 5. Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | One file for transform, compositing, filters and isolation, or a separate `filter.js`? | **A** one `compositing.js`; **B** `compositing.js` + `filter.js` | **A**: all of it is canvas state a node sets before drawing (~140 lines); filters alone would be ~40 |
| D2 | Scope entries outside `compiler.js` (gradients, filters) and `pxl.scopeKeys` | **A** `pxl.scope` created in `engine.js`, entries added by their feature file, `pxl.scopeKeys` computed at the first compile; **B** keep every scope entry in `compiler.js`, move only the build side | **A**, with a unit test that every `pxl.scope` name is visible in a compiled expression. Today `pxl.scopeKeys` is computed when `compiler.js` loads: an entry added by a later file would silently be missing from every expression. Computing it at the first compile (all built-in files have loaded by then) removes that trap; B keeps the trap away by leaving gradient descriptors far from their build |
| D3 | Where do the anchor tables go? Used by rect's `anchor`, radial gradient radii, `tools/build_types.js`, `examples/test53.html` | **A** `engine.js` (shared box vocabulary); **B** `rect.js`; **C** `gradient.js` | **A**: two features use them; in B or C one feature would read the other's table |
| D4 | Arrow constants and helpers (`pxl.ARROW_*`, `pxl.arrowSize`, `pxl.createArrowRecord`) | **A** `shape.js`, next to the arrow methods; **B** an `arrows.js` with the methods too | **A** now: the methods are `Shape` methods on `this.values`; B would come with or after the class phases (6–8), if at all |
| D5 | Registry and versions: with the scheduler in `reactivity.js`, or stay in `engine.js`? | **A** `reactivity.js`; **B** stay | **A**: "who reads whom and when it is evaluated" in one file |
| D6 | The scheduler as a class owned by the stage, or `pxl.*` functions taking the stage? | **A** class (`stage.scheduler`); **B** functions | **A**: it owns six fields, which CLAUDE.md wants in a constructor; same pattern as `pxl.InteractionEngine` |
| D7 | Drawing with the cached local matrix (`ctx.transform(...getLocalMatrix())`) instead of `applyTransformState()`'s calls | **A** in this plan as phase 6; **B** its own plan | **B**: it changes behavior (canvas calls, possibly pixels) and needs a measurement against the frame budget; this plan only moves code. *2026-11-28:* the merged idea had measured it on 2026-11-20 (global matrix per shape: 3–9 % slower alone, §8); it stays tied to `space` |
| D8 | Split hit testing out of `interaction.js` (the merged idea's step 5: `pxl.dummyCtx` and the walk to a file of its own)? | **A** split; **B** keep | **B**: the walk is three `pxl.InteractionEngine` methods (about 70 lines) and the dummy context (about 10); a file of their own would need a class or `pxl.*` functions taking the engine, and `interaction.js` (about 570 lines after phase 2) stays about one subject, the pointer over shapes. *2026-11-28:* parked with phases 6 and 8 in `design/ideas/2026-11-28_element_base_classes_note.md` |

**Decided 2026-11-28:** every decision as recommended: D1 A (one `compositing.js`), D2 A (`pxl.scope` in `engine.js`, `pxl.scopeKeys` at the first compile, with its unit test and the load-order rule of §6.3), D3 A (anchors in `engine.js`), D4 A (arrow helpers in `shape.js`), D5 A (registry and scheduler in `reactivity.js`), D6 A (`pxl.UpdateScheduler`, owned by the stage), D7 B (its own plan, §8). D8 (added with the merge, 2026-11-28) is open.

## 6. Risks, Per-Frame Cost and Edge Cases

### 6.1 Moves

- **Load order.** `class … extends` and spread `static defaults` run at load: `arc.js` after `shape.js`, `gradient.js` before `shape.js` only if a class field needs it (none does: the slots are created in the constructor). D2 handles the scope. `build.js` fails on top-level declarations, so a moved helper that was written as a function declaration would be caught.
- **`_` ownership** (`build.js` checks it by name across files): fields move together with the code that uses them (`_gradCache` → the slot's own fields; the scheduler's `_order`, `_readers`, … → `pxl.UpdateScheduler`). The checker names any field that breaks the rule.
- **Tests that read internals:** the four lines named in phases 1, 4 and 5. Everything else calls `pxl.*` functions that keep their names.
- **Prototypes** in `design/prototypes/` that call moved internals (`option_b.patch`, the isolation box pages, `applyCompositingState` in the custom shapes patches) are history and run against the build of their time (`git show <commit>:dist/pxl.js`); not updated.
- **Bundle size:** about neutral (a class wrapper or two). Checked by `tools/check_build.js`.

### 6.2 Per-Frame Cost and Garbage Collection

Phases 1–3 add nothing per frame: phase 1's only new call, `publishMetrics()`, runs once per second per stage and does the work the monitor does today (`toFixed()` strings once a second); the frame counting in `Stage.render()` stays the same three lines. Phase 2's handlers run only on events. Phase 3 moves functions between files of one concatenated bundle, so the engine runs the same functions.

Phases 6–8 move lifecycle code (connect, disconnect, attributes: not per frame) and, in phase 8, the container's update and draw loops, which keep their form (rule 3).

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
| 6 | `pxl.Stage` has no expressions, matrices or `parentLayer` | `pxl.BaseElement` holds only what both classes have today; everything else stays in `PxlNode` |
| 7 | A layer removed while a shape in it is hovered or pressed | Released without events, as when the shape itself is removed (its own disconnect runs too) |
| 7 | A variable moved between a layer and stage level | Its own stage-level field decides whether the stage evaluates it; `stage` is set either way |
| all | `tools/build_types.js` runs the bundle in Node with a stubbed DOM | New files touch no DOM at load (the isolation canvas stays lazy); `handlers.js` builds its `Proxy` over `pxl.nodes` at load, so `reactivity.js` comes first (2 before 7) |

## 7. Docs

ENGINE.md only, in each phase: §1 (file table), §3 (scope), §4 (reactivity file names, the scheduler class), §6.1–§6.3 (compositing and gradients), §8.7 (handlers), §9, §10 (stage registry, the timer calling `publishMetrics()`). KILOPIXEL.md names only `pxl.anchorX` / `pxl.anchorY` (§11.3), which stay. No docs page describes engine files.

## 8. Not in This Plan

*2026-11-28, after closing:* the follow-ups below are tracked in `design/ideas/2026-11-28_element_base_classes_note.md` (§5; the transform path also in the `space` plan, TODO §28). The text stays as history.

- **One transform path** (the merged idea's step 6, D7 here): every shape drawn with its global matrix (`setTransform()`), as isolation and hit testing already are; groups and layers apply no transform when drawing; `pxl.applyTransformState()` and `pxl.applyContextState()` go. Measured on 2026-11-20 as a patch over commit `2f75888` (`design/prototypes/2026-11-20_custom_shapes/transform_path/`): pixels identical in 284 of 300 layers of 24 docs and 56 example pages, the other 16 differ only on anti-aliased edges (at most 77 / 255 on single edge pixels); frame time 3–9 % slower in 8 of 9 runs (0.6–2 ms per frame with 5,000 circles), from the matrix lookup per shape. So not alone: with `space` (TODO §28), whose extra transform becomes a different parent matrix. Since the layer scales by `u` once, the global matrix would be multiplied by `u` × DPR per shape, as isolation does; `design/prototypes/2026-11-20_custom_shapes/phase2/run.js` compares two builds by pixels and frame time.
- What shapes and groups still share after phase 7: the handler attributes in `observedAttributes`, `isHovered` / `isPressed`, the `handlers` record. Small; a decision when phase 7 is built.
- `Polyline.setPoints()` re-implements `valueChanged()` (and skips `affectsPixels()`).
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

## 10. Phase 2 Built (2026-11-28)

As planned in §4:

- **`js/handlers.js`** (new, after `compiler.js` in `build.js`): the 77 lines about `pxl-on-*` from `interaction.js`, unchanged: `pxl.HANDLER_EVENTS`, `pxl.createHandlers`, `pxl.handlerRef`, `pxl._assignableNames`, `pxl._unassignableNames`, `pxl.ASSIGNING_REF`, `pxl.compileHandler`. It builds its `Proxy` over `pxl.nodes` at load, so it comes after `engine.js`; `Group` and `Shape` read `pxl.HANDLER_EVENTS` when their tags are defined, later in the bundle.
- **`js/interaction.js`** starts with the hit test context; `setHandler()` stays a `PxlNode` method in `node.js`.
- **Merge:** while building it, the parked cleanup idea turned up, whose step 5 sent handler compiling to `compiler.js`. Kept `handlers.js` (decided 2026-11-28): the file also holds the event map, the `ref` proxy with its assignment rules and the error wrapper of each listener, more than compiling. The idea is merged into this plan (Log).
- **Tests:** no change needed (the names stay). Full test run passed; bundle size unchanged (74.51 KB).
- **Docs:** ENGINE.md §1 (file table: `handlers.js` is file 4, 21 files), §8.7 (heading names the file), §11 (file count).
- **Left:** phases 3–8, D8.

## 11. Phase 3 Built (2026-11-28)

As planned in §4, with D1–D4:

- **`js/compositing.js`** (new, after `compiler.js`): `pxl.hasTransform`, `pxl.applyTransformState`, `pxl.scaleResponsiveFilter`, `pxl.applyContextState`, `pxl.checkCanvasFilter`, `pxl.applyCompositingState`, `pxl.getIsolationContext` from `graphics.js`, and the ten filter scope entries (`blur()`, `dropShadow()`, …) from `compiler.js` (D1, D2).
- **D2 built:** `pxl.scope` is created in `engine.js`; `pxl.scopeKeys` is now a function, `pxl.scopeKeys()`, that builds the list at the first compile (`pxl._scopeKeys`); `compiler.js` and `handlers.js` call it. New unit test ("scope: every name in `pxl.scope` is visible in static and animated expressions and in handlers").
- **Moved to their callers:** the anchor tables to `engine.js` (D3); `pxl.arcEndRadians` and `pxl.isFullTurn` to `arc.js`; the arrow constants, `pxl.arrowSize`, `pxl.createArrowRecord`, `pxl._emptyDash` and `pxl.hasLineDash` to `shape.js` (D4); `pxl.parsePointsIntoArray` to `polyline.js`. `js/graphics.js` is removed; `build.js` lists 21 files.
- **Deviation:** `pxl.resolveRadius` went to `shape.js`, next to its only caller `buildGradient()`, instead of waiting in `graphics.js`: phase 4 moves both to `gradient.js`.
- **Pixels:** `design/prototypes/2026-11-28_engine_restructure/pixel_hashes.html`, 38 scenes through every moved helper (transforms on layers, groups and shapes, alpha, blend, mask, filters, shadows, isolation, dashes, arrowheads, arc angles, the points parser, anchors, radial radii, text, grid, the Gauge): 0 changed against the build before the phase.
- **Checks:** full test run passed (unit 107/107); generated types unchanged; build checks (`_` ownership) passed without changes. Bundle 74.61 KB (+0.1 KB, the `scopeKeys()` function and comments), still ~75KB.
- **Docs:** ENGINE.md §1 (file table), §3 (where the scope is filled, `pxl.scopeKeys()`).
- **Left:** phases 4–8, D8.

## 12. Phase 4 Built (2026-11-28)

As planned in §4, with D2:

- **`js/gradient.js`** (new, after `compiler.js`): `pxl.parseStops` and the scope entries `linear()`, `radial()`, `conic()` from `compiler.js`, `pxl.resolveRadius` from `shape.js` (where phase 3 had put it), and **`pxl.GradientSlot`**: `resolve(ctx, descriptor, box, sw)` is the cache check of the old `createGradient()`, `build(ctx, descriptor, box, sw)` the old `buildGradient()`, with `slot === 1` now the slot's own `_isStroke`. All its fields (`_isStroke`, `_config`, `_left`, `_top`, `_right`, `_bottom`, `_sw`, `_grad`, `_error`) are set in its constructor.
- **`js/elements/shape.js`:** `_gradients = [new pxl.GradientSlot(false), new pxl.GradientSlot(true)]` replaces the two `_gradCache` records; `createGradient(ctx, value, slot)` keeps its test for a descriptor first (colors and `null` return at once) and otherwise calls the slot. `paint()`, `applyStyle()`, `applyStrokeState()`, text and grid are unchanged.
- **Tests:** `tests/index.html` reads `_gradients[1]._sw` and `_gradients[0]._right` (two tests). Full test run passed; generated types unchanged; build checks passed without changes.
- **Pixels:** `design/prototypes/2026-11-28_engine_restructure/pixel_hashes.html`, 38 of 38 scenes unchanged (radial, linear and conic gradients, keyword radii, stroke gradients on lines and polylines included).
- **Per frame:** the rules of §6.2 hold: the color test before the slot, no allocation in `resolve()`, the build code unchanged. Measured with `design/prototypes/2026-11-28_engine_restructure/gradient_bench.html` (1,500 rects drawn every frame; colors, static gradients, animated gradients; the build before the phase loaded with `?src=`). Median ms, before → after: Chrome (browser pane) 9.6 → 9.5, 13.1 → 5.1, 27.9 → 22.6 and in a second pair 8.6 → 4.0, 11.1 → 13.7, 19.9 → 20.3; Firefox headless (timer rounded to 1 ms) 7 → 9, 27 → 20, 10 → 11. The differences go both ways by up to 2× between runs of the same build: the measurement can't show a change of one method call per gradient, and none is visible. A steadier benchmark would need many alternating runs in a headless Chrome; not needed for this phase.
- **Docs:** ENGINE.md §1 (file table: `gradient.js` is file 4, 22 files), §3 (where the scope is filled), §6.3 (the slot), §11 (file count).
- **Left:** phase 5 (`reactivity.js`, the scheduler), phases 6–8, D8.

## 13. Phase 5 Built (2026-11-28)

As planned in §4, with D5 and D6:

- **`js/reactivity.js`** (new, file 2, after `engine.js`): the registry and versions from `engine.js` (`pxl.nodes`, `pxl._changeCounter`, `pxl._registryVersion`, `pxl._readIds`, `pxl._orderVersion`, `pxl.MAX_CYCLE_ROUNDS`, `pxl.CYCLE_MESSAGE`, `pxl.addReadIds`, `pxl.isRead`, `pxl.markChanged`, `pxl.wakeReaders`, `pxl.registerNode`, `pxl.unregisterNode`, `pxl.renameNode`), unchanged except that `pxl.wakeReaders()` asks `stage.scheduler.readsId(id)`; and **`pxl.UpdateScheduler`** with the six fields (`_idsRead`, `_readers`, `_checkedCounter`, `_order`, `_cycleStart`, `_builtOrderVersion`) and eight methods (`readsId`, `addReader`, `updateReaders`, `buildOrder`, `addOrderNode`, `orderSources`, `pushContainers`, `evaluateOrder`) from `stage.js`, plus `evaluateSources(t)` (the order rebuilt if needed, then evaluated) and `reset()` (what `disconnectedCallback()` did to the order).
- **In the moved methods, `this` meant the stage in seven places** (`listedIn`, `readerStage` compared or set): they use `this.stage` now, so the elements keep the stage as their value (§6.3).
- **`js/elements/stage.js`** (about 530 → 387 lines): `this.scheduler = new pxl.UpdateScheduler(this)` in the constructor; `runFrame()` calls `scheduler.evaluateSources(t)` before the walk and `scheduler.updateReaders()` after it; `disconnectedCallback()` calls `scheduler.reset()`. **`js/elements/node.js`:** `collectSources()` calls `readerStage?.scheduler.addReader(this)`. Comments naming `Stage.buildOrder()`, `Stage.evaluateOrder()` and `Stage.updateReaders()` (in `engine.js`, `compiler.js`, `node.js`, `tests/scaling.html`) name the scheduler.
- **Tests:** `tests/index.html` reads `stage.scheduler._readers`. Full test run passed, the evaluation-order, lifecycle and reference-cycle tests and `tests/scaling.html` included; generated types unchanged; build checks (`_` ownership) passed without changes.
- **Per frame:** two method calls on `stage.scheduler` instead of `this` (one property load each); the loops are unchanged. No drawing code moved, so no pixel comparison; §12 showed that the gradient benchmark can't resolve differences of this size, so it wasn't repeated.
- **Size:** 75.50 KB (+0.3 KB, the class wrapper and its comments), still ~75KB by the build's rounding check.
- **Docs:** ENGINE.md §1 (file table: `reactivity.js` is file 2, 23 files), §4 (the file, the scheduler, `stage.scheduler.addReader()`), §5.2 (the frame), §11 (file count).
- **Left:** phases 6–8 (shared base classes), D8.

## 14. Phase 7 Built (2026-11-28)

Discussed and checked before building (per-frame cost, garbage, edge cases); phases 6 and 8 and D8 are parked in `design/ideas/2026-11-28_element_base_classes_note.md`.

- **`js/elements/node.js`:** one field, `stage`, on every node: set first in `connectedCallback()` (properties set before the upgrade may already ask the stage for a frame), cleared last in `disconnectedCallback()`, after `stage.interaction.releaseElement(this)`, which moved here from `Shape` and `Group` and now runs for every node. `readerStage` is gone; `collectSources()` calls `stage?.scheduler.addReader(this)`.
- **`js/elements/shape.js`, `js/elements/group.js`:** their `stage` field and both lifecycle overrides removed.
- **`js/elements/layer.js`:** registers with the stage after the base class's connect (it sets `stage`), unregisters before the base class's disconnect (it clears `stage`).
- **`js/elements/variable.js`:** `_isStageLevel` keeps the meaning `stage` had there (inside a stage, outside every layer), decided on connect and reset on disconnect; registering, unregistering and the frame request on a value change check it, so a variable inside a layer behaves as before.
- **`js/reactivity.js`:** the scheduler compares the elements' `stage` (four places).
- **Found while checking:** the reset of `_isStageLevel` on disconnect (else a value set before the next connect could ask the old stage for a frame); `addReader()` may now run twice during one connect, harmless (the ids are a `Set`, `listedIn` prevents a second entry). A removed shape or group no longer keeps its stage alive through `stage`; it still keeps `parentLayer` (not in this phase).
- **Tests** (`tests/index.html`, 190/190): every node has its stage, the new one after a move, `null` after removal; a removed layer leaves nothing hovered or pressed, without events; a variable inside a layer asks for no frame by itself, a stage-level one does. The existing test of a stage variable moved into a layer checked the old meaning of `stage` (`null` in a layer) and now checks `_isStageLevel`. Full test run passed; build checks and generated types unchanged.
- **Per frame:** unchanged (the scheduler's check reads `stage` instead of `readerStage`); no allocation. One `closest('pxl-stage')` per connect instead of two for shapes, groups and layers.
- **Size:** 75.08 KB (−0.4 KB).
- **Docs:** ENGINE.md §2 (the field, connect, disconnect), §4.3, §8.5; KILOPIXEL.md §12 and `docs/custom-shapes.html` (`this.stage` is `null` while the shape isn't connected).

## Log

- 2026-11-28: phase 7 built (§14); the plan is implemented (phases 1–5 and 7; 6, 8 and D8 parked) and moved to `design/done/`.
- 2026-11-28: phases 6 and 8 and D8 parked in `design/ideas/2026-11-28_element_base_classes_note.md` after measuring how much they would share; phase 7 (one `stage` field per node) under discussion.
- 2026-11-28: phase 5 built (§13): `js/reactivity.js` with `pxl.UpdateScheduler`. Phases 1–5 (files by feature) are done. Next: phase 6.
- 2026-11-28: phase 4 built (§12): `js/gradient.js` with `pxl.GradientSlot`. Next: phase 5.
- 2026-11-28: phase 3 built (§11): `js/compositing.js`, `graphics.js` removed, scope names at the first compile (D2). Next: phase 4.
- 2026-11-28: phase 2 built (§10): `js/handlers.js`. Next: phase 3.
- 2026-11-28: merged the parked idea `design/archive/2026-11-22_engine_structure_cleanup_plan.md` (archived as superseded by this plan): its steps 2–4 are phases 6–8, step 1 was built as `pxl.describe()`, step 5's handler move is phase 2 (into `handlers.js`, not `compiler.js`), its hit-testing split is D8 (open), step 6 is in §8 with its measurement.
- 2026-11-28: phase 1 built (§9): `pxl.stages`, `pxl.perf` only the timer, `Stage.publishMetrics()`. Next: phase 2.
- 2026-11-28: decided: D1–D7 as recommended (§5). Next: phase 1.
- 2026-11-28: review for per-frame cost, garbage and edge cases: §6.2 (rules for phases 4 and 5), §6.3 (edge cases), animated gradients in §8. The review found the `paint()` bug fixed in `a54e485`.
- 2026-11-28: phase 1 also moves the monitor's publishing into the stage (`publishMetrics()`, counters owned by the stage), the step the throttling plan's C2 needs; that plan (TODO §8) stays after release 0.1.
- 2026-11-28: proposed after the code review of the same day; its small findings were built first.
- Status line until 2026-11-28 (implemented): 🟢 **Decided** (2026-11-28, phases 1–5 built, §9–§13; phase 7 under discussion; phases 6 and 8 and D8 parked in design/ideas/)
