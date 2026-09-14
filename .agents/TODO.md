# Kilopixel — TODO & Roadmap

## 1. Evaluate Degrees vs. Radians Consistency
- **Current Status**: Mixed angular unit boundary:
  - All Kilopixel attributes use **Degrees** (`rotate`, `start`, `end`, `sweep`, `skewx`, `skewy`).
  - All expression Math functions use **Radians** (`sin`, `cos`, `tan`, `atan2`).
- **Options**:
  - **Option A (All-Degrees)**: Wrap trig functions in `pxl.scope` to take/return degrees.
  - **Option B (All-Radians)**: Standardize all attributes to radians (at expense of UX).
  - **Option C (Document Hybrid)**: Keep current behavior, add `deg(rad)` / `rad(deg)` helpers to scope.

## 2. Implement `<pxl-out>` Declarative HTML Output Component
- **Reference**: [`design/2026-08-02_declarative_html_output_pxl_out_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-08-02_declarative_html_output_pxl_out_plan.md)
- Build the `<pxl-out>` Custom Web Component as a declarative DOM bridge.
- Allow placement anywhere in standard HTML to reactively output data (e.g., `ref.main.fps`) from the Kilopixel dependency graph without JavaScript polling.
- Resolve open design questions regarding the primary attribute syntax (`value="..."` vs `text="..."`) and built-in template literal string formatting.

## 3. Shape Masking & Compound Clipping (Canvas Bug)
- **Issue**: Applying a `mask` (via `globalCompositeOperation`) to a Kilopixel Shape that has both a `fill` and a `stroke` breaks the output. Because Canvas renders the fill and stroke as sequential paint operations, the mask clips the layer twice (first for the fill, then again for the stroke), obliterating the expected boolean cutout.
- **Impact**: Developers cannot easily create single-layer masked shapes that have borders.
- **Options**:
  - **Option A (Explicit Caching)**: Add a `cache="true"` attribute to shapes/groups. Kilopixel would render the shape to an offscreen canvas first, then composite the flattened raster image onto the main canvas with the mask applied. (Similar to Konva's `.cache()`).
  - **Option B (Vector Clipping Node)**: Add a dedicated `<pxl-clip>` element or `clip="path-id"` attribute that maps to the native `ctx.clip()` API. This provides true mathematical vector boundaries rather than alpha-pixel clipping.
  - **Option C (Documentation Only)**: Treat it as a known Canvas limitation and advise users to only apply masks to solid shapes without strokes.

## 4. Stage-Level `<pxl-var>` Execution
- **Reference**: [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md)
- **Issue**: `<pxl-var>` elements placed directly under `<pxl-stage>` (outside any `<pxl-layer>`) are only evaluated once on mount. Because `Stage.render(t)` only iterates over `this.layers`, root-level variables never update on animation frames.
- **Impact**: Scenes requiring shared global animated state across multiple layers currently require an empty `<pxl-layer>` (and its associated canvas buffer) just to drive animated variables.
- **Proposed Solution**:
  - Update `PxlStage` to register direct `<pxl-var>` children.
  - In `Stage.render(t)`, evaluate root-level animated variables before looping through child layers, ensuring shared state is available to all layers without allocating unnecessary canvas buffers.

## 5. Declarative Math Plotting Element (`<pxl-plot>`)
- **Reference**: [`design/2026-09-07_plot_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-07_plot_element_plan.md)
- Implement a dedicated `<pxl-plot>` shape component for high-performance canvas plotting of explicit functions ($y = f(x)$) and parametric curves ($x = f(v), y = g(v)$).
- **Core Features**:
  - True mathematical upward $+Y$ orientation and strict 1:1 isotropic scaling.
  - Decoupled `scale` (pixels per unit) and `domain` (evaluation interval).
  - Pre-allocated `Float32Array` vertex caching and zero-GC animation loop.
  - Public coordinate projection API (`ref.plotId.getX(val)`, `ref.plotId.getY(val)`) for multi-layer HUD reactivity.
  - Expression compiler parameter injection in `js/compiler.js` to support math parameter tokens (`x`, `v`) in factory closures.

## 6. Layer-Level FPS Throttling (`maxfps`) & Granular Performance Profiling
- **Reference**: [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md)
- **Motivation**: Currently, all layers with active animations tick on every browser animation frame (60Hz–120Hz). Throttling secondary or slow-moving layers (e.g. background effects to 24 FPS, charts/clocks to 1–4 FPS) can dramatically cut CPU/GPU rasterization load and save battery.
- **Proposed Layer Throttling**:
  - Add `maxfps` (or `fps`) attribute to `<pxl-layer>`.
  - In the render cycle, if `t - layer._lastRenderTime < (1 / maxfps)`, skip `layer.render()` unless `layer.isDirty` (mutation/resize forces immediate repaint).
- **Rethinking Performance Metrics (Stage vs. Layer)**:
  - **Stage-level metrics (`stage.fps`, `stage.renderAvg`, `stage.renderMax`)**: Keep as macro indicators of total scene health, RAF execution rate, and overall CPU frame time.
  - **Layer-level metrics (`layer.fps`, `layer.renderAvg`)**: Introduce individual profiling on `<pxl-layer>`. Developers can observe the exact rasterization time of specific layers and verify that throttled layers are rendering at their target FPS.
