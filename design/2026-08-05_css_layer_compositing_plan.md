# Layer CSS Compositing Upgrade

This plan finalizes the architectural separation of context states in Kilopixel by migrating `<pxl-layer>`'s context states (`alpha`, `blend`, `filter`) from the Canvas API to the CSS DOM API.

## Goal Description
Kilopixel layers are implemented as physically separate `<canvas>` DOM elements stacked via CSS absolute positioning. Currently, applying `blend`, `alpha`, or `filter` to a `<pxl-layer>` sets the Canvas API `globalCompositeOperation` on its internal context. This incorrectly causes the layer's children to blend/overlap with *each other* on an empty canvas, rather than blending the flattened layer against the background.

By mapping `<pxl-layer>`'s context states to CSS (`opacity`, `mix-blend-mode`, `filter`), layers will behave like true "Photoshop Layers", perfectly compositing into the background.

## Architecture Rules Established
1. **`<pxl-layer>`**: Handles all flattened layer compositing. `alpha`, `blend`, and `filter` are mapped to CSS. (Note: `mask` is intentionally ignored by Layers because masking an entire DOM element against the background requires CSS Masks, which is outside the scope of basic compositing).
2. **`<pxl-group>`**: Remains purely spatial for maximum performance. Context states are ignored.
3. **`<pxl-circle>`, `<pxl-rect>`, etc.**: Handles raw Canvas API context states. If a developer wants shapes to multiply against each other, or mask each other, they apply `blend` or `mask` directly to the shapes.

## Proposed Changes

### [js/graphics.js](file:///C:/Users/micha/woodoo-labs/kilopixel/js/graphics.js)
- **[MODIFY]** `pxl.applyContextState`
  - Add `mask` to the destructured attributes.
  - Prioritize `mask` over `blend` when setting `ctx.globalCompositeOperation`. 
  - **[PERF/GC OPTIMIZATION]**: Fix the `filter.join(' ')` memory leak. Currently, if `filter` is an array of dynamic helpers, `join(' ')` allocates a new string every frame, thrashing the Garbage Collector. We will implement a fast Array shallow-compare: only `join` and `scaleResponsiveFilter` if the array's contents have actually changed!

### [js/elements/shape.js](file:///C:/Users/micha/woodoo-labs/kilopixel/js/elements/shape.js)
- **[MODIFY]** `render()`
  - Add `mask !== 'none'` to the `hasStateChanges` boolean flag, ensuring we retain our Phase 1 zero-cost early exit for shapes that don't need context states.

### [js/elements/node.js](file:///C:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js)
- **[MODIFY]** `constructor()` and `attributeChangedCallback`
  - Add `mask` to the list of `pxl.attributes` defaults.

### [js/elements/stage.js](file:///C:/Users/micha/woodoo-labs/kilopixel/js/elements/stage.js)
- **[MODIFY]** `render(t)`
  - **[EDGE CASE FIX]**: Change the render loop to `if (layer.isDirty || layer.isAnimated) layer.render(this.unit, t);`. We must separate the "Canvas Needs Redraw" flag (`isDirty`) from the "Layer Needs Animation Check" flag (`isAnimated`), otherwise the `cssOnly` fast path will never execute!

### [js/elements/layer.js](file:///C:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js)
- **[MODIFY]** `render(u, t)`
  - Remove `pxl.applyContextState(ctx, u, this.attributeValues, this)` from the layer's internal render loop.
  - After `evaluateAnimations(t)`, manually sync `this.attributeValues.alpha`, `blend`, and `filter` to `this.canvas.style.opacity`, `mixBlendMode`, and `filter`.
  - **[PERF/GC OPTIMIZATION]**: Utilize the same fast Array shallow-compare for `filter` as `graphics.js` to ensure zero string allocation garbage during the 60fps layer sync loop.
  - **[NEW] `cssOnly` Fast Path**: If a layer is animating, but its transforms (`x`, `scale`, etc.) are NOT animated, and its children are NOT dirty (`!this.isDirty`), we can completely skip `ctx.clearRect` and the child redraw loop! We just sync the CSS, call `this.stage?.requestRender()` to keep the loop alive, and `return`.
  - **[HEARTBEAT FIX]**: Change `if (this.isAnimated) this.invalidate();` at the end of the render loop to `if (this.isAnimated) this.stage?.requestRender();`. This keeps the animation loop alive *without* accidentally marking the canvas as dirty!
- **[MODIFY]** `connectedCallback()`
  - Add `this.invalidate()` to the end of `connectedCallback()`. If a layer is reparented to a new Stage, we must force `isDirty = true` so the `cssOnly` fast path is temporarily bypassed, guaranteeing the canvas is redrawn at the correct scale.

## Documentation & Example Updates

### [examples/test40.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test40.html)
- **[MODIFY]**: Change the two `<pxl-circle blend="destination-in">` masking elements to use the new `mask="destination-in"` attribute instead.

### [.agents/KILOPIXEL.md](file:///C:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md)
- **[MODIFY]** `Style Cascade & Inheritance`: Rewrite this section to clearly explain the new Dual Architecture (Layers = CSS DOM properties, Shapes = Canvas API properties).
- **[MODIFY]** `Element Reference — Layer`: Remove `shadow*` attributes from the list. Explain that `blend` maps to CSS `mix-blend-mode` and `alpha` maps to CSS `opacity`.
- **[MODIFY]** `Element Reference — Shape`: Add `mask` to the list of observed attributes. Explain that `mask` is strictly for Porter-Duff masking operators like `destination-out`.

## Verification Plan
- Run `node build.js` to compile the framework.
- Verify `examples/test40.html` clipping masks still work with the new `mask` attribute.
- Verify `examples/test18.html` fades perfectly as a unified flat image using the new `cssOnly` fast path.
