# Technical Implementation Plan: Stage-Level Variables & Layer-Level FPS Throttling

**Date**: 2026-09-14  
**Status**: Proposed Architecture & Design Specification  
**Target Files**:
- `js/elements/stage.js` (Root variable registration, master variable loop, performance metrics)
- `js/elements/layer.js` (`maxfps` attribute parsing, interval gate, loop keep-alive, layer-level metrics)
- `js/elements/variable.js` (Stage attachment registration)
- `js/monitor.js` (Publishing layer-level FPS and render times)
- `.agents/KILOPIXEL.md` (Engine reference documentation)

---

## 1. Executive Summary & Context

This design plan addresses two fundamental architectural opportunities in the Kilopixel Declarative Canvas engine:
1. **Stage-Level Variables**: Allowing `<pxl-var>` elements to live directly under `<pxl-stage>` without forcing the creation of dummy `<pxl-layer>` elements (saving GPU memory and canvas buffers).
2. **Layer-Level FPS Throttling (`maxfps`)**: Allowing developers to throttle individual layers (e.g. background grids, starfields, charts) down to 24, 4, or 1 FPS while letting foreground HUD or cursor layers run at full 60Hz/120Hz.

### Context & Discussion History
During our architectural review of `docs/coordinates.html`, Section 8 placed variables at the stage root outside any layer. Because `Stage.render(t)` historically only iterated through `this.layers`, root variables never evaluated on animation frames. To make them work, they had to be relocated into a background `<pxl-layer>`, which created an unnecessary full-screen HTML5 `<canvas>` element and backing buffer solely to hold mathematical state.

In reviewing solutions, we explored deep theoretical edge cases:
- **Cross-Layer Coupling**: What happens if a 60 FPS layer references a variable inside a 4 FPS layer?
- **Dynamic Expression Mutation**: What happens if an attribute transitions from `"5"` to `"sin(t)"` at runtime?
- **The "Baton Relay" Hazard**: Kilopixel's child shapes keep the animation loop alive by calling `parentLayer.invalidate()` inside their `render()` method (line 115 in `node.js`). If a throttled layer skips its render pass, child shapes are not rendered, the baton is dropped, and the animation loop can prematurely die on frame 1.

**The Pragmatic Conclusion ("Keep It Simple")**:  
Rather than creating an overly complex, fragile reactive dependency graph to solve theoretical 0.01% edge cases, we adopt a clean, two-part architecture:
1. **State belongs to the Stage Master Clock ($t$)**: Global variables evaluate once per frame at the top of the loop.
2. **Layers are independent Rasterization Surfaces**: `maxfps` acts as a pure, lightweight gatekeeper on the layer's 2D canvas repaints.

---

## 2. Architecture Specification

### Part 1: Stage-Level `<pxl-var>` Execution

#### 1. Registration Lifecycle
`<pxl-stage>` maintains an internal array `this.variables = []`.

```javascript
// In Stage.js:
registerVariable(v) {
  if (!this.variables.includes(v)) this.variables.push(v);
}

unregisterVariable(v) {
  pxl.removeFromArray(this.variables, v);
}
```

In `Variable.js`:
```javascript
connectedCallback() {
  this.style.display = 'none';
  const stage = this.closest('pxl-stage');
  // Register with Stage if directly parented under Stage (or regardless of nesting)
  if (this.parentElement === stage) {
    stage?.registerVariable(this);
  }
  super.connectedCallback();
}

disconnectedCallback() {
  const stage = this.closest('pxl-stage');
  stage?.unregisterVariable(this);
  super.disconnectedCallback();
}
```

#### 2. The Master Clock Loop
In `Stage.render(t)`, root variables are evaluated *before* iterating through layers:

```javascript
render(t) {
  const start = performance.now();

  // 1. Master Variable Tick (Zero Canvas Allocation)
  const varLen = this.variables.length;
  for (let i = 0; i < varLen; i++) {
    this.variables[i].evaluateAnimations(t);
  }

  // 2. Layer Rendering Pass
  if (this.isOrderDirty) {
    this.layers.sort((a, b) => 
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
    );
    this.isOrderDirty = false;
  }

  const len = this.layers.length;
  for (let i = 0; i < len; i++) {
    const layer = this.layers[i];
    if (layer.isDirty || layer.isAnimated) layer.render(this.unit, t);
  }
  ...
}
```

#### Benefits:
- **Zero-Allocation Global State**: Scenes requiring shared variables no longer allocate empty `<canvas>` layers.
- **Continuous Master Clock**: Stage variables update smoothly on the master clock $t$, so any layer sampling them gets the exact current value.

---

### Part 2: Layer-Level FPS Throttling (`maxfps`)

#### 1. Observed Attribute & Configuration
Add `'maxfps'` to `Layer.observedAttributes`:
```javascript
// In Layer.js:
static get observedAttributes() {
  return [..., 'maxfps'];
}

constructor() {
  ...
  this.maxfps = null;
  this._lastRenderTime = 0;
  this._hasAnimatedChildren = false;
}
```

When `maxfps` is specified (e.g. `maxfps="24"` or `maxfps="4"`):
- Minimum frame interval: $\Delta t_{\text{min}} = \frac{1}{\text{maxfps}}$ seconds.

#### 2. Render Gatekeeper Logic
Inside `Layer.render(u, t)`:

```javascript
render(u, t) {
  // 1. Throttle Gatekeeper for Continuous Animations
  if (this.maxfps && this.isAnimated && !this.isDirty) {
    if (t - this._lastRenderTime < (1 / this.maxfps)) {
      // KEEP-ALIVE: If we have active animations, ensure the RAF loop continues!
      this.stage?.requestRender();
      return; // Skip canvas clear and child rendering!
    }
  }

  this._lastRenderTime = t;

  // 2. Proceed with normal canvas clear & child draw pass
  ...
}
```

#### 3. Resolving the "Baton Relay" Hazard
Why line `this.stage?.requestRender()` inside the throttle skip is essential:
- In current Kilopixel, animations stay alive because child shapes call `parentLayer.invalidate()` on each frame.
- When `Layer.render()` skips a frame due to `maxfps`, child shapes are not rendered, so they cannot pass the baton.
- By having the layer call `this.stage?.requestRender()` when skipping an animated frame, the Stage knows that an animation is in flight and continues ticking until the layer's next frame window arrives.

#### 4. The Idle Reactivity Invariant
- If a layer is non-animated and has been sitting idle for $> \frac{1}{\text{maxfps}}$ (e.g. 2 seconds):
  $$\Delta t = t - \text{\_lastRenderTime} \ge \frac{1}{\text{maxfps}}$$
- When an attribute changes or user clicks an element:
  - The layer renders **immediately on the very next RAF (within 16ms)**.
  - Zero perceptible input delay for the user!

---

### Part 3: Hierarchical Performance Profiling (Stage vs. Layer)

Currently, performance metrics (`fps`, `renderAvg`, `renderMax`) exist exclusively on `<pxl-stage>`. With `maxfps`, this is insufficient because a scene running at 60 FPS might have a layer running at 4 FPS.

#### Recommended Metrics Model:
1. **`<pxl-stage>` Metrics (`ref.stageId.*`)**:
   - `fps`: Global RAF ticks per second (scene refresh rate).
   - `renderAvg` / `renderMax`: Combined execution time of all layers per frame.
   - Purpose: End-to-end scene health indicator for HUD counters.

2. **`<pxl-layer>` Metrics (`ref.layerId.*`)**:
   - `fps`: Actual number of times *this layer's canvas* repainted in the last second (verifying that `maxfps` throttling is functioning).
   - `renderAvg` / `renderMax`: Execution time spent exclusively inside this layer's 2D context drawing commands.
   - Purpose: Granular bottleneck diagnosis and layer optimization.

---

## 3. Usage Examples

### Example A: Global Shared State Without Empty Layers
```html
<pxl-stage width="800" height="600">
  <!-- Global Shared State at Stage Root: NO Canvas Buffer Allocated! -->
  <pxl-var id="globalHue" value="loop(10) * 360"></pxl-var>
  <pxl-var id="cameraX" value="wave(4) * 50"></pxl-var>

  <!-- Layer 1: Background Grid (Static) -->
  <pxl-layer id="bgLayer">
    <pxl-grid stroke="#334155" major="2"></pxl-grid>
  </pxl-layer>

  <!-- Layer 2: Animated Visuals -->
  <pxl-layer id="mainLayer">
    <pxl-circle x="400 + ref.cameraX.value" y="300" r="100" 
                fill="hsl(ref.globalHue.value, 80%, 50%)">
    </pxl-circle>
  </pxl-layer>
</pxl-stage>
```

### Example B: Throttling a Heavy Background Layer
```html
<pxl-stage width="1000" height="600">
  <!-- Heavy background throttled to 12 FPS: Saves ~80% GPU/CPU -->
  <pxl-layer id="starfield" maxfps="12">
    <!-- Hundreds of rotating, pulsing stars -->
  </pxl-layer>

  <!-- Smooth interactive cursor layer running at full 60/120 FPS -->
  <pxl-layer id="interactiveLayer">
    <pxl-circle x="mouse.x" y="mouse.y" r="12" fill="#38bdf8"></pxl-circle>
  </pxl-layer>
</pxl-stage>
```

---

## 4. Verification & Testing Plan

### Automated Build Verification
1. Run `node build.js` to ensure modified files (`stage.js`, `layer.js`, `variable.js`, `monitor.js`) bundle cleanly into `dist/kilopixel.js` with zero Terser syntax or reference errors.

### Functional Test Cases
1. **Stage-Level Variable Ticking**:
   - Create a stage with `<pxl-var id="val" value="t"></pxl-var>` directly under `<pxl-stage>`.
   - Verify `ref.val.value` continuously increments over time without any `<pxl-layer>` present.
2. **Layer Throttling (`maxfps="4"`)**:
   - Place an animated circle (`x="wave(1)*100"`) inside a layer with `maxfps="4"`.
   - Inspect `ref.layer.fps` to verify it registers 4 repaints per second while `ref.stage.fps` reports 60.
   - Verify that the animation does not stall or die on frame 1.
3. **Idle Reactive Responsiveness**:
   - On a static layer with `maxfps="1"`, call `circle.setAttribute('fill', 'red')` from the console after 5 seconds of idle time.
   - Verify the color changes on the very next frame without waiting 1000ms.
4. **Cross-Layer Reading**:
   - Place a Stage-level variable ticking at master rate.
   - Read it from both a 60 FPS layer and a 4 FPS layer.
   - Verify both layers render without console warnings or stuttering.
