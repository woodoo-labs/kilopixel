# Evaluation Model: When Values Are Evaluated and Layers Redrawn

- **Status**: 🟡 **Proposed** (2026-11-20, merges three plans; next: step 2, then decision D1)
- **Date**: 2026-11-20
- **Replaces**: `design/done/2026-11-12_two_phase_frame_plan.md` (step 1 built there, §7.4; its open parts continue here), `design/done/2026-11-12_reactive_propagation_plan.md` (the cycle stop built there, §2; its full design is option A here), `design/archive/2026-11-15_per_frame_evaluation_plan.md` (option B here). Details, derivations and measurements stay in those plans; this one holds the state, the next step and the decisions.
- **Related**: `design/done/2026-11-17_pointer_frame_order_plan.md` (the pointer at the start of the frame), `design/done/2026-11-07_safe_shape_render_plan.md` (error rules, kept), `design/done/2026-10-26_tolocal_fix_plan.md` (the `toLocal` matrix walk)
- **Target Implementation**: `js/elements/stage.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/shape.js`, `js/elements/node.js`, `js/elements/variable.js`, `js/engine.js`, `js/interaction.js`, `js/monitor.js`, `tests/index.html`, `.agents/ENGINE.md` §4–§5, `.agents/KILOPIXEL.md` §3.6
- **Prototypes**: `design/prototypes/2026-11-12_two_phase_frame/` (second walk, CSS-only path, frame bench), `design/prototypes/2026-11-12_reactive_propagation/` (cycles, propagation cost), `design/prototypes/2026-11-15_per_frame_evaluation/pull_bench.html` (broadcast against a per-frame loop, ordering cost)

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

## 2. Step 2 (Next): Change-Based Dirty Flags, Keep-Alive in the Stage

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

## 5. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | Option A or B (§3) | build step 2, prototype B, then decide |
| C1 | Cycles without `t` (`a = b + 1`, `b = a + 1`): (a) today's recursion with the nesting counter, A only; (b) members in DOM order, repeated while values change, at most `pxl.MAX_CYCLE_ROUNDS` rounds, one warning, and the edge that closes the cycle requests no frame; (c) one pass and a warning when the order is built | (b), on both options: it keeps the results of every cycle that settles or converges, without recursion; (c) stops converging cycles after one step |
| D2 | Granularity: element (as the compiler records it) or attribute (`ref.orb.stroke` as its own source) | element |
| D3 | A: one propagation per `broadcast()`, or several changes in a handler as one | one per `broadcast()` (reads right after a change see new values) |
| D4 | `toLocal`: A keeps the walk through the work list; B evaluates every frame that runs, or compares matrix versions | as listed; matrix versions only if a measurement asks for it |
| D5 | B: derived values right after `setAttribute()` in the next frame, or evaluated on demand when a stale value is read | the next frame, if step 2 finds no page that relies on it |
| D6 | Hidden subtrees: evaluate them every frame, never, or only what someone outside reads (R5) | only what is read: under B the ordered sources already are |
| D7 | B: wake every stage in view, or only stages with readers of the source | every stage in view |
| D8 | Scoped names instead of global ids (`design/done/2026-10-30_framework_compatibility_plan.md` D2, §8.2): compiled functions would get `ref` per stage at call time, so component instances share them | design together with D1: both change how `ref` is resolved |
| D9 | Throttled layers (`design/2026-11-12_layer_throttling_plan.md`): evaluated every frame (smooth readers) or at their rate | decide with throttling part A, after step 2 |
| D10 | Hit testing uses the values of the last update; in a throttled layer they can be ahead of its pixels | accept |

## 6. Plans That Depend on This

| TODO | Plan | What changes |
|---|---|---|
| §8 | `design/2026-11-12_layer_throttling_plan.md` | part A after step 2: a skipped layer just stays dirty until its window (no rAF relay or timer); D9 |
| §3 | `design/2026-10-01_tween_animation_plan.md` | its §7 "auto-sleep" is replaced by step 2 (a finished tween stops redrawing on its own); a spring is a reader with state, evaluated once per frame in the order |
| — | `design/ideas/2026-09-29_pxl-clip_element_plan.md` (parked) | if it is picked up: its `applyClip()` evaluates children while drawing; they must be evaluated in the update phase (possible since step 1) |
| §28 | `design/2026-10-30_space_attribute_plan.md` | its reactivity (§3.3) subscribes through broadcasts: rewrite after D1; its draw-order rule (§3.5) is gone since step 1 |
| §5 | `design/2026-08-02_declarative_html_output_pxl_out_plan.md` | after D1: under A the propagation must be ordered first (no 210 before 220), under B it is a reader in part 3 |
| §47 | `design/2026-11-20_custom_shapes_plan.md` | `draw(ctx, u)` without `t` becomes the contract with step 2; internal animated values (its §5.9) wait for D1 |

Not affected: hit testing and event dispatch (both fit either option), isolation, `<pxl-plot>`, `<pxl-path>`.

## 7. Steps

1. **Step 2** (§2), with its tests; count the redraws saved and the pages that read derived values right after `setAttribute()`.
2. **Prototype B** as a patch over the engine; the page sweep and the frame bench; decide D1 and C1.
3. **Build** the chosen option, tests first (§8).
4. **Update** the dependent plans (§6), `.agents/ENGINE.md` §4–§5 and `.agents/KILOPIXEL.md` §3.6.

## 8. Tests

Existing tests stay (two-phase frame, ref cycles, safe render, `toLocal`, layer fast path). New:

- Step 2: a `floor(t)` text redraws once per second; a finished `clamp()` animation stops redrawing; one pointer move with a reader of the pointer runs one frame (today's `test.known()`); a page without animation stays at 0 FPS; a shape added to a static layer is drawn in the next frame.
- D1: ten stacked diamonds evaluate their bottom once per change and never show a half-updated value; a chain of 10,000 readers ends at the right value; three readers with `t` in the DOM order C, B, A show the same frame's values; a cycle without `t` warns once, names its elements and doesn't keep the stage running; an idle page with 1,000 readers runs no frame while the monitor publishes; a reader written before its source updates when the source connects and again when it is removed; a `toLocal` reader that another reader reads, with a target in a group that moves with `t`.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-20: the shape authoring plan was replaced by `design/2026-11-20_custom_shapes_plan.md` (TODO §47); §6 points to it.
- 2026-11-20: `<pxl-clip>` parked in `design/ideas/`; §6 marks its row.
- 2026-11-20: merged from the two-phase frame plan (open parts), the reactive propagation plan (option A) and the per-frame evaluation plan (option B). Their decision names map as follows: per-frame D1–D3, D5–D8 → D1, D2, D4, D5, D7, D8 here (its D4 had moved to C1); two-phase questions 6, 7, 9 → D6, D9, D10; reactive propagation D1–D4 → part of option A, D2, D3, D4.
