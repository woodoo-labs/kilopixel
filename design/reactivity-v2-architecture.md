# Kilopixel Reactivity v2.0: Centralized DAG Architecture

This document serves as the foundational architectural blueprint for rebuilding the Kilopixel reactivity engine. It addresses the growing complexity of the current system while strictly adhering to the framework's core tenets: **Zero-GC allocations during the 60fps render loop** and **Zero DOM Traversal**.

## 1. The Core Problem: Decentralized & Coarse Reactivity
Currently, reactivity is handled natively by the DOM elements themselves. 
- A `<pxl-text>` parses its expression, extracts `ref.layer1`, and adds itself to `pxl._subscriptions['ref.layer1']`.
- When `layer1` updates, it loops through its subscribers and calls their `variableChangedCallback`.

**Why this breaks down:**
1. **Coarse Granularity:** If a layer animates its `x` position, it broadcasts `ref.layer1`. This forces our text element to re-evaluate its `mouseX` expression, even though the mouse hasn't moved!
2. **Derived State Deadlocks:** Properties like local `mouseX` are mathematically derived from `main.mouseX`. Because the current engine only understands explicit string dependencies, intermediate nodes (like the layer itself) auto-unsubscribe from the mouse because they don't explicitly require it in their HTML attributes. This led to complicated bypass hacks.
3. **Scattered Logic:** Lifecycle hooks (`variableChangedCallback`, subscription tracking) are duplicated across `layer.js`, `group.js`, and `shape.js`.

---

## 2. The Solution: Centralized Topological Graph (DAG)
We will completely strip reactivity logic out of the custom elements and move it into a centralized `pxl.graph`.

Instead of "Elements subscribing to Elements" (e.g., `<pxl-text>` subscribes to `<pxl-layer>`), the DAG models "Properties subscribing to Properties" (e.g., `text.x` subscribes to `layer1.mouseX`).

### 2.1 The Global State Store
All reactive variables will be moved into a central flat structure.
```javascript
// A central registry mapping node IDs to their state arrays
pxl.state = {
  main: { mouseX: 500, mouseY: 500, isHovered: false },
  layer1: { x: 0, y: 0, mouseX: 0, mouseY: 0 },
  text1: { x: 0, text: '' }
};
```

### 2.2 Fine-Grained Edges
The DAG stores directional edges representing mathematical dependencies.
```javascript
// Graph edges: [Source] -> [List of Dependents]
pxl.graph.edges = {
  'main.mouseX': ['layer1.mouseX'],
  'layer1.mouseX': ['text1.x', 'text1.text']
};
```

### 2.3 The Zero-GC Topological Update Loop
When an external event occurs (like the mouse moving), we do not immediately execute callbacks. Instead, we use a classic **Dirty Flag + Topological Sort** approach:

1. **Mark Phase:** The engine marks `main.mouseX` as dirty. It walks the DAG and marks all downstream dependents (`layer1.mouseX`, `text1.x`) as `pending`.
2. **Evaluation Phase:** The engine iterates through the `pending` list in topological order. 
   - It computes `layer1.mouseX`. If the calculated value is identical to the previous frame, it unmarks downstream dependents, short-circuiting the update!
   - If it changed, it proceeds to evaluate `text1.x`.
3. **Render Phase:** The engine iterates through the scene graph, but only calls `.render()` on layers/groups that contain elements flagged as dirty.

---

## 3. Implementation Details & Zero-GC Strategies

### 3.1 Resolving Derived State Elegantly
In v2.0, the framework natively understands Derived State. When a `<pxl-layer id="layer1">` is created, the engine automatically registers internal DAG nodes bridging the absolute-to-local coordinate space.
```javascript
// The framework implicitly registers this dependency:
pxl.graph.addEdge('main.mouseX', 'layer1.mouseX', function computeLocalMouse() {
    // Inverse matrix projection goes here
    return pxl.computeLocal(pxl.state.main.mouseX); 
});
```
This entirely removes the need for `layer.render()` to compute mouse coordinates, and completely eliminates the "chicken-and-egg" render bugs.

### 3.2 Pre-allocated Graph Pools
To maintain Zero-GC, the DAG will not create closure functions or instantiate new `Set()` objects during runtime.
- The `pending` queue will be a pre-allocated `Uint32Array` or statically sized `Array`.
- Edges will be managed via parallel arrays or a pooled class structure.

### 3.3 Unified Event Hub
Hit testing and pointer events will be deeply integrated into the DAG.
Instead of `stage.js` traversing the DOM and mutating `isHovered` on elements, `stage.js` computes the hit targets and pushes the changes directly into `pxl.state`. The DAG then ripples the `isHovered` state changes directly into the specific shape attributes that depend on them (e.g., `fill="ref.btn.isHovered ? 'red' : 'blue'"`).

---

## 4. Execution Plan (When Ready)

When you are ready to trigger this rebuild, we will execute the following sequence:

#### Phase 1: Core Engine Rewrite
- Delete `pxl._subscriptions` and `variableChangedCallback` from `engine.js`.
- Implement `pxl.graph` (The DAG).
- Write the Zero-GC topological sort algorithm and update loop.

#### Phase 2: Compiler Adjustments
- Update `compiler.js` regex to parse specific property dependencies (e.g., extracting `mouseX` specifically from `ref.layer1.mouseX`).
- Refactor the compiled output closures to interact with `pxl.state` instead of `this.attributeValues`.

#### Phase 3: DOM Element Cleanup
- Strip all custom reactivity logic from `layer.js`, `group.js`, and `shape.js`.
- Custom elements will become "dumb" rendering containers that merely read from `pxl.state` when the DAG tells them to draw.

#### Phase 4: Stage & Hit Testing
- Refactor `stage.js` to dispatch events into the DAG rather than mutating child elements directly.
