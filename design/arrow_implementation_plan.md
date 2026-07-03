# Add Dynamic Arrowheads to Shapes

This plan introduces native arrowhead support for `<pxl-line>`, `<pxl-polyline>`, `<pxl-circle>`, and `<pxl-ellipse>`. It implements the mathematical offset and formatting rules we discussed, and ensures **zero performance overhead** by preventing irrelevant shapes from tracking arrow properties.

*(Note: The `<pxl-line>` element has already been implemented and tested successfully).*

## Architecture & Performance Guarantee

1. **Subclass Isolation**: The arrow attributes will *only* be added to the path-based shapes (`Line`, `Polyline`, `Circle`, `Ellipse`). Shapes like `<pxl-rect>` and `<pxl-text>` will not observe or evaluate these attributes, protecting the 60fps loop from useless math.
2. **Fast-Path Bailout**: Every `draw()` method in the path shapes features a strict bailout:
```javascript
if (!arrowstart && !arrowend) {
  // Original, unmodified fast-path drawing logic
} else {
  // Arrow offset and tangent math
}
```

## Proposed Changes

### `js/elements/shape.js`

**1. Attribute Definitions in Subclasses**
- For `Polyline`, `Circle`, and `Ellipse`:
  - Add `'arrowstart'`, `'arrowend'`, and `'arrowstyle'` to their `observedAttributes`.
  - Add `arrowstart: 0, arrowend: 0, arrowstyle: 'filled'` to their default `attributeExpressions` and `attributeValues`.

### Specific Shape Render & Math Logic

#### `Polyline`
- **Tangent Math (Catmull-Rom Insight)**:
  - Start Angle: `Math.atan2(firstY - secondY, firstX - secondX)`
  - End Angle: `Math.atan2(lastY - secondToLastY, lastX - secondToLastX)`
  - **Why this works for `smooth` (Catmull-Rom) polylines**: In the open Catmull-Rom algorithm, the imaginary control point for the final node is clamped to the final node itself. Because the cubic Bezier curve uses `cp2 = p2 - (p3 - p1) * (tension/6)`, and `p3 == p2`, the vector from `cp2` to the end point `p2` is exactly parallel to the line between `p1` and `p2`. This brilliant geometric property means **the tangent of the smoothed curve at the endpoint is mathematically identical to the straight line tangent**. Therefore, we can bypass expensive Bezier derivatives entirely and just use `Math.atan2` on the last two points!
- **Render**: Temporarily mutate the first and last points in `this.flatCache` to pull back the physical drawn path by `0.75 * arrowSize`. Stroke the path, call `this.drawArrow(...)`, then exactly restore the `flatCache` instantly to prevent permanent mutation.

#### `Circle`
- **Tangent Math**: The tangent is perfectly perpendicular to the radius.
  - Direction: `const dir = anticlockwise ? -1 : 1;`
  - Start Angle: `sRad - (Math.PI / 2) * dir`
  - End Angle: `eRad + (Math.PI / 2) * dir`
- **Render**: Convert `arrowend` pixels into an angular delta (`deltaRad = (arrowSize * 0.75) / r`). Adjust the curved arc's start/end angles so it stops exactly deep inside the arrowhead base. Call `this.drawArrow(...)` using `r * Math.cos(angle)` / `r * Math.sin(angle)` as the true tip coordinates.

#### `Ellipse`
- **Tangent Math**: Because an ellipse is squashed (`rx` vs `ry`), the tangent requires evaluating its mathematical derivative.
  - Derivative of parametric equation `(rx * cos(t), ry * sin(t))` is `(-rx * sin(t), ry * cos(t))`.
  - Clockwise Tangent: `Math.atan2(ry * Math.cos(t), -rx * Math.sin(t))`
  - Anticlockwise Tangent: Rotate the above angle by 180 degrees (`+ Math.PI`).
- **Render**: Like Circle, approximate the angular delta based on local radius to shorten the arc slightly by `0.75 * arrowSize`, then call `this.drawArrow(...)` using `rx * Math.cos(angle)` / `ry * Math.sin(angle)` as the true tip coordinates.
