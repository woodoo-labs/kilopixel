# Evaluation Model: When Values Are Evaluated and Layers Redrawn

- **Status**: ✅ **Implemented** (2026-11-27, option B with global ids, §11)
- **Date**: 2026-11-20
- **Replaces**: `design/done/2026-11-12_two_phase_frame_plan.md` (step 1 built there, §7.4; its open parts continue here), `design/done/2026-11-12_reactive_propagation_plan.md` (the cycle stop built there, §2; its full design is option A here), `design/archive/2026-11-15_per_frame_evaluation_plan.md` (option B here). Details, derivations and measurements stay in those plans; this one holds the state, the next step and the decisions.
- **Related**: `design/done/2026-11-17_pointer_frame_order_plan.md` (the pointer at the start of the frame), `design/done/2026-11-07_safe_shape_render_plan.md` (error rules, kept), `design/done/2026-10-26_tolocal_fix_plan.md` (the `toLocal` matrix walk)
- **Target Implementation**: `js/compiler.js`, `js/elements/stage.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/shape.js`, `js/elements/node.js`, `js/elements/variable.js`, `js/engine.js`, `js/interaction.js`, `js/monitor.js`, `tests/index.html`, `.agents/ENGINE.md` §4–§5, `.agents/KILOPIXEL.md` §3.6
- **Prototypes**: `design/prototypes/2026-11-20_evaluation_model/` (step 2 page sweep `run.js`; option B as `option_b.patch`, its bench `option_b_bench.html`, §10), `design/prototypes/2026-11-12_two_phase_frame/` (second walk, CSS-only path, frame bench), `design/prototypes/2026-11-12_reactive_propagation/` (cycles, propagation cost), `design/prototypes/2026-11-15_per_frame_evaluation/pull_bench.html` (broadcast against a per-frame loop, ordering cost)

---

## 1. Today

An attribute expression is re-evaluated by one of three mechanisms (`.agents/ENGINE.md` §4–§5):

| Expression | Example | Re-evaluated | By |
|---|---|---|---|
| uses `t` (with or without refs) | `x="t * 10"`, `x="ref.a.x + wave(2)"` | every frame, in DOM order | `evaluateAnimations()` in the update phase |
| reads `ref.*`, no `t` | `fill="ref.theme.value"` | at once when the source changes, recursively | `pxl.broadcast()` → `variableChangedCallback()` |
| uses `toLocal()`, no `t` | `x="toLocal(ref.planet, 'tx')"` | as above, and when an ancestor's matrix changes | `broadcastGlobalMatrixChange()` |

**Built:** the update phase runs before the draw phase (two-phase step 1, 2026-11-13: readers without `t` see this frame's values whatever the DOM order); a `ref` cycle that never settles stops after 100 rounds (`_broadcastNesting`, 2026-11-13); hit testing and handlers run at the start of the frame (2026-11-17).

**Open problems**, where the mechanisms meet:

1. **`isDirty` means two things,** "pixels out of date" and "something is animated, keep the loop running": every animated element invalidates its layer in every frame, whether its value changed or not. A `text="floor(t)"` clock redraws 60 times a second; a finished `clamp(t * 100, 0, 300)` intro never stops.
2. **Readers with `t` don't subscribe,** so each one before its source in the DOM lags one frame.
3. **Diamonds** (a reader reached on two paths) are evaluated once per path and first see one new and one old input (210 before 220). Invisible today, because only final values are drawn; visible to `<pxl-out>` or handlers that react to every change.
4. **`toLocal`** needs a third key list and a subtree walk on every matrix change.
5. **A change before the running frame's update phase requests a frame of its own:** a pointer reader adds an empty frame after each move (`test.known()` in `tests/index.html`, rule R1).
6. **Hidden subtrees:** values that follow `t` freeze inside a hidden group or layer, also for readers outside (§5, D6).

*2026-11-26:* problems 1 and 5 are solved by step 2 (§9). *2026-11-27:* problems 2, 3 and 4 by option B (§11); for 6, values that others read are evaluated also when hidden (D6).

## 2. Step 2: Change-Based Dirty Flags, Keep-Alive in the Stage

*2026-11-26: built, §9 (with three additions: variables and hidden elements redraw nothing, `wake()`).*

Needed by both options of D1, by throttling and by tweens. Design: two-phase plan §3.2, §3.3, §7.2, §7.3.

- **A layer is dirty only when something in it changed:** an animated value changed in the update phase, or an outside source invalidated it (`setAttribute()`, broadcasts, resize, font arrival, later image loads, the first draw). `parentLayer.invalidate()` at the end of `evaluateAnimations()` and the layer heartbeat at the end of `Layer.render()` go away; `isDirty` only means "pixels out of date".
- **The stage keeps the loop alive** from the update phase: it requests the next frame while anything is animated. A layer that skips drawing (throttled, hidden, CSS-only path) can't drop the loop. The update phase still evaluates every frame while something is animated (the clock must notice the next second); only drawing is saved.
- **Which layers the update phase walks:** a fact per layer, "had animated content in the last walk", collected during the walk; plus dirty layers and layers with animated attributes of their own.
- **Facts are recomputed during the walk, never kept as counters** that connect, disconnect and `setAttribute()` would have to update: every such change already invalidates the layer, so the next walk recomputes them (two-phase plan §7.3).
- **R1 holds:** a change before the running frame's update phase requests no frame of its own; the `test.known()` becomes a test.
- **Contract:** `draw()` only reads `attributeValues` (checked: no built-in `draw()` uses `t`); custom shapes inherit it (`design/archive/2026-10-17_shape_authoring_plan.md`: `draw(ctx, u)` without `t`).

| Expression | Today | After step 2 |
|---|---|---|
| `text="floor(t)"` | 60 redraws / s | 1 / s |
| `x="clamp(t * 100, 0, 300)"` | 60 / s forever | stops after 3 s |
| `fill="t > 5 ? 'red' : 'blue'"` | 60 / s | 1, at the switch |

- **Limits:** values that are new objects every frame (an animated gradient descriptor, an array) compare as changed and redraw as today. One changing element still redraws its whole layer (5,000 static circles: the full 12–13 ms), so most docs pages, animated with `t` throughout, gain little; the docs can then recommend putting changing shapes into their own layer.
- **Optional:** skip static subtrees in the update phase ("has animated descendants" on groups), about 0.2 ms per frame for 5,000 static elements (two-phase plan §5.1).
- **Measure while building:** redraws saved on every docs and example page (count `Layer.render()` calls that drew), and the engine tests and pages that read a derived value right after `setAttribute()` (for D5).

## 3. Decision D1: How Values Are Evaluated After Step 2

### 3.1 Option A: Keep Broadcasts, Add Order

- **Readers with `t`** (two-phase step 3, plan §3.1.1): the update phase evaluates sources before their readers across layers and groups, from a lasting dependency order built from the compiler's `variableDependencies` (an edge from each source to its reader; `toLocal()` adds the ancestors of both). Nodes are elements that are read by others and have expressions of their own (R4); the order is rebuilt only when such an element connects, disconnects or changes an expression or `id` (iterative Tarjan). Per frame: walk the cached order, no allocation.
- **Reactive readers** (reactive propagation plan §4): `broadcast()` first marks every affected reader and counts its affected inputs (stamps, an explicit stack), then evaluates each reader once, when all its affected inputs are done and one of them changed (Kahn's algorithm on the affected part only). Nested broadcasts join the running propagation. No lasting graph.
- **`toLocal`:** the matrix walk stays, routed through the work list.
- **Code:** about +90 lines (+1 KB minified) for the propagation, plus the order for readers with `t`.

### 3.2 Option B: Evaluate per Frame, No Broadcasts

Design: per-frame plan §2–§3.

- **Versions instead of broadcasts:** a change raises `pxl._changeCounter` into the source's `changeVersion` and asks for a frame (`pxl.markChanged()`, replacing the 19 `broadcast()` calls); a reader keeps `_seenVersion` and is out of date when a source's version is newer. Sources are looked up by id at check time; connecting with an id marks the element changed, removing one raises `pxl._registryVersion`.
- **Update phase in three parts:** (1) ordered sources: elements read by others with expressions of their own, in dependency order (Kahn on these nodes only; 0.06 ms for 1,000 nodes); (2) the walk, as today, for every other expression with `t`; (3) a flat list per stage of readers nobody reads, each compared by version and evaluated only when out of date (about 20 ns per reader that is up to date). `toLocal` readers are in part 3 and evaluated in every frame that runs; a `toLocal` reader that others read is an ordered source whose edges include the ancestors of its target and its own (the riskiest case: prototype it first).
- **Waking a stage:** only for sources someone reads (`pxl._readIds`, filled by the compiler), so an idle page stays idle while the monitor publishes.
- **Goes away:** subscriptions, `broadcast()`, `variableChangedCallback()`, the `toLocal` key list and matrix walk, the layer heartbeat: about 205 lines out, 170 in.
- **Behavior change:** a reactive value is updated in the next frame's update phase, not inside `setAttribute()` (same frame on screen); a handler that sets a variable and reads a derived value in its next statement sees the old one (D5).

### 3.3 Comparison

| | A | B |
|---|---|---|
| Mechanisms afterwards | three, two of them ordered | one |
| Reactive value right after `setAttribute()` | new at once | new in the next frame |
| Cost when a source changes | about +20 ns per reader over today (15–20 % of a broadcast; 0.1 % of a frame for 1,000 readers) | about the same as broadcasts (330–620 ns per reader either way) |
| Cost when nothing changed | none | about 20 ns per reader with the version check (without it: 1 ms per 5,000 readers) |
| Diamonds | evaluated once (14 stacked: 65,532 evaluations → 42) | evaluated once |
| Risk | small steps on working code | replaces the core of `engine.js` and `node.js` in one step |

*2026-11-27: B prototyped (§10). Measured against today: the same cost when a source changes, 16 ns per idle reader (0 when nothing read changed), diamonds 65,532 → 42 evaluations, about +166 lines and +2.95 KB rather than fewer lines.*

Speed is not the reason for either; B ends with less to understand and keep right, A keeps today's timing. **Recommended procedure:** build step 2, prototype B as a patch over the engine, run the page sweep (every docs and example page, 60 frames driven by hand, pixels and canvas clears compared with today, as in two-phase plan §7.4) and the frame bench, then decide.

## 4. Rules Both Options Share

| | Rule |
|---|---|
| R1 | A change before the running frame's update phase (pointer, hover and press states, handlers in `interaction.process()`, stage-level variables) is drawn in that frame and requests no frame of its own. Only other stages, and the keep-alive decided after the update phase, request frames |
| R2 | Cycles without `t`: decision C1 below |
| R3 | An element that reads its own attributes sees this frame's values, also when both are reactive: self-edges stay out of the order, and inside the element its reactive expressions are evaluated once more when one of its values changed and another reads the element |
| R4 | Nodes of the dependency order are elements that are read by others **and** have expressions of their own. Adding readers (particles following `ref.main.mouseX`) never rebuilds the order. The algorithm is iterative |
| R5 | "Who reads this element" comes from the compiler's `variableDependencies`, which expressions with `t` have too (`pxl._subscriptions` knows only readers without `t`) |
| R6 | Stage-level variables are evaluated first; the stage keeps the loop running while one is animated |

**Cycles with `t`** (a "follow" self-reference, shapes chasing each other) keep working as today: members evaluated once per frame in DOM order, a member reading a later one gets its previous frame's value; no warning, the feedback is usually intended.

## 5. Decisions

| | Question | Recommended |
|---|---|---|
| D1 | Option A or B (§3) | build step 2, prototype B, then decide. *2026-11-27: **decided: B** (§10.4)* |
| C1 | Cycles without `t` (`a = b + 1`, `b = a + 1`): (a) today's recursion with the nesting counter, A only; (b) members in DOM order, repeated while values change, at most `pxl.MAX_CYCLE_ROUNDS` rounds, one warning, and the edge that closes the cycle requests no frame; (c) one pass and a warning when the order is built | (b), on both options: it keeps the results of every cycle that settles or converges, without recursion; (c) stops converging cycles after one step. *2026-11-27: **decided: (b)**, as prototyped (§10)* |
| D2 | Granularity: element (as the compiler records it) or attribute (`ref.orb.stroke` as its own source) | element. *2026-11-27: **decided: element*** |
| D3 | A: one propagation per `broadcast()`, or several changes in a handler as one | one per `broadcast()` (reads right after a change see new values). *2026-11-27: not needed, B decided* |
| D4 | `toLocal`: A keeps the walk through the work list; B evaluates every frame that runs, or compares matrix versions | as listed; matrix versions only if a measurement asks for it. *2026-11-27: **decided**: evaluated in every frame that runs; `toLocal()` reads a target in the reader's own stage only (§10.4)* |
| D5 | B: derived values right after `setAttribute()` in the next frame, or evaluated on demand when a stale value is read | the next frame, if step 2 finds no page that relies on it. *2026-11-27: **decided: the next frame**; no docs or example page relies on it (§10.2); the docs say so* |
| D6 | Hidden subtrees: evaluate them every frame, never, or only what someone outside reads (R5) | only what is read: under B the ordered sources already are. *2026-11-27: **decided**, as prototyped (§10.4)* |
| D7 | B: wake every stage in view, or only stages with readers of the source | every stage in view. *2026-11-27: **decided: only stages that read the changed key**, as prototyped (§10.1)* |
| D8 | Scoped names instead of global ids (`design/done/2026-10-30_framework_compatibility_plan.md` D2, §8.2): compiled functions would get `ref` per stage at call time, so component instances share them | design together with D1: both change how `ref` is resolved. *2026-11-27: **decided: keep global ids** (§10.4); scoped names parked in `design/ideas/2026-11-27_scoped_names_note.md`* |
| D9 | Throttled layers (`design/ideas/2026-11-12_layer_throttling_plan.md`): evaluated every frame (smooth readers) or at their rate | decide with throttling part A, after step 2 |
| D10 | Hit testing uses the values of the last update; in a throttled layer they can be ahead of its pixels | accept. *2026-11-27: **decided: accept*** |
| D11 | Internal animated values of custom shapes (a pump's impeller that spins while `running`, without the page writing `t`): a declarative `static animations = { impeller: 'this.values.running ? t * 90 : 0' }` evaluated like an animated attribute, and values that keep state between frames (smooth start and stop) | decide with D1; until then time goes through an attribute (`spin="t * 180"`). From `design/done/2026-11-20_custom_shapes_plan.md` §5.9 (D9 there). *2026-11-27: still open, not needed for the build* |
| D12 | Duplicate ids (added 2026-11-27): today the element connected last wins silently, and removing it deletes the entry although the other is still there | **decided: nothing special**, as today (§10.4) |
| D13 | A `<pxl-var>` outside every stage (added 2026-11-27): no stage evaluates it | **decided: nothing special**: not evaluated, like any element outside a stage (§10.4) |

## 6. Plans That Depend on This

| TODO | Plan | What changes |
|---|---|---|
| §8 | `design/ideas/2026-11-12_layer_throttling_plan.md` | part A after step 2: a skipped layer just stays dirty until its window (no rAF relay or timer); D9 |
| §3 | `design/2026-10-01_tween_animation_plan.md` | its §7 "auto-sleep" is replaced by step 2 (a finished tween stops redrawing on its own); a spring is a reader with state, evaluated once per frame in the order |
| — | `design/ideas/2026-09-29_pxl-clip_element_plan.md` (parked) | if it is picked up: its `applyClip()` evaluates children while drawing; they must be evaluated in the update phase (possible since step 1) |
| §28 | `design/ideas/2026-10-30_space_attribute_plan.md` | its reactivity (§3.3) subscribes through broadcasts: rewrite after D1; its draw-order rule (§3.5) is gone since step 1 |
| (parked) | `design/ideas/2026-08-02_declarative_html_output_pxl_out_plan.md` | after D1: under A the propagation must be ordered first (no 210 before 220), under B it is a reader in part 3 |
| (closed) | `design/done/2026-11-20_custom_shapes_plan.md` | `draw(ctx)` without `t` is the contract since its step 3; internal animated values (its §5.9, D9) moved here as D11 |

Not affected: hit testing and event dispatch (both fit either option), isolation, `<pxl-plot>`, `<pxl-path>`.

## 7. Steps

1. **Step 2** (§2), with its tests; count the redraws saved and the pages that read derived values right after `setAttribute()`.
2. **Prototype B** as a patch over the engine; the page sweep and the frame bench; decide D1 and C1.
3. **Build** the chosen option, tests first (§8).
4. **Update** the dependent plans (§6), `.agents/ENGINE.md` §4–§5 and `.agents/KILOPIXEL.md` §3.6.

*2026-11-27: step 2 done (§10); D1 decided, step 3 is next (§10.5).* *2026-11-27: steps 3 and 4 built (§11).*

## 8. Tests

Existing tests stay (two-phase frame, ref cycles, safe render, `toLocal`, layer fast path). New:

- Step 2: a `floor(t)` text redraws once per second; a finished `clamp()` animation stops redrawing; one pointer move with a reader of the pointer runs one frame (today's `test.known()`); a page without animation stays at 0 FPS; a shape added to a static layer is drawn in the next frame.
- D1: ten stacked diamonds evaluate their bottom once per change and never show a half-updated value; a chain of 10,000 readers ends at the right value; three readers with `t` in the DOM order C, B, A show the same frame's values; a cycle without `t` warns once, names its elements and doesn't keep the stage running; an idle page with 1,000 readers runs no frame while the monitor publishes; a reader written before its source updates when the source connects and again when it is removed; a `toLocal` reader that another reader reads, with a target in a group that moves with `t`.

## 9. Step 2 Built (2026-11-26)

As §2 describes it: `isDirty` means only "pixels out of date", and the stage keeps the frame loop running.

- **`js/elements/node.js`:**
  - `affectsPixels(key)` replaces `isCompositingKey()`: whether a changed value changes the layer's pixels.
  - `valueChanged()` invalidates the layer only for such a value; otherwise it calls `compositingChanged()`, and for an animated element `parentLayer.wake()`.
  - `evaluateAnimations()` calls `parentLayer.markAnimated()` while the element is animated, *before* evaluating. It invalidates only when a changed value `affectsPixels()`, otherwise calls `compositingChanged()`. Its special case for a layer's own values (`parentLayer !== this`) is gone: `affectsPixels()` covers it.
  - `reportError()` no longer invalidates.
- **`js/engine.js`:** `pxl.evaluateAttributesForVariable()` and `pxl.evaluateToLocalAttributes()` use `affectsPixels()` (bit 4); the second calls `compositingChanged()` for other changes.
- **`js/elements/layer.js`:**
  - `affectsPixels()`: not for `alpha`, `blend`, `filter`.
  - `markAnimated()` stamps the frame (`_animatedFrame`); the update sets `hasAnimatedContent` from it after the children. `wake()` sets it from outside and asks for a frame.
  - `needsRender()` = `isDirty || _isCompositingDirty`. `render()` returns after the CSS when the layer isn't dirty (the CSS-only path, without its loop over the animated keys) and clears `isDirty` before drawing.
  - Removed: `_updateFrame`, `_wasDirty`, `_keepAlive` and the three heartbeats in `render()`.
  - A failed update no longer clears `isDirty`, so the layer keeps its request without restoring it.
- **`js/elements/stage.js`:**
  - `render()` runs `runFrame()` inside `try` / `finally` with `_isRendering`, during which `requestRender()` does nothing (R1).
  - The update phase walks layers with `isDirty || hasAnimatedContent`.
  - `needsNextFrame()` asks for the next frame while a stage-level variable is animated, or a layer has animated content or is still dirty.
- **`js/elements/variable.js`:** `affectsPixels()` returns `false`.

**Deviations from §2, decided while building:**
- **Variables redraw nothing:** §2 counted any changed value. An animated `<pxl-var>` inside a layer used to redraw the layer in every frame for nothing; its readers redraw their own layers.
- **Hidden elements redraw nothing** except for `hidden` itself. They are still evaluated, so `ref.*` to them stays current.
- **`wake()`:** both rules above mean that an element made animated with `setAttribute()` may change no pixels, so nothing would bring its layer into the next update. `wake()` does that without a redraw.
- **The keep-alive mark comes before the evaluation,** so an animated element whose evaluation fails keeps the frames coming and recovers when the error depends on `t`. A shape whose evaluation fails now keeps its old pixels unless something else redraws its layer; before, it disappeared for that frame.
- **The layers to walk** are `isDirty || hasAnimatedContent`. A layer's own animated attributes mark it like a child's, so §2's third condition ("animated attributes of its own") isn't needed.
- **Not built:** skipping static subtrees in the update phase (optional in §2).
- **Not measured:** the pages that read a derived value right after `setAttribute()` (D5). That belongs to the prototype of option B.

**Tests** (`tests/index.html`), 161/161 pass:
- The `test.known()` of R1 ("one pointer move with a reader of the pointer runs one frame") is a test now.
- New section "Change-based redraws":
  - a `floor(t)` text redraws once in a second;
  - a finished `clamp()` stops redrawing while the stage keeps evaluating;
  - an animated variable redraws nothing, its reader's layer redraws;
  - a hidden animated shape is evaluated but redraws nothing, and showing it redraws once;
  - a hidden shape and a variable made animated with `setAttribute()` are evaluated in the next frames (`wake()`).
- "safe render: an animated shape keeps its layer running while it fails" now checks `hasAnimatedContent` and `needsNextFrame()` instead of `isDirty`.
- The idle page ("nothing redraws while nothing moves") and "a shape added to a static layer is drawn in the next frame" are existing tests and pass.

**Pages** (`design/prototypes/2026-11-20_evaluation_model/run.js`: every docs and example page, 120 frames driven by hand, the canvases compared at the end without a forced redraw):

| | Before (`a1f46e3`) | Step 2 |
|---|---|---|
| Pages, stages, layers | 82, 173, 306 | the same |
| Frames run | 9,336 | 9,336 |
| Canvas clears (redraws) | 10,907 | 10,667 (−2.2 %) |
| Layers that look different | | 0 (3 unstable: clocks, randomness) |

- **The saving comes from two pages:**
  - `examples/test29.html`: a layer that holds only variables, 120 → 0;
  - `examples/test54.html`: a clock on `time('h')`, `time('m')`, `floor(time('s'))`, which now redraws once per second instead of 60 times.
- **Every other page** animates with `t` throughout and redraws as before, as §2 expected. The tool run against itself gave noise only on `docs/walkthrough.html` (1–2 layers, randomness).

**Size:** 70.43 KB minified, 21.21 KB gzipped (+0.11 KB, +0.03 KB); the rounded sizes in the docs stay.

**Reference:** `.agents/ENGINE.md` §2, §4.3, §4.4, §5.1–§5.4; `.agents/KILOPIXEL.md` §6.2 (a layer redraws only in frames where something in it changed) and §13 (frames that redrew nothing count).

**Left:** the prototype of option B and D1 (§7, step 2 there).

## 10. Prototype of Option B (2026-11-27)

`design/prototypes/2026-11-20_evaluation_model/option_b.patch` applies to commit `e1b2f68` (`git apply`, then `node build.js`). It is a working engine, not a sketch: every test page passes with it.

### 10.1 What the Patch Does

- **`js/engine.js`:** `pxl.markChanged(node)` replaces `broadcast()`. It acts only for keys someone reads (`pxl._readKeys`, filled by the compiler): it raises `pxl._changeCounter` into the node's `changeVersion` and wakes the stages that read the key (`pxl.wakeReaders()`, D7). Removing an id raises `pxl._registryVersion`. Changes that affect the order raise `pxl._orderVersion`. Gone: subscriptions, `broadcast()`, `evaluateToLocalAttributes()`, `evaluateAttributesForVariable()`, `restoreVariableSubscriptions()`.
- **`js/compiler.js`:** a compiled expression also keeps `sourceIds`, the ids it reads without the `ref.` prefix.
- **`js/elements/node.js`:** `changeVersion` and `_seenVersion`; `isOutOfDate()` compares the versions of the sources in a flat `_sourceIds` list; `evaluateReactive()`, `updateReactive()` (evaluated twice when the element reads itself, R3), `updateAsSource()`. `valueChanged()` and `evaluateAnimations()` call `markChanged()`. The `toLocal` key list and the matrix broadcast are gone.
- **`js/elements/stage.js`, the update phase:**
  1. `evaluateOrder()`: the ordered sources, built by `buildOrder()` only when `pxl._orderVersion` changed (Kahn's algorithm; a `toLocal()` node also depends on the ancestors of itself and its target). What is left over is in a cycle and is evaluated in rounds while values change, at most `pxl.MAX_CYCLE_ROUNDS`, with one warning (C1 b).
  2. Stage-level variables, then the walk as today.
  3. `updateReaders()`: the readers nobody reads, each evaluated when out of date. It returns at once when no read key changed since its last pass and the stage has no `toLocal()` readers.
- **Smaller:** `group.js`, `polyline.js`, `interaction.js`, `monitor.js` call `markChanged()`.
- **Tests:** 10 cases read a derived value right after a change and now render a frame in between (D5); 3 checks of removed internals (subscriptions, `toLocalAttributeKeys`, the broadcast nesting) check the behavior instead.

### 10.2 Results

- **Tests:** `tests/index.html` 169/169, `tests/frameworks.html` 58/58, `tests/render.html` 56/56, `tests/unit.html` 88/88.
- **Pages** (`run.js e1b2f68` against the patched build): 82 pages, 173 stages, 306 layers; 9,336 frames and 10,667 canvas clears in both; 0 layers that look different (5 unstable: clocks, randomness). **No page relies on reading a derived value right after `setAttribute()` (D5).**
- **Bench** (`option_b_bench.html`, Chrome, the same machine):

| Case | Today (`e1b2f68`) | Option B |
|---|---|---|
| 5,000 readers, their source changes in every frame | 0.40 ms per frame | 0.40 ms |
| The same readers, nothing they read changes | 0.000 ms | 0.000 ms |
| 14 stacked diamonds, one change at the top | 65,532 evaluations, 7.6 ms | 42 evaluations, 0.10 ms |
| A chain of 10,000 readers, one change | 4.7 ms, recursive (1) | 3.9 ms, no recursion |
| Readers with `t` written before their sources (C reads B reads A) | B one frame behind, C older | all three in step |
| A handler sets 10 variables one reader sums | 10 evaluations of the reader | 1 |
| A derived value read right after `setAttribute()` | new | old until the next frame (D5) |

(1) One call per link: it finished from the console, and overflowed the stack in earlier runs started from inside the bench loop.

- **The version check** of an idle reader (`checkCost()`): 16 ns for `isOutOfDate()`. With the stage's skip (no read key changed) a frame touches no reader at all. The first version needed about 300 ns per idle reader: it looked up each expression's dependency list on the element and counted every change, also of keys nobody reads. The flat `_sourceIds`, counting only read keys and the skip fixed that.
- **Size and code:** `js/` +372 / −206 lines (+166); `pxl.min.js` 71.16 → 74.11 KB (+2.95 KB), about +0.7 KB gzipped. §3.2 expected about −35 lines: it counted the broadcast code that goes, but the order (Kahn, `toLocal` ancestors, cycle rounds) and the reader list with its version checks are larger than estimated.

### 10.3 Limits Found

1. **Paused stages:** a stage out of view (the intersection observer) or in a background tab runs no frames, so the values *derived* inside it stay at its last frame until it runs again. Values set from outside are current at once, and nothing stale is on screen; only JavaScript that reads a derived value of a paused stage sees an old one. Decided in §10.4.
2. **A `<pxl-var>` outside every stage** is never evaluated, because no stage runs it; a plain value is still readable through its id. Decided in §10.4 (D13).
3. **`toLocal()` across stages:** a reader didn't follow a target moved by an ancestor in another stage. Decided in §10.4.

### 10.4 Decisions (2026-11-27)

- **D1: option B,** as prototyped: the same cost as today when sources change, nothing when they don't, diamonds evaluated once, no recursion, no lag for readers with `t`. Accepted against it: +166 lines rather than fewer, and D5.
- **Confirmed as prototyped:** C1 (b), D2 element, D4 (`toLocal()` evaluated in every frame that runs), D6 (what others read is evaluated, also when hidden; values with `t` that nobody reads stay frozen while hidden), D7 (only stages that read the changed key are woken), D10 accept.
- **D5: the next frame.** A handler that sets a value and reads one derived from it in its next statement sees the old one; what is drawn is always current. KILOPIXEL.md and the docs say so.
- **`toLocal()` reads a target in the reader's own stage only:** its geometry needs a shared space, and another stage's frame doesn't move with this one.
- **D8: keep global ids.** Names scoped to their surroundings (`name`, looked up from the reader outward) were designed in this discussion and work for repeated markup, but they add a second lookup rule, a migration of every page and their own corner cases (a reader must find itself and its ancestors before their subtrees, or every copy follows the first). The case they help is narrow: a shape read through `ref.*` inside repeated markup, which frameworks handle with generated ids (`bg${i}`), as `docs/frameworks.html` already says. The design is parked in `design/ideas/2026-11-27_scoped_names_note.md` for a native `<pxl-repeat>` or a user who needs it.
- **D12, duplicate ids: nothing special,** as today: the element connected last wins, and removing it leaves the id unregistered although the other element is still there. A duplicate id is the author's mistake, and `docs/frameworks.html` §5 already says ids must be unique. Considered: a warning (about 5–8 lines; checked in the next frame, because frameworks may insert a replacement before removing the old element), or the first in DOM order winning like `getElementById()` (about 10–15 lines); worth adding only if users get confused.
- **D13, a `<pxl-var>` outside every stage: nothing special.** It isn't evaluated, like a circle outside a stage isn't drawn, and needs no warning. No docs, example or test page has one; a value shared between stages lives in one of them and is read through its global id.
- **Paused stages** (§10.3, 1): accepted; the docs say that a stage out of view updates its derived values when it runs again.
- **Timing across stages:** another stage's pointer and hover are set at the start of that stage's frame; a reader in a stage that runs earlier in the same animation frame sees them one frame late, as today. A shared frame for all stages (all pointers first, then every update phase, then every draw) would fix that and keep stages in step: about 30–40 lines, later and only if needed.
- **Still open, not needed for the build:** D9 (with the throttling plan), D11 (internal animations of custom shapes).

### 10.5 Next

*2026-11-27: built, §11.*

1. **Build** B from the patch (§7 step 3), with the tests of §8 (diamonds, chain, readers with `t`, the idle page, a `toLocal()` reader that others read), and the 10 tests that now render a frame between a change and a read.
2. **Update** the dependent plans (§6), `.agents/ENGINE.md` §4–§5 and `.agents/KILOPIXEL.md` §3.6 (D5, `toLocal()` within one stage, paused stages), and the docs:
   - `docs/frameworks.html` §2 or §3: a handler that sets a value and reads one derived from it right away gets the old one until the next frame (D5); §8 Known Limits: a stage out of view updates its derived values when it runs again;
   - `docs/walkthrough.html` §8 and `docs/mapping.html` (intro or §1): `toLocal()` reads a target in the reader's own stage.

   No interactive demo depends on the timing: the page sweep was identical, and `docs/mapping.html` §2 (a `toLocal()` reader that others read, in a transformed layer) matched after every slider move and with both layers following `t`, one frame after each change (checked in the browser, 2026-11-27).

## 11. Built (2026-11-27)

Option B as prototyped (§10), from `design/prototypes/2026-11-20_evaluation_model/option_b.patch`, with two fixes and one cleanup agreed before building.

**Files, functions and fields:**
- **`js/engine.js`:**
  - New: `pxl.markChanged()`, `pxl.wakeReaders()`, `pxl.registerNode()`, `pxl.unregisterNode()`, `pxl.addReadIds()`, `pxl.isRead()`, `pxl.expressionsChanged()`; `pxl._changeCounter`, `pxl._registryVersion`, `pxl._readIds`, `pxl._orderVersion`. `pxl.renameNode()` uses the first two.
  - Gone: `pxl._subscriptions`, `pxl._subscribedKeys`, `broadcast()`, `subscribeToVariable()`, `unsubscribeFromVariable()`, `clearAllVariableSubscriptions()`, `restoreVariableSubscriptions()`, `evaluateAttributesForVariable()`, `evaluateToLocalAttributes()`.
- **`js/compiler.js`:** `fn.sourceIds` (the ids, always set) replaces `variableDependencies`; `fn.usesToLocal` is always a boolean.
- **`js/elements/node.js`:**
  - New: `registeredId` (replaces `refKey`), `changeVersion`, `_seenVersion`, `sourceIds`, `hasToLocal`, `_evaluatedFrame`, and, written by the stage, `readerStage`, `listedIn`, `isOrderNode`. Methods `collectSources()`, `isOutOfDate()`, `evaluateReactive()`, `updateReactive()`, `updateAsSource()`, `readsItself()`. `connectedCallback()` evaluates through `evaluateReactive()`.
  - Gone: `variableChangedCallback()`, `broadcastGlobalMatrixChange()`, `toLocalAttributeKeys`, `_broadcastNesting`.
- **`js/elements/stage.js`:** `runFrame()` in three parts; `readsId()`, `addReader()`, `updateReaders()`, `buildOrder()`, `addOrderNode()`, `orderSources()`, `pushContainers()`, `evaluateOrder()`; `registeredId`, `changeVersion`, `_idsRead`, `_readers`, `_checkedCounter`, `_order`, `_cycleStart`, `_builtOrderVersion`.
- **Smaller:**
  - `group.js`: skips its children after failing in part 1;
  - `polyline.js`: `markChanged()`, and `expressionsChanged()` when removed point keys held expressions;
  - `layer.js`: a comment;
  - `interaction.js`, `monitor.js`: `markChanged()`.

**Deviations from the patch, agreed before building** (both bugs checked in `scratch/` against the patched build, and against today's engine, which got them right):
1. **One list of ids.** The compiler gives only `sourceIds`; `pxl._readIds` and the stage's `_idsRead` hold ids; `refKey` (`'ref.<id>'`) became `registeredId`. Every use of the `ref.` keys was a broadcast or a subscription. Callers call `pxl.markChanged()` without checking for an id first.
2. **Every `toLocal()` reader is a source in the order**, not only one that others read. With the patch, a reader before a group whose reactive `rotate` moves its target read the group's old matrix and asked for no further frame: it stayed at (600, 250) instead of (500, 350). In the order, the reader comes after the group. Part 3 then needs no DOM-order sort of its readers and no exception for `toLocal()` in its skip.
3. **An element that others read rebuilds the order when it gets its first expression.** With the patch only elements already in the order did: when the new expression's source was already read by another element, the reader showed 11 instead of 21, again without a next frame.

**Decided while building:**
- **Sources are collected when the expressions change** (`collectSources()`, from `pxl.expressionsChanged()` and on connect), not lazily as in the patch (`areSourcesDirty`): one place, and no flag to check per frame. It loops over the element's keys on every `setAttribute()` of an expression, so a polyline with n coordinate expressions reads n² keys once, small against compiling them.
- **Readers with `toLocal()` and only `t`** are in the reader list too, so the order finds them.
- **The reader pass** also drops elements that are no longer readers.
- **The order is rebuilt when any container's expressions change.** The patch did that only while a `toLocal()` node existed (`pxl._hasToLocalNodes`, gone).
- **The order's edges keep duplicates** (Kahn counts each edge on both sides). A source in another stage's order adds no edge (it is read as it is; without that check, which the patch had and the first cleanup lost, building the order threw, found by the cross-stage test), and a `toLocal()` target in another stage adds no containers (§10.4).
- **B8** of `design/done/2026-10-27_engine_cleanup_inventory_note.md`, settled: the connect loop uses `evaluateReactive()`; `evaluateAnimations()` and `evaluateReactive()` stay two loops on the per-frame path.
- **Readers with `t` no longer lag** behind a source later in the DOM: a source that others read is in the order (§1, problem 2). KILOPIXEL.md §3.6 drops that exception.
- **Not built:** a warning that names every member of a cycle (the first member is named, as before).

**Tests:**
- `tests/index.html` 178/178. New section "Evaluation order" (9 tests):
  - ten stacked diamonds evaluate their bottom once, with all inputs new;
  - a chain of 10,000 readers ends at the right value in one frame;
  - readers with `t` in DOM order C, B, A show the same frame;
  - a `toLocal()` reader that others read follows a target in a group that moves with `t`;
  - the two cases of deviations 2 and 3;
  - a source in another stage's order is read as it is;
  - a derived value is new in the next frame, not right after `setAttribute()` (D5);
  - the monitor asks no frame of a stage whose readers don't read it, and one once a reader does.
- **Changed tests:**
  - the cycle test also checks that the warning names a member and that the stage doesn't keep running;
  - the 10 tests that read a derived value right after a change render a frame first (`nextFrame()`);
  - the checks of `toLocalAttributeKeys`, `_broadcastNesting` and `pxl._subscriptions` check behavior or the stage's reader list instead.
- **Other pages:**
  - `tests/unit.html` 88/88 (classification reads `sourceIds`);
  - `tests/frameworks.html` 58/58;
  - `tests/render.html` 56/56;
  - `tests/scaling.html` 9/9 ("one variable read by n shapes" renders a frame per change, since `setAttribute()` no longer evaluates the readers);
  - page sweep: 82 pages, no console messages.

**Pages** (`run.js HEAD` against the build, as in §9 and §10.2): 82 pages, 173 stages, 306 layers; 9,336 frames and 10,667 canvas clears in both. One run showed 2 differing layers on `docs/walkthrough.html` (the page that gave noise in §9); three runs of that page in the browser and a layer-by-layer check of two old and two new runs showed none.

**Size and code:** `js/` +399 / −245 lines (+154; the patch +166). `pxl.min.js` 71.16 → 73.56 KB (+2.40 KB; the patch +2.95 KB), gzipped about +0.56 KB.

**Reference and docs:**
- `.agents/ENGINE.md` §1–§5 (§4 rewritten), §6.5, §8.3, §8.4, §9, §10;
- `.agents/KILOPIXEL.md` §2, §3.2, §3.5, §3.6 (D5, stages out of view), §9 (one stage);
- `docs/frameworks.html` §2 (Derived Values) and §8 (Stages Out of View), `docs/walkthrough.html` §8, `docs/mapping.html` (lead).

**Left:** D9 (with the throttling plan), D11 (custom shapes' internal animations).

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-27: option B built (§11), with two fixes (every `toLocal()` reader in the order; an element that others read rebuilds the order when it gets its first expression) and one list of ids (`sourceIds`, `registeredId`); moved to `design/done/`, its TODO item removed.

- 2026-11-27: option B prototyped (§10: patch, bench, page sweep); decided: B, global ids (scoped names parked in `design/ideas/2026-11-27_scoped_names_note.md`), D5 the next frame, nothing special for duplicate ids (D12) and variables outside a stage (D13), `toLocal()` within one stage.

- 2026-11-26: step 2 built (§9): change-based dirty flags, the keep-alive in the stage, R1; variables and hidden elements redraw nothing; problems 1 and 5 of §1 solved.

- 2026-11-25: `<pxl-out>` parked in `design/ideas/` (its TODO item removed): D1 and D8 need not serve an element outside every stage; §1 item 3 and the §6 row still name it.
- 2026-11-22: D11 added: internal animated values of custom shapes, moved here from `design/done/2026-11-20_custom_shapes_plan.md` (D9 there), which is closed.
- 2026-11-21: `attributeValues` is now `values` and `attributeExpressions` `expressions` (`design/done/2026-11-20_custom_shapes_plan.md` step 4); the old names here are the old form.
- 2026-11-21: `design/done/2026-11-20_custom_shapes_plan.md` step 3 built: shapes draw in logical units (the canvas scaled by the unit, `draw(ctx, 1)`) and `draw()` gets no `t`; the contract "`draw()` only reads values" holds in the code (line 42 and the custom shapes row describe it as planned).
- 2026-11-20: the shape authoring plan was replaced by `design/done/2026-11-20_custom_shapes_plan.md`; §6 points to it.
- 2026-11-20: `<pxl-clip>` parked in `design/ideas/`; §6 marks its row.
- 2026-11-20: merged from the two-phase frame plan (open parts), the reactive propagation plan (option A) and the per-frame evaluation plan (option B). Their decision names map as follows: per-frame D1–D3, D5–D8 → D1, D2, D4, D5, D7, D8 here (its D4 had moved to C1); two-phase questions 6, 7, 9 → D6, D9, D10; reactive propagation D1–D4 → part of option A, D2, D3, D4.
