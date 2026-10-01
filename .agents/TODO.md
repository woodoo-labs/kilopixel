# Kilopixel — TODO & Roadmap

## 1. Native SVG Path2D & Vector Sprites (`<pxl-path>`)
- **Status**: 🟢 **Design Complete & Ready for Implementation**
- **Reference**: [`design/2026-09-30_path_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-30_path_element_plan.md)
- **Core Features**:
  - Direct integration with native browser `Path2D` API for sub-1 KB bundle footprint.
  - Native copy-paste support for SVG icons (Figma, Lucide, Heroicons, Material, FontAwesome).
  - Dual-format `viewbox` (space-separated string `"0 0 24 24"` or array `[0, 0, 24, 24]`).
  - First-class SVG vector sprite-sheet support via dynamic array `viewbox="[ref.frame.value * 24, 0, 24, 24]"`.
  - Non-scaling stroke normalization (`strokewidth / avgScale`) and 9-point anchor alignment.
  - Multi-path and duotone composition via `<pxl-group>` or sub-path `M` (MoveTo) concatenation.

## 2. Compound Vector Clipping Element (`<pxl-clip>`)
- **Status**: 🟢 **Design Complete & Ready for Implementation**
- **Reference**: [`design/2026-09-29_pxl-clip_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-29_pxl-clip_element_plan.md)
- **Problem Solved**: Fixes the Canvas 2D bug where applying a `mask` to a shape with both a `fill` and `stroke` obliterates the cutout.
- **Core Features**:
  - Dedicated structural container element `<pxl-clip>` mapping to native `ctx.clip()`.
  - Supports compound path unions, `fillrule="evenodd"` boolean holes, and nested intersection clipping without offscreen canvas buffers.

## 3. Animation, Easing & Physics Expansion (`tween`, `ease`, `spring`)
- **Status**: ⚪ **Concept Stage**
- **Motivation**: Current time drivers are strictly periodic loops (`loop`, `wave`, `bounce`). Interactive UIs need one-shot animations and smooth organic state transitions.
- **Proposed Additions**:
  - **One-Shot Tweens (`tween(duration, [ease], [delay])`)**: Progresses 0 to 1 once and clamps at 1.0 forever (essential for entrance/exit animations).
  - **Penner Easing Suite (`ease('back', p)`, `ease('elastic', p)`)**: Adds overshoot, bounce decay, and exponential curves beyond basic `glide()`.
  - **Stateful Physics Springs (`spring(target, [stiffness], [damping])`)**: Eliminates instant snapping on reactive state changes (e.g. `ref.btn.isHovered ? 1.2 : 1.0`) by maintaining zero-GC velocity state per element attribute.
  - **Angle & Vector Helpers**: `deg(rad)` and `rad(deg)` to resolve the degrees vs. radians boundary ergonomically.

## 4. Evaluate Degrees vs. Radians Consistency
- **Current Status**: Mixed angular unit boundary:
  - All Kilopixel attributes use **Degrees** (`rotate`, `start`, `end`, `sweep`, `skewx`, `skewy`).
  - All expression Math functions use **Radians** (`sin`, `cos`, `tan`, `atan2`).
- **Resolution Plan**: Keep current hybrid behavior (best ergonomics for declarative HTML), but inject `deg(rad)` and `rad(deg)` helpers into `pxl.scope` as part of the animation expansion.

## 5. Implement `<pxl-out>` Declarative HTML Output Component
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-08-02_declarative_html_output_pxl_out_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-08-02_declarative_html_output_pxl_out_plan.md)
- **Core Features**:
  - Custom Web Component acting as a declarative DOM bridge outside `<pxl-stage>`.
  - Reactively outputs canvas telemetry (e.g., `ref.main.fps` or coordinates) without JavaScript polling.

## 6. Stage-Level `<pxl-var>` Execution
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md)
- **Problem Solved**: Direct child `<pxl-var>` elements under `<pxl-stage>` currently do not evaluate during animation frames.
- **Proposed Solution**: Update `PxlStage` to register direct `<pxl-var>` children and evaluate animated variables before the layer render loop, avoiding unnecessary empty `<pxl-layer>` buffers.

## 7. Declarative Math Plotting Element (`<pxl-plot>`)
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-09-07_plot_element_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-07_plot_element_plan.md)
- **Core Features**:
  - Dedicated shape element for high-performance plotting of functions ($y = f(x)$) and parametric curves ($x = f(v), y = g(v)$).
  - Upward $+Y$ mathematical orientation, 1:1 isotropic scaling, decoupled domain intervals, and pre-allocated `Float32Array` vertex caching.

## 8. Layer-Level FPS Throttling (`maxfps`) & Granular Profiling
- **Status**: 🟡 **Plan Drafted**
- **Reference**: [`design/2026-09-14_stage_variables_and_layer_throttling_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-09-14_stage_variables_and_layer_throttling_plan.md)
- **Core Features**:
  - Add `maxfps` attribute to `<pxl-layer>` to throttle secondary layers (e.g. background effects to 24 FPS, clocks to 1 FPS).
  - Add per-layer profiling telemetry (`layer.fps`, `layer.renderAvg`).

## 9. Raster Bitmaps & Complex SVG Graphics (`<pxl-image>`)
- **Status**: ⚪ **Concept Stage**
- **Motivation**: Complete the visual asset suite by allowing developers to load raster images (PNG, JPEG, WebP) and complex multi-color SVGs directly into the canvas via native `ctx.drawImage()`, with aspect-ratio fitting (`contain` / `cover`) and anchor transforms.

## 10. Evaluate `map()` Utility Retention vs. API Pruning
- **Current Status**: Open design question
- **Background**:
  - `pxl.scope.map(v, inMin, inMax, outMin, outMax)` provides linear range remapping (familiar from Processing/p5.js).
  - It is currently only used in `examples/test31.html` for distance-to-style mapping, but all such calculations can be written using `lerp(a, b, t)` with normalized progress or raw arithmetic.
- **Options to Investigate**:
  - **Option A (Prune `map()`)**: Remove `map()` from `pxl.scope` to minimize the standard library footprint, eliminate redundant ways of interpolating values alongside `lerp()`, and prevent naming confusion with `Array.prototype.map` or coordinate mapping. Migrate `examples/test31.html` to `lerp()`.
  - **Option B (Retain `map()`)**: Keep `map()` as a convenient 1-line helper for creative coders who want to avoid manual `/ (inMax - inMin)` normalization algebra inside HTML attribute strings.

