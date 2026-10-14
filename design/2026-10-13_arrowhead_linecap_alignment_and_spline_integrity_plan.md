# Arrowhead Linecap Alignment & Spline Integrity Plan (de Casteljau Reference)

- **Status**: ⚪ **Superseded by `design/2026-10-14_unified_arrowhead_geometry_plan.md`** (kept as history)
- **Date**: 2026-10-13
- **Related Plans**: `design/2026-10-12_centralized_arrowhead_geometry_plan.md`, `design/2026-10-13_simplified_arrowhead_geometry_plan.md`
- **Target Implementation**: `js/elements/shapes/polyline.js`, `js/elements/shapes/line.js`
- **Validation Pages**: `examples/test24.html`, `docs/arrows.html`

---

## 1. Executive Summary & Core Architectural Principle

In Kilopixel, arrowheads can be attached to any open-path shape (`<pxl-line>`, `<pxl-polyline>`, `<pxl-circle>`, `<pxl-ellipse>`) using two visual styles:
- **`arrowstyle="filled"`**: A solid equilateral triangle drawn with `ctx.fill()`.
- **`arrowstyle="line"`**: An open stroked chevron drawn with `ctx.stroke()`.

### 1.1 The Core Design Principle
> **"Line Cap defines where the line ends. Arrowheads end at that exact same spot."**

An arrowhead represents the **active termination of the stroke**:
1. If a line without an arrowhead extends to a certain physical boundary because of its `linecap`, the arrowhead tip must land **at that exact same physical boundary**.
2. **Overshoot is 100% independent of `arrowstyle`**: Both `arrowstyle="filled"` and `arrowstyle="line"` reach the exact same outer boundary.
3. The underlying stroke terminates **behind the arrowhead**, ensuring:
   - For `filled` arrows, the blunt stroke cap is completely enclosed inside the wide triangle body, leaving only a sharp 1-unit tip at the outer boundary.
   - For `line` arrows, the stroke cap never bulges or protrudes through the front of the chevron apex.
4. For smooth curves (`<pxl-polyline smooth="1">`), path geometry must remain **100% invariant**—arrowhead sizing or pullback must never mutate spline control vertices.

---

## 2. Mathematical Formulation (Full Polynomial Model)

Let:
- $W = \text{strokewidth} \times u$ (scaled stroke width)
- $S = \text{arrowSize} \times u$ (scaled arrowhead length)
- $P_t = (x_t, y_t)$ (the mathematical endpoint declared on the shape)
- $\mathbf{T} = (\cos \theta, \sin \theta)$ (the unit tangent vector pointing forward along the path termination)

### 2.1 Physical Outer Boundary ($P_{\text{outer}}$)
The physical boundary of a stroked line is determined solely by `linecap`:
$$\Delta_{\text{cap}} = \begin{cases} 0 & \text{if } \text{linecap} = \text{'butt'} \\ \frac{W}{2} & \text{if } \text{linecap} \in \{\text{'square'}, \text{'round'}\} \end{cases}$$

$$P_{\text{outer}} = P_t + \Delta_{\text{cap}} \cdot \mathbf{T}$$

### 2.2 Arrowhead Glyph Placement
Both styles reach $P_{\text{outer}}$:
1. **`arrowstyle="filled"`**: Rendered with `ctx.fill()` (zero stroke join expansion). Apex vertex is placed directly at $P_{\text{outer}}$:
   $$P_{\text{apex}} = P_{\text{outer}} = P_t + \Delta_{\text{cap}} \cdot \mathbf{T}$$
2. **`arrowstyle="line"`**: Rendered with `ctx.stroke()`. Because the stroked chevron corner expands forward by its join geometry ($\Delta_{\text{join}} = W$ for miter, $W/2$ for round), the path vertex is retracted by $\Delta_{\text{join}}$ so its outer stroked edge reaches $P_{\text{outer}}$:
   $$P_{\text{vertex}} = P_{\text{outer}} - \Delta_{\text{join}} \cdot \mathbf{T}$$

### 2.3 Spline Trimming via de Casteljau Subdivision
For cubic Bezier segment defined by control points $p_1, cp_1, cp_2, p_2$:
1. Compute chord length: $L_{\text{seg}} = \|p_2 - p_1\|$.
2. Setback: $d_{\text{setback}} = \min(0.6 \cdot S, \max(1.6 \cdot W, 0.35 \cdot S))$.
3. Fractional parameter: $t_{\text{trim}} = 1 - \min(d_{\text{setback}} / L_{\text{seg}}, 0.8)$.
4. de Casteljau coordinates:
   $$\begin{aligned}
   q_0 &= p_1 + (cp_1 - p_1) \cdot t_{\text{trim}} \\
   q_1 &= cp_1 + (cp_2 - cp_1) \cdot t_{\text{trim}} \\
   q_2 &= cp_2 + (p_2 - cp_2) \cdot t_{\text{trim}} \\
   r_0 &= q_0 + (q_1 - q_0) \cdot t_{\text{trim}} \\
   r_1 &= q_1 + (q_2 - q_1) \cdot t_{\text{trim}} \\
   S &= r_0 + (r_1 - r_0) \cdot t_{\text{trim}}
   \end{aligned}$$
5. Stroke curve terminates with `ctx.bezierCurveTo(q0.x, q0.y, r0.x, r0.y, S.x, S.y)`.
6. Arrow orientation is computed along secant $\mathbf{S} = P_{\text{outer}} - S$.

---

## 3. Implementation Code (de Casteljau Model)

```javascript
// Polyline draw segment with de Casteljau:
const dx = p2x - p1x, dy = p2y - p1y;
const chordLen = Math.sqrt(dx * dx + dy * dy);
const setback = Math.min(arrowEndSize * u * 0.6, Math.max(strokewidth * u * 1.6, arrowEndSize * u * 0.35));
const dt = setback / (chordLen > 0 ? chordLen : 1);
const t = dt < 0.8 ? 1 - dt : 0.2;

const q0x = p1x + (cp1x - p1x) * t, q0y = p1y + (cp1y - p1y) * t;
const q1x = cp1x + (cp2x - cp1x) * t, q1y = cp1y + (cp2y - cp1y) * t;
const q2x = cp2x + (p2x - cp2x) * t, q2y = cp2y + (p2y - cp2y) * t;
const r0x = q0x + (q1x - q0x) * t,   r0y = q0y + (q1y - q0y) * t;

const mt = 1 - t;
const sX = mt*mt*mt*p1x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*p2x;
const sY = mt*mt*mt*p1y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*p2y;

ctx.bezierCurveTo(q0x, q0y, r0x, r0y, sX, sY);
arrowEndAngle = Math.atan2(arrowEndTipY - sY, arrowEndTipX - sX);
```
