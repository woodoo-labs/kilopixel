# Two-Phase Frame: Evaluate Everything, Then Draw

- **Status**: ✅ **Implemented** (2026-11-13, step 1 built, §7.4; the rest continues in `design/done/2026-11-20_evaluation_model_plan.md`)
- **Date**: 2026-11-12
- **Related**: see §6 (every plan whose per-frame design depends on this one, and what changes for it); `design/archive/2026-11-15_per_frame_evaluation_plan.md` (proposes another way after step 2: one evaluation per frame for all expressions, no broadcasts; step 2 is the first step of both); background: `design/done/2026-11-07_safe_shape_render_plan.md` (same render path, hidden subtrees in §5.1), `design/done/2026-10-26_tolocal_fix_plan.md` (matrix walk within the frame), `design/ideas/2026-10-25_refs_across_spaces_note.md` (hub for refs, toLocal and the one-frame lag)
- **Target Implementation** (step 1 built, §7.4): `js/elements/stage.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/shape.js`, `js/elements/node.js`, `js/elements/variable.js`, `tests/index.html`, `.agents/KILOPIXEL.md` (Per-Frame Data Flow, Per-Frame Render Pipeline, Coordinate Mapping, AI guide), `docs/mapping.html` (section 7 removed, §8)
- **Prototypes**: `design/prototypes/2026-11-12_two_phase_frame/css_fast_path.html` (the CSS-only fast path, before and after the fix, §7.1), `design/prototypes/2026-11-12_two_phase_frame/second_walk_bench.html` (cost of the second walk, §5.1), `design/prototypes/2026-11-12_two_phase_frame/frame_bench.html` (frame time of the built engine, §7.4)

---

## 1. The Frame Before Step 1: One Pass

Until 2026-11-13 (step 1, §7.4), `Stage.render(t)` walked the layers in DOM order. Each layer evaluates its own animated attributes, clears its canvas, then walks its children; each child evaluates (`evaluateAnimations(t)`) and draws in the same step. Evaluation happens *inside* drawing. Two consequences:

1. **One-frame lag.** A reader drawn before its target (toLocal, `space`, plain `ref.*`) sees the target's values from the previous frame. The rule was: put readers in a layer after their targets (`docs/mapping.html` section 7 "Draw Order", removed with step 1). Fixed by step 1 for readers without `t`.
2. **`isDirty` means two things.** When an animated child is evaluated, its layer has already cleared the canvas, so the engine can't ask "did anything change?" before redrawing. Every animated element therefore calls `parentLayer.invalidate()` in every frame, whether its value changed or not. `isDirty` means both "pixels out of date" and "something is animated, keep the loop running" (KILOPIXEL.md Dirty-Flag Optimization, corrected 2026-11-12).

## 2. Idea

Split the frame:

- **Update phase:** the stage runs `evaluateAnimations(t)` for every element of every layer (and its own variables, §3.4). Reactive refs and toLocal readers settle through the existing broadcasts.
- **Draw phase:** every layer that needs it draws, with this frame's values.

Each value is still evaluated once per frame; the cost is a second walk over the elements (§5).

## 3. What the Split Makes Possible

### 3.1 No one-frame lag

Readers see this frame's values whatever the DOM order. Tested 2026-11-02 (`scratch/draw_order_chain_check.html` (not kept)):

- **Reactive readers** (`ref.*` / toLocal without `t`) settle through broadcasts, so the update phase fixes chains of any length in any order. Built with step 1 (§7.4).
- **Readers whose expression also uses `t`** don't subscribe to refs (`pxl.compileAttribute`, `js/engine.js`); they read their source only at their turn in the update phase, so each one before its source in the DOM still adds one frame (today: C reads B reads A in the order C, B, A lags 2 frames; confirmed 2026-11-12 with `design/prototypes/2026-11-12_reactive_propagation/ref_cycles.html`). Options: let time-dependent expressions with refs subscribe as well (re-evaluated on the broadcast, a second evaluation for those few), or sort by dependencies before the update phase (needs a rule for cycles). Recommended: the dependency order, §3.1.1.

#### 3.1.1 Dependency Order (Recommended, 2026-11-12)

The update phase evaluates every source before the elements that read it, whatever the DOM order, across layers and groups. Each element is still evaluated exactly once per frame.

- **The graph comes from the compiler** and is built by this plan (reactive propagation stays recursive, `design/done/2026-11-12_reactive_propagation_plan.md`). Every expression that reads `ref.*` has `variableDependencies`, also when it uses `t` (`js/compiler.js`). An edge goes from each source to its reader; `toLocal()` adds the ancestors of both elements, whose transforms count too.
- **An element that reads itself** is not a cycle in the sense of this rule: the walkthrough's section 9 orb has `shadowcolor="ref.sec9FlyingOrb.stroke"`, so `shadowcolor` simply follows `stroke`. Reactive propagation settles it inside the element with one extra round (tested in `tests/index.html`); the order leaves self-edges out. Found 2026-11-12, when a first cycle guard stopped this case.
- **Small graph.** Only elements that read `ref.*` or are read by others are in the graph; most shapes are not and stay in plain DOM order.
- **Computed only on change**, never per frame: after an element with an `id` or with references is added or removed, or an expression or `id` changes; a dirty flag like `_isOrderDirty`. One pass of Tarjan's algorithm gives the order and the cycles (an iterative version: a recursive one hits the stack on long chains, §9 R4). A page that adds particles every frame usually doesn't touch the graph (no `id`, no references).
- **Per frame:** the update phase walks the cached order, no allocation. Reactive readers keep updating through broadcasts at the moment their source changes, which in this order is before the animated readers further down.
- **Cycle rule:** the members of a cycle (A → B → C → A) are evaluated once each, in DOM order; where an element reads a member that comes later, it gets that member's value from the previous frame. Deterministic, no recursion. A self-reference with `t` (the "follow" effect, `x="ref.me.x + (100 - ref.me.x) * 0.1 + t * 0"`) is the cycle of one and keeps working as today. Feedback with `t` is often intentional (shapes chasing each other, springs), so no warning.
- **Limit:** several stages each run their own loop; a reader in one stage that reads another can still lag a frame. A shared update phase for all stages could fix that later.

**Reactive cycles** (no `t`) are not part of this plan: they settle during propagation, which recurses. A cycle that never settles (`a = b + 1`, `b = a + 1`) stops after 100 rounds with a warning (since 2026-11-13). Diamonds evaluated once per path and half-updated values remain, accepted until a feature needs them: `design/done/2026-11-12_reactive_propagation_plan.md` (`design/done/2026-11-20_evaluation_model_plan.md`).

### 3.2 Change-based dirty flags

`evaluateAnimations()` already returns whether a value changed. With evaluation before drawing, a layer is dirty only when something in it really changed:

- an animated value changed in the update phase;
- or an external source invalidated it: `setAttribute()` / broadcasts (reactive readers), resize, font arrival (`invalidateLayers()`, `design/done/2026-11-06_text_box_accuracy_plan.md`), later image load (TODO §9), the layer's first draw.

Redraws that would disappear:

| Expression | Today | With change-based dirty flags |
|---|---|---|
| `text="floor(t)"` (a clock) | 60 redraws / s | 1 redraw / s |
| `x="clamp(t * 100, 0, 300)"` (intro animation) | 60 redraws / s forever (`isAnimated` stays true) | stops redrawing after 3 s |
| `fill="t > 5 ? 'red' : 'blue'"` | 60 redraws / s | 1 redraw, at the switch |
| Pattern B pump while stopped (`design/archive/2026-10-17_shape_authoring_plan.md` §4) | 60 redraws / s | none |

Conditions:

- **`draw()` only reads `attributeValues`.** Checked 2026-11-12 (and 2026-11-07 in the shape authoring plan §3.3): no `draw()` uses `t`. This becomes a contract for custom shapes; the shape authoring plan's `draw(ctx, u)` without `t` states it in the signature.
- **Values that are new objects every frame** (an animated gradient descriptor, an array) compare as changed: conservative, they redraw as today. They are also today's only garbage in the hot loop, independent of this plan: `linear(t * 90, ['gold', 'orange'])` creates a stops array and a descriptor in every evaluation, and `createGradient()` then builds a new `CanvasGradient` because its cache compares the descriptor by identity. Reusing them would be a separate compiler optimization.
- **The saving is per layer.** One changing element redraws its whole layer: in the benchmark of §5.1, one moving circle among 5,000 static ones in the same layer costs the full 13 ms of drawing. Redraws are saved only where a whole layer is quiet (clocks, finished intros, step changes). Most docs pages animate continuously with `t` and gain little; §5 measures how much. Docs and the AI guide can then recommend putting changing elements in their own layer.
- **The update phase keeps running** while anything is animated (the clock must still be evaluated to notice the next second); only drawing is saved. Whether the evaluation itself can sleep (tweens that finished, `clamp()` past its end) is the tween plan's question (§6).

### 3.3 Keep-alive moves to the stage

The stage knows after the update phase whether anything is animated and requests the next frame itself. Keeping the loop alive no longer depends on drawing, so:

- `parentLayer.invalidate()` at the end of `evaluateAnimations()` and the layer heartbeat at the end of `Layer.render()` go away; `isDirty` only means "pixels out of date".
- A layer that skips drawing (throttled, hidden, CSS-only fast path) can't drop the loop.

### 3.4 Stage-level `<pxl-var>`

Built 2026-11-13 (`design/ideas/2026-11-12_layer_throttling_plan.md` Part B): `Stage.render()` evaluates variables outside every layer before the layers. The update phase simply starts with them; their keep-alive in the stage is already what §3.3 proposes for everything.

### 3.5 `maxfps` becomes a pure draw gate

With §3.3, a throttled layer just stays dirty until its window: no rAF relay or timer per layer (throttling plan §3.4). If the update phase also evaluates throttled layers every frame, variables in them stay smooth (throttling plan §3.6). Change-based dirty flags (§3.2) also cover the clock example that motivated `maxfps`, so `maxfps` remains for layers that really change every frame (heavy backgrounds).

## 4. Open Questions

1. **Cost of the second walk** (§5). The whole idea depends on it. First answer (§5.1): about 0.02 ms per 1,000 elements, 1–2 % of a frame; not a blocker. Confirmed in the engine with step 1 (§7.4): no measurable difference.
2. **CSS-only fast path:** a layer whose only animated attributes are compositing (`alpha`, `blend`, `filter`) skips its canvas (works since the fix in §7.1); the split must keep that.
3. **Static layers stay idle:** a page without animation keeps 0 FPS.
4. **Order of broadcasts** during the update phase: a broadcast reaches readers that may or may not have been evaluated yet this frame.
5. **Readers that use `t` and refs** (§3.1): subscribe them too, or sort by dependencies? Recommended: the dependency order (§3.1.1), because it evaluates each element once per frame and doesn't depend on the DOM order. Cost limits for either option:
   - **Subscribe:** a reader whose sources change several times in one frame would be evaluated several times. Evaluate it at most once per frame (frame stamp, §7.2).
   - **Sort:** never per frame (an allocation, and O(elements + refs)). Keep the order like `_isOrderDirty`: recompute it only after a connect, disconnect or attribute change.
6. **Hidden subtrees** (measured 2026-11-07, safe render plan §5.1): a hidden shape is still evaluated, so `ref.*` to it stays current. Inside a hidden group or layer, values that follow `t` freeze (a `<pxl-var>` too); values that follow other refs keep updating through broadcasts. Should the update phase evaluate hidden subtrees? Doing it every frame would keep a page with a hidden animated panel running at 60 FPS for values nobody sees. Middle way: evaluate a hidden subtree only when something outside reads it. `pxl._subscriptions` knows only the readers without `t`, so it can't answer this alone (§9 R5).
7. **Throttled layers:** evaluate them every frame (smooth readers, no saving on evaluation) or only at their rate (as today)?
8. **Errors:** an element whose evaluation fails in the update phase is skipped in the draw phase too, keeping the safe render rules (safe render plan §3.3: a layer keeps its old pixels, a variable its old value).
9. **Hit testing** (`interaction.process()`) runs at the start of the frame since 2026-11-17, before the update phase, and uses the values of the last update, the picture on screen (`design/done/2026-11-17_pointer_frame_order_plan.md`; after drawing, readers of the pointer and of hover states were drawn one frame late). In a throttled layer the values can still be ahead of the pixels (throttling plan §3.2); acceptable?

## 5. Measurements Before Deciding

A prototype in `design/prototypes/` (folder named like this plan), comparing today's single pass with a two-pass version on the same bundle:

- extra cost of the second walk: benchmark presets (`examples/benchmark.html`), the heaviest docs pages, against the 16.7 ms frame budget;
- redraws saved by change-based dirty flags on the docs pages and examples (count `Layer.render()` calls that drew);
- the chain-of-readers cases from §3.1.

### 5.1 Measured 2026-11-12: The Second Walk

`design/prototypes/2026-11-12_two_phase_frame/second_walk_bench.html`: circles in one layer, 10 % animated, frames driven by hand with `stage.render(t)`. Each value is still evaluated once, so the extra cost is only visiting every element a second time; the bench times a walk that does what an update loop does besides evaluating (check `hidden`, read the animated keys, recurse).

| Elements | Today's frame (evaluate + draw) | Second walk | Share |
|---|---|---|---|
| 1,000 | 2.0 ms | 0.021 ms | 1.1 % |
| 5,000 | 12.9 ms | 0.20 ms | 1.5 % |
| 5,000 in groups of 50 | 12.9 ms | 0.18 ms | 1.4 % |

- Drawing dominates the frame; the second walk is about 0.02 ms per 1,000 elements against the 16.7 ms budget. The frame time varies between runs (1,000 elements: 0.9–2.0 ms), the walk stays at 0.02 ms, so its share is 1–2 %.
- Today's `evaluateAnimations()` calls on static elements (no animated keys) cost about as much again (0.2 ms for 5,000). That is what skipping static subtrees in the update phase would save (§7.2, optional).
- The walk ran outside the engine; step 1 (same bundle, one walk vs. two) is the final check.
- **GC:** the steps need no allocation per frame: plain `for` loops as in today's `Stage.render()`, sorting only when `_isOrderDirty`, per-element state in fields set in the constructor (frame stamps, §7.2), `try` / `catch` free until something throws (safe render plan §4). The only garbage in the hot loop is today's animated gradients (§3.2).

## 6. Related Plans

Plans whose per-frame design assumes today's single pass. Each has a pointer to this plan; bring it up to date before building it if this plan is decided first.

| TODO | Plan | What changes with a two-phase frame |
|---|---|---|
| §8 | `design/ideas/2026-11-12_layer_throttling_plan.md` | Part A: the keep-alive (§3.4) and the variable placement rule (§3.6) are workarounds for the single pass; the gate stays. Part B (built 2026-11-13): becomes the start of the update phase. Part C: independent. Its D9 is the order |
| §3 | `design/2026-10-01_tween_animation_plan.md` | §7 (sleep when tweens finish) works through `isAnimated` and the layer heartbeat; with §3.3 the stage decides from the update phase, and change-based dirty flags stop redrawing a finished tween on their own |
| §2 | `design/ideas/2026-09-29_pxl-clip_element_plan.md` | §6.1 `applyClip()` evaluates its children while drawing and §9 relies on the layer heartbeat; the clip's children must be evaluated in the update phase |
| §28 | `design/ideas/2026-10-30_space_attribute_plan.md` | §3.5 "Draw Order" (one-frame lag, readers after targets) goes away: no lag since step 1 for readers without `t` |
| §25 | `design/ideas/2026-10-25_refs_across_spaces_note.md` | the same lag for toLocal and plain `ref.*`; this plan is the general fix |
| §20 | `design/archive/2026-10-17_shape_authoring_plan.md` | §3.3 `draw(ctx, u)` without `t` becomes a requirement (§3.2); §4 Pattern B sets `isAnimated` by hand, which the update phase must keep working; its open point "while stopped, the layer keeps redrawing" is solved by §3.2 |
| §39 | `design/done/2026-11-12_reactive_propagation_plan.md` | no dependency: reactive propagation stays recursive (the cycle crash is fixed); this plan builds its own order for readers with `t` (§3.1.1). If §39 is built later, both could share the ordering code |
| §31 | `design/done/2026-11-01_isolated_shape_compositing_plan.md` | no logical dependency, but both change `Shape.render()` (it the drawing, this plan the evaluation): build one after the other, not in parallel (2026-11-20: since step 1 `Shape.render()` only draws, and steps 2–4 change the update phase; any order, isolation plan §9) |
| §14 | (no plan) `paintorder` | same draw path; only ordering, after §31 |

Not affected: the framework plan (`design/done/2026-10-30_framework_compatibility_plan.md`: its event dispatch fits both models), `<pxl-out>` (`design/ideas/2026-08-02_declarative_html_output_pxl_out_plan.md`: updates through broadcasts, independent of draw order), `<pxl-plot>` (`design/ideas/2026-09-07_plot_element_plan.md`), stage sizing (`design/done/2026-11-04_stage_sizing_plan.md`). TODO §9 (`<pxl-image>`) only adds an external invalidation source (§3.2).

## 7. Suggested Order

1. **Independent fixes:** all done. The CSS-only fast path (§7.1), the crash of reactive cycles that never settle and the monitor bug (throttling plan Part C1, both 2026-11-13).
2. **This plan:** step 1 measured and built (§7.4); answer the rest of §4, then 🟡 for steps 2–4.
3. **Build it in steps** (§7.2): step 1 done; step 2 when a measurement shows that the saved redraws matter, or with throttling or tweens.
4. **Update the dependent plans to the new model, then build them:** throttling Part A (much simpler), tween §7, `<pxl-clip>`, `space` (without §3.5).
5. **Isolated compositing (`design/done/2026-11-26_isolation_box_plan.md`)** before or after item 3, not in parallel; `paintorder` after it. (2026-11-20: no shared code any more, any order; isolation plan §9. Step 1 of the isolation plan built the same day.)
6. **Docs cleanup** (§8): already with step 1 of §7.2.

### 7.1 Found While Checking: The CSS-Only Fast Path Never Ran (Fixed 2026-11-12)

`Layer.render()` has a fast path: when a layer's only animated attributes are compositing (`alpha`, `blend`, `filter`) and it isn't dirty, it updates the canvas CSS and skips clearing and redrawing. Before the fix it never triggered:

- A layer's `parentLayer` is the layer itself (`closest('pxl-layer')` includes the element). `evaluateAnimations()` ended with `this.parentLayer?.invalidate()`, so an animated layer set its own `isDirty` while evaluating, and the fast path requires `!this.isDirty`.
- Measured with `design/prototypes/2026-11-12_two_phase_frame/css_fast_path.html` (frames driven by hand with `stage.render(t)`): a layer with `alpha="0.5 + wave(2) * 0.5"` and one static circle cleared its canvas in 10 of 10 frames (engine of commit `4f1b7ea`); with `parentLayer` set to `null` for the experiment, 0 of 10, and the opacity still animated (the layer heartbeat keeps the loop alive).
- **Fix** (`js/elements/node.js`): `evaluateAnimations()` skips the call when `parentLayer === this`. Setting `parentLayer` to `null` would have been wrong: `attributeChangedCallback()` and `reportError()` use the same call, and a layer's own `setAttribute()` must still redraw it. (2026-11-20: not for its `alpha`, `blend` and `filter`, which keep the pixels like the animated ones, `design/done/2026-10-30_framework_compatibility_plan.md` §29.)
- **Latent bug exposed by the fix** (`js/elements/layer.js`): the fast path checked only "compositing animated, transforms not", so a layer with `alpha` and `hidden` both animated would have skipped clearing when it became hidden. The condition is now "every animated attribute is compositing".
- **Result:** the prototype shows 0 clears in 10 frames; on `docs/blend.html` the layer with `filter="hueRotate(t * 45)"` and 36 static circles no longer redraws them in every frame (pixels unchanged, only the CSS filter moves). 4 engine tests ("layer fast path: …"): alpha only keeps its pixels; animated `hidden` still clears and redraws; an animated child still redraws every frame; a shape changed with `setAttribute()`, added, or moved in from another layer is drawn in the next frame. 59/59 pass.

### 7.2 Building It in Steps

Little code breaks: the split stays inside `stage.js`, `layer.js`, `group.js`, `shape.js` and `variable.js`. The `draw()` of all shapes (also custom shapes, which only override `draw()`), the compiler, broadcasts, the toLocal walk, hit testing, event dispatch, attributes and the public API stay unchanged. No engine test expects the lag (checked 2026-11-12).

**Step 1: only split evaluation from drawing** (built 2026-11-13, §7.4). Each `render()` becomes `update(t)` (evaluate) and a draw method; `Stage.render()` runs two loops over the same layers as today (`isDirty || isAnimated`). Hidden subtrees and errors keep today's rules. Three things must be adjusted, because they rely on evaluation and drawing being one step:

1. **Heartbeat.** Today an animated layer stays alive through an order inside `Layer.render()`: `isDirty = false`, then the children evaluate and set it again. After the split they evaluate before the draw clears it, and the animation would stop after one frame. Fix: clear `isDirty` at the start of the layer's update; draw when the layer was dirty at the start of the frame or became dirty during the update (also through a broadcast from a later layer). The engine test "nothing redraws while nothing moves (0 FPS)" guards this.
2. **Errors.** A failing evaluation skips the drawing today because both are in one `try`. After the split, an element remembers that its evaluation failed in this frame, and the draw phase skips it (a layer keeps its pixels, a group its children).

**Frame stamps instead of booleans.** State that holds "for this frame" (evaluation failed, layer became dirty during the update, a reader already evaluated, §4 question 5) is stored as the frame number it happened in (`this._failedFrame === frame`), in fields set in the constructor. A boolean would need resetting every frame: another walk or extra writes. A stamp needs no reset and allocates nothing.
3. **Docs in the same change.** Step 1 already removes the lag for readers that update through broadcasts (`ref.*`, toLocal), so §8 belongs to this step. Readers that also use `t` still lag until step 3.

Sorting children by DOM position (`_isOrderDirty` in layers and groups) moves into the update phase, so elements added or moved since the last frame are evaluated in DOM order (§7.3).

Step 1 doubles as the measurement of §5: the same bundle with one walk and with two.

**Step 2: change-based dirty flags (§3.2) and the keep-alive in the stage (§3.3).** `parentLayer.invalidate()` disappears from `evaluateAnimations()`, the layer heartbeat from `Layer.render()`, and `isDirty` only means "pixels out of date". This is the step that saves redraws. Facts like "this layer contains something animated" follow the rule of §7.3.

- **Which layers the update phase walks.** Today the per-frame `parentLayer.invalidate()` is what brings an animated layer back into the next frame; step 2 removes it. So the update phase needs a fact **per layer**, not only for the stage: "had animated content in the last walk", collected during the walk (allowed by §7.3: recomputed on every walk, and any added, removed or changed element invalidates the layer, which forces a walk). The update phase walks a layer when it has that fact, is dirty, or has animated attributes of its own. Without it the stage would either walk every layer in every frame (a static background with 5,000 shapes: 0.2 ms per frame for nothing, §5.1) or none, and the animation would stop.
- **Requests during the frame** (§9 R1): with the keep-alive in the stage, a change made before the running frame's update phase (pointer, hover states, handlers) no longer needs to request a frame of its own; today it adds an empty frame. The `test.known()` "one pointer move with a reader of the pointer runs one frame" in `tests/index.html` becomes a test with this step.
- **Optional, a micro-optimization: skip static subtrees.** With evaluation separate from drawing, the update phase only has to visit animated elements. The same fact on groups ("has animated descendants", collected the same way) lets it skip static groups. Saves about as much as the second walk costs (§5.1); only worth it for large static scenes.

**Step 3: the open behavior questions.** Readers that use `t` and refs (the dependency order, §3.1.1), hidden subtrees (§4, question 6).

**Step 4: the dependent plans** (§6; their order in item 4 of the list above).

### 7.3 Elements Added, Removed, Moved or Copied at Any Time

Pages add shapes and layers later, remove them, or move them between layers with plain DOM calls (`appendChild()`, `insertAdjacentHTML()`, `remove()`, `cloneNode()`). Today everything that changes what a layer contains already invalidates it: `registerChild()` / `unregisterChild()` in layers and groups, `registerLayer()` / `unregisterLayer()` in the stage, and `attributeChangedCallback()` for every `setAttribute()`. Moving an element is a disconnect plus a connect, so both layers redraw (engine test "layer fast path: a shape changed, added or moved in from another layer is drawn in the next frame", 2026-11-12).

**Rule for every step:** a fact about a layer's content ("contains something animated", "has stage-level variables", a list of readers) is recomputed while the layer is walked, never kept as a counter that connect, disconnect and `setAttribute()` must update. Elements come and go, and switch between static and animated, at any time; each of those changes already invalidates the layer, so the next walk recomputes the fact, while a counter would drift with one missed path.

Per step:

- **Step 1:** safe. An added element marks its layer dirty, so the update phase evaluates it before it is drawn; sorting moves into the update phase (§7.2).
- **Step 2:** the step where the rule matters most (§3.2, §3.3).
- **Stage-level variables** (built): one moved from the stage into a layer, or back, leaves and joins the stage's list in `disconnectedCallback()` / `connectedCallback()` (engine test "stage variables: moved into a layer or removed …").
- **Step 3:** evaluating a hidden subtree only when something reads it (§4, question 6) uses the live readers, so it follows readers added later: `pxl._subscriptions` for readers without `t`, the compiler's dependencies for readers with `t` (§9 R5).
- **Throttling** (`design/ideas/2026-11-12_layer_throttling_plan.md` §3.3): a layer moved to another stage clears its timer on disconnect and resets its wait on connect; a shape moved into a throttled layer waits for that layer's next window, like any other change there.
- **Copies** (`cloneNode()`): a copy is a new element and needs nothing special. Unrelated to this plan and unchanged: a copy keeps its `id`, so two elements share it and `ref.<id>` points to the one connected last.
- **Elements added in an event handler:** hit testing and the handlers run at the start of the frame (`interaction.process()`, since 2026-11-17, `design/done/2026-11-17_pointer_frame_order_plan.md`), so such elements are evaluated and drawn in the same frame.

### 7.4 Step 1 Built 2026-11-13

`Stage.render()` runs an update phase over all layers, then a draw phase. Prototyped first as a patch over the running engine (`scratch/two_phase_step1/patch.js` (not kept)), with the same results as the build below.

- **Code** (+96 / −23 lines in `js/`, comments included; 56.5 KB minified, +0.9 KB): `update(t)` in `layer.js`, `group.js`, `shape.js`, `variable.js` evaluates; `render()` only draws (a variable draws nothing). `pxl._frame` counts frames in `stage.js`; per-frame state is a frame stamp (§7.2): `_failedFrame` (declared in `node.js`) makes the draw phase skip an element whose update failed, and a layer's `_updateFrame` tells the draw phase whether it was updated in this frame.
- **The heartbeat** (the risky part, §7.2 item 1): `Layer.update()` keeps the requests from before the frame in `_wasDirty`, clears `isDirty`, and after the children keeps their heartbeat in `_keepAlive`. `needsRender()` = updated and `_wasDirty`, or `isDirty` (also a later layer's broadcast after this layer's update), or animated itself. Drawing sets `isDirty = _keepAlive`, so only the heartbeat survives into the next frame.
- **Not changed:** the `draw()` of every shape (also custom shapes), the compiler, broadcasts, the toLocal walk, hit testing, attributes. `draw(ctx, u, t)` still receives `t` (step 2 makes `draw()` without `t` a contract).
- **Missed, fixed 2026-11-17:** the stage's pointer values and the hover / press states change in `interaction.process()`, which still ran after drawing, so their readers without `t` (and hover readers with `t`) stayed one frame late. No test covered it. `design/done/2026-11-17_pointer_frame_order_plan.md` moved `process()` to the start of the frame.
- **Tests** (`tests/index.html`, "two-phase frame: …", 76/76 pass): a reader in an earlier layer is drawn with its target's value of the same frame (`ref.*` and the toLocal case of the removed mapping section 7); the heartbeat keeps a layer with an animated child redrawing and a static one idle; a layer made dirty by an earlier layer's broadcast draws once per frame with the new value; a shape whose update fails is skipped in the draw phase, and a failing layer keeps its pixels. Against the build of commit `eb26043`, the two lag tests fail (line 5 px behind the ball, ring 340 px off the planet) and the other three pass: they guard behavior that stays.
- **Heartbeat cases**, live and hand-driven, one pass vs. step 1 (`scratch/two_phase_step1/heartbeat.html` (not kept)): animated child 60 redraws/s in both; static 0; one `setAttribute()` 1 redraw, then idle; animated made static 0; static made animated 60; CSS-only fast path 0; hidden layer with an animated child 0; a throwing shape next to an animated one keeps the layer at 60. Reader before its target: gap 5 px before, 0 px with step 1, and its layer redraws once per frame, not twice.
- **Frame time** (`design/prototypes/2026-11-12_two_phase_frame/frame_bench.html`, frames driven by hand, best of three, two runs each, ms per frame):

| Scene | One pass (`eb26043`) | Step 1 |
|---|---|---|
| 5,000 circles, 1 layer, 10 % animated | 16.37 | 15.74 |
| 5,000 circles, 10 layers, 10 % animated | 16.74 | 16.15 |
| 1,000 circles, 1 layer, all animated | 3.68 | 3.33 |
| 1,000 circles, 20 layers, all animated | 3.88 | 3.19 |

  No measurable cost: the differences lie within the run-to-run variation (up to 15 % between runs of the same build).
- **Pages:** all 78 docs and example pages (166 stages), each loaded with the build of `eb26043` and with step 1, 60 frames driven by hand on every stage: 5,646 canvas clears before, 5,648 with step 1; no warnings or errors in either. The only difference: `examples/test26.html` and `test27.html` nest a `<pxl-layer>` inside a `<pxl-layer>`, which the engine doesn't really support (the outer layer treats the inner one as a child and calls its `render()` with the child arguments, and the stage draws it as well); with step 1 the inner layer is drawn twice in its first frame. (A live sweep with the browser's own frames needs the window in the foreground: in a background tab, rAF runs about 3 times per second and measures nothing.)
- **Docs:** `docs/mapping.html` section 7 "Draw Order" deleted (§8); KILOPIXEL.md Per-Frame Data Flow, Per-Frame Render Pipeline, Dirty-Flag Optimization, Errors While Rendering, Coordinate Mapping, AI guide.

## 8. Docs When Solved

Done with step 1 (2026-11-13): section 7 "Draw Order" of `docs/mapping.html` deleted (it was the last section, nothing to renumber); KILOPIXEL.md Coordinate Mapping and the AI guide no longer ask for readers after their targets, only a reader that also uses `t` does.

## 9. Rules Both Paths Share (Aligned 2026-11-18)

After step 2 the evaluation work can go two ways (§2 of `design/archive/2026-11-15_per_frame_evaluation_plan.md`, its D1): this plan's step 3 with `design/done/2026-11-12_reactive_propagation_plan.md` (option A), or the per-frame plan (no broadcasts). A comparison of the three plans and the pointer frame order plan on 2026-11-18 found places where they disagreed or left a gap. The rules below hold for either path; the other plans point here.

| | Rule | Where it was inconsistent |
|---|---|---|
| R1 | **A change before the running frame's update phase requests no frame of its own.** Pointer values, hover / press states and handler effects (`interaction.process()`, start of the frame) and stage-level variables are drawn in that frame. Only other stages, and the keep-alive decided after the update phase (§3.3), request frames | Measured 2026-11-18 (frames run by hand, the browser pane was hidden): `Stage.requestRender()` doesn't know that a frame is running, so the `invalidate()` of a pointer reader inside `process()` schedules a second, empty frame. One pointer move without a reader: 1 frame; with one `ref.<stage>.mouseX` reader: 2 frames (1 drawn, 1 empty). `design/done/2026-11-17_pointer_frame_order_plan.md` §3 measured "1 frame per move" on a page without such a reader. While the pointer keeps moving, the extra frame merges with the next move's frame, so it costs one empty frame after the last move. Fixed with step 2 (§7.2); `test.known()` in `tests/index.html`. The per-frame plan's `pxl.markChanged()` (§3.6 there) follows the same rule |
| R2 | **Cycles without `t`**: open decision C1 below | Three rules: today's nesting counter (100 rounds, `pxl.MAX_CYCLE_ROUNDS`), the reactive propagation plan §4 (members in DOM order, repeated while values change, at most 100 rounds), the per-frame plan D4 (one pass, a warning when the order is built) |
| R3 | **An element that reads its own attributes** (`shadowcolor="ref.sec9FlyingOrb.stroke"`) sees them with this frame's values, also when both attributes are reactive. Self-edges stay out of the order (§3.1.1); inside the element, its own reactive expressions are evaluated once more when one of its values changed and another one reads the element (today's extra round, engine test "ref cycles: an attribute that reads another attribute of its own element follows it at once") | The per-frame plan §3.4 only ordered "`t` before reactive" inside an element; two reactive attributes in the wrong key order would have lagged a frame |
| R4 | **Nodes of the dependency order** are elements that are read by others **and** have expressions of their own. An element that only reads is not a node, so adding readers (particles that follow `ref.main.mouseX`) never rebuilds the order. The algorithm is iterative (no recursion, any chain length) | The reactive propagation plan §4 (option B) assumed every subscriber is a node and expected a rebuild per added particle; §3.1.1 here and the per-frame plan §3.3 define nodes as above |
| R5 | **"Who reads this element"** (hidden subtrees, §4 question 6; which ids wake a stage, per-frame plan §3.6) comes from the compiler's dependencies (`variableDependencies`), which expressions with `t` have too | §4 question 6 relied on `pxl._subscriptions`, which knows only the readers without `t`; the per-frame plan §3.8 doesn't have the gap |
| R6 | **Stage-level variables** (built 2026-11-13) are the first thing the update phase evaluates (§3.4); the stage keeps the loop running while one of them is animated | Missing in the per-frame plan's three-part frame (§3.2 there), written two days after they were built |

### 9.1 Open Decision C1: Cycles Without `t`

A cycle without `t` (`a = b + 1`, `b = a + 1`) is a mistake in the page; a cycle that settles (`a = b`, `b = a`, or one that converges like `a = (b + 10) / 2`, `b = a`) is legal.

| Option | Settling and converging cycles | A cycle that never settles |
|---|---|---|
| (a) Today: recursive broadcasts with the nesting counter | settle | 100 nested rounds per change, one warning; option A only (no broadcasts in the per-frame plan) |
| (b) Members in DOM order, repeated while values change, at most `pxl.MAX_CYCLE_ROUNDS` rounds, one warning; the edge that closes the cycle doesn't request another frame | settle, converging ones too | 100 rounds per change, no recursion, the stage goes idle afterwards |
| (c) One pass, a warning when the order is built (per-frame plan D4) | settle; a converging cycle stops after one step | one pass per change |

**Recommended: (b)** for both paths. It keeps today's results for every cycle that settles, needs no recursion, and the "closing edge" part keeps a cycle from running the frame loop forever in the per-frame model. (c) is cheaper but changes the result of converging cycles. Decide together with the per-frame plan's D1.

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-20: `.agents/KILOPIXEL.md` was split into `.agents/KILOPIXEL.md` (language) and `.agents/ENGINE.md` (engine); section names in this plan refer to the old single file.
- Status line until 2026-11-20: 💬 **Discussion** (2026-11-18: §9 lists the rules both paths share, aligned with the per-frame evaluation, reactive propagation and pointer frame order plans, and one open decision on cycles; 2026-11-17: readers of the pointer and of hover states had kept the lag, fixed by `design/done/2026-11-17_pointer_frame_order_plan.md`, §4 question 9, §7.3 and §7.4 updated; 2026-11-13: step 1 built, §7.4: no one-frame lag for readers without `t`, no measurable cost; steps 2–4 not decided; builds its own dependency order, reactive propagation stays recursive; 2026-11-12: plan started from the former TODO item 29 (idea 2026-10-30) and made the hub for the plans that depend on it; performance and GC review: the second walk costs about 1–2 % of a frame (§5.1), redraws saved still to measure; dependency order with a cycle rule recommended, §3.1.1; nothing decided)
