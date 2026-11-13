# Layer Throttling (`maxfps`), Stage-Level `<pxl-var>` and Performance Monitor

- **Status**: 🟡 **Proposed** (2026-11-13, Part B built with D6 (b), §4.5; Parts A and C open, decisions D1–D5 and D7–D9 open, D9: build A after the two-phase frame?)
- **Date**: 2026-11-12
- **Supersedes**: `design/archive/2026-09-14_stage_variables_and_layer_throttling_plan.md` (stage-level `<pxl-var>`, `maxfps`, per-layer metrics) and `design/archive/2026-09-14_layer_throttling_plan.md` (revised 2026-09-15: `maxfps` in detail, keep-alive, cross-layer variables, frame counting, monitor bug)
- **Related**: `design/2026-11-07_safe_shape_render_plan.md` (error path in `Layer.render()`), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A: `maxfps` comes from `static defaults`), `design/2026-11-12_two_phase_frame_plan.md` (💬, TODO §29: an update phase before drawing would simplify Part A and absorb Part B, §1.1 and D9 here)
- **Target Implementation**: `js/elements/layer.js`, `js/elements/stage.js`, `js/elements/variable.js`, `js/monitor.js`, `tests/index.html`, `.agents/KILOPIXEL.md` (Stage, Layer, Variable, Per-Frame Render Pipeline, Performance Monitor); docs: see D8

---

## 1. Three Parts

| Part | What | Can ship alone |
|---|---|---|
| **A. `maxfps`** | Attribute on `<pxl-layer>`: at most N canvas redraws per second | Yes, but needs C2 to verify it |
| **B. Stage-level `<pxl-var>`** | A `<pxl-var>` in the stage but outside any layer is evaluated by the stage every frame | Yes; **built 2026-11-13** (§4.5) |
| **C. Performance monitor** | C1: fix the known bug (values freeze when idle, `fps` is not per second). C2: per-layer metrics | C1 yes (a bug fix); C2 together with A |

They belong in one plan because they meet in the same 20 lines of `Stage.render()`, and because B is the answer to A's main pitfall: an animated variable inside a throttled layer only updates at that layer's rate (§3.6), so shared animated state should live on the stage.

Suggested order: B (built 2026-11-13) → C1 → A + C2, each its own commit with its tests. But see §1.1 and D9: if the two-phase frame is decided, A should wait for it.

### 1.1 If the Two-Phase Frame Comes First

This plan is designed for today's single-pass frame, where elements are evaluated while they are drawn. `design/2026-11-12_two_phase_frame_plan.md` (TODO §29) proposes evaluating every element first, then drawing. If that is built first:

- **Part A gets simpler.** The stage keeps the loop alive from the update phase, so a skipped layer just stays dirty until its window: the keep-alive of §3.4 (rAF relay or timer) and D2 go away. The gate (§3.3), what is throttled (§3.2) and D1, D3, D7 stay.
- **§3.6 can go away.** If the update phase evaluates throttled layers every frame, variables in them stay smooth (the two-phase plan's open question 7 decides this).
- **Part B (built) moves into the update phase.** Stage-level variables are simply the first thing it evaluates; D6 stays.
- **Part A is needed less.** Change-based dirty flags stop redrawing when values don't change, so a `floor(t)` clock redraws once per second without `maxfps`. `maxfps` remains for layers that really change every frame (heavy backgrounds).
- **Part C is unaffected.** C1 is a bug fix for both models; frame counting (§5.2) and C2 stay as they are.

## 2. What Changed Since the 2026-09-14 Plans

Both old plans were written before Rule A, the `pxl` namespace, the `_` ownership rule, `zoom` and safe render. Checked against today's code (`stage.js`, `layer.js`, `node.js`, `variable.js`, `monitor.js`):

1. **Animated children keep the layer dirty.** `PxlNode.evaluateAnimations()` ends with `this.parentLayer?.invalidate()` for every animated element. `Layer.render()` sets `isDirty = false` *before* drawing the children, so a layer with an animated child is dirty again after every frame. `isDirty` therefore can't separate "a reactive change" from "the animation heartbeat". The first plan's gate (`maxfps && isAnimated && !isDirty`) would never throttle anything.
2. **`layer.isAnimated` covers only the layer's own attributes** (`rotate="t * 10"`), not its children. The usual throttled layer (a static layer full of animated shapes) has `isAnimated === false` and `isDirty === true`. The second plan's split "animated → rAF relay, otherwise → timer" would send exactly the main use case down the timer branch.
3. **`resize()` clears the canvas** (setting the size resets it) and the stage renders immediately. A throttled layer that skips that frame would stay blank for up to `1 / maxfps` seconds. Neither plan handled this.
4. **`_` ownership:** the second plan's stage loop reads `layer._maxFps`, `layer._minInterval`, `layer._lastRenderTime`, `layer._throttleTimer`. That breaks the rule (build.js refuses it). Fix: the gate lives inside `Layer.render()` (D1), so all throttle state stays in `layer.js`.
5. **Rule A:** `maxfps: 0` goes into `Layer.defaults`; the gate reads `this.attributeValues.maxfps` directly. No mirrored `_maxFps` / `_minInterval` fields, no post-compile hook.
6. **Safe render:** a failing layer evaluation returns early from `Layer.render()` and keeps the old pixels; `reportError()` keeps an animated layer asking for frames. The gate runs before that, so an error frame counts as the layer's turn.
7. **Pointer events request frames** (`interaction.js`) even when nothing is dirty. Today `perfFrames` counts every `stage.render()`, also those in which no layer drew, so `ref.<stage>.fps` on a static page shows pointer-move frames.
8. **Stage-level variables today:** a `<pxl-var>` outside any layer has `parentLayer` and `parentContainer` `null`, so nothing calls its `render()`. Static and reactive values work (compiled at connect, updated by broadcasts); only values that follow `t` never evaluate. Fixed by Part B (2026-11-13).

Dropped from the old plans: `dist/kilopixel.js`, `this.layers` / `isOrderDirty` (now `_layers` / `_isOrderDirty`), `_hasAnimatedChildren`, line numbers, `file:///` links, the frame-1 "baton" description (see 1 and 2 for how the loop is kept alive today).

## 3. Part A: `maxfps` on `<pxl-layer>`

### 3.1 API

| Attribute | Default | Description |
|---|---|---|
| `maxfps` | `0` | At most this many canvas redraws per second. `0` (also bare, removed, negative or `NaN`) = no limit. |

```html
<pxl-stage ratio="5 / 3">
  <!-- Ambient background: at most 12 redraws per second -->
  <pxl-layer maxfps="12">
    <pxl-circle x="500" y="300" r="400" fill="hsl(loop(10) * 360, 50, 20)"></pxl-circle>
  </pxl-layer>

  <!-- Interactive layer at full rate (no attribute) -->
  <pxl-layer>
    <pxl-circle x="ref.main.mouseX" y="ref.main.mouseY" r="12" fill="#38bdf8"></pxl-circle>
  </pxl-layer>
</pxl-stage>
```

Why `maxfps` and not `fps`: it is a ceiling. A layer with `maxfps="30"` on a machine that manages 20 shows 20. Animation speed doesn't change: `t` is wall-clock seconds, so motion is the same at any rate; `maxfps` only decides how often the canvas is redrawn.

### 3.2 What is throttled

Everything that redraws the layer's canvas: animation, reactive `ref.*` broadcasts, `setAttribute()` on its children, its own CSS-only compositing animation (D3). Otherwise a fast producer (an animated variable in another layer) would defeat the throttle.

Not throttled:
- **The first draw** after connect and **the draw after a resize** (the canvas was cleared).
- **Hit testing and events:** `interaction.process()` runs every stage frame. Handlers fire at once; only the visual feedback waits for the layer's next redraw. Hit testing uses the shapes' current values, which a reactive change may update before the layer redraws (at most `1 / maxfps` seconds of mismatch).
- **Other layers.**

Visual latency is at most one interval: ~33 ms at 30, 125 ms at 8, 250 ms at 4, 1 s at 1. After an idle period longer than the interval, a change redraws in the very next frame.

### 3.3 The gate (in `Layer.render()`)

```javascript
// Constructor: all throttle state is the layer's own
this._nextRenderTime = 0;   // earliest t of the next draw while maxfps > 0; 0 = draw now
this._throttleTimer = 0;
this._throttleWakeup = () => {
  this._throttleTimer = 0;
  this.invalidate();
};

// Layer.render(u, t), first lines. Returns whether the layer drew (frame counting, §5)
const maxfps = this.attributeValues.maxfps;
if (maxfps > 0) {
  if (t < this._nextRenderTime - 0.002) {
    this.waitForNextRender(t);
    return false;
  }
  // Advance by the interval instead of setting it to t, so 30 on a 60 Hz screen stays 30
  // (t only comes in steps of 16.7 ms). After a pause, start again from t.
  const interval = 1 / maxfps;
  this._nextRenderTime = t - this._nextRenderTime < interval ? this._nextRenderTime + interval : t + interval;
}
```

- The skipped layer keeps `isDirty === true`, so the stage calls it again.
- The 2 ms tolerance absorbs the jitter of rAF timestamps; without it, `maxfps="30"` on 60 Hz drops to 20 when a timestamp lands a fraction early.
- On a 144 Hz screen `maxfps="60"` alternates 2 and 3 frames and averages 60 (no common divisor; unavoidable).
- `resize()` and `connectedCallback()` set `_nextRenderTime = 0`; `disconnectedCallback()` clears `_throttleTimer`.
- `maxfps` itself may be any expression (D7); the gate reads its last value.

### 3.4 Keeping the loop alive while skipping

When a throttled layer skips a frame, something must bring it back at its next window. Nothing in the layer did that before: its children's `invalidate()` calls happen during drawing, which was skipped.

```javascript
// A short wait rides on the stage's rAF (exact vsync). A long one sleeps in a timer that wakes the layer
// about one frame early, so a page whose only animation is a 1 FPS clock runs no rAF in between.
waitForNextRender(t) {
  const remaining = this._nextRenderTime - t;
  if (remaining < 0.05) this.stage.requestRender();
  else if (!this._throttleTimer) this._throttleTimer = setTimeout(this._throttleWakeup, (remaining - 0.02) * 1000);
}
```

| Wait | Mechanism | Why |
|---|---|---|
| < 50 ms (e.g. `maxfps` ≥ 20) | `stage.requestRender()` | Vsync-exact; a timer would land between frames and lose one (30 → 20 FPS) |
| ≥ 50 ms (e.g. `maxfps` ≤ 12) | One-shot timer ~20 ms early, then rAF for the rest | The stage loop can stop between redraws; only the last frame or two run rAF |

This replaces both old variants: the first plan always requested rAF (a 1 FPS clock costs 60 empty frames per second), the second chose by `layer.isAnimated` (wrong branch, §2.2). The thresholds are first guesses to check with the prototype (D2). Timer and rAF running together is harmless: `requestRender()` ignores a second request.

### 3.5 Cost when not used

One property read and one comparison per layer render (`maxfps > 0` is false). Static layers are untouched (the stage doesn't call them).

### 3.6 Variables in a throttled layer

A `<pxl-var>` with `value="sin(t)"` inside a `maxfps="4"` layer updates 4 times per second, and so does everything reading it, also in fast layers. Rule for the docs: *put shared animated variables on the stage (Part B), or in a layer at least as fast as the fastest reader.* The other direction is fine: a fast variable read by a slow layer writes the reader's values at full rate, and the slow layer always draws the newest value.

## 4. Part B: Stage-Level `<pxl-var>`

### 4.1 Problem

A `<pxl-var id="hue" value="loop(10) * 360">` directly in the stage never evaluates (§2.8). Today it has to sit inside a layer, which costs a full-size canvas for no pixels, or inside a visible layer the author has to pick; in a hidden layer it freezes (KILOPIXEL.md "Hidden Elements and Evaluation"), in a throttled one it steps (§3.6).

### 4.2 Design

- **Registration:** `Variable.connectedCallback()`, after `super`: when `parentLayer` is `null` and the variable is inside a stage, it registers with that stage (`registerVariable` / `unregisterVariable`, stage field `_variables`). Which variables count: D6.
- **Evaluation:** `Stage.render(t)` evaluates its variables before the layer loop, through `Variable.render()`, which already catches its own errors. Readers in every layer then see this frame's value, and reactive readers are invalidated by the existing broadcast.
- **Keep-alive:** a stage variable has no layer to invalidate. The stage requests the next frame when one of its variables is animated, and `Variable` requests a frame from its stage when it becomes animated (`setAttribute('value', 't * 2')`) or registers while animated.

```javascript
// Stage.render(t), before the layers
let variablesAnimated = false;
for (let i = 0; i < this._variables.length; i++) {
  const variable = this._variables[i];
  variable.render(null, this.unit, t);
  if (variable.isAnimated) variablesAnimated = true;
}
if (variablesAnimated) this.requestRender();
```

### 4.3 Behavior

- Evaluated once per stage frame, independent of any layer's `maxfps` or `hidden`.
- Paused with the stage (out of view): `t` is wall-clock, so the value is right again in the first frame back.
- Not part of the canvas: no layer, no pixels, no hit testing.
- A `<pxl-var>` outside every stage (elsewhere on the page) is unchanged: static and reactive values work, `t` doesn't. Out of scope.

### 4.4 Relation to the Two-Phase Frame

The two-phase frame (`design/2026-11-12_two_phase_frame_plan.md`, TODO §29) would evaluate all elements before drawing; stage-level variables are a small, separate first step that doesn't depend on it. If it is built, its update phase simply starts with the stage's variables (§1.1).

### 4.5 Built 2026-11-13

As designed in §4.2, with D6 (b): every `<pxl-var>` inside a stage and outside every layer, found with `closest('pxl-stage')`.

- **`js/elements/variable.js`:** field `stage` (set only for a stage-level variable); `connectedCallback()` registers when `parentLayer` is `null`, `disconnectedCallback()` unregisters; `attributeChangedCallback()` calls `stage.requestRender()`, so a value that becomes animated starts the loop (it has no layer to invalidate).
- **`js/elements/stage.js`:** `_variables`, `registerVariable()` / `unregisterVariable()`; `render()` sorts them with the layers (`_isOrderDirty`), evaluates them before the layers and requests the next frame while one is animated.
- **Tests** (`tests/index.html`, "stage variables: …"): an animated stage variable is evaluated and readers in two layers, placed before it in the DOM, see this frame's value; the stage asks for frames while one is animated and for none when all are static; `setAttribute()` that makes one animated starts the loop; moved into a layer, back, or removed, it leaves and joins the stage's list. The `maxfps` reader of §7 waits for Part A. 69/69 pass.
- **Docs:** a paragraph at the end of `docs/walkthrough.html` section 7; `docs/DOCS_STANDARDS.md` stacking order (a variable shared by several layers goes in the stage); KILOPIXEL.md Variable, Hidden Elements, Per-Frame Data Flow, Per-Frame Render Pipeline.

## 5. Part C: Performance Monitor

### 5.1 C1: Known bug (found 2026-10-15, confirmed in the code 2026-11-05)

Observed with `scratch/text_hit/mixed.html` (not kept), a static scene that renders only on pointer movement:

- **Values freeze when idle.** `pxl.perf.publish()` is called from `stage.render()`, at most once per second. Without frames nothing publishes, so `fps` / `renderAvg` / `renderMax` keep their last values. A frozen "26 FPS" on an idle page suggests it is still rendering.
- **`fps` is "frames since the last publish".** It is not divided by the elapsed time, so the first value after a pause counts all frames of the pause interval and reads too low.

Fix: `pxl.perf` gets its own 1-second `setInterval`, started by the first `registerStage()` and stopped when the last stage unregisters. `Stage.render()` no longer publishes. On each tick, `fps = Math.round(frames / elapsedSeconds)`, and an interval without frames publishes `fps = 0`, `renderAvg = renderMax = '0.00'`. Cost: one timer per page, no per-frame work.

One effect to accept or avoid (D5): a HUD showing `ref.main.fps` is itself a reader. Each publish that changes the value redraws the HUD's layer, which counts as a frame, so an otherwise idle page shows 1 FPS (or alternates 0 / 1 if only changes are broadcast). That is honest (the HUD did redraw) but looks odd.

### 5.2 Frame counting (D4)

Today every `stage.render()` counts, including pointer-move frames in which no layer drew and, with `maxfps`, frames in which every layer skipped. Proposal: a stage frame counts only when at least one layer drew (`Layer.render()` returns `true`), and `renderAvg` / `renderMax` cover only those frames. `ref.<stage>.fps` then means "how often the picture changed", which is what an FPS counter is read as.

### 5.3 C2: Per-layer metrics

`ref.<layerId>.fps`, `.renderAvg`, `.renderMax`: how often *this* layer's canvas was redrawn and how long its own `render()` took. Needed to see that `maxfps` works (stage 60, layer 4) and to find the expensive layer.

- The layer measures its own `render()` (two `performance.now()` calls per drawn frame, well under a microsecond) and counts only frames that drew.
- Publishing: the monitor can't read `stage._layers`, so it calls a stage method that publishes the stage and its layers (one shared helper writes `fps` / `renderAvg` / `renderMax` from the counters). The counters can then become `_` fields of their classes.
- `ref.<layerId>` is broadcast once per second, only for layers with an `id`. Readers of a layer's position (`toLocal(ref.myLayer, …)`, `ref.myLayer.x`) are re-evaluated once per second as a side effect: negligible.

## 6. Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | Where is the gate? | (a) first lines of `Layer.render()`; (b) in the stage loop (old plan 2) | (a): throttle state stays in `layer.js` (`_` rule); the stage only learns whether the layer drew |
| D2 | How does a skipped layer come back? | (a) short wait via rAF, long wait via timer (§3.4); (b) always rAF (old plan 1); (c) rAF if `isAnimated`, else timer (old plan 2) | (a), thresholds checked with a prototype |
| D3 | Is the CSS-only compositing path (`alpha="wave(2)"` with nothing else animated) throttled too? | (a) yes, like everything else; (b) no, it's cheap anyway | (a): one simple rule ("the layer updates at most N times per second") |
| D4 | What does `ref.<stage>.fps` count? | (a) frames in which a layer drew; (b) every rAF tick (old plan 1) | (a) |
| D5 | The FPS display's own redraw on an idle page (§5.1) | (a) accept 1 FPS; (b) broadcast only changed values (0 / 1 alternates); (c) don't count frames caused by the monitor's own broadcast | (a) for now; revisit if it confuses in the docs |
| D6 | Which `<pxl-var>` elements does the stage evaluate? | (a) direct children of `<pxl-stage>`; (b) every one inside the stage but outside any layer (like layers, which use `closest('pxl-stage')`) | (b), decided and built 2026-11-13 |
| D7 | Can `maxfps` be an expression (`ref.speed.value`, `t`-based)? | (a) any expression, the gate reads the last value; (b) static only | (a): no extra code; docs show numbers |
| D8 | Docs | There is no Layer, Stage or Variable page yet. (a) a section in an existing page (`walkthrough.html`?); (b) wait for a Layer page | Decide when A is built |
| D9 | Build order relative to the two-phase frame (§1.1) | (a) C1 now, then decide the two-phase frame, then A (B before it as a small step if wanted); (b) build A and B now on the single pass | (a): A built now would need its keep-alive rewritten later; C1 is a bug fix and doesn't wait |

Later, not in this plan: `maxfps` on `<pxl-stage>` as a default for its layers or as a cap for the whole loop (can be added without breaking anything).

## 7. Tests (`tests/index.html`)

- **A:** a `maxfps="4"` layer with an animated shape: it draws about 4 times per second while a sibling layer draws every frame; the loop doesn't stop after the first skip; a reactive change after a long idle redraws in the next frame; a resize redraws a throttled layer at once; a disconnected throttled layer leaves no timer; a page whose only animation is a `maxfps="1"` layer runs (almost) no rAF between redraws.
- **B** (built, §4.5; the `maxfps` reader comes with A): `<pxl-var id="v" value="t">` directly in a stage with only a static layer: `ref.v.value` advances; a reader in a `maxfps` layer and a reader in a full-rate layer see the same value when both draw; `setAttribute('value', 't')` on a static stage variable starts the loop; removing it stops the loop.
- **C:** `fps` drops to `0` within about 2 seconds after the last frame; `fps` is per second after a pause; pointer moves over a static stage give `fps` 0; layer `fps` follows `maxfps`.

A manual test page with all cases side by side (layers at full rate, `maxfps` 30 / 8 / 1, a stage variable read by all of them, the monitor) goes into `design/prototypes/` (folder named like this plan) when A is built.

## 8. KILOPIXEL.md When Built

- Layer: `maxfps` in the attribute list and defaults (15 attributes), the gate, the keep-alive, the return value of `render()`.
- Stage: frame counting (`_variables` done with Part B).
- Variable: the placement rule from §3.6 (evaluation by the stage done with Part B).
- Per-Frame Render Pipeline and Per-Frame Data Flow: the gate and the keep-alive of a skipped layer (the heartbeat itself was corrected there on 2026-11-12).
- Performance Monitor: the timer, per-second `fps`, per-layer metrics.
