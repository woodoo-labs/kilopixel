# Engine Structure Cleanup

- **Status**: ⚪ **Superseded by** `design/done/2026-11-28_engine_restructure_plan.md` (2026-11-28, merged: steps 2–4 are its phases 6–8, step 6 is in its §8)
- **Date**: 2026-11-22
- **Origin**: §6 and decision D7 of `design/done/2026-11-20_custom_shapes_plan.md`, which took them from the cleanup draft of 2026-11-20 (`scratch/2026-11-20_engine_structure_cleanup_plan.md` (not kept))
- **Related**: `design/2026-10-30_space_attribute_plan.md` (step 6 goes with it, TODO §28), `design/done/2026-11-20_evaluation_model_plan.md` (rewrites the evaluation loops step 4 touches)
- **Target Implementation**: `js/elements/node.js`, `js/elements/stage.js`, `js/elements/layer.js`, `js/elements/group.js`, a new `js/elements/base.js` and `js/elements/container.js`, `js/interaction.js`, `js/compiler.js`, `js/graphics.js`; `build.js` (file list)
- **Prototypes**: `design/prototypes/2026-11-20_custom_shapes/transform_path/` (step 6, made for the custom shapes plan)

---

## 1. Goal

Less repeated code between the element classes, without any change in behavior: each step one commit, the tests are the check. Measured 2026-11-20: −1 to −1.5 KB for steps 1–4, about −0.5 KB for step 6.

## 2. Steps

1. **`pxl.describe(element)`:** the text `<pxl-rect id="btn">` for warnings, in 4 places today.
2. **`pxl.BaseElement`** (new `js/elements/base.js`), the base of `Stage` and `PxlNode`: `values` with the hidden `set` / `$node`, the `id` registry (`refKey`, `_isRegistered`, rename), properties set before the upgrade, `attributeChangedCallback()` for unchanged values and `id`, passing other names to the subclass. Methods on the class, so the fields stay in their class.
3. **`stage` and `releaseElement()` in `PxlNode`:** set on connect, cleared on disconnect, for every node; removing a layer then releases hover and press in its own `disconnectedCallback()` (same states, no events). `Variable` registers with the stage only when stage-level.
4. **`pxl.Container`** (new `js/elements/container.js`), the base of `Layer` and `Group`: `childList`, sorting, register / unregister (both invalidate `parentLayer`, which is the layer itself for a layer), the update and draw loops.
5. **Split `interaction.js`:** handler compiling to `compiler.js`; `pxl.dummyCtx` and the walk to `js/hit_testing.js`; states, boundary events and dispatch stay (about 470 lines). Organization only.
6. **One transform path** (decision D1): every shape drawn with its global matrix (`setTransform()`), as isolation and hit testing already are; groups and layers apply no transform when drawing; `pxl.applyTransformState()` and `pxl.applyContextState()` go. Measured 2026-11-20 as a patch over commit `2f75888` (`transform_path/`):
   - **Pixels:** 24 docs and 56 example pages, 169 stages, 300 layers, every layer drawn old, patched, old again, compared premultiplied: 284 layers identical, 16 differ only on anti-aliased edges (worst: `examples/test45.html`, filled circles 15 groups deep, at most 77 / 255 on single edge pixels; the matrices agree to 7 · 10⁻⁶ device pixels). Two traps: Chrome moves a canvas from GPU to CPU drawing after a few `getImageData()` calls (read every layer three times first), and un-premultiplied values of nearly transparent pixels jump by up to 255.
   - **Frame time:** 5,000 circles, `Layer.render()` only, old and patched alternating: 3–9 % slower in 8 of 9 runs (0.6–2 ms per frame), from the matrix lookup per shape.
   - So not alone: with `space` (TODO §28), whose extra transform becomes a different parent matrix.
   - *2026-11-22:* since phase 2 of the custom shapes plan, a layer scales its context by `u` once and everything inside draws in logical units; the global matrix of this step would then be multiplied by `u` × DPR per shape, as isolation and hit testing do now. The tools of that phase compare two builds pixel by pixel and by frame time (`design/prototypes/2026-11-20_custom_shapes/phase2/run.js`), which fits this step too.

Steps 1–5 and step 6 are independent: 1–5 can go in any time; 6 waits for `space`.

## 3. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | The transform path (step 6; D7 of the custom shapes plan) | with `space`, not alone |
| D2 | Steps 1–5: when | when the element classes are touched next, or before the npm release |

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-28: merged into `design/done/2026-11-28_engine_restructure_plan.md` and archived: step 1 built there as `pxl.describe()` (`1c01aca`); steps 2–4 are its phases 6–8; step 5's handler compiling went to `js/handlers.js` (its phase 2), the hit-testing split is its D8; step 6 is in its §8, still tied to `space`.
- Status line until 2026-11-28: 💬 **Discussion** (2026-11-22, moved out of the custom shapes plan; to be discussed; step 6 waits for `space`)
- 2026-11-22: moved out of `design/done/2026-11-20_custom_shapes_plan.md` (§6 and D7) when that plan was closed.
