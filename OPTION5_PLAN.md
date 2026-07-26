# Option 5: Relative Pivot (dx/dy as pivot offset)

## Summary

Change the transform pipeline so that `x/y` = **visual position** and `dx/dy` = **relative pivot offset from position**. The pivot moves with the shape. Children of groups are positioned relative to `x/y`.

### Pipeline Change

```
Current:  T(x,y) → R → S → Skew → T(dx,dy)
Option 5: T(x,y) → T(dx,dy) → R → S → Skew → T(-dx,-dy)
```

At `rotate=0`, shape appears at `(x, y)` regardless of `dx/dy`. When rotation is applied, the shape orbits around `(x+dx, y+dy)`.

### Tradeoffs Accepted

| Gains | Costs |
|---|---|
| `x/y` always = visual position | Shared orbit center requires `dx = -x` per shape |
| Group children relative to `x/y` | Animating orbit radius needs two coupled attributes |
| Pivot moves with shape (hinge model) | Breaking change for existing `dx/dy` usage |
| Matches CSS/Pixi.js mental model | |

### Naming Decision

**Open question:** Keep `dx/dy` as attribute names? The semantic changes from "shape offset" to "pivot offset" — same names, different meaning. This is a breaking change regardless, so renaming could reduce migration confusion. Alternatively, keeping `dx/dy` avoids API churn.

---

## Proposed Changes

### Engine Core (2 files)

#### graphics.js (lines 7-19)

Change `applyContextState` transform order:

```
Before:
  translate(x, y)  →  rotate  →  scale  →  skew  →  translate(dx, dy)

After:
  translate(x, y)  →  translate(dx, dy)  →  rotate  →  scale  →  skew  →  translate(-dx, -dy)
```

Concrete code change:
- Move the `dx/dy` translate from AFTER skew to BEFORE rotate
- Negate the values: `ctx.translate(-dx * u, -dy * u)` at the end

#### matrix.js (lines 10-54)

Change `updateLocal` to match new pipeline order:

- Combine x+dx, y+dy as the initial translation (pivot position)
- Apply rotation, scale, skew around that pivot
- Apply inverse -dx, -dy translation after transforms
- The matrix math: `T(x+dx, y+dy) * R * S * Skew * T(-dx, -dy)`

#### interaction.js

Hit testing rebuilds the transform stack. Verify that `processHitTest` applies transforms in the new order (same sequence as `applyContextState`).

### No Changes Needed

- **node.js** — dirty flagging already tracks dx/dy as matrix-invalidating attributes
- **compiler.js** — no transform logic
- **shape.js / group.js / layer.js** — they call `applyContextState`, no direct transform code
- **engine.js** — reactivity/pub-sub, no transform logic

---

### Documentation and Examples

#### coordinates.html

- Update sections 4-6 to reflect new pipeline semantics
- Section 4 ("Local Offsets"): dx/dy now means pivot offset, not shape offset
- Section 6 ("Animated Orbits"): Update solar system example

#### framework.md

- Update "Coordinate System and Transform Pipeline" section
- Update "AI Code Generation Guide" orbit examples

#### AGENTS.md

- Update coordinate system rules for AI

#### Examples using dx/dy

Affected files (non-zero dx/dy):
- `examples/index.html` — dev test page, multiple uses
- `examples/test01.html` — 1 text offset
- `examples/test03.html` — 1 glitch effect
- `examples/test22.html` — 1 ellipse shift
- `examples/test37.html` — ~30 uses (nebula drift, zodiac ring, planets)

**Migration rule: negate dx/dy values, then add old dx/dy to x/y.**

Example migration for orbit:
```
Before: <pxl-circle x="0" y="0" dx="220" rotate="30" .../>
After:  <pxl-circle x="220" y="0" dx="-220" rotate="30" .../>
```

For simple offsets without rotation (most cases), just move dx/dy into x/y:
```
Before: <pxl-text x="500" y="281" dy="25" .../>
After:  <pxl-text x="500" y="306" .../>
```

---

## Verification Plan

### Automated
- `node build.js` — verify build succeeds

### Manual
- Open `docs/coordinates.html` — verify all 6 interactive demos work correctly
- Open `examples/test37.html` — verify mandala renders identically after migration
- Test orbit behavior: shape with dx/dy + rotate should orbit around (x+dx, y+dy)
- Test group with dx/dy: children should appear relative to group's x/y at rest
- Test toLocal / mapCoordinate still returns correct coordinates
