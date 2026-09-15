# Layer Throttling (`maxfps` Attribute)

> **Date**: 2026-09-14 (revised 2026-09-15)
> **Status**: Design — awaiting approval
> **Scope**: `<pxl-layer>` element, stage render loop, performance monitor

## Goal

Introduce a `maxfps` attribute on `<pxl-layer>` that caps how often a layer renders per second. This serves two purposes:

1. **Performance savings** — reduce CPU/GPU work for layers that don't need full refresh rate (decorative backgrounds, slow transitions, ambient effects).
2. **Predictable frame budgets** — a layer with `maxfps="30"` renders at most 30×/sec regardless of monitor refresh rate (60Hz, 120Hz, 144Hz).

> [!NOTE]
> **Animation speed is already monitor-independent.** Because `t` is wall-clock seconds (`performance.now() / 1000`), expressions like `rotate="t * 90"` produce identical motion on any monitor. `maxfps` controls rendering frequency, not animation math.

---

## API Design

### Attribute

| Attribute | Element | Type | Default | Description |
|-----------|---------|------|---------|-------------|
| `maxfps` | `<pxl-layer>` | number | `0` | Maximum renders per second. `0` = no limit (current behavior). |

```html
<!-- Ambient background at 8fps — saves ~87% render work vs 60fps -->
<pxl-layer maxfps="8">
  <pxl-circle x="500" y="300" r="400" fill="hsl(loop(10) * 360, 50, 20)"></pxl-circle>
</pxl-layer>

<!-- Full-speed interactive layer (default, no attribute needed) -->
<pxl-layer>
  <pxl-rect id="btn" x="500" y="300" w="120" h="50"
    fill="ref.btn.isHovered ? '#555' : '#888'"
    onclick="ref.counter.set('value', ref.counter.value + 1)"></pxl-rect>
</pxl-layer>
```

### Why `maxfps` and Not `fps`

`maxfps` communicates a **ceiling**, not a target. A developer won't expect `maxfps="4"` to mean "render exactly 4 times per second regardless." It clearly means "at most 4." A layer with `maxfps="30"` on a system that can only sustain 20fps will show 20fps — the attribute never forces a higher rate.

---

## Core Mechanism

### Timestamp Gate in `stage.render()`

The throttle is a single timestamp comparison in the stage's render loop. When a throttled layer hasn't waited long enough since its last render, it's skipped. The `isDirty` flag stays `true` so the next eligible frame picks it up.

```javascript
// In stage.render(t):
for (let i = 0; i < len; i++) {
  const layer = this.layers[i];
  if (layer.isDirty || layer.isAnimated) {
    if (layer._maxFps && (t - layer._lastRenderTime) < layer._minInterval) {
      continue; // skip — leave isDirty true for next eligible frame
    }
    layer.render(u, t);
    layer._lastRenderTime = t;
  }
}
```

**Key properties**:
- **Vsync-aligned**: `t` comes from rAF's timestamp, so renders snap to the nearest vsync boundary. No drift, no jitter.
- **Batching**: Multiple reactive changes that arrive between throttle windows are naturally coalesced — only the final state is rendered.
- **Zero cost when idle**: Static layers without `maxfps` are completely unaffected (no `isDirty`, no `isAnimated` → not even evaluated).

### What Gets Throttled

**Everything.** Both animation heartbeats and reactive invalidations are subject to the same gate. This is the simplest correct behavior and avoids a loophole where high-frequency reactive sources (e.g., an animated `<pxl-var>` in a fast layer broadcasting to a slow layer) would bypass the throttle entirely.

| Trigger | Throttled? | Rationale |
|---------|-----------|-----------|
| Animation heartbeat (`isAnimated`) | ✅ Yes | Primary use case — reduce continuous render work |
| Reactive `ref.*` broadcast | ✅ Yes | Prevents fast producers from defeating the throttle |
| Direct `setAttribute()` on layer's children | ✅ Yes | Consistent behavior — the layer renders at its capped rate |
| Pointer events / interaction | ❌ No | Hit testing and event dispatch run in `interaction.process()`, which is independent of layer rendering |

### Visual Feedback Latency

A throttled layer's visual updates are delayed by up to `1000 / maxfps` milliseconds:

| `maxfps` | Max visual latency |
|----------|--------------------|
| `60` | ~16ms (imperceptible) |
| `30` | ~33ms (barely noticeable) |
| `8` | ~125ms (fine for ambient effects) |
| `4` | ~250ms (noticeable for UI) |
| `1` | ~1000ms (only for very slow effects) |

**Interaction events are NOT delayed.** Click handlers, hover state changes, and all event dispatch happen at full rAF speed via `interaction.process()`. Only the canvas redraw is throttled.

---

## rAF Lifecycle Management

### The "Baton Relay" Problem

Kilopixel's animation loop stays alive through a relay pattern: at the end of `layer.render()`, animated layers call `this.stage?.requestRender()` to schedule the next rAF. When the throttle gate **skips** a layer's render, this heartbeat never fires — the baton is dropped and the animation loop dies on the very next skip.

```
t=0ms:     Animated throttled layer renders → heartbeat fires → schedules rAF
t=16ms:    rAF fires → stage.render() → gate: 16ms < 250ms → SKIP
           layer.render() never runs → heartbeat never fires → no next rAF → DEAD 💀
```

### Dual Keep-Alive Strategy

The gate skip block handles two cases:

```javascript
// In stage.render(), when gate skips a throttled layer:
if (layer._maxFps && (t - layer._lastRenderTime) < layer._minInterval) {
  if (layer.isAnimated) {
    // BATON RELAY: animated layers need rAF to keep ticking.
    // This is NOT a new rAF loop — it was already running for this layer.
    // The gate just makes each tick cheaper by skipping canvas work.
    this.requestRender();
  } else if (layer.isDirty && !layer._throttleTimer) {
    // ONE-SHOT TIMER: non-animated layers have no heartbeat.
    // Schedule a single wake-up to flush the dirty flag.
    const remaining = layer._minInterval - (t - layer._lastRenderTime);
    layer._throttleTimer = setTimeout(() => {
      layer._throttleTimer = null;
      layer.invalidate();
    }, remaining * 1000);
  }
  continue;
}
```

| Layer type | Keep-alive mechanism | Why |
|---|---|---|
| **Animated + throttled** | `requestRender()` (baton relay) | rAF was already running. Gate just skips render work. Vsync-aligned, zero drift. |
| **Reactive-only + throttled** | One-shot `setTimeout` | No heartbeat exists. Timer fires once, calls `invalidate()`, done. Sync precision doesn't matter (no smooth motion). |
| **Unthrottled** | Existing heartbeat (unchanged) | No gate, no changes needed. |
| **Static, no `maxfps`** | Nothing (unchanged) | Zero rAF, zero cost. |

**Safety guarantees**:
- Animated baton relay adds zero new rAF loops — the loop was already running for this layer.
- The `setTimeout` is one-shot and guarded by `_throttleTimer` to prevent duplicates.
- The timer is cleaned up in `disconnectedCallback`.

---

## Performance Metrics

### Stage-Level `fps` Counter

Only count frames where actual canvas work happened:

```javascript
// In stage.render(t):
let anyLayerRendered = false;

for (let i = 0; i < len; i++) {
  const layer = this.layers[i];
  if (layer.isDirty || layer.isAnimated) {
    if (layer._maxFps && (t - layer._lastRenderTime) < layer._minInterval) {
      if (layer.isAnimated) {
        this.requestRender(); // baton relay
      } else if (layer.isDirty && !layer._throttleTimer) {
        const remaining = layer._minInterval - (t - layer._lastRenderTime);
        layer._throttleTimer = setTimeout(() => {
          layer._throttleTimer = null;
          layer.invalidate();
        }, remaining * 1000);
      }
      continue;
    }
    layer.render(u, t);
    layer._lastRenderTime = t;
    anyLayerRendered = true;
  }
}

if (anyLayerRendered) {
  const ms = performance.now() - start;
  this.perfAccumulated += ms;
  if (ms > this.perfMax) this.perfMax = ms;
  this.perfFrames++;
}
```

This ensures `ref.main.fps` reports meaningful values — the actual composite rendering rate, not inflated by idle rAF ticks.

---

## `<pxl-var>` and Cross-Layer References

### Rule: A Variable Updates at Its Layer's Rate

A `<pxl-var>` with an animated `value` (e.g., `value="sin(t)"`) evaluates inside `layer.render()`. If its layer is throttled, the variable only updates at that throttled rate.

| Variable placement | Variable update rate | Consumer in 60fps layer sees |
|--------------------|---------------------|------|
| Unthrottled layer | 60fps | Smooth 60fps updates ✅ |
| `maxfps="4"` layer | 4fps | Stepped 4fps updates ⚠️ |

**This is intentional and documented behavior:**

> *Place animated variables in a layer that runs at least as fast as the fastest consumer.*

Since `<pxl-var>` is invisible, it costs nothing to place it in any layer — put it where it makes sense.

### Reverse Direction: Fast Variable → Slow Consumer

A 60fps variable broadcasting to a shape in a 4fps layer: the reactive callback writes the latest value to `attributeValues` at 60fps (in memory), but the canvas only redraws at 4fps. The rendered frame always shows the most recent value — never stale.

---

## Proposed Changes

### `js/elements/layer.js`

#### [MODIFY] [layer.js](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js)

- Add `maxfps` to `observedAttributes` list.
- Add `maxfps: 0` to default `attributeExpressions` / `attributeValues`.
- Add internal properties: `_maxFps`, `_minInterval`, `_lastRenderTime`, `_throttleTimer`.
- In `attributeChangedCallback` (inherited from PxlNode): `maxfps` attribute compiles normally. Add a post-compile hook or override to compute `_minInterval = 1 / maxfps` when `maxfps` changes.
- In `disconnectedCallback`: clear `_throttleTimer` if active.

---

### `js/elements/stage.js`

#### [MODIFY] [stage.js](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/stage.js)

- Modify `render(t)` loop: add the throttle gate check before `layer.render()`.
- Add baton relay (`requestRender()`) when gate skips an animated layer.
- Add `setTimeout` scheduling for non-animated throttled layers when the gate skips them.
- Move performance metric accumulation to only count frames where `anyLayerRendered` is true.
- Keep `interaction.process()` outside the gate — it always runs at full speed.

---

### `.agents/KILOPIXEL.md`

#### [MODIFY] [KILOPIXEL.md](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md)

- Add `maxfps` to Layer's observed attributes list and defaults.
- Document throttling behavior in the Layer reference section.
- Add a note about variable placement in the Variable reference section.
- Update the Per-Frame Render Pipeline section to include the throttle gate.

---

## Verification Plan

### Automated

- `node build.js` — build completes without errors.

### Manual Testing

Create a test page (`scratch/throttle-test.html`) with:
1. **Layer A** — unthrottled, animated (verify still runs at full speed).
2. **Layer B** — `maxfps="4"`, animated (verify visually slower updates, animations still smooth when they render because `t` is wall-clock).
3. **Layer C** — `maxfps="8"`, reactive only (verify responds to slider/setAttribute within ~125ms).
4. **Layer D** — static, no `maxfps` (verify zero-cost, renders only on demand).
5. **Cross-layer ref** — animated `<pxl-var>` in Layer A, consumer shape in Layer B (verify Layer B updates at 4fps, not 60fps).
6. **Interactive button** in Layer B (verify click handler fires immediately, visual feedback delayed up to 250ms).
7. **Performance monitor** — `ref.main.fps` shows meaningful values (not inflated by idle frames).
8. **Baton relay** — throttled animated layer does NOT stall on frame 1. Animation continues indefinitely at the throttled rate.
9. **Dynamic reclassification** — change an attribute from static (`r="50"`) to animated (`r="50 + wave(2) * 30"`) at runtime via `setAttribute`. Verify throttling still applies correctly after the layer becomes animated.
10. **Disconnect/reconnect** — remove and re-add a throttled layer to the DOM. Verify `_throttleTimer` is cleaned up and layer resumes correctly.

---

## Future Enhancements

> [!NOTE]
> **Per-layer metrics** (`ref.layerId.fps`, `ref.layerId.renderAvg`, `ref.layerId.renderMax`): Each layer could track its own actual render count and timing, making it easy to verify throttling is working and diagnose per-layer bottlenecks. This is additive — can be layered on without changing the throttle mechanism.

> [!NOTE]
> **Stage-level `<pxl-var>`**: Allow `<pxl-var>` directly under `<pxl-stage>` (not inside any layer). The stage would evaluate these in a "master clock" loop before iterating layers, making them independent of any layer's throttle rate. Useful for shared animated state that multiple layers consume at different rates.

---

## Open Questions

> [!IMPORTANT]
> **Static `maxfps` only?** Should `maxfps` support animated expressions (e.g., `maxfps="ref.speed.value"`)? This would allow runtime speed control but adds complexity to the `_minInterval` computation. Recommendation: start with static-only values for v1.

> [!IMPORTANT]
> **Stage-level default?** Should `<pxl-stage>` support a `maxfps` attribute that sets the default for all its layers? This would be convenient for pages where every layer should be throttled. Could be added later without breaking changes.
