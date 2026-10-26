# toLocal Fix: Readers in a Moving Space

- **Status**: ✅ **Implemented** (2026-10-26). Tests in §7 pass.
- **Date**: 2026-10-26
- **Related**: `design/2026-10-25_refs_across_spaces_note.md` (what `toLocal` maps), `design/coordinate_mapping_implementation_plan.md` (original `toLocal` design), `.agents/TODO.md` §25
- **Target Implementation**: `js/compiler.js` (`compileExpression`), `js/engine.js` (`compileAttribute`, new `evaluateToLocalAttributes`), `js/elements/node.js` (constructor, `broadcastGlobalMatrixChange`)
- **Demo** (local only, scratch is git-ignored): `scratch/tolocal_numbers.html`
- **Tests** (committed): `tests/index.html`, the `toLocal:` tests (10, added 2026-10-26)

---

## 1. Problem

`toLocal(ref.target, prop)` returns the target's position (or rotation, scale) in the space where the reader's own `x` / `y` live: the reader's parent space. The result goes stale when **the reader's own space moves** and the target does not.

Demo (`scratch/tolocal_numbers.html`): a circle `sun` sits still in an untransformed layer A at `(50, 100)`. A ring in layer B reads it:

```html
<pxl-layer x="600" y="350" rotate="t * 12" scale="1.5">
  <pxl-circle id="reader" x="toLocal(ref.sun, 'x')" y="toLocal(ref.sun, 'y')" r="16"></pxl-circle>
</pxl-layer>
```

- Expected: the ring stays on the circle while its numbers in layer B change every frame.
- Actual: the ring keeps the numbers of the first frame, `(−367, −167)`, and drifts away as layer B rotates.
- Workarounds before the fix:
  - Make the expression time-dependent, `toLocal(ref.sun, 'x') + t * 0`. It works but users must know the trick, and it redraws the layer every frame even when nothing moves.
  - Flip the roles: the element in the still space reads the element in the moving space (the target side was already tracked). Only possible when the follower may live in the still space.

The same happens for any reader inside a moving group or layer, e.g. a gripper inside a rotating robot arm group that follows a target elsewhere, and for static moves (a slider sets `rotate` on the reader's layer). In the docs: the line in `docs/walkthrough.html` §8 connects two circles in two other layers with `toLocal`; it works on the page only because its own layer never moves. Moving and rotating that layer (`x="500" y="300" rotate="30"`) left the line at its old numbers `(200, 100)` instead of `(−360, −23)`.

---

## 2. Cause

A reader is a **reactive** attribute (no `t`): it is evaluated once on connect and then only when one of its `ref.*` dependencies broadcasts. The compiler finds `ref.sun` in the expression, so the reader subscribes to `ref.sun` only. Two things broadcast `ref.sun` today:

1. **The target changes itself**: `sun` gets a new `x`, `rotate`, … (`evaluateAnimations`, `attributeChangedCallback`).
2. **An ancestor of the target moves**: the ancestor calls `setLocalMatrixDirty()` → `broadcastGlobalMatrixChange()`, which walks its subtree and broadcasts every child that has subscribers (`js/elements/node.js`).

Missing: **an ancestor of the reader moves.** Layer B's walk does pass the reader, but it only broadcasts `ref.reader` to the reader's own subscribers (in the demo, the read-out text). Nobody re-evaluates the reader's `toLocal` attributes.

The target cannot help: nothing about it changed. The signal has to come from the reader's side, and the walk that carries it already exists.

---

## 3. Fix

Let the walk that a moving container already performs also re-evaluate the `toLocal` attributes of the elements it passes.

### 3.1 Compiler: mark `toLocal` expressions (`js/compiler.js`)

`compileExpression` already rewrites `toLocal(` to `pxl.toLocal(this, `. Detect it on the way and flag the compiled function (animation path only; a `toLocal` without `ref.*` has nothing to map):

```js
const usesToLocal = /\btoLocal\(/.test(sanitizedStr);
sanitizedStr = sanitizedStr.replace(/\btoLocal\(/g, 'pxl.toLocal(this, ');
// …
if (usesToLocal) fn.usesToLocal = true;
```

The flag sits on the cached function, so every element sharing the expression string shares it (same as `isTimeDependent` and `variableDependencies`).

### 3.2 Engine: track and re-evaluate (`js/engine.js`, `js/elements/node.js`)

- New per-element list `toLocalAttributeKeys` (constructor: `[]`), kept in `compileAttribute` next to `reactiveAttributeKeys`:
  - reactive function with `usesToLocal` → add the key;
  - any other result (time-dependent, static, reactive without `toLocal`) → remove it.
  - Time-dependent `toLocal` expressions are left out: they are evaluated every frame anyway.
- New `pxl.evaluateToLocalAttributes(element)`, modelled on `evaluateAttributesForVariable`:
  - re-evaluates only the keys in `toLocalAttributeKeys`;
  - if a value changed: invalidates the element's layer;
  - if a spatial value changed (`pxl.isSpatialKey`): calls `element.setLocalMatrixDirty()` (which walks the element's own subtree);
  - returns a bitmask: `1` = values changed, `2` = matrix dirtied.
- `pxl.Polyline.clearPoints()` also removes point keys (`pN`) from `toLocalAttributeKeys`, like from the other key lists (point coordinates can use `toLocal` too).

### 3.3 The walk (`broadcastGlobalMatrixChange` in `js/elements/node.js`)

Per child, in this order:

```js
let walked = false;
if (child.toLocalAttributeKeys.length > 0) {   // every child is a PxlNode, so the list always exists
  // The child's own space moved: its toLocal results are stale
  walked = (pxl.evaluateToLocalAttributes(child) & 2) !== 0;   // setLocalMatrixDirty() already walked the subtree
}

// Broadcast the child if someone tracks it (unchanged, now with fresh values)
if (child._refKey && subs[child._refKey] && subs[child._refKey].length > 0) {
  pxl.broadcast(child._refKey);
}

if (!walked && typeof child.broadcastGlobalMatrixChange === 'function') {
  child.broadcastGlobalMatrixChange();
}
```

- Re-evaluate before broadcasting, so the child's subscribers read the new values.
- Skip the recursion when the re-evaluation already walked the subtree (avoids walking grandchildren twice).

### 3.4 Timing

A moving container calls the walk from its own `evaluateAnimations` (animated move) or `attributeChangedCallback` (static move), before its children are drawn. The reader therefore has its new value in the same frame: no one-frame lag.

---

## 4. Alternatives Considered

| Alternative | Why not |
|---|---|
| Treat every `toLocal` expression as time-dependent (1 line in the compiler) | Every layer with a `toLocal` reader would redraw every frame forever, even when nothing moves. Breaks the "static layers are drawn once" principle (`DOCS_STANDARDS.md` §11, layer dirty flags). |
| Subscribe the reader to its ancestors' `ref.*` keys | Ancestors often have no `id`, so they have no key and never broadcast. |
| Check the caller's parent matrix version inside `pxl.toLocal` | `toLocal` only runs when something evaluates it; a stale reader is never evaluated. Needs the walk anyway. |

---

## 5. Edge Cases

- **Reader and target in the same moving subtree**: both paths fire (target broadcast and walk). The reader is evaluated twice with the same result. Harmless.
- **Nested readers**: a reader inside a group inside the moving layer is reached by the recursion. If its re-evaluation moves it, its own subtree is walked by `setLocalMatrixDirty()`.
- **`<pxl-var>` readers**: variables are `PxlNode`s registered in their container's `childList`, so the walk reaches them too.
- **Time-dependent `toLocal`**: unchanged, still evaluated every frame (not in `toLocalAttributeKeys`).
- **Disconnect / reconnect**: `toLocalAttributeKeys` belongs to the element like `reactiveAttributeKeys` and survives; `connectedCallback` already re-evaluates all reactive attributes once.
- **Attribute replaced** (`setAttribute` with a non-`toLocal` value): `compileAttribute` removes the key.
- **Not changed by this fix**: a target in a layer that is drawn *after* the reader's layer still reaches the reader one frame late (existing behaviour of every `ref.*` across layers).

---

## 6. Cost

- **Code**: about 25 lines (compiler 2, engine about 18, node about 6).
- **Walk**: one extra property check per child on each container move; the walk itself already runs.
- **Re-evaluation**: only for elements with `toLocal` attributes, only when an ancestor actually moved. Each `toLocal` call is one matrix inversion and one multiplication (zero-GC scratch matrices).
- **Idle frames**: no change. Nothing is evaluated or redrawn unless something moves.

### 6.1 Measured (2026-10-26, `examples/test39.html`, rotating layer with 50 squares)

| What | Time | Share of a 60 FPS frame (16,667 µs) |
|---|---|---|
| Today's walk over 50 children (runs on every move already) | ≈ 0.15–0.45 µs per frame | ≤ 0.003% |
| Planned walk, nobody uses `toLocal` (3 rounds × 50,000 runs) | 0.184 / 0.154 / 0.146 µs vs. today 0.200 / 0.152 / 0.154 µs | no measurable difference |
| One `toLocal()` call | ≈ 0.05 µs | 0.0003% |

A reader with `x` and `y` costs two calls (≈ 0.1 µs), only in frames where its own space moved. Build size: 54.67 KB minified (was ≈ 54 KB).

---

## 7. Tests

1. `scratch/tolocal_numbers.html` **without** the `+ t * 0` workaround: the ring stays on the circle; the read-out changes every frame.
2. Static move: a button / `setAttribute('rotate', …)` on layer B (no animation) moves the reader once and the layer then stays idle (check `fps` drops to 0 when nothing moves).
3. Nested: reader inside a group inside a rotating layer; target in another layer.
4. Same subtree: reader and target both inside the rotating layer (no regression, no flicker).
5. Existing `toLocal` users show no change: `examples/test34.html`, `examples/test37.html`, `examples/test43.html`, `examples/benchmark.html`, `docs/walkthrough.html` §8.
6. Console clean on all of the above; `node build.js` passes (namespace check).
7. Walkthrough: `docs/walkthrough.html` §8, move and rotate the line's own layer (`x="500" y="300" rotate="30"`): the line still connects both circles; then rotate a circle layer: the line follows (target side unchanged).

### 7.1 Results (2026-10-26)

Tests 2–4 run in `scratch/tolocal_fix_tests.html`; "OK" means the stored value equals a fresh `pxl.toLocal()` call.

| Test | Result |
|---|---|
| 1. Demo without workaround | OK in 4 samples over 2.8 s (e.g. stored `(−391, −97)` = correct `(−391, −97)`) |
| 2. Static move (`setAttribute` on the reader's layer) | OK before and after the move; stage at 0 FPS when idle afterwards |
| 3. Nested reader (group in rotating layer), `<pxl-var>` reader, polyline point reader | OK in 3 samples each; keys listed: `x`, `y` / `value` / `p2`, `p3` |
| 4. Reader and target in the same moving subtree | OK in 3 samples |
| 5. `test34`, `test37`, `test43`, `benchmark` | Render as before, no console errors |
| 6. Build; console sweep over 11 docs pages | Build passes; no console errors |
| 7. Walkthrough §8 | OK: `(200, 100)` before, `(−360, −23)` after moving the line's layer, then follows a rotated circle layer |

---

## 8. Docs

- `.agents/KILOPIXEL.md`, Coordinate Mapping → **Reactivity**: readers now also update when their own space moves (walk from the moving container).
- `design/2026-10-25_refs_across_spaces_note.md`: link this plan; the point form (`toLocal(ref.zig, 'x3')`) builds on the same reactivity.
- `.agents/TODO.md`: entry for the fix, closed when done.
- Public docs: nothing to change; `toLocal` simply behaves as documented.

---

## 9. Steps

1. ✅ Approve this plan.
2. ✅ Implement §3.1–§3.3, run `node build.js`, update the `pxl.min.js` size (CLAUDE.md rule: ~55KB).
3. ✅ Run the tests in §7.
4. ✅ Update the docs in §8.
5. Review the diff, then commit (`fix(engine): toLocal readers update when their own space moves`).
