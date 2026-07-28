# Coordinate Mapping & Transformation Pipeline Implementation Plan

## Goal Description
Establish 100% consistent, lowercase attribute naming across the Kilopixel engine and introduce a mathematical symmetry between simple property reads (`ref.shape.*`) and relative global-to-local matrix mapping (`toLocal(ref.shape, '...')`). 

Specifically:
- Eliminate camelCase attribute names and internal parameter inconsistencies (`scaleX`, `scaleY`, `skewX`, `skewY`) across `js/matrix.js`, `js/graphics.js`, `js/elements/group.js`, `js/elements/layer.js`, and `js/elements/shape.js`.
- Remove unnecessary defensive checks (`|| 0`, `!== undefined`, `targetNode.attributeValues && ...`) across `js/matrix.js`, `js/graphics.js`, and `js/elements/node.js`, relying on constructor default attribute initialization for 60 FPS zero-GC performance.
- Simplify scale resolution in `js/node.js` and `js/graphics.js` to `scale !== 1 ? scale : scalex` by initializing default `scale`, `scalex`, and `scaley` to `1`.
- Fix a critical rendering bug in `group.js`, `layer.js`, and `shape.js` where `render()` checked undefined camelCase `scaleX`, `scaleY`, `skewX`, `skewY` when evaluating `hasStateChanges`, causing isolated `scalex` or `skewx` attributes to be silently ignored.
- Provide non-enumerable `.tx` and `.ty` property getters on `attributeValues` (`ref.shape.tx`) returning `x + dx` and `y + dy` for shapes in the same coordinate space.
- Standardize `toLocal(ref.shape, '...')` property mapping to support canonical lowercase properties (`x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scale`, `scalex`, `scaley`) under the **Kilopixel Golden Rule of Scaling**, and fix existing bugs (`'r'` hijacking radius).

---

## Architecture & Naming Specification

### 1. Canonical Lowercase Properties
All coordinates, transformations, and scale factors are strictly lowercase across the engine:
- `x`, `y` ➔ Hinge origin coordinates (`0`)
- `dx`, `dy` ➔ Offset vector components (`0`)
- `tx`, `ty` ➔ Total physical screen coordinate (`x + dx` / `y + dy`)
- `rotate` ➔ Rotation angle in degrees (`0`)
- `scale`, `scalex`, `scaley` ➔ Scale multipliers (`1`)
- `skewx`, `skewy` ➔ Skew angles in degrees (`0`)

### 2. The Kilopixel Golden Rule of Scaling
1. **Uniform Scaling (95% of cases):** Use `scale="..."`. Sets both X and Y axes uniformly.
2. **Non-Uniform Scaling:** Use `scalex="..."` and/or `scaley="..."`. Sets horizontal and vertical axes independently.
3. **No Mixing:** Never mix `scale` with `scalex` or `scaley` on the same element (`scale` takes precedence: `scale !== 1 ? scale : scalex`).

### 3. Symmetrical Reference Matrix (`ref.*` vs `toLocal(*)`)

| Property | Simple Reference (`ref.shape.*`) (Same layer / simple math) | Transformed Reference (`toLocal(ref.shape, '...')`) (Across layers, rotations, scalings) |
| :--- | :--- | :--- |
| **`'x'` / `'y'`** | `x` / `y` (Logical Hinge Origin) | Transformed Hinge Origin `(x, y)` |
| **`'dx'` / `'dy'`** | `dx` / `dy` (Local Offset) | Transformed Rotated/Scaled Offset Vector `(tdx, tdy)` |
| **`'tx'` / `'ty'`** | `x + dx` / `y + dy` (Total Local Position) | Total Transformed Physical Screen Coordinate |
| **`'rotate'`** | Raw `rotate` attribute in degrees | Relative world rotation angle in degrees |
| **`'scale'`** | Raw uniform `scale` attribute | Relative uniform matrix scale factor (identical to `scalex` under uniform scaling) |
| **`'scalex'` / `'scaley'`** | Raw axis scale attributes | True relative world X-axis and Y-axis scale multipliers |

---

## Proposed Source Changes

### 1. `js/elements/node.js`
- Add non-enumerable `.tx` and `.ty` getters to `this.attributeValues` (1 CPU cycle, zero allocations):
```javascript
Object.defineProperty(this.attributeValues, 'tx', { get: () => this.attributeValues.x + this.attributeValues.dx, enumerable: false });
Object.defineProperty(this.attributeValues, 'ty', { get: () => this.attributeValues.y + this.attributeValues.dy, enumerable: false });
```
- Simplify `getLocalMatrix()` scale resolution:
```javascript
const sX = v.scale !== 1 ? v.scale : v.scalex;
const sY = v.scale !== 1 ? v.scale : v.scaley;
```

### 2. `js/graphics.js`
- Simplify `applyContextState()` by removing redundant `!== undefined` and `|| 0` checks:
```javascript
const finalScaleX = scale !== 1 ? scale : scalex;
const finalScaleY = scale !== 1 ? scale : scaley;
if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

if (skewx || skewy) {
  const sx = Math.tan(skewx * Math.PI / 180);
  const sy = Math.tan(skewy * Math.PI / 180);
  ctx.transform(1, sy, sx, 1, 0, 0);
}
if (dx || dy) ctx.translate(dx * u, dy * u);

if (alpha !== 1) ctx.globalAlpha *= alpha;
if (blend !== 'source-over') ctx.globalCompositeOperation = blend;
if (filter !== 'none') ctx.filter = filter;
```

### 3. `js/matrix.js`
- Clean up `updateLocal` function signature, restore `if (rotate)` trig guard, and remove all redundant `|| 0` defensive checks:
```javascript
updateLocal: function(out, x, y, dx, dy, rotate, scalex, scaley, skewx, skewy) {
  if (rotate) {
    const rad = rotate * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    out[0] = c;  out[1] = s;
    out[2] = -s; out[3] = c;
  } else {
    out[0] = 1; out[1] = 0;
    out[2] = 0; out[3] = 1;
  }
  out[4] = x;
  out[5] = y;

  if (scalex !== 1 || scaley !== 1) {
    out[0] *= scalex; out[1] *= scalex;
    out[2] *= scaley; out[3] *= scaley;
  }
  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    const a0 = out[0], a1 = out[1], a2 = out[2], a3 = out[3];
    out[0] = a0 + a2 * sy;
    out[1] = a1 + a3 * sy;
    out[2] = a0 * sx + a2;
    out[3] = a1 * sx + a3;
  }
  if (dx || dy) {
    out[4] += out[0] * dx + out[2] * dy;
    out[5] += out[1] * dx + out[3] * dy;
  }
  return out;
},
```
- Clean up `pxl.mapCoordinate()` to use canonical lowercase names (`x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scale`, `scalex`, `scaley`) without defensive boilerplate:
```javascript
  const dx = targetNode.attributeValues.dx;
  const dy = targetNode.attributeValues.dy;
  const tdx = pxl._scratchMatrixB[0] * dx + pxl._scratchMatrixB[2] * dy;
  const tdy = pxl._scratchMatrixB[1] * dx + pxl._scratchMatrixB[3] * dy;

  if (prop === 'x')      return pxl._scratchMatrixB[4] - tdx;
  if (prop === 'y')      return pxl._scratchMatrixB[5] - tdy;
  if (prop === 'dx')     return tdx;
  if (prop === 'dy')     return tdy;
  if (prop === 'tx')     return pxl._scratchMatrixB[4];
  if (prop === 'ty')     return pxl._scratchMatrixB[5];
  if (prop === 'rotate') return Math.atan2(pxl._scratchMatrixB[1], pxl._scratchMatrixB[0]) * 180 / Math.PI;
  if (prop === 'scale' || prop === 'scalex') return Math.sqrt(pxl._scratchMatrixB[0]*pxl._scratchMatrixB[0] + pxl._scratchMatrixB[1]*pxl._scratchMatrixB[1]);
  if (prop === 'scaley') return Math.sqrt(pxl._scratchMatrixB[2]*pxl._scratchMatrixB[2] + pxl._scratchMatrixB[3]*pxl._scratchMatrixB[3]);
```

### 4. `js/elements/group.js`, `js/elements/layer.js`, `js/elements/shape.js`
- Set constructor default `attributeExpressions` in `group.js`, `layer.js`, and `shape.js` to use:
```javascript
{ scale: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0 }
```
- Fix `render()` destructuring and `hasStateChanges` checks in `group.js`, `layer.js`, and `shape.js` to use canonical lowercase and precise identity checks:
```javascript
const { x, y, dx, dy, rotate, scale, scalex, scaley, skewx, skewy, alpha, blend, filter } = this.attributeValues;
const hasStateChanges = x || y || dx || dy || rotate || 
                        scale !== 1 || scalex !== 1 || scaley !== 1 || 
                        skewx || skewy || 
                        alpha !== 1 || blend !== 'source-over' || filter !== 'none';
```

---

## Verification & Migration Plan

### 1. Engine Build
- Run `node build.js` to compile all source changes into `dist/pxl.min.js`.
- Verify the build succeeds with zero errors.

### 2. Affected Example & Documentation Files
Update files where orbiting/offset objects (`dx`/`dy`) are tracked across coordinate spaces via `toLocal(..., 'x')` / `'y'`, changing them to `'tx'` / `'ty'`:
- **`examples/test37.html`:** Lines 321 & 325 (tracking orbiting `planetA`).
- **`docs/coordinates.html`:**
  - Example 4 (`ex4Rect` offset marker, lines 456–462)
  - Example 6 (`ex6PointA` and `ex6PointB` orbiting markers, lines 784–785, 789–790, 825–826, 828–829)
  - Example 7 (`ex7Planet` crosshairs and arrows, lines 965–966, 969–970)

### 3. Documentation Update
- Update `.agents/framework.md` (lines 542–546 and line 1326) to reflect canonical lowercase `toLocal()` properties (`x`, `y`, `dx`, `dy`, `tx`, `ty`, `rotate`, `scale`, `scalex`, `scaley`).
