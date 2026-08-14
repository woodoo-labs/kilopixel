# Implement Universal `<pxl-plot>` Element

This plan outlines the architecture and implementation for a dedicated `<pxl-plot>` shape that supports both standard mathematical functions ($y = f(x)$) and parametric equations ($x = f(v), y = g(v)$) natively in the DOM, while maintaining the engine's strict zero-GC 60fps performance requirements.

## Proposed Changes

### 1. Upgrade the Core Expression Compiler (`js/compiler.js`)
Currently, math expressions compile into a closure that only accepts `_t` (global time). We will seamlessly upgrade the compiler template to accept optional mathematical iteration parameters (`_v`, `_x`, `_y`), allowing the engine to inject variables directly into formulas at runtime.

#### [MODIFY] `js/compiler.js`
- Update the `Function` closure template in the animation path to:
  ```javascript
  return function(_t, _v, _x, _y) {
    t = _t;
    let v = _v;
    let x = _x;
    let y = _y;
    // ...
  };
  ```
- This is 100% backward-compatible. Existing shapes simply won't pass the extra parameters, causing them to safely remain `undefined` in those contexts.

### 2. Create the Plot Element (`js/elements/shapes/plot.js`)
We will create a new class `Plot extends Shape` to handle both modes.

#### [NEW] `js/elements/shapes/plot.js`
- **Observed Attributes**: `fx`, `fy`, `domain`, `steps`, `closed`, `smooth`, `mode` (optional).
  - *Note: We use `fx` and `fy` for the formulas so we preserve the standard spatial `x` and `y` attributes, allowing you to freely position the plot on the stage!*
- **Modes**:
  - `auto`: If both `fx` and `fy` exist, acts as parametric. If only `fy` exists, acts as a normal function.

**Mode 1: Normal Function ($y = f(x)$)**
If you only provide `fy`, the plot steps the physical $X$ coordinate across the screen based on the `domain`. The mathematical variable `x` is injected into your formula:
```html
<pxl-plot 
  domain="[-500, 500]"
  fy="sin(x / 50) * 100"
  stroke="blue" strokewidth="2" smooth="true">
</pxl-plot>
```

**Mode 2: Parametric Function ($x = f(v), y = g(v)$)**
If you provide both `fx` and `fy`, the plot steps an invisible parameter `v` across the `domain`. The mathematical variable `v` is injected into both formulas:
```html
<pxl-plot 
  domain="[0, 2*PI]" 
  steps="100"
  fx="sin(v) * 450"
  fy="cos(v) * 250"
  stroke="red" strokewidth="2" closed="true">
</pxl-plot>
```

> [!NOTE]
> **60fps Mathematical Animations**
> Because `<pxl-plot>` is deeply integrated with the core Kilopixel engine, you can freely use global time variables (`t`) and time drivers (like `wave(10)`) directly inside `fx` or `fy`! If the engine detects time variables, it will effortlessly re-evaluate your formula across the entire plot array at 60fps with zero GC overhead! 
> *(e.g., `fy="sin((x + t*50) / 50) * 100"` creates a continuously scrolling sine wave!)*

- **Compilation Interception**:
  - Because `fx` and `fy` must be evaluated inside a loop with a local `v` or `x`, we cannot let the global `evaluateAnimations` engine evaluate them blindly.
  - The `attributeChangedCallback` will intercept these attributes, compile them via `pxl.compileExpression`, and manually map their dependencies to `pxl.subscribeToVariable`.
- **Zero-GC Rendering (`draw` loop)**:
  - Allocate a reusable `Float32Array` based on the `steps` attribute.
  - In `draw()`, loop from `0` to `steps`, executing `fx(t, v, x)` and `fy(t, v, x)`.
  - Draw the resulting points using the standard `beginPath`/`lineTo` and Catmull-Rom spline logic (reused from `polyline.js`).
- Register as `<pxl-plot>`.

### 3. Register the Element (`build.js` & `KILOPIXEL.md`)
#### [MODIFY] `build.js`
- Add `'js/elements/shapes/plot.js'` to the file list for the bundler.
#### [MODIFY] `.agents/KILOPIXEL.md`
- Document the new element and its attributes in the framework spec.

## User Review Required

> [!IMPORTANT]
> **API Naming Convention**
> To prevent the mathematical formula from colliding with Kilopixel's universal layout engine (which uses `x` and `y` to position elements), I am proposing we name the formula attributes **`fx`** and **`fy`**. 
> 
> Example: 
> `<pxl-plot x="500" y="300" fy="sin(x) * 100"></pxl-plot>`
> *The spatial `x="500"` physically moves the plot, while the `fy` attribute uses the mathematical `x` parameter for the formula.*
> 
> Does this `fx`/`fy` naming convention look clean to you?

## Verification Plan

### Manual Verification
1. I will write the component and integrate it into the build system.
2. I will run `node build.js` to compile the framework.
3. I will replace the messy 100-point `<pxl-polyline>` string in `coordinates.html` (Section 9) with our beautiful new `<pxl-plot>` parametric element to prove that it renders the trace path flawlessly.
