# The `space` Attribute: Draw an Element in Another Element's Space

- **Status**: 🟡 **Proposed** (2026-10-30, no code changes yet)
- **Date**: 2026-10-30
- **Related**: `design/2026-10-29_tolocal_decomposition_plan.md` (§7 "Later idea", the clone rule this replaces for exact copies), `design/2026-10-25_refs_across_spaces_note.md` (hub for refs across spaces; §4 anchors), `design/2026-10-26_tolocal_fix_plan.md` (reactivity walk), `design/2026-10-17_always_save_restore_plan.md` (same render path, §10)
- **Target Implementation**: `js/elements/node.js` (`getParentMatrix`, `getGlobalMatrix`, space resolution), `js/graphics.js` (`applyTransformState`), `js/matrix.js` (`pxl.toLocal` uses the parent matrix), `js/elements/shape.js` and `group.js` (attribute, state check), `js/engine.js` (spatial key, reactivity); hit testing in `js/interaction.js` needs no change (§3.2)
- **Demo**: `examples/test53.html` (the corner helpers become one attribute each)

---

## 1. Problem

Following another element exactly, from a different layer or group, takes many attributes today:

- **Exact copy** (outline, ghost, highlight): the clone rule maps six values with toLocal and copies `dx` / `dy` (`tolocal_decomposition_plan.md` §3.2). Users who map attribute by attribute (`skewx` → `skewx`, `skewy` → `skewy`) get a wrong copy; the decomposition is not something they think about.
- **A point inside the target** (a corner, a handle, a label position): toLocal maps only the target's frame origin. `examples/test53.html` needs a helper element per corner that copies seven transform attributes of its rect and computes the anchor offset with an engine internal (`pxl.anchorX`).
- **Attachments**: a label that sits 40 units to the right of a rotating ship in another layer and turns with it needs `x`, `y` and `rotate` from toLocal plus trigonometry for the 40 units.

All three want the same thing: "draw this element as if it were inside A".

## 2. Proposal

A new attribute on shapes and groups:

```html
<pxl-rect space="ref.part" w="ref.part.w" h="ref.part.h" anchor="ref.part.anchor"
  stroke="#0ea5e9" strokewidth="2" linedash="[6, 6]"></pxl-rect>
```

`space="ref.A"` makes A's frame the element's **parent space**. The element's global matrix becomes

```
B global = A global × B local
```

instead of `B's container global × B local`. A's global matrix already contains A's own transform (`x`, `y`, `rotate`, `zoom`, `scalex`, `scaley`, skew, `dx`, `dy`) and the transforms of all A's ancestors. Nothing is decomposed or inverted for the user: skew, mirroring and non-uniform scale come along exactly.

### 2.1 What Comes Along

| From A | With `space="ref.A"` |
|---|---|
| `x`, `y`, `dx`, `dy` | ✓ (the origin is A's drawing origin, §2.2) |
| `rotate`, `zoom`, `scalex`, `scaley`, `skewx`, `skewy` | ✓ |
| Transforms of A's layers and groups | ✓ |
| Geometry (`w`, `h`, `r`, `anchor`, `points`, …) | ✗ not part of the matrix; copy with `ref.A.w` etc. |
| Style (`fill`, `stroke`, …) and compositing (`alpha`, `blend`, `filter`, `mask`, clip) | ✗ the element keeps its own, and the compositing of **its own** layer |

B's **own** transform attributes apply on top, in A's local units:

| B's attributes | Result |
|---|---|
| all at defaults | exactly on A: turned, zoomed, skewed and mirrored like A |
| `x="40"` | 40 units along A's x axis (turned with A; 80 on screen if A has `zoom="2"`) |
| `rotate="90"`, `zoom="1.1"` | on top of A's rotation / zoom (an outline 10 % larger) |
| `x="-50" y="-25"` | A's top-left corner, for a 100 × 50 rect with anchor center |

B's own DOM ancestors (its layer and groups) **don't** transform it anymore; its layer still decides the canvas, the draw order and the compositing.

### 2.2 Origin: A's Drawing Origin

The origin of the space is where A is **drawn**: A's global matrix including its `dx` / `dy`. So a rect with A's `w`, `h` and `anchor` covers A with no further attributes, and B's coordinates are A's drawing coordinates (the coordinates of `A.draw()`).

The pivot is still reachable: `x="-ref.A.dx" y="-ref.A.dy"` (exact for A's own offset, since B is in the frame where A's offset was applied).

Alternative: the pivot as origin (A's global matrix without its offset). Rejected: an overlay would need `dx="ref.A.dx" dy="ref.A.dy"` again, and corners would be measured from the pivot instead of from the drawing.

### 2.3 Use Cases

```html
<!-- Selection outline from an overlay layer (never clipped or faded with the part's layer) -->
<pxl-rect space="ref.part" w="ref.part.w" h="ref.part.h" anchor="ref.part.anchor" stroke="#0ea5e9"></pxl-rect>

<!-- Corner handle: test53's helper shrinks from 7 copied attributes to one -->
<pxl-circle id="corner1" space="ref.rect1" x="-ref.rect1.w / 2" y="-ref.rect1.h / 2" r="3"></pxl-circle>
<!-- Readers elsewhere map it as usual -->
<pxl-polyline points="toLocal(ref.corner1, 'x'), toLocal(ref.corner1, 'y'); …"></pxl-polyline>

<!-- Label attached to a rotating ship in another layer -->
<pxl-text space="ref.ship" x="40" text="'SS Pixel'"></pxl-text>

<!-- Draw in a layer's coordinates from another layer (on top, with its own blend) -->
<pxl-circle space="ref.mapLayer" x="ref.city.x" y="ref.city.y" r="6"></pxl-circle>
```

A group with `space` puts all its children into A's space:

```html
<pxl-group space="ref.ship">
  <pxl-text x="40" text="'SS Pixel'"></pxl-text>
  <pxl-line x1="0" y1="0" x2="35" y2="0"></pxl-line>
</pxl-group>
```

## 3. Implementation

### 3.1 One Parent Matrix for Everything

`node.js` gets one method that every matrix reader uses:

```js
// The matrix of the space this element's own x / y live in: its container's, or A's with space="ref.A"
getParentMatrix() {
  const parent = this.spaceNode ?? this.parentContainer;
  return parent ? parent.getGlobalMatrix() : pxl._identityMatrix;
}
```

- `getGlobalMatrix()` uses the same parent (the version check compares the space target's `_globalMatrixVersion`, so a moving A makes B's matrix stale without extra code).
- `pxl.toLocal` uses `caller.getParentMatrix()` instead of `caller.parentContainer.getGlobalMatrix()`, so a reader inside a space element maps into the right space, and `toLocal(ref.B, …)` (B as target) is correct through `getGlobalMatrix()`.
- `spaceNode` is the resolved target element (`attributeValues.space?.$node`), set when the attribute is evaluated (§3.4). It has no underscore: `matrix.js` and `graphics.js` read it.

### 3.2 Drawing and Hit Testing: One Extra Transform

Rendering doesn't use global matrices; it builds the canvas transform on the context stack (layer → groups → shape, `pxl.applyTransformState`). When B is drawn, the context already holds `base × P`, where P is B's DOM parent's global matrix and base the layer's DPR scale. To end up at `base × A global × B local`, B applies one extra transform before its own:

```
R = inverse(P) × A global        (the same delta toLocal computes)
ctx.transform(R0, R1, R2, R3, R4 · u, R5 · u)
```

This goes into `pxl.applyTransformState` (an element with `spaceNode` applies R first, then its own state), so:

- **Shapes and groups** get it through their existing `hasStateChanges` path (`space` set counts as a state change).
- **Hit testing** (`interaction.js`) rebuilds the transform by applying `applyTransformState` for every DOM ancestor and then the element, in the same order as rendering. R is relative to the DOM parent's matrix, which those ancestors put on the stack, so B's hit area matches what is drawn without a change in `interaction.js`. This also holds for children of a group with `space`.
- **No DPR or canvas coupling:** R is relative to whatever the context holds, so the layer's DPR scale and the stage don't need to be known.
- Uses the shared scratch matrices (`pxl._scratchMatrixA` / `B`): no allocations.

Alternative: `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` and then A's global matrix directly. Saves the inversion, but needs the layer's DPR in `graphics.js` and a different path for hit testing (whose context has no DPR). Rejected for coupling; the inversion costs about 40 ns (`scratch/tolocal_bench.js`).

**Edge case:** if P can't be inverted (B's own layer or group has `zoom="0"` or `scalex="0"`), `pxl.Matrix.invert` returns the identity and B is drawn wrong. B's container is invisible then anyway; B stays invisible with it, which matches what users expect from a hidden container.

### 3.3 Reactivity

`space="ref.A"` compiles like any reactive expression: B subscribes to `ref.A`. A broadcasts when its own attributes change, when its animated values change (`evaluateAnimations`) and when an ancestor's matrix changes while A is tracked (`broadcastGlobalMatrixChange`). So B is told every time A's global matrix may have moved.

The evaluated value is the same object each time (`pxl.nodes.A`), so the usual "value changed" test would skip the update. For `space`, an evaluation always counts as a matrix change of B's parent:

- reset `_lastParentMatrixVersion` (B's matrix is recomputed on the next read),
- `broadcastGlobalMatrixChange()` on B (B's children and their toLocal readers, `ref.B` readers),
- invalidate B's layer.

`space` is a spatial key (`pxl.isSpatialKey`), so setting or removing the attribute takes the same path.

### 3.4 Resolving the Target and Guards

When `space` is evaluated:

| Value | `spaceNode` | Behaviour |
|---|---|---|
| attribute absent (default `null`) | `null` | normal: the container is the parent |
| `ref.A` of a shape, group or layer | A | drawn in A's space |
| `ref.A` not connected yet (`undefined`) | `null` | drawn in its container's space until A registers; the subscription re-evaluates then |
| `ref.stage` or `ref.var` (no frame) | `null` | warning once: "space: ref.x has no frame" |
| a cycle (A's parent chain, space-aware, reaches B) | `null` | warning once: "space: ref.A is inside this element's space (cycle)" |

**Cycle guard** (an invalid value would freeze: `getGlobalMatrix` would recurse forever, CLAUDE.md "Invalid user values"): before accepting A, walk from A up the space-aware parent chain (`spaceNode ?? parentContainer`) to the top; if B is met, reject. This covers A inside B (a child can't be B's space), `A space=B` + `B space=A`, and longer loops. Runs only when `space` is evaluated, not per frame. Whoever closes a cycle is the one rejected; the earlier links keep working.

**Scope:** shapes and groups. Not layers: a layer's transform is applied on its own canvas, and a layer in another layer's space has no use case yet. Not `pxl-var` (no frame).

### 3.5 Draw Order

Like toLocal: if B's layer is drawn before A's layer and A animates, B uses A's matrix from the previous frame (A's animated values are evaluated when A's layer renders). The rule stays the same: put readers (here: elements with `space`) in a layer after their target. Within one layer, children render in DOM order, so B after A.

A general fix (a two-phase frame: evaluate every element first, then draw) would remove this lag for `space`, toLocal and plain refs alike. It is a separate topic: `.agents/TODO.md` §29.

## 4. Performance and Allocations

| Path | Cost | Allocations |
|---|---|---|
| Elements without `space` | one `spaceNode` null check in `getParentMatrix` and `applyTransformState` | none |
| Elements with `space`, per draw | A's `getGlobalMatrix()` (version checks while nothing moves) + `invert` + `multiply` (~40 ns) + one `ctx.transform` | none (scratch matrices) |
| Hit test of a space element | the same R once per test | none |
| Evaluating `space` | the cycle walk up A's chain | none |

No change in the hot path for pages that don't use `space`.

## 5. Alternatives Considered

| Alternative | Why not |
|---|---|
| Keep the clone rule (six toLocal values + `dx` / `dy`) | Works since the decomposition plan, but long, easy to get wrong (`skewy`), and no help for points inside the target. Stays for single values. |
| `transform="toLocal(ref.A)"` returning a whole matrix | Needs a matrix value type in attributes and an inversion on the user's side of the model; `space` gives the same result with A's matrix directly. |
| Move B into A's group in the DOM | Shapes can't have children; it would also move B into A's layer (clip, blend, alpha, draw order). |
| Pivot as origin (§2.2) | Overlays would need `dx` / `dy` again; corners would be measured from the pivot. |
| `setTransform` with A's global matrix (§3.2) | Couples `graphics.js` to the layer's DPR and needs a separate hit-test path. |
| A point form of toLocal (`toLocal(ref.A, 'x', px, py)`) | Solves corners for readers, but not overlays or attachments; can still come later (refs note §5.1). With `space`, the corner is an element, and readers use plain toLocal on it. |
| Other names: `frame`, `in`, `attach`, `follow` | `space` matches the wording of toLocal ("the reader's space") and of the docs ("parent space"). `frame` is a close second. |

## 6. Edge Cases

- **A is removed from the DOM:** B should fall back to its container (`spaceNode = null`). To check during implementation: whether removing an element broadcasts its ref today, or whether `disconnectedCallback` has to notify `space` readers.
- **A is hidden:** B is still drawn (hidden is compositing, not geometry). A hidden helper target is a valid pattern.
- **`space` on an element whose container also has `space`:** works; the container's R is on the stack, P includes it via `getParentMatrix`.
- **B is a toLocal target:** `toLocal(ref.B, …)` uses B's global matrix, so the corner helper (§2.3) works for any reader.
- **B reads toLocal itself:** maps into A's space (§3.1). Its own `x` / `y` are A-local, so that is the right space.
- **Events:** `isHovered` / `onclick` on B use the hit test (§3.2) and match the drawing.
- **Bounding boxes** (grid, filters): read through `getGlobalMatrix()`, so they follow automatically.

## 7. Tests (`tests/index.html`)

1. **Overlay**: a rect in a rotating, skewed, mirrored group; a second rect with `space` and the same w / h / anchor in another layer: both global matrices are equal (all six entries within 0.01), sampled while the group turns.
2. **Local offset**: `space="ref.A" x="40"` with A `rotate="90" zoom="2"`: B's global origin is 80 units along A's rotated x axis.
3. **Corner**: helper with `space="ref.rect"` at `(-w/2, -h/2)`; `toLocal(ref.helper, 'x' | 'y')` from an untransformed layer equals the rect's top-left corner computed from the rect's global matrix.
4. **Group with space**: children of a `space` group follow A.
5. **Reactivity**: a static `setAttribute('rotate', …)` on A's layer moves B (layer invalidated, matrix refreshed); nothing redraws while nothing moves (stage idle at 0 FPS).
6. **Hit test**: `isHovered` on B at a point inside B's drawn (transformed) area and not at B's untransformed position.
7. **Guards**: `A space=B` + `B space=A` warns once and draws (no freeze); `space="ref.stageId"` warns; a target connected later is picked up.
8. **toLocal inside**: a reader inside a `space` group maps a target in a third layer correctly.
9. Existing tests unchanged; `examples/test53.html` with the simplified corner helpers draws the same yellow line.

## 8. Docs

- `.agents/KILOPIXEL.md`: attribute tables for shapes and groups (`space`), Coordinate System (parent space can be another element's frame), Coordinate Mapping (`getParentMatrix`, clone rule vs. `space`), AI guide (when to use `space` vs. toLocal).
- `design/2026-10-29_tolocal_decomposition_plan.md` §7: link to this plan.
- `design/2026-10-25_refs_across_spaces_note.md`: §0 row, §4 pattern "draw in the target's space".
- `.agents/TODO.md`: entry.
- Public docs: the planned `mapping.html` (Coordinate Mapping) gets a section "Drawing in another element's space"; until then nothing.
- `examples/test53.html`: corner helpers with `space`.

## 9. Open Decisions

1. **Name**: `space` (proposed) or `frame`.
2. **Origin**: A's drawing origin (proposed, §2.2) or A's pivot.
3. **Scope**: shapes and groups (proposed) or also layers.
4. **Hidden A**: B still drawn (proposed) or hidden with A.

## 10. Steps

1. Agree on this plan and the open decisions (§9).
   - **Implementation order:** implement `design/2026-10-17_always_save_restore_plan.md` (decided, TODO §19) first if possible. It removes the `hasStateChanges` check from `Shape.render()`, so `space` needs no new term there; the shape is always inside `save()` / `restore()`, and `space` only adds its extra transform in `applyTransformState` (§3.2). If `space` comes first, add `spaceNode !== null` to `hasStateChanges` in `shape.js` and `group.js`; always save / restore later removes it again from `shape.js`.
2. Implement §3 (node.js, graphics.js, matrix.js, shape.js / group.js, engine.js), `node build.js`, update the `pxl.min.js` size if it changes.
3. Add the tests (§7); all pass, console clean.
4. Simplify the test53 corner helpers; update the docs (§8).
5. Review the diff, then commit (`feat(engine): space attribute draws an element in another element's space`).
