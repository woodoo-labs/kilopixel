# Gradient Safety and Optimization Plan
**Date:** 2026-08-25

## 1. Goal Description
The current gradient system suffers from two core issues related to how color stops are processed:
1. **Fatal Vulnerability (IndexSizeError):** `CanvasGradient.addColorStop()` requires offsets to be strictly between `0.0` and `1.0`. If a user animates a color stop's position using time or `ref.*` variables, and the evaluated value drifts outside this range, the native Canvas API throws a fatal `IndexSizeError` DOMException. Because the Kilopixel render loop operates without `try/catch` guards for maximum performance, this single error completely halts the entire engine permanently for that page.
2. **GC Overhead (Intermediate Object Allocation):** The internal `_parseStops` function inside `compiler.js` eagerly allocates a brand-new `stops` array filled with new `{ offset, color }` objects every time a gradient expression is evaluated. When gradients are animated, this generates hundreds of small objects per second, violating the zero-GC principles of the reactive engine.

## 2. Proposed Changes

### A. Remove Eager Parsing in `compiler.js`
We will eliminate the `_parseStops` function entirely. The gradient descriptor objects (`linear()`, `radial()`, `conic()`) will now simply pass the raw `colorsArray` directly down the pipeline to the shape renderer.

**[DELETE]** Function `_parseStops` from `js/compiler.js`

**[MODIFY]** `js/compiler.js`
- Update `pxl.scope.linear`: Remove `_parseStops(colorsArray)` and attach `colors: colorsArray` directly to the returned descriptor object.
- Update `pxl.scope.radial`: Remove `_parseStops(colorsArray)` and attach `colors: colorsArray` directly to the returned descriptor object.
- Update `pxl.scope.conic`: Remove `_parseStops(colorsArray)` and attach `colors: colorsArray` directly to the returned descriptor object.

### B. Inline Parsing and Safety Clamping in `shape.js`
The `createGradient` function will take on the responsibility of parsing the raw `colorsArray` and applying it directly to the `CanvasGradient` instance without allocating any intermediate arrays. During this loop, all offsets will be safely clamped to `[0, 1]` using high-performance primitive math.

**[MODIFY]** `js/elements/shape.js`
- In `createGradient(...)`, replace the current `stops` loop with a zero-GC inline parser:
```javascript
    if (grad) {
      const colors = styleValue.colors;
      const len = colors?.length || 0;
      
      if (len > 0) {
        if (typeof colors[0] === 'string') {
          // Evenly spaced array (e.g. ['red', 'blue'])
          const step = 1 / (len - 1 || 1);
          for (let i = 0; i < len; i++) {
            grad.addColorStop(Math.max(0, Math.min(1, i * step)), colors[i]);
          }
        } else {
          // Explicit offset pairs (e.g. [0, 'red', 1, 'blue'])
          for (let i = 0; i < len; i += 2) {
            grad.addColorStop(Math.max(0, Math.min(1, colors[i])), colors[i + 1]);
          }
        }
      }
      
      // Update cache
      c.config = styleValue;
      // ...
```

## 3. Verification Plan
1. **Safety Verification:** Create an explicit test case with an animated offset designed to intentionally overshoot the bounds (e.g., `fill="linear(0, [t*2, 'red', 1, 'blue'])"`). Verify that the engine safely parks the color stop at `1.0` and continues rendering at a smooth 60fps instead of crashing.
2. **Visual Parity:** Re-run the interactive documentation (`colors.html`) to visually verify that all 4 Linear Gradient examples and all 3 Radial Gradient examples continue to render and animate perfectly with the new zero-GC inline parsing.
