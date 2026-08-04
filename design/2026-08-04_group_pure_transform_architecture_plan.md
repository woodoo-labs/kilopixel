# 2026-08-04: Group Pure Transform & Structural Architecture Plan

**Date:** 2026-08-04  
**Status:** Architectural Specification & Implementation Plan  

---

## 1. Goal Description
Refactor `<pxl-group>` into a **Pure Spatial Transform & Structural Container** with zero canvas rendering state and zero compositing overhead.
1. Remove compositing attributes (`alpha`, `blend`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy`) from `Group.observedAttributes` and from the Group rendering loop.
2. Establish a clean 3-tier container architecture:
   - `<pxl-stage>`: Root canvas lifecycle and resolution management.
   - `<pxl-layer>`: Bitmap & compositing container (handles `alpha`, `blend`, `filter`, `shadow*` as unified bitmap operations).
   - `<pxl-group>`: Lightweight spatial transform & structural grouping container (`x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `hidden`).
3. Clean up existing example HTML files in `examples/` by stripping invalid compositing attributes from `<pxl-group>` tags (leaving the `<pxl-group>` tags in place).
4. Update `.agents/KILOPIXEL.md` documentation to reflect the new architecture.

---

## 2. User Review Required

> [!IMPORTANT]
> **Key Architectural Decisions**
> 1. **No Style Cascading or Inheritance**: `<pxl-group>` does not inherit or cascade styles (`fill`, `stroke`, `filter`, etc.) to child elements.
> 2. **Compositing on Layers or Shapes**: To apply alpha opacity, blend modes, filters, or shadows, users should apply them either to `<pxl-layer>` (for unified bitmap compositing) or directly on leaf Shape elements.
> 3. **Example Files Cleanup**: Instead of changing `<pxl-group>` to `<pxl-layer>` in existing examples, we will simply remove the invalid compositing attributes (`alpha`, `blend`, `filter`, `shadow*`) from `<pxl-group>` tags to ensure syntax correctness without modifying the DOM hierarchy.

---

## 3. Proposed Changes

### 1. [MODIFY] `js/elements/group.js`
* Update `static get observedAttributes()` to return exactly 11 attributes:
  ```javascript
  static get observedAttributes() {
    return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'hidden'];
  }
  ```
* Remove `alpha`, `blend`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy` from `this.attributeExpressions` and `this.attributeValues` in `constructor()`.
* Simplify `Group.prototype.render(ctx, u)`:
  * Remove all calls to `pxl.applyContextState(ctx, u, this.attributeValues, this)`.
  * Replace with a lightweight transform-only application (`pxl.applyTransformState(ctx, u, this.attributeValues)` or direct translate/rotate/scale/skew calls).
  * Ensure `ctx.save()` / `ctx.restore()` is only executed when transforms are active.

---

### 2. [MODIFY] `examples/` (Audit & Cleanup)
Strip invalid compositing attributes from `<pxl-group>` tags across the following 6 example files:
* **[MODIFY] [examples/test01.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test01.html)**:
  * Line 52: Remove `blend="screen"` from `<pxl-group ...>`.
  * Line 64: Remove `filter="\`blur(${wave(2)*4}px)\`"` from `<pxl-group ...>`.
* **[MODIFY] [examples/test25.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test25.html)**:
  * Line 55: Remove `alpha="0.05"` from `<pxl-group>`.
* **[MODIFY] [examples/test26.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test26.html)**:
  * Line 29: Remove `alpha="0.05"` from `<pxl-group>`.
* **[MODIFY] [examples/test27.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test27.html)**:
  * Line 21: Remove `alpha="0.05"` from `<pxl-group>`.
* **[MODIFY] [examples/test28.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test28.html)**:
  * Line 68: Remove `alpha="0.03"` from `<pxl-group>`.
* **[MODIFY] [examples/test38.html](file:///C:/Users/micha/woodoo-labs/kilopixel/examples/test38.html)**:
  * Line 67: Remove `shadowcolor="#a855f7" shadowblur="25" shadowy="12"` from `<pxl-group x="0" y="0">`.

---

### 3. [MODIFY] `.agents/KILOPIXEL.md` (Documentation Updates)
Update official Kilopixel documentation to specify `<pxl-group>`'s exact scope and capabilities:
* **Section 2 (Core Elements Reference - `<pxl-group>`)**:
  * Remove `alpha`, `blend`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy` from the supported attributes table.
  * Explicitly define `<pxl-group>` as a **Pure Spatial Transform & Structural Container** (`x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `hidden`).
  * Add an architectural guidance box explaining the 3-tier hierarchy (`Stage` -> `Layer` -> `Group`/`Shape`) and stating that bitmap compositing (`alpha`, `blend`, `filter`, `shadow*`) belongs on `<pxl-layer>` or leaf Shapes.
* **Section 5 (Attribute Inheritance / Cascading)**:
  * Add a subsection explicitly noting that `<pxl-group>` does **not** cascade presentation styles or compositing attributes to child elements, ensuring zero DOM inheritance overhead.

---

## 4. Verification Plan

### Automated Tests
* Run `node build.js` to ensure the framework compiles and bundles without errors.

### Manual Verification
* Open `examples/test01.html`, `test25.html`, `test26.html`, `test27.html`, `test28.html`, and `test38.html` in the browser to verify that removing the invalid attributes from `<pxl-group>` does not break rendering or structural grouping.
* Create a verification test file `examples/test_group_pure_transform.html` demonstrating:
  1. Nested `<pxl-group>` elements applying transforms (`rotate`, `scale`, `x`, `y`) with 60 FPS animation.
  2. Verifying in developer tools that `<pxl-group>` no longer parses or reacts to compositing attributes.
