# Detailed Technical Implementation: Zero-GC Matrix Tracker

This document outlines the exact technical implementation details for the "Option B" (High Performance, Zero-GC) Matrix Tracker. This will allow containers (`<pxl-layer>`, `<pxl-group>`) to natively expose `ref.id.mouseX` and `ref.id.mouseY` in pure logical coordinates without generating any garbage collection overhead.

## 1. Global State (`graphics.js`)
We will initialize a zero-allocation matrix stack in the global engine scope to track the 2D affine transform matrix (6 floats: `a, b, c, d, e, f`).
```javascript
pxl.matrixStack = new Float32Array(600); // Supports 100 nested depths
pxl.matrixDepth = 0;
pxl.currentMatrix = new Float32Array([1, 0, 0, 1, 0, 0]); // Identity [a, b, c, d, tx, ty]
pxl.needsMatrixTracking = false;
```
We will implement raw, zero-allocation math helpers: `pxl.pushMatrix()`, `pxl.popMatrix()`, `pxl.matrixTranslate(x, y)`, `pxl.matrixScale(x, y)`, and `pxl.matrixRotate(rad)`.

## 2. Compiler AST Detection (`compiler.js`)
To protect the 60fps loop, Matrix Tracking remains completely dormant unless mathematically required.
- Inside `pxl.compileExpression`, we scan the expression string for the exact regex: `/\bref\.([a-zA-Z_$][a-zA-Z0-9_$]*)\.(mouseX|mouseY)\b/`.
- If detected, we flip the global safety valve: `pxl.needsMatrixTracking = true`.
- If this flag remains `false`, the rendering loop skips all matrix math operations entirely.

## 3. Container Tracking (`layer.js` & `group.js`)
We restrict tracking to containers (Layers and Groups). Shapes (leaf nodes) will apply transforms to the `ctx` for rendering, but will NOT waste CPU cycles updating the mathematical `currentMatrix`.

Inside the `render(ctx, u, t)` loop of a Layer or Group:
1. **Push & Multiply:** If `pxl.needsMatrixTracking` is true, call `pxl.pushMatrix()`.
2. **Apply Context State:** Update `pxl.applyContextState` to accept a boolean `isContainer`. If true, it multiplies the layer/group's `x, y, rotate, scale` (in **logical units**, ignoring `u`) into `pxl.currentMatrix`.
3. **Calculate Local Mouse:** 
   - Get the Stage's absolute mouse: `absX = this.stage.attributeValues.mouseX`.
   - Calculate the **inverse** of `pxl.currentMatrix` (using raw scalar math, zero arrays allocated).
   - Multiply `absX` and `absY` by the inverse matrix to find `localX` and `localY`.
4. **Reactivity Broadcast:**
   - If `localX` or `localY` differs from `this.attributeValues.mouseX`:
   - Set `this.attributeValues.mouseX = localX`.
   - Call `pxl.broadcast(this._refKey)`.
5. **Draw Children:** The container loops over its child shapes. Because we just broadcasted the update, any child shape depending on `ref.group1.mouseX` will instantly re-evaluate its math with the fresh coordinate *before* it gets drawn!
6. **Pop:** Call `pxl.popMatrix()`.

## 5. Hit-Test Optimization (Future-Proofing vs Current Scope)
**Crucial Architectural Note:** For the current implementation, we are STRICTLY limiting the Matrix Tracker to Containers (Layers and Groups) to protect the 60fps loop. Shapes (leaf nodes) will NOT track their matrix.

However, `performance_analysis.md` highlighted a bottleneck where hit-testing walks the full parent chain for every interactive shape. If we ever decide to solve this bottleneck in the future, we will reuse the exact zero-GC math primitives built here. To fix hit-testing, we would simply expand the Matrix Tracker to *also* run for Shapes, caching the final world-transform on each shape. 

**Zero-Overhead Guarantee:** When we eventually expand this to Shapes (for `absoluteX` or hit-testing), we will use the AST Compiler to achieve zero overhead. Just like `pxl.hitTestRequestedIds`, the compiler can detect exactly which IDs are requested (e.g. `ref.planet.absoluteX`) and flag them in a `pxl.matrixRequestedIds` Set. During the render loop, only Shapes flagged in this set (or explicitly interactive shapes) will compute their matrix. The other 99.9% of shapes will perform zero math, ensuring the 60fps loop remains perfectly clean.

By building the math engine now, we lay the foundation for that future optimization, while keeping the current CPU footprint as small as possible.
