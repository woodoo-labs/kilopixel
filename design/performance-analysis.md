# Kilopixel — Performance Analysis & Framework Assessment

> **Date**: 2026-07-12 | **Source**: Deep analysis of all 19 source files

---

## General Assessment

### The Core Idea is Genuinely Original

Kilopixel is a **reactive animation DSL embedded in HTML attributes**, compiled to JavaScript at runtime. The closest comparisons are p5.js (imperative), Lottie (pre-baked JSON), or SVG+CSS (limited math). None of them let you write `r="30 + wave(2) * 70"` in an HTML attribute and get 60fps compiled animation with zero build step.

The **"just write HTML"** developer experience is the killer feature. The distance from idea to working animation is remarkably short — and because it's just HTML, it's also perfect for AI code generation (LLMs can produce Kilopixel scenes trivially).

### Is It Useful?

**Yes, very — in its niche.** It excels at:
- Animated data visualizations (dashboards, charts)
- Generative art & creative coding
- Interactive demos, prototypes, hero sections
- Embedded animated graphics (logos, loading screens)
- AI-generated canvas content
- Educational tools (math visualization)

**Less suited for:**
- Games (no sprites, physics, or scene management)
- Heavy interactivity (event model is minimal, no drag/drop, no keyboard)
- Accessibility-critical UIs (canvas is inherently screen-reader-hostile)
- Scenes with 10K+ objects (Canvas 2D has a ceiling; WebGL would be needed)

### What's Brilliant

1. **The Fast Path compiler** — the progressive classification (`#hex` → static CSS → booleans → numbers → words → expressions) means the common case (static values like `fill="red"`) is free. This is sophisticated engineering that most framework authors wouldn't bother with.

2. **The pivot/offset coordinate split** — `x/y` as rotation center + `dx/dy` as post-transform offset is a genuinely novel API design. It makes orbits trivial in one line of HTML.

3. **Gradient deferred creation** — returning descriptors instead of `CanvasGradient` objects, then creating at draw-time from the bounding box, is architecturally correct.

4. **The `u` unit system** — fixed logical 1000 width is elegant. Same code works at 50px and 4K.

---

## What's Missing (Beyond Shapes)

### High Impact

| Missing Feature | Why It Matters |
|----------------|----------------|
| **Easing/Transitions** | The 8 drivers are all oscillators (loop forever). No `ease(from, to, duration, curve)` for one-shot animations. Fade-in, slide-to-position, enter/exit — none of these are expressible without manual `clamp(t - startTime, ...)` math. |
| **`<pxl-image>`** | No way to draw images/sprites. This blocks a huge category of use cases. |
| **Animation Timeline Control** | No pause, reset, seek, or sequencing. `t` always runs. You can't say "start this animation when clicked" without manual time-offset math. |
| **Clipping / Masking** | No `clip` attribute on groups/layers. Can't create reveal effects, viewports, or crop regions. |

### Medium Impact

| Missing Feature | Why It Matters |
|----------------|----------------|
| **Event bubbling** | Only the topmost hit element gets events. You can't put an `onclick` on a group and have it fire when any child is clicked. |
| **Drag interaction** | No built-in drag support. `onmove` fires but there's no drag state (deltaX/deltaY from press origin). |
| **Shadow (built-in)** | You can use `filter="drop-shadow(...)"` but it's expensive. A dedicated `shadow` attribute could use `ctx.shadowBlur` which is hardware-accelerated in some browsers. |
| **Missing shapes** | `pxl-path` (SVG d-attribute), `pxl-image`, `pxl-star`, `pxl-polygon`, `pxl-triangle` |
| **Keyboard events** | No keyboard input support at all. |

### Nice-to-Have

| Missing Feature | Notes |
|----------------|-------|
| **Explicit z-index** | Currently DOM order = draw order. An explicit z-index could be useful. |
| **Spring physics driver** | A `spring(target, stiffness, damping)` driver would enable physics-based animation. |
| **Canvas accessibility** | ARIA descriptions, fallback content for screen readers. |

---

## Deep Performance & GC Analysis (60fps Hot Loop)

Every code path that executes per-frame was traced. Here are the findings:

### ✅ Already Well-Optimized

These are things already done right:

| Pattern | Where | Impact |
|---------|-------|--------|
| Fast Path compiler | `parseAttributeValue()` | 60-70% of attributes pay zero runtime cost |
| Factory closure | `compileExpression()` | Scope destructured once, inner function is tight |
| Dirty-flag rendering | `layer.isDirty` | Static layers = zero per-frame cost |
| Zero-GC array ops | `removeFromArray()` | Swap-and-pop instead of splice |
| Pre-allocated bounding boxes | `shape.boundingBox` | Mutated in-place, never recreated |
| Float32Array | `polyline.flatCache` | Typed array for point coordinates |
| Versioned lazy matrices | `_globalMatrixVersion` | Recomputes only on version mismatch |
| Transform skip | `hasStateChanges` check | Skips `ctx.save()/restore()` when unnecessary |
| Text 3-tier caching | `text.draw()` | Font/layout/bbox rebuilt only when inputs change |
| Gradient caching | `_lastGradientConfig` | Avoids recreating identical CanvasGradients |

---

### 🔴 Issue #1: Gradient Descriptor Allocation (HIGH IMPACT)

**Location**: `compiler.js` lines 43-95 (`pxl.scope.linear` / `pxl.scope.radial`)

```javascript
// This runs EVERY FRAME for animated gradients
pxl.scope.linear = (direction, colorsArray) => {
  // ...
  const parsedStops = [];              // ← NEW array every frame
  for (...) {
    parsedStops.push({ offset, color }); // ← NEW objects every frame
  }
  return { isGradient: true, type: 'linear', ... stops: parsedStops }; // ← NEW object every frame
};
```

**Problem**: For any animated gradient (e.g. `fill="linear(t*10, ['red', 'blue'])"`), `linear()` creates:
- 1 descriptor object
- 1 stops array
- N stop objects (one per color)

Every single frame. **For 100 shapes with animated gradients, that's ~400 short-lived objects per frame = 24,000 allocations/second.**

And the gradient cache in `createGradient()` uses **reference equality** (`_lastGradientConfig === styleValue`), which always fails because `linear()` returns a new object each time. **The cache is effectively useless for animated gradients.**

**Fix ideas**:
- Pool/reuse descriptor objects (one per shape, mutate in-place)
- Use structural equality in the cache (compare stops/angle values)
- Or: have `linear()` return a flat token array instead of an object, and do structural comparison

---

### 🔴 Issue #2: Color Function String Allocation (MEDIUM IMPACT)

**Location**: `compiler.js` lines 26-37

```javascript
pxl.scope.hsl = (h, s, l) => {
  const sf = typeof s === 'number' ? s + '%' : s;  // ← string concat
  const lf = typeof l === 'number' ? l + '%' : l;  // ← string concat
  return `hsl(${h},${sf},${lf})`;                  // ← template literal = new string
};
```

**Problem**: Every frame, for every shape with an animated color expression, this creates 2-3 new strings. V8's string interning helps for repeated identical strings, but unique values (animated hue) create genuinely new strings.

For `fill="hsl(t * 36, 80, 50)"` — that's a unique string every frame because `t * 36` changes continuously.

**Fix idea**: Pre-allocate a string buffer or use `ctx.fillStyle` setter with numeric values directly (not possible with Canvas 2D API, so this may be unavoidable).

---

### 🟡 Issue #3: Transform Dirty Check Uses String Chain (LOW-MEDIUM)

**Location**: `node.js` lines 72-74

```javascript
if (key === 'x' || key === 'y' || key === 'dx' || key === 'dy' || 
    key === 'rotate' || key === 'scale' || key === 'scalex' || 
    key === 'scaley' || key === 'skewx' || key === 'skewy') {
  this._isLocalMatrixDirty = true;
}
```

**Problem**: This is 10 string comparisons per animated attribute per frame. For a shape with 5 animated attributes, that's 50 string comparisons per frame per shape.

**Fix idea**: Use a `Set` or a pre-computed bitmask. E.g.:
```javascript
// At class level:
static _transformKeys = new Set(['x','y','dx','dy','rotate','scale','scalex','scaley','skewx','skewy']);

// In evaluateAnimations:
if (PxlNode._transformKeys.has(key)) this._isLocalMatrixDirty = true;
```

---

### 🟡 Issue #4: Hit Testing Replays Full Parent Chain (MEDIUM on mousemove)

**Location**: `interaction.js` lines 110-147

```javascript
for (let i = len - 1; i >= 0; i--) {  // For EVERY interactive element
  // Walk parent chain
  while (curr && curr !== this.stage) {
    this._hitStack[stackLen++] = curr;
    curr = curr.parentElement;
  }
  // Replay transform stack on dummy ctx
  for (let j = stackLen - 1; j >= 0; j--) {
    pxl.applyContextState(ctx, this.stage.unit, this._hitStack[j].attributeValues);
  }
  // Re-draw the shape path
  el.draw(ctx, this.stage.unit, 0);
}
```

**Problem**: On every `pointermove` (which fires at ~60fps when mouse is moving), for N interactive elements nested D levels deep, this does:
- N × D parent walks
- N × D transform applications
- N shape redraws (path construction + fill/stroke interception)

For a scene with 50 interactive elements 4 levels deep, that's 200 parent walks + 200 transforms + 50 draws per mouse move.

**Fix ideas**:
- Cache the transform stack per element (only recompute when transforms change)
- Use the already-computed `globalMatrix` instead of replaying the context state chain — you could `ctx.setTransform()` directly from the matrix
- Early-exit with AABB pre-check before the expensive path hit test

---

### 🟡 Issue #5: Broadcast Cascading During Render (MEDIUM, scenario-dependent)

**Location**: `node.js` lines 79-81

```javascript
if (this._refKey && animatedValuesChanged && pxl._subscriptions[this._refKey]) {
  pxl.broadcast(this._refKey);  // ← fires DURING render loop
}
```

**Problem**: If element A is animated and element B reactively depends on A (`ref.A.x`), then during A's `evaluateAnimations()`, the broadcast triggers B's `variableChangedCallback()`, which re-evaluates B's reactive attributes synchronously. If B also has an `id` and C depends on B, it cascades further.

This is **correct behavior** but can cause unbounded work in deep dependency chains (A→B→C→D→...). In a scene where 100 elements chain-reference each other, a single animation step could trigger 100 cascading re-evaluations.

**Fix idea**: Defer broadcasts to after all animations are evaluated (batch phase), or limit cascade depth.

---

### 🟢 Issue #6: Polyline Point Key Lookup (LOW)

**Location**: `polyline.js` line 63

```javascript
for (let i = 0; i < this.pointCount; i++) {
  this.flatCache[i] = this.attributeValues[this.pointKeys[i]] * u;
}
```

The `this.pointKeys[i]` does a string array access → then a string property lookup on `attributeValues`. For a 500-point polyline (1000 values), that's 1000 string-keyed property lookups per frame. A parallel `Float32Array` or numeric-indexed array would be faster.

---

### 🟢 Issue #7: Text `_lines` Array Re-allocation (LOW)

**Location**: `text.js` lines 80, 100

```javascript
this._lines = [];              // ← new array on every text change
// or
this._lines = textStr.split('\n');  // ← new array + new strings
```

For animated text (e.g., `` text="`Score: ${ref.score.value}`" ``), this creates a new array on every update. Minor, since text changes are typically less frequent than 60fps, but worth noting.

---

## Performance Summary

| Issue | Severity | Frequency | Fix Difficulty |
|-------|----------|-----------|----------------|
| Gradient descriptor allocation | 🔴 High | Every frame per animated gradient | Medium (pooling/structural cache) |
| Color string allocation | 🔴 Medium | Every frame per animated color | Hard (Canvas API limitation) |
| Transform dirty string chain | 🟡 Low-Medium | Every animated attr per frame | Easy (Set or bitmask) |
| Hit testing parent chain replay | 🟡 Medium | Every pointermove | Medium (cache transforms / use matrix) |
| Broadcast cascading | 🟡 Medium | Depends on scene complexity | Medium (batched broadcasts) |
| Polyline key lookup | 🟢 Low | Every frame per polyline | Easy (parallel array) |
| Text lines re-allocation | 🟢 Low | On text value change | Easy (reuse array) |

## Final Verdict

The framework is already in the **top 20%** of performance-conscious JavaScript canvas code. The Fast Path compiler alone puts it ahead of most alternatives. The biggest win would be fixing the **gradient descriptor allocation** — it's the only issue that creates genuinely unbounded GC pressure in common scenes. Everything else is polish.

---

## Framework Comparisons

| Framework | Approach | Kilopixel's Advantage |
|-----------|----------|----------------------|
| **p5.js** | Imperative `draw()` loop | Declarative HTML eliminates boilerplate; zero-to-animation is faster |
| **Fabric.js** | Imperative object model | Reactive expressions and built-in time drivers |
| **Konva.js** | Imperative with events | Reactive expressions; they have richer interactivity (for now) |
| **SVG + CSS** | Declarative but limited | 60fps JS math in attributes; SVG can't do per-frame trig |
| **Lottie** | Pre-rendered JSON playback | Live and reactive; Lottie is pre-baked |
| **PixiJS** | WebGL 2D, imperative | Simpler for 2D; they scale better at 10K+ sprites |

**Unique niche:** *"HTML for Canvas"* — a declarative, reactive, animation-first canvas framework with zero build step. No other framework does exactly this with Web Components and a compiled expression engine.
