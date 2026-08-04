# 2026-08-04: Group Pure Transform & Structural Architecture Plan

**Date:** 2026-08-04  
**Status:** Architectural Specification & Refactoring Plan  

---

## 1. Goal Description
Establish a clean, predictable 3-tier container hierarchy in Kilopixel by making `<pxl-group>` a **Pure Spatial Transform & Structural Container**.

> [!WARNING]
> **CRITICAL NOTICE: Corrections to Existing Code Required**
> This plan is not simply adding new features—it requires **correcting and refactoring existing code**. Specifically, we must **remove** compositing attributes (`alpha`, `blend`, `filter`, `shadowcolor`, `shadowblur`, `shadowx`, `shadowy`) from `<pxl-group>` in `js/elements/group.js` and discard any style cascading / inheritance proposals.

### Architectural Responsibilities (The 3-Tier Hierarchy)
1. **`<pxl-layer>` (Bitmap & Compositing Container)**: Owns an offscreen `<canvas>`. This is the *only* container where unified bitmap compositing (`alpha`, `blend`, `filter`, `shadow*`) makes semantic sense.
2. **`<pxl-group>` (Pure Spatial Transform & Structural Container)**: Lightweight container that manages **spatial transforms ONLY** (`x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy`) and structural visibility (`hidden`). It does **not** support compositing attributes (`alpha`, `blend`, `filter`, `shadow*`) or style cascading.
3. **`Shape` (`<pxl-*>`) (Leaf Drawing & Styling Node)**: Renders geometry and manages its own explicit presentation styles (`fill`, `stroke`, `strokewidth`, etc.) and leaf-level compositing (`alpha`, `blend`, `filter`, `shadow*`).

---

## 2. Comprehensive Architectural Attribute Matrix

| Attribute | Category | `<pxl-layer>` | `<pxl-group>` | Shape (`<pxl-*>`) | Semantic Behavior |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`x`, `y`** | Transform (Origin) | ✅ | ✅ | ✅ | Defines transform origin and center position in parent space. |
| **`dx`, `dy`** | Transform (Offset) | ✅ | ✅ | ✅ | Visual displacement after rotation/scale (origin stays at `x,y`). |
| **`rotate`** | Transform | ✅ | ✅ | ✅ | Rotates local coordinate space in degrees around `(x,y)`. |
| **`scale`, `scalex`, `scaley`** | Transform | ✅ | ✅ | ✅ | Scales local coordinate space around `(x,y)`. |
| **`skewx`, `skewy`** | Transform | ✅ | ✅ | ✅ | Skews local coordinate space around `(x,y)`. |
| **`alpha`** | Compositing | ✅ *(Layer Bitmap)* | ❌ **Remove** | ✅ *(Shape-level)* | On Layer: fades entire canvas as one image. On Shape: sets shape alpha (`globalAlpha *= alpha`). |
| **`blend`** | Compositing | ✅ *(Layer Bitmap)* | ❌ **Remove** | ✅ *(Shape-level)* | On Layer: blends layer canvas against stage. On Shape: sets shape `globalCompositeOperation`. |
| **`filter`** | Compositing | ✅ *(Layer Bitmap)* | ❌ **Remove** | ✅ *(Shape-level)* | On Layer: filters entire layer as **one unified image**. On Shape: filters that individual shape. |
| **`shadowcolor`, `shadowblur`, `shadowx`, `shadowy`** | Compositing | ✅ *(Layer Bitmap)* | ❌ **Remove** | ✅ *(Shape-level)* | On Layer: drops shadow around **outer silhouette** of layer. On Shape: shadows that shape. |
| **`hidden`** | Visibility | ✅ | ✅ | ✅ | Skips rendering the node and all of its descendants immediately. |
| **`fill`, `stroke`, `strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`** | Presentation Styles | ❌ | ❌ | ✅ *(Draws)* | **No Cascading**: Shapes explicitly define their own styles. References (`ref.theme.color`) can be used for sharing. |

---

## 3. Proposed Changes (File-by-File Detailed Specification)

### 1. [MODIFY] `js/elements/group.js` (Existing Code Correction)
Refactor `Group` to strip all compositing state while preserving spatial transform propagation:
* **Update `observedAttributes` to Exactly 11 Attributes**:
  ```javascript
  static get observedAttributes() {
    return ['x', 'y', 'dx', 'dy', 'rotate', 'scale', 'scalex', 'scaley', 'skewx', 'skewy', 'hidden'];
  }
  ```
* **Remove Compositing Defaults from Constructor**:
  ```javascript
  // Remove alpha, blend, filter, shadowcolor, shadowblur, shadowx, shadowy:
  Object.assign(this.attributeExpressions, {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, hidden: false
  });
  ```
* **Refactor `Group.prototype.render(ctx, u, t)` to Apply Pure Spatial Transforms ONLY**:
  ```javascript
  render(ctx, u, t) {
    if (this.isOrderDirty) {
      this.childList.sort((a, b) => 
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : -1
      );
      this.isOrderDirty = false;
    }

    this.evaluateAnimations(t);

    if (this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasTransformChanges = x || y || dx || dy || rotate || 
                                scale !== 1 || scalex !== 1 || scaley !== 1 || 
                                skewx || skewy;

    if (hasTransformChanges) {
      ctx.save();
      pxl.applyContextState(ctx, u, this.attributeValues); // Applies translate/rotate/scale/skew
    }
    const len = this.childList.length;
    for (let i = 0; i < len; i++) {
      this.childList[i].render(ctx, u, t);
    }
    if (hasTransformChanges) ctx.restore();
  }
  ```

---

### 2. [MODIFY] `.agents/KILOPIXEL.md` (Documentation Correction)
Update official documentation to reflect the pure transform container architecture:
* Under **Section 12: `<pxl-group>`**, update `Observed Attributes` from 18 to **11**:
  * `x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `hidden`.
* Add an explicit architectural note:
  > **Note on Compositing & Styles**: `<pxl-group>` is a pure spatial transform and visibility container. It does not support compositing (`alpha`, `blend`, `filter`, `shadow*`) or style cascading. To apply filters, opacity, or shadows to a collection of shapes as a unified image, use `<pxl-layer>`.

---

### 3. [MODIFY] Existing Examples & Tests (Existing Code Correction)
* Audit all `examples/*.html` files for any `<pxl-group>` tag using `alpha`, `blend`, `filter`, or `shadowcolor`.
* Migrate any such occurrences to `<pxl-layer>` or move attributes to child shapes.

---

## 4. Verification Plan

### Automated Tests
* Run `node build.js` to ensure `group.js` and the engine bundle cleanly without syntax errors.

### Manual Verification
* Create `examples/test_group_pure_transform.html`:
  1. Test a `<pxl-group x="500" y="500" rotate="45" scale="1.5">` containing shapes. Verify spatial transform inheritance (`translate`, `rotate`, `scale`, `skew`) works perfectly via Canvas 2D `save/restore`.
  2. Verify setting `hidden="true"` on `<pxl-group>` hides all child shapes.
  3. Verify that `<pxl-group>` with no active spatial transforms (`x=0, y=0, rotate=0, scale=1`) skips `ctx.save()/restore()`, achieving 0.00ms context overhead.
  4. Verify that `<pxl-layer filter="blur(5px)" alpha="0.5">` correctly composites children as a unified image.
