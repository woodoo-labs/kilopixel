# Shared Base Classes for the Elements (Parked)

- **Status**: 💬 **Discussion** (2026-11-28, parked: small gain against an extra class level; pick up when the element lifecycle is reworked)
- **Date**: 2026-11-28
- **Origin**: phases 6 and 8 and decision D8 of `design/done/2026-11-28_engine_restructure_plan.md`, which took them from steps 2, 4 and 5 of `design/archive/2026-11-22_engine_structure_cleanup_plan.md`
- **Related**: `design/2026-10-30_space_attribute_plan.md` (TODO §28: a reason to rework the lifecycle and the transform path anyway)

---

## 1. The Ideas

1. **`pxl.BaseElement`** (`js/elements/base.js`), the base of `Stage` and `PxlNode`: `values` with the hidden `$node`, `assigningRef`, the id registry (`registeredId`, `_isRegistered`, `pxl.renameNode()` from `attributeChangedCallback()`), properties set before the upgrade (`_pendingProperties`), and `attributeChangedCallback()` for unchanged values and `id`.
2. **`pxl.Container`** (`js/elements/container.js`), the base of `Layer` and `Group`: `childList`, the DOM sort, `registerChild()` / `unregisterChild()`, the child update and draw loops.
3. **Hit testing in a file of its own** (D8 of the restructure plan): `pxl.dummyCtx` and the walk (`findShapeAt()`, `findShapeIn()`, `hitsShape()`) out of `interaction.js`.

## 2. Why Parked (Measured 2026-11-28, After Restructure Phase 5)

| Idea | Repeated code today | Catch |
|---|---|---|
| `pxl.BaseElement` | about 15 lines in `stage.js` (constructor, `attributeChangedCallback()`, `connectedCallback()`, `disconnectedCallback()`) | The two `connectedCallback()`s register the id at different moments: a node evaluates its reactive values and collects its sources first, so its readers find it complete; the stage registers at once. A base class could offer helpers, not own the lifecycle, and each subclass would have to know when to call them. |
| `pxl.Container` | about 12 lines (fields, `registerChild()`, `unregisterChild()`, the sort) | The update loops differ (a layer goes on after a failed evaluation, it still has to note animated content; a group stops), and the draw methods share almost nothing (a layer writes CSS, clears and scales by `u`; a group saves and transforms). Only the small part would be shared. |
| Hit testing apart | the walk is three `pxl.InteractionEngine` methods (about 70 lines) and the dummy context (about 10) | A file of its own needs a class or `pxl.*` functions taking the engine; `interaction.js` (about 570 lines) is about one subject already, the pointer over shapes. |

Together about 25–30 lines less (the cleanup idea's −1 to −1.5 KB included `pxl.describe()`, built on 2026-11-28 in `1c01aca`), for one more class level and lifecycle rules a reader has to learn. Phases 1–5 of the restructure plan made each feature findable in one file; these would mostly move a few lines between classes.

## 3. When to Pick Up

When the element lifecycle changes anyway: `space` (TODO §28) gives elements a second parent frame; a new element kind that is a container (a clip or mask group) would be a third copy of the container code, which would change the count above.

## 4. Also Open: Parents Kept After Removal

Since phase 7 of the restructure plan (`design/done/2026-11-28_engine_restructure_plan.md` §14), every node clears `stage` on disconnect. `parentLayer` and `parentContainer` are set on connect (`js/elements/node.js`) and never cleared, so a removed shape or group still points at its former layer and container:

- **Memory:** an element that the page or a framework keeps after removing it (a detached list item, a cached component) keeps its former layer alive, and with it the layer's canvas (1000 × 600 CSS px at a pixel ratio of 2: about 9.6 MB). Unmeasured how often that happens in practice.
- **Wasted frames:** `valueChanged()`, `evaluateReactive()` and `evaluateAnimations()` call `parentLayer?.invalidate()`, so setting an attribute on a removed shape marks its former layer dirty and asks that layer's stage for a frame that changes nothing.

Clearing both on disconnect would need a check of what reads them while an element is detached: `getGlobalMatrix()` walks `parentContainer`, the hit walk and `toLocal()` read matrices of connected elements only, and `releaseElement()` reads `parentContainer` of the removed element before `stage` is cleared. Fits the same lifecycle work as §1.

## Log

- 2026-11-28: §4: `parentLayer` and `parentContainer` stay set after removal (memory, wasted frames), recorded after restructure phase 7.
- 2026-11-28: parked from the restructure plan (its phases 6 and 8, D8) after measuring how much they would share (§2).
