# Design Plan: `<pxl-clip>` — Compound Clipping Geometry

**Date**: 2026-09-29  
**Status**: Draft  
**Files affected**: `js/elements/clip.js` (new), `js/elements/node.js`, `js/elements/layer.js`, `js/elements/group.js`, `js/elements/shape.js`, all 7 shape classes, `build.js`

---

## 1. Problem Statement

Kilopixel currently has no way to restrict drawing to an arbitrary geometric region. The existing `mask` attribute on shapes maps to `ctx.globalCompositeOperation` (pixel compositing), which:

- Operates on already-rasterized pixels, not geometry
- Cannot clip a *group of children* as a spatial unit without an offscreen buffer
- Requires careful draw order management (mask shape must be drawn after content)

`ctx.clip()` solves these problems at the canvas geometry level — it restricts all subsequent drawing to the interior of the current path, before any pixel is written. Clipping a subtree of children requires no offscreen buffer, no special draw order, and costs essentially nothing at runtime.

---

## 2. Element Hierarchy

`<pxl-clip>` sits at the same level as `<pxl-group>` in the PxlNode hierarchy — it is a structural container, not a leaf shape. It accepts the same parent elements as Group and accepts the same child elements as Group.

```
HTMLElement
├── Stage (pxl-stage)               — NOT a PxlNode; standalone root
└── PxlNode (abstract base)
    ├── Layer    (pxl-layer)         — owns <canvas>, compositing unit
    ├── Group    (pxl-group)         — transform container, draws into parent ctx
    ├── Clip     (pxl-clip)          — clip path container  ← NEW
    ├── Variable (pxl-var)           — reactive variable
    └── Shape (abstract)             — drawing + styling leaf
        └── Circle, Ellipse, Rect, Line, Polyline, Text, Grid
```

### Valid parent / child relationships

| Element | Valid parents | Accepts as children |
|---|---|---|
| `<pxl-layer>` | `<pxl-stage>` | Group, Clip, Shape, Variable |
| `<pxl-group>` | Layer, Group | Group, Clip, Shape, Variable |
| `<pxl-clip>` | Layer, Group | Group, Clip, Shape |
| `<pxl-var>` | Layer, Group | — |
| Shapes | Layer, Group, **Clip** | — |

### `parentContainer` resolution in `PxlNode.connectedCallback`

Every `PxlNode` resolves its nearest structural parent with `closest()`. The selector must include `pxl-clip` so that shapes connect to the clip's `childList` rather than skipping up to the grandparent:

```js
// Before
this.parentContainer = this.closest('pxl-group, pxl-layer');

// After
this.parentContainer = this.closest('pxl-group, pxl-layer, pxl-clip');
```

`parentLayer` (the enclosing `<pxl-layer>`) is unchanged — it still walks past any clip to reach the layer, which is correct for invalidation.

### Groups inside `<pxl-clip>`

Because groups are valid children of a clip, you can cluster clip shapes with shared transforms:

```html
<pxl-clip x="500" y="300">
  <!-- Rotating cross arm — two rects share a transform -->
  <pxl-group rotate="t * 45">
    <pxl-rect w="200" h="50"></pxl-rect>
    <pxl-rect w="50" h="200"></pxl-rect>
  </pxl-group>
  <!-- Plus a static outer boundary -->
  <pxl-circle r="250"></pxl-circle>
</pxl-clip>
```

`applyClip()` therefore recurses into child groups using the same path-building logic.

### Nested `<pxl-clip>` elements

A `<pxl-clip>` inside another `<pxl-clip>` is valid. Canvas's successive `ctx.clip()` calls **intersect** — each nested clip further constrains the drawable region. This allows declarative boolean intersection of compound shapes.

---

## 3. Proposed API: `<pxl-clip>`

A dedicated element — not an overloaded attribute on `<pxl-group>` — for two reasons:

1. Its children define a geometric **path**, not a visual result. They are never drawn.
2. The render semantics are fundamentally different from `<pxl-group>`.


### 3.1 Basic Usage

```html
<pxl-layer>
  <!-- Unclipped background -->
  <pxl-rect w="1000" h="600" fill="#111"></pxl-rect>

  <!-- The clip region is the UNION of all child shapes -->
  <pxl-clip x="500" y="300">
    <pxl-circle r="150"></pxl-circle>
    <pxl-rect w="300" h="100" x="-50"></pxl-rect>
    <pxl-ellipse rx="200" ry="80" y="100"></pxl-ellipse>
  </pxl-clip>

  <!-- These siblings are drawn only inside the union of the clip shapes -->
  <pxl-rect w="1000" h="600" fill="linear(45, ['#e879f9', '#818cf8'])"></pxl-rect>
  <pxl-text text="'Clipped!'" x="500" y="300" fill="white" size="60"></pxl-text>
</pxl-layer>
```

### 3.2 Animated Clip

All child shapes go through the full Kilopixel expression pipeline:

```html
<pxl-clip x="500" y="300">
  <pxl-circle r="wave(3) * 200"></pxl-circle>
  <pxl-circle r="100" x="sin(t) * 150" y="cos(t) * 150"></pxl-circle>
</pxl-clip>
```

### 3.3 Boolean Hole via `fillrule="evenodd"`

When two shapes overlap, the `evenodd` fill rule cancels the overlapping region, creating a hole:

```html
<!-- Animated donut: outer circle minus inner circle -->
<pxl-clip x="500" y="300" fillrule="evenodd">
  <pxl-circle r="200"></pxl-circle>
  <pxl-circle r="wave(2) * 100"></pxl-circle>
</pxl-clip>
```

### 3.4 Nested Clips = Intersection

Canvas's successive `ctx.clip()` calls intersect. A `<pxl-clip>` inside a `<pxl-group>` that is itself inside another `<pxl-clip>` automatically produces the geometric intersection of both regions.

```html
<pxl-clip x="500" y="300">          <!-- outer: circle -->
  <pxl-circle r="200"></pxl-circle>
</pxl-clip>

<pxl-group x="500" y="300">
  <pxl-clip>                        <!-- inner: rect (intersected with outer) -->
    <pxl-rect w="200" h="400"></pxl-rect>
  </pxl-clip>
  <pxl-rect fill="red" w="1000" h="600"></pxl-rect>  <!-- clipped to intersection -->
</pxl-group>
```

---

## 4. Scoping Rules

The clip scope is determined by the nearest `ctx.save()`/`ctx.restore()` boundary in the render stack:

| Where `<pxl-clip>` is placed | Scope of clip |
|---|---|
| Direct child of `<pxl-layer>` | All subsequent siblings in that layer |
| Child of `<pxl-group>` | All subsequent siblings in that group only |
| Across `<pxl-layer>` elements | **Impossible** — each layer has its own `ctx` |

Layer isolation is a structural guarantee of the browser canvas API, not a Kilopixel decision. Each `<pxl-layer>` owns an independent `<canvas>` element and therefore an independent context. `ctx.clip()` cannot cross layer boundaries.

---

## 5. Observed Attributes

`<pxl-clip>` supports the same spatial transform attributes as `<pxl-group>`:

`x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `hidden`

Plus one new attribute:

| Attribute | Default | Description |
|---|---|---|
| `fillrule` | `'nonzero'` | `'nonzero'` = union of all child paths. `'evenodd'` = XOR (overlapping areas become holes). Passed directly to `ctx.clip(fillrule)`. |

---

## 6. Render Algorithm

### 6.1 `PxlClip.applyClip(ctx, u, t)`

```
1. evaluateAnimations(t)            ← update own animated transform attributes
2. if hidden: return                ← hidden clip = no clip (subsequent siblings draw normally)
3. ctx.save()                       ← sandbox this clip (parent owns the matching restore)
4. applyTransformState(ctx, u)      ← position the clip's coordinate space
5. ctx.beginPath()                  ← start a single shared compound path
6. for each child in childList:
     if child is Shape:
       a. child.evaluateAnimations(t)
       b. if child has transforms: ctx.save(); applyTransformState(child)
       c. child.buildPath(ctx, u)   ← add to compound path, no beginPath/applyStyle
       d. if child has transforms: ctx.restore()
     if child is Group:
       a. child.evaluateAnimations(t)
       b. if group has transforms: ctx.save(); applyTransformState(group)
       c. recursively call buildPathFromGroup(ctx, u, t, group)
          → same loop over group's childList (handles shapes and nested groups)
       d. if group has transforms: ctx.restore()
     if child is Clip:
       a. ctx.clip(this.fillrule)   ← commit current compound path as clip
       b. child.applyClip(ctx, u, t) ← nested clip further intersects (adds own ctx.save)
       c. ctx.beginPath()           ← reset for any further siblings in this clip
7. ctx.clip(fillrule)               ← commit the final compound path as the clip region
8. ← DO NOT ctx.restore() here — clip must persist for subsequent siblings in the parent
```

> **Critical**: The `ctx.save()` in step 3 is NOT matched by a restore inside `applyClip()`. The parent container (layer or group) owns the restore. This is what allows the clip to persist for subsequent siblings.

### 6.2 Parent Render Loop Changes (Layer & Group)

The parent's render loop distinguishes `PxlClip` children and calls `applyClip()` instead of `render()`:

```js
for (let i = 0; i < len; i++) {
  const child = this.childList[i];
  if (child instanceof PxlClip) {
    child.applyClip(ctx, u, t);   // no restore inside — clip persists
  } else {
    child.render(ctx, u, t);
  }
}
```

### 6.3 Mandatory `ctx.save()`/`ctx.restore()` Sandwich

The Layer's `save`/`restore` is currently **conditional** on having transform attributes. This must change:

**Problem**: If a layer has no transforms, there is no `ctx.restore()`. A clip established by `<pxl-clip>` would then leak into the **next frame** (`ctx.clearRect()` clears pixels but does NOT reset the clip state).

**Solution**: The layer always wraps its child render loop in `ctx.save()`/`ctx.restore()` when any child is a `PxlClip`.

```js
// Detect whether a save/restore sandbox is needed
const needsSandbox = hasTransformChanges || this.childList.some(c => c instanceof PxlClip);

if (needsSandbox) ctx.save();
if (hasTransformChanges) pxl.applyTransformState(ctx, u, this.attributeValues);
for (let i = 0; i < len; i++) { /* render loop */ }
if (needsSandbox) ctx.restore();
```

`<pxl-group>` already applies `ctx.save()`/`ctx.restore()` conditionally on transforms; the same fix must be applied there.

---

## 7. Required Shape Refactor: `buildPath()`

The most significant cross-cutting change. Every shape currently calls `ctx.beginPath()` at the top of `draw()`. For `<pxl-clip>` to collect all child paths into a single compound path, shapes must expose a `buildPath()` method that contributes to the *existing* path buffer (no `beginPath`, no `applyStyle`).

### 7.1 Pattern

**Before** (all shapes today):
```js
draw(ctx, u, t) {
  ctx.beginPath();
  ctx.arc(0, 0, r * u, startRad, endRad);
  this.applyStyle(ctx, u);
}
```

**After**:
```js
buildPath(ctx, u) {
  ctx.arc(0, 0, r * u, startRad, endRad);  // contributes to current path
}

draw(ctx, u, t) {
  ctx.beginPath();        // opens a fresh path
  this.buildPath(ctx, u); // fills it
  this.applyStyle(ctx, u); // fills/strokes it
}
```

`draw()` behavior is **identical** for normal rendering — this is a pure refactor with no visible change.

### 7.2 Per-Shape Notes

| Shape | `buildPath()` contents | Notes |
|---|---|---|
| `circle.js` | `ctx.arc(...)`, donut inner arc if `ir > 0`, pie lines | Arrow geometry stays in `draw()` only (not meaningful in clip context) |
| `ellipse.js` | `ctx.ellipse(...)`, donut, pie | Same arrow note |
| `rect.js` | `ctx.roundRect(...)` or `ctx.rect(...)` | Straightforward |
| `line.js` | `ctx.moveTo(...) ctx.lineTo(...)` | A line path in a clip is a zero-width region — valid but unusual |
| `polyline.js` | Loop of `moveTo`/`lineTo`/`bezierCurveTo`, `closePath` if set | Points must be pre-evaluated; `buildPath` receives the already-computed `flatCache` |
| `text.js` | **No-op** | Text has no geometric path in Canvas 2D; clip will silently skip |
| `grid.js` | **No-op** | An infinite grid clip makes no semantic sense; silently skip |

### 7.3 Child Transforms in `applyClip`

Each child shape in a clip group may have its own `x`, `y`, `rotate`, etc. These must be applied to the canvas context before calling `buildPath()`, so the path points land in the correct coordinate space. The approach:

```js
// Inside PxlClip.applyClip(), for each child:
const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = child.attributeValues;
const hasChildTransforms = x || y || dx || dy || rotate ||
                           scale !== 1 || scalex !== 1 || scaley !== 1 ||
                           skewx || skewy;

if (hasChildTransforms) {
  ctx.save();
  pxl.applyTransformState(ctx, u, child.attributeValues);
}
child.buildPath(ctx, u);
if (hasChildTransforms) ctx.restore();
```

Canvas accumulates path points in the current transform space. The save/restore adjusts the CTM per child without breaking the shared path buffer.

---

## 8. Hit Testing Compatibility

The interaction system (`interaction.js`) uses a dummy 1×1 canvas context for hit testing. It walks the parent chain and applies transforms, then calls `shape.draw()` on the dummy context.

`<pxl-clip>` children are **not interactive** (they define geometry, not visual output), so they should not be registered with the `InteractionEngine`. `PxlClip` simply does not call `stage.interaction.registerElement()`.

No other changes to `interaction.js` are required.

---

## 9. Invalidation / Dirty Flags

`<pxl-clip>` participates in the standard Kilopixel reactivity model:

- If any child has animated attributes (`isAnimated`), the parent layer is kept dirty via the normal heartbeat
- `PxlClip.applyClip()` calls `child.evaluateAnimations(t)` for each child — this is the same path that normal shapes use
- `PxlClip` itself calls `evaluateAnimations(t)` for its own transform attributes

No special dirty logic is needed. The clip redraws every frame along with its parent layer, just as any other animated shape would.

---

## 10. File Changes Summary

| File | Change Type | Description |
|---|---|---|
| `js/elements/clip.js` | **New** | `PxlClip` class: `applyClip(ctx, u, t)`, `buildPathFromGroup()` helper, child management, transform attributes |
| `js/elements/node.js` | Fix | `parentContainer` selector extended from `'pxl-group, pxl-layer'` to `'pxl-group, pxl-layer, pxl-clip'` |
| `js/elements/shape.js` | Refactor | Extract `buildPath(ctx, u)` from `draw()`; `draw()` calls `beginPath + buildPath + applyStyle` |
| `js/elements/shapes/circle.js` | Refactor | Implement `buildPath()` |
| `js/elements/shapes/ellipse.js` | Refactor | Implement `buildPath()` |
| `js/elements/shapes/rect.js` | Refactor | Implement `buildPath()` |
| `js/elements/shapes/line.js` | Refactor | Implement `buildPath()` |
| `js/elements/shapes/polyline.js` | Refactor | Implement `buildPath()` |
| `js/elements/shapes/text.js` | Refactor | `buildPath()` = no-op |
| `js/elements/shapes/grid.js` | Refactor | `buildPath()` = no-op |
| `js/elements/layer.js` | Fix | `save`/`restore` sandbox becomes unconditional when any child is `PxlClip` |
| `js/elements/group.js` | Fix | Same fix as layer |
| `build.js` | Update | Add `js/elements/clip.js` to build order (after `group.js`, before shape files) |

---

## 10. Open Questions

### Resolved

**Q: Should `<pxl-clip>` support nested `<pxl-group>` children?**  
**A: Yes.** Groups are valid children of a clip. `applyClip()` recurses into groups via `buildPathFromGroup()`, applying the group's transforms before collecting each child's path. This allows clustering clip shapes with shared transforms (e.g., a rotating group of rects forming a compound clip arm).

**Q: `<pxl-clip>` inside a `<pxl-clip>`?**  
**A: Yes, fully supported.** Nested clips intersect — the inner clip calls `applyClip()` recursively, which adds another `ctx.save()` + `ctx.clip()`. The result is the geometric intersection of both regions. This is the expected canvas behavior and is explicitly documented as a feature.

### Still Open

1. **`hidden` attribute semantics** — if `hidden="true"`, should the clip be a no-op (subsequent siblings draw without restriction) or should it clip to nothing (subsequent siblings invisible)? Proposed: **no-op** (transparent clip = no restriction). This allows toggling a clip on/off declaratively with `hidden="ref.toggle.value"`.

2. **Should `text.js` and `grid.js` silently skip or emit a `console.warn`** when used as a clip child? A warning on first use would help developers who accidentally put a `<pxl-text>` inside a `<pxl-clip>`. Proposed: **warn once** using a `_warnedClip` flag on the shape instance.

