# Local Coordinates & Mouse Tracking Implementation Plan

## The Problem
When building complex 2D editors or games, the global screen mouse coordinates (`ref.main.mouseX`) do not match the local coordinates inside a rotated, scaled, or translated group/layer. Users need a way to easily map arbitrary global coordinates (like the mouse) into the local space of any specific container, so elements can track the mouse accurately regardless of camera zoom or group rotation.

## The Solution
We will extend the existing declarative `toLocal()` math function to support overloaded arguments. 
Currently, `toLocal` accepts another DOM node: `toLocal(ref.player, 'x')`. 
We will overload it so it can also accept raw global X/Y coordinates: `toLocal(ref.main.mouseX, ref.main.mouseY, 'x')`.

Because the compiler naturally translates `toLocal(...)` into `pxl.mapCoordinate(this, ...)`, the compiler itself requires **zero modifications**. We only need to update the math engine in `matrix.js`.

## Proposed Changes

### 1. `js/matrix.js`
Update `pxl.mapCoordinate` to detect if the first two arguments are numbers (representing global X and Y). 

If numbers are detected:
1. Retrieve the `caller.parentContainer.getGlobalMatrix()` (defaulting to identity if no parent).
2. Invert that matrix into `pxl._scratchMatrixA` (zero-GC).
3. Push the global (X,Y) point through the inverted matrix using a standard affine transformation:
   * `localX = m[0]*X + m[2]*Y + m[4]`
   * `localY = m[1]*X + m[3]*Y + m[5]`
4. Return the requested `'x'` or `'y'` component.

### Example Code Update in `matrix.js`:
```javascript
pxl.mapCoordinate = function(caller, arg1, arg2, arg3) {
  if (!caller) return 0;
  const parentGlobal = caller.parentContainer ? caller.parentContainer.getGlobalMatrix() : pxl._identityMatrix;

  // OVERLOAD 1: toLocal(globalX, globalY, prop)
  if (typeof arg1 === 'number' && typeof arg2 === 'number') {
    const globalX = arg1, globalY = arg2, prop = arg3;
    pxl.Matrix.invert(pxl._scratchMatrixA, parentGlobal);
    
    if (prop === 'x') {
      return pxl._scratchMatrixA[0] * globalX + pxl._scratchMatrixA[2] * globalY + pxl._scratchMatrixA[4];
    }
    if (prop === 'y') {
      return pxl._scratchMatrixA[1] * globalX + pxl._scratchMatrixA[3] * globalY + pxl._scratchMatrixA[5];
    }
    return 0;
  }

  // OVERLOAD 2: toLocal(ref.node, prop)
  const targetObj = arg1, prop = arg2;
  const targetNode = targetObj && targetObj.$node ? targetObj.$node : targetObj; 
  const targetGlobal = targetNode && targetNode.getGlobalMatrix ? targetNode.getGlobalMatrix() : null;
  if (!targetGlobal) return 0;

  pxl.Matrix.invert(pxl._scratchMatrixA, parentGlobal);
  pxl.Matrix.multiply(pxl._scratchMatrixB, pxl._scratchMatrixA, targetGlobal);

  if (prop === 'x') return pxl._scratchMatrixB[4];
  if (prop === 'y') return pxl._scratchMatrixB[5];
  if (prop === 'rotate' || prop === 'r') return Math.atan2(pxl._scratchMatrixB[1], pxl._scratchMatrixB[0]) * 180 / Math.PI;
  if (prop === 'scaleX' || prop === 'sx') return Math.sqrt(pxl._scratchMatrixB[0]*pxl._scratchMatrixB[0] + pxl._scratchMatrixB[1]*pxl._scratchMatrixB[1]);
  if (prop === 'scaleY' || prop === 'sy') return Math.sqrt(pxl._scratchMatrixB[2]*pxl._scratchMatrixB[2] + pxl._scratchMatrixB[3]*pxl._scratchMatrixB[3]);
  
  return 0;
};
```

## Zero-GC Validation
This approach does not allocate any arrays or objects. It relies entirely on `pxl._scratchMatrixA` and basic mathematical primitives, fully preserving our zero-GC architectural constraints.

## User Implementation Example
Once implemented, users can easily track local mouse positions by adding a tracking element inside their rotated/scaled group:
```html
<pxl-group rotate="45" scale="2">
  <pxl-circle id="mouseTracker" x="toLocal(ref.main.mouseX, ref.main.mouseY, 'x')" y="toLocal(ref.main.mouseX, ref.main.mouseY, 'y')" />
</pxl-group>
```
