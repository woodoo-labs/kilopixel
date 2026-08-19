# Kilopixel — TODO & Roadmap

## 1. Documentation: Styling & Compositing Rules (`styling.html`)
- Create a dedicated `docs/styling.html` guide under "Getting Started" in the documentation sidebar.
- **Content Scope**:
  - The Universal Styling Attributes: `fill`, `stroke`, `strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`.
  - Dual Architecture Compositing: CSS DOM vs HTML5 Canvas split. `alpha`, `blend`, `filter` on `<pxl-layer>` modifies the `<canvas>` DOM element, while the same attributes on a shape modify the `ctx` operations inside the canvas buffer.
  - Zero-Inheritance Groups: Why `<pxl-group>` is a pure spatial transform container and does not support compositing attributes.
  - Static vs. Dynamic Syntax: Guidance on plain strings (`filter="blur(5)"`) vs. JavaScript Arrays for animated filters (`filter="[blur(wave(2)*10)]"`).

## 2. Evaluate Degrees vs. Radians Consistency
- **Current Status**: Mixed angular unit boundary:
  - All Kilopixel attributes use **Degrees** (`rotate`, `start`, `end`, `sweep`, `skewx`, `skewy`).
  - All expression Math functions use **Radians** (`sin`, `cos`, `tan`, `atan2`).
- **Options**:
  - **Option A (All-Degrees)**: Wrap trig functions in `pxl.scope` to take/return degrees.
  - **Option B (All-Radians)**: Standardize all attributes to radians (at expense of UX).
  - **Option C (Document Hybrid)**: Keep current behavior, add `deg(rad)` / `rad(deg)` helpers to scope.

## 3. IntersectionObserver for Offscreen Stages
- Implement an `IntersectionObserver` inside `PxlStage` alongside the existing `ResizeObserver`.
- Set a boolean flag `this.isVisible` and skip inner rendering routines when `false`.
- **Expected Benefit**: Massive reduction in battery drain and rendering overhead on documentation pages with multiple animated examples.

## 4. Implement `<pxl-out>` Declarative HTML Output Component
- **Reference**: [`design/2026-08-02_declarative_html_output_pxl_out_plan.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/design/2026-08-02_declarative_html_output_pxl_out_plan.md)
- Build the `<pxl-out>` Custom Web Component as a declarative DOM bridge.
- Allow placement anywhere in standard HTML to reactively output data (e.g., `ref.main.fps`) from the Kilopixel dependency graph without JavaScript polling.
- Resolve open design questions regarding the primary attribute syntax (`value="..."` vs `text="..."`) and built-in template literal string formatting.
