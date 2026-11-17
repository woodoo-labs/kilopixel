# Per-Frame Evaluation in Dependency Order (No Broadcasts)

- **Status**: 🟡 **Proposed** (2026-11-17, §3.7 follows the pointer frame order; 2026-11-15, design and measurements; nothing built; D1 decides between this plan and the path of the two related plans)
- **Date**: 2026-11-15
- **Related**: `design/2026-11-12_two_phase_frame_plan.md` (TODO §29: step 1 built; its steps 2 and 3 are the first steps of this plan too, §8), `design/2026-11-12_reactive_propagation_plan.md` (TODO §39: orders the broadcasts instead of removing them; this plan is the alternative, §7), `design/2026-10-26_tolocal_fix_plan.md` (the matrix walk this plan removes), `design/2026-10-15_interactive_state_auto_registration_plan.md` (sticky ids and lazy unregistering, §3.7), `design/2026-11-07_safe_shape_render_plan.md` (error rules, kept)
- **Target Implementation** (if decided): `js/engine.js`, `js/elements/node.js`, `js/elements/stage.js`, `js/elements/layer.js`, `js/interaction.js`, `js/monitor.js`, `tests/index.html`, `.agents/KILOPIXEL.md` (Reactivity Engine, Per-Frame Render Pipeline)
- **Prototype**: `design/prototypes/2026-11-15_per_frame_evaluation/pull_bench.html` (today's broadcast against a per-frame loop, on the engine's own compiled expressions; cost of ordering a graph)

---

## 1. Today: Three Mechanisms for One Job

An attribute expression is re-evaluated in one of three ways, depending on what it contains:

| Expression | Example | Re-evaluated | By |
|---|---|---|---|
| Uses `t` (with or without refs) | `x="t * 10"`, `x="ref.a.x + wave(2)"` | every frame, in DOM order | `evaluateAnimations()` in the update phase |
| Reads `ref.*`, no `t` | `fill="ref.theme.value"` | at once when the source changes, recursively | `pxl.broadcast()` → `variableChangedCallback()` |
| Uses `toLocal()`, no `t` | `x="toLocal(ref.planet, 'tx')"` | as above, and when an ancestor's matrix changes | `broadcastGlobalMatrixChange()` walking the subtree |

Each mechanism has its own bookkeeping, and most open problems sit where two of them meet:

- **Subscriptions** (`pxl._subscriptions`): subscribe at compile time, restore on connect, clear on disconnect, unsubscribe lazily when a reader no longer needs a key.
- **Recursion:** diamonds are evaluated once per path and see half-updated values; a cycle needs a nesting counter (`design/2026-11-12_reactive_propagation_plan.md` §1, §2).
- **Readers with `t` don't subscribe**, so they lag one frame per reader that comes before its source in the DOM (`design/2026-11-12_two_phase_frame_plan.md` §3.1). The same fact makes their references to `isHovered` / `isPressed` "sticky" (`pxl._stickyIds`, `releaseIfUnused()`).
- **`toLocal` readers** need a third key list (`toLocalAttributeKeys`) and a walk over the subtree on every matrix change.
- **`isDirty` means two things**, "pixels out of date" and "keep the loop running" (two-phase plan §1).

The two related plans fix these one by one and keep all three mechanisms: the two-phase plan adds a dependency order for readers with `t`, the reactive propagation plan adds a second order for the broadcasts.

## 2. Idea

One mechanism: **when a stage runs a frame, it evaluates what is out of date, sources before readers, then draws the layers in which a value changed.** A change no longer pushes anything; it only raises a version number and asks for a frame.

- No subscriptions, no `pxl.broadcast()`, no recursion.
- One order for all expressions, with and without `t`.
- A layer is dirty only when one of its values really changed (two-phase plan §3.2, which this plan takes over unchanged).

## 3. Design

### 3.1 Versions Instead of Broadcasts

- `pxl._changeCounter` counts every change. Each source (every `PxlNode`, and the stage) has a `changeVersion`: the counter's value at its last change.
- The 19 places that call `pxl.broadcast()` today (17 when this plan was written; `pxl.renameNode()` added two on 2026-11-16) call `pxl.markChanged(node)` instead: it raises the version and asks for a frame (§3.6). Nothing else runs at that moment.
- A reader keeps `_seenVersion`, the counter's value when its reactive attributes were last evaluated. It is out of date when a source's `changeVersion` is larger.
- **Sources are looked up by id at check time** (`pxl.nodes[id]`, as expressions do today): no resolved pointers to keep valid. An element that connects with an `id` marks itself changed, so readers written before it pick it up. Removing an element with an `id` raises `pxl._registryVersion`, which every reader also compares.
- **Granularity:** the element, as the compiler records it today (`variableDependencies`). A reader of `ref.main.fps` is also checked when the pointer moves; it evaluates, finds the same value and changes nothing.

### 3.2 The Frame

The update phase of `Stage.render()` gets three parts; the draw phase stays as built in step 1.

1. **Ordered sources** (§3.3): the few elements that are read by others and have expressions of their own, in dependency order. Expressions with `t` are evaluated; reactive ones when a source's version is newer.
2. **The walk**, as today: every other expression with `t`, layer by layer, top-down. Their sources are final after part 1.
3. **Readers that nobody reads:** a flat list per stage of elements with reactive expressions (kept like `_interactiveElements`: added on connect, removed on disconnect, sorted by DOM position when it changed). Each one compares versions and evaluates only when it is out of date. `toLocal` readers are in this list and evaluate in every frame that runs (§3.5).

An element whose value changed marks itself changed (for later readers in the same frame) and its layer dirty. The stage asks for the next frame when anything with `t` was evaluated (two-phase plan §3.3).

### 3.3 The Order

- **Nodes:** elements that have an `id`, are named in some expression, and have at least one expression of their own. Most shapes are not nodes: a shape that only reads is in the flat list of §3.2 part 3, and a source with only plain values needs no order.
- **Edges** come from the compiler (`variableDependencies`), also for expressions with `t`.
- **Built only when it may have changed** (a flag like `_isOrderDirty`): a node candidate connected or disconnected, or one of its expressions or its `id` changed. Adding shapes that only read (particles that follow `ref.main.mouseX`) doesn't touch it.
- **Algorithm:** Kahn's, on the nodes only. What is left over is in a cycle (§3.4).
- **Cost:** 0.06 ms for 1,000 nodes, 0.5–0.9 ms for 10,000 (§5). Real pages have a handful.

### 3.4 Cycles

- **With `t`** (`x="ref.me.x + (100 - ref.me.x) * 0.1 + t * 0"`, shapes chasing each other): members are evaluated once per frame in DOM order; a member that reads a later one gets the previous frame's value. This is the rule of the two-phase plan §3.1.1, and what such pages do today.
- **Without `t`** (`a = b + 1`, `b = a + 1`, by mistake): today 100 rounds and a warning. Proposed (D4): one warning when the order is built, naming the elements; the members are evaluated in DOM order, and the edge that closes the cycle doesn't count as "source changed". The cycle then stops after one pass instead of counting up in every frame.
- **An element that reads itself** (walkthrough section 9, `shadowcolor="ref.sec9FlyingOrb.stroke"`) is not a cycle: inside one element, expressions with `t` are evaluated before the reactive ones.

### 3.5 `toLocal`

A `toLocal()` result depends on the target's global matrix and on the matrix of the reader's own parent, so on every ancestor of both. Proposed (D3):

- **Evaluate `toLocal` expressions in every frame that runs**, without a version check. They are few, and an evaluation costs about as much as a check plus two lazy matrix lookups. They don't keep the stage awake: an idle page stays idle.
- **They run in part 3**, after the walk, so every ancestor that moves with `t` is final. Part 3 is in DOM order, so a reader's own ancestors come before it.
- **`toLocalAttributeKeys`, `pxl.evaluateToLocalAttributes()` and the walk in `broadcastGlobalMatrixChange()` go away.** `setLocalMatrixDirty()` only sets the flag.
- **The hard case:** a `toLocal` reader that is itself read by others is an ordered source (part 1) and is evaluated before the walk. Its edges must then include the ancestors of its target and its own; an ancestor with expressions on its transform becomes a node too. This is the part of the design to prototype first (§8 step 2): `toLocal` has needed the most fixes so far (`design/2026-10-26_tolocal_fix_plan.md`, `design/2026-10-29_tolocal_decomposition_plan.md`).

### 3.6 Waking a Stage

- `pxl.markChanged(node)` asks every stage that is in view for a frame (D7). A frame in which nothing is out of date costs the version checks of part 3 (about 20 ns per reader, §5) and draws nothing.
- **Only when someone reads the source:** the compiler adds every id it sees in an expression to a set (`pxl._readIds`, never shrinks, like `pxl._interactiveIds` today). A change to an element whose id isn't in the set wakes nobody. This keeps a page idle while the performance monitor publishes `fps` once per second and nobody shows it.
- `setAttribute()`, resize and font arrival invalidate their layer as today.

### 3.7 Interactive States

- `InteractionEngine.process()` runs at the start of the frame, before the update phase, as today (since 2026-11-17, `design/2026-11-17_pointer_frame_order_plan.md`). Where it broadcasts the stage's pointer values or sets `isHovered` / `isPressed`, it calls `pxl.markChanged()` instead. Readers then update in the update phase of the same frame and are drawn in it, as today. A `markChanged()` for the pointer must stay in `process()` (or come earlier): marked after the update phase, readers would be drawn one frame late, as they were before 2026-11-17.
- **Which shapes are hit-tested:** as today, a shape with handlers or one whose states are named in an expression (`pxl._interactiveIds`). The lazy unregistering (`releaseIfUnused()`, `pxl._stickyIds`) goes away: it exists because subscriptions can tell when the last reader left, and only for readers without `t`. A shape whose last reader was removed stays hit-tested; that costs one `isPointInPath()` per pointer frame.

### 3.8 Hidden Subtrees

Answers question 6 of the two-phase plan with its "middle way", without extra code: ordered sources (part 1) are evaluated wherever they are, because someone reads them. Everything else inside a hidden group or layer is skipped by the walk as today. Readers in part 3 inside a hidden subtree still compare versions; skipping them is a possible micro-optimization.

### 3.9 Errors

The rules of `design/2026-11-07_safe_shape_render_plan.md` stay: an element whose evaluation throws reports its own error, keeps its previous values and is skipped in the draw phase of that frame (`_failedFrame`). The special cases for readers that fail inside someone else's broadcast or matrix walk disappear, because no element evaluates inside another one's call any more.

## 4. What Changes in Behavior

| Case | Today | With this plan |
|---|---|---|
| Reactive value after `setAttribute()` on its source | updated before `setAttribute()` returns | updated in the next frame's update phase. Pixels: the same frame as today |
| An `on*` handler that sets a variable and reads a value derived from it in the next statement | sees the new derived value | sees the old one until the next frame (D5). The variable itself is new at once |
| Reader with `t` before its source in the DOM | one frame behind | no lag |
| Diamond (`l` and `r` read `d`, `b` reads both) | `b` evaluated twice, once with a half-updated input | evaluated once, with final inputs |
| Chain of readers | recursion, limited by the stack after thousands of levels | a loop |
| Cycle without `t` | 100 rounds, then a warning | one warning when the order is built, one pass |
| `text="floor(t)"` | 60 redraws per second | 1 redraw per second (two-phase plan §3.2) |
| Idle page | 0 FPS | 0 FPS |

Engine tests that set an attribute and read a derived value in the next line need a frame in between (`srRender()` exists for that). How many: counted in step 1 of §8.

## 5. Measurements

`design/prototypes/2026-11-15_per_frame_evaluation/pull_bench.html`, 2026-11-15, Chrome, this laptop. One `<pxl-var>` read by N circles through `dy="ref.a.value * k"` (50 different expressions); medians, each size in its own page load. The values vary by about 30 % between runs.

| Per reader | 1,000 readers | 5,000 readers |
|---|---|---|
| Today: `pxl.broadcast()`, source changed | 575 ns | 520–620 ns |
| Loop over all readers, source changed | 340 ns | 330–530 ns |
| Loop over all readers, nothing changed (evaluate, compare) | 155 ns | 200 ns |
| Loop with version check, source changed | 180 ns | 420–440 ns |
| Loop with version check, nothing changed | 20 ns | 22–25 ns |

Ordering a graph (Kahn's algorithm on plain objects, two sources per node): 0.06 ms for 1,000 nodes, 0.5–0.9 ms for 10,000.

- **When the source changes, both designs cost about the same.** Evaluating, comparing and storing dominate; the way a reader is reached doesn't. Speed is not the reason for this plan.
- **Without the version check the loop is not free:** 5,000 readers whose sources didn't change cost 1 ms in every frame that runs, where today they cost nothing. With the check it is 0.11 ms. So the check is part of the design (D2), not an optimization for later.
- **Not measured yet:** the full frame with all three parts, and real pages. That is step 2 of §8.

## 6. Code

Estimates from reading the source; nothing is built.

| Goes away | Lines (about) |
|---|---|
| `pxl._subscriptions`, `pxl._subscribedKeys` (since 2026-11-16), `broadcast()`, `subscribeToVariable()`, `unsubscribeFromVariable()`, `clearAllVariableSubscriptions()`, `restoreVariableSubscriptions()` (`engine.js`) | 65 |
| `evaluateAttributesForVariable()`, `evaluateToLocalAttributes()`, the subscription part of `compileAttribute()` (`engine.js`) | 55 |
| `variableChangedCallback()`, `broadcastGlobalMatrixChange()`, `_broadcastNesting`, `toLocalAttributeKeys` (`node.js`) | 65 |
| `releaseIfUnused()`, `pxl._stickyIds` (`interaction.js`) | 15 |
| The layer heartbeat: `_wasDirty`, `_keepAlive`, `parentLayer.invalidate()` in `evaluateAnimations()` (`layer.js`, `node.js`) | 20 |

| Comes | Lines (about) |
|---|---|
| Versions, `pxl.markChanged()`, `pxl._readIds`, the check in the reader | 40 |
| The stage's reader list and part 3 of the update phase | 40 |
| The order (nodes, edges, Kahn, cycle rule and warning) | 90 |

About 220 lines out, 170 in. The engine doesn't get much smaller; it gets one mechanism instead of three, and the five problems of §1 have no place left to occur.

## 7. Compared With the Path of the Two Related Plans

| | Two-phase steps 2–3 plus reactive propagation (option A) | This plan |
|---|---|---|
| Change-based dirty flags, keep-alive in the stage | step 2 | the same code (§8 step 1) |
| Readers with `t` in dependency order | step 3: a lasting graph | part 1 |
| Reactive readers | broadcasts stay; a second order per broadcast, about 90 lines more | no broadcasts; the same order as above |
| `toLocal` | the matrix walk stays | evaluated in every frame that runs |
| Reactive values right after `setAttribute()` | new at once | new in the next frame |
| Risk | small steps, each on working code | replaces the core of `engine.js` and `node.js` in one step (step 3 of §8) |
| Mechanisms afterwards | three, two of them ordered | one |

The other path is safer and keeps today's timing. This plan ends with less to understand and to keep right. Both start with the same step, so the decision can wait until that step is built.

## 8. Steps

1. **Change-based dirty flags and the keep-alive in the stage** (two-phase plan §7.2 step 2). Needed on both paths; builds on today's broadcasts. While doing it, count the engine tests and docs pages that read a derived value right after `setAttribute()` (for D5).
2. **Prototype the rest as a patch over the running engine** (as step 1 of the two-phase plan was): versions, the reader list, the order, `toLocal` in part 3 and the hard case of §3.5. Run the page sweep of the two-phase plan §7.4 (all docs and example pages, 60 frames by hand, compare the pixels and the number of canvas clears) and the frame bench. Decide D1 on the result.
3. **Build it:** tests first (§9), then replace the broadcasts.
4. **Update the plans that assume broadcasts:** `<pxl-out>` (TODO §5), tweens and springs (TODO §3: a spring is a reader with state, evaluated once per frame in the order), `space` (TODO §28), throttling (TODO §8). Archive `design/2026-11-12_reactive_propagation_plan.md` as superseded.
5. **KILOPIXEL.md:** Reactivity Engine, Variable Change Propagation, Per-Frame Render Pipeline, Interaction System.

## 9. Tests

The existing tests stay (ref cycles, two-phase frame, safe render, toLocal, layer fast path); those that read a derived value right after a change get a frame in between. New:

1. Ten stacked diamonds: the bottom is evaluated once per change, and never sees a half-updated state.
2. A chain of 10,000 readers ends at the right value.
3. Three readers with `t` in the DOM order C, B, A (C reads B reads A) show the same frame's values.
4. A cycle without `t` warns once, names its elements and doesn't keep the stage running.
5. An idle page with 1,000 readers runs no frame while the monitor publishes; a change to an element nobody reads wakes no stage.
6. A reader written before its source exists updates when the source connects, and again when it is removed.
7. `toLocal`: a reader that is read by another reader, with a target inside a group that moves with `t` (the hard case of §3.5).

## 10. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | This plan, or the two related plans' path (§7)? | Build step 1, prototype step 2, then decide |
| D2 | Reactive readers: version check, or evaluate all of them in every frame that runs? | Version check (§5: 0.11 ms instead of 1 ms per 5,000 readers) |
| D3 | `toLocal`: every frame that runs, or compare matrix versions? | Every frame that runs; versions only if a measurement asks for it |
| D4 | Cycles without `t`: warn when the order is built and stop after one pass, or keep the 100 rounds? | Warn and stop |
| D5 | Derived values right after `setAttribute()`: accept the next frame, or evaluate on demand when a stale value is read? | Accept the next frame, if step 1 finds no page that relies on it |
| D6 | Granularity: element, or attribute (`ref.orb.stroke` as its own source)? | Element, as today |
| D7 | Wake every stage in view, or only stages with readers of the changed source? | Every stage in view; the check costs about 20 ns per reader |
| D8 | Scoped names (`design/2026-10-30_framework_compatibility_plan.md` D2): resolve `ref` per stage? | Design it with D1: compiled functions would receive `ref` at call time instead of binding the global `pxl.nodes`, so component instances share their compiled expressions (framework plan §19.3, added 2026-11-15) |
