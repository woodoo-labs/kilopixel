# Arrowhead Look: `arrowcap` & `arrowjoin` (Separating Arrow Style from Shape Style)

- **Status**: 💬 **Discussion / Draft** — direction agreed, open decisions listed in §6
- **Date**: 2026-10-15
- **Builds on**: `design/2026-10-14_unified_arrowhead_geometry_plan.md` (geometry, insets, zero-GC records)
- **Target Implementation**: `js/elements/shape.js`, `js/elements/shapes/line.js`, `polyline.js`, `circle.js`, `ellipse.js`
- **Docs Impact**: `docs/arrows.html` (sections 2–4), `.agents/KILOPIXEL.md`
- **Context**: Kilopixel is pre-release, so backwards compatibility is not required.

---

## 1. Problem: Shape Attributes Control the Arrowhead

Today the arrowhead's look is borrowed from the shape's stroke settings, and the two arrow styles follow different rules.

**`arrowstyle="line"` (chevron):**

| Attribute | Effect on the arrowhead | Effect on the shape |
|---|---|---|
| `linecap` | 1. **Position of the tip** (advances by `strokewidth / 2` for `square` / `round`)<br>2. **Wing ends** (`butt` flat, `square` flat and longer by `strokewidth / 2`, `round` rounded) | path ends |
| `linejoin` | **Tip shape** (`miter` sharp, `bevel` flat, `round` rounded) | path corners |
| `miterlimit` | none (tip is always sharp with `miter`, since 2026-10-14) | path corners |

**`arrowstyle="filled"` (triangle):**
- `linecap` → only the **tip position** (and the hidden shaft inset).
- `linejoin` → **no effect**; the triangle always has sharp corners.

**Consequences:**
- "Rounded path corners with a sharp arrow tip" is impossible with `line` chevrons (`linejoin="round"` rounds both).
- `filled` and `line` follow different rules.
- Three concerns are mixed: **(a)** where the arrow ends, **(b)** what the arrowhead looks like, **(c)** what the path looks like.

---

## 2. Agreed Principles

1. **`linecap` and `linejoin` belong to the shape.**
2. **`linecap` defines the effective length** of the path, so a line with an arrowhead is exactly as long as the same line without one. The tip always lands on the cap boundary (unchanged from the 2026-10-14 plan). Arrow attributes never move the tip.
3. **The arrowhead's look gets its own attributes**, which by default **inherit** from the shape's line attributes (CSS-like): no extra attributes needed for a matching look, overrides possible when needed.

**Alternative considered and rejected:** "The tip always lands exactly on the end coordinate, regardless of `linecap`" (like SVG markers). Rejected because the length rule (principle 2) keeps lines with and without arrowheads the same length.

---

## 3. Proposal: `arrowcap` and `arrowjoin`

| Attribute | Values | Default | Meaning |
|---|---|---|---|
| `arrowcap` | `butt` \| `square` \| `round` | inherits `linecap` | **`line`:** ends of the two chevron wings. **`filled`:** no effect (a triangle has no wing ends). |
| `arrowjoin` | `miter` \| `bevel` \| `round` | inherits `linejoin` | **`line`:** tip shape. **`filled`:** shape of all three triangle corners (sharp / bevelled / rounded, size `strokewidth / 2`, so `round` looks the same for both styles). |

- Names mirror `linecap` / `linejoin` (familiar, map 1:1 onto canvas `lineCap` / `lineJoin`) and sit next to `arrowstart`, `arrowend`, `arrowstyle`.
- **Inheritance:** the attribute default is `null`, meaning "use the shape's value" at draw time (`arrowjoin ?? linejoin`). Works with animated and reactive values without extra wiring.
- **Miter tips stay sharp:** a low `miterlimit` still never blunts a `miter` arrow tip (existing behaviour).
- **Example — the original use case:**
  ```html
  <pxl-polyline points="..." linejoin="round" arrowjoin="miter" arrowend="auto" arrowstyle="line">
  ```
  Rounded path corners, sharp arrow tip.

**Alternative considered:** one descriptive attribute (`arrowcorners="sharp | round | flat"`) applying to both styles. Simpler, but less control and a different vocabulary from `linecap` / `linejoin`. Option kept in mind; the two-attribute version is preferred.

---

## 4. Default Behaviour Walkthrough

Shape defaults: `linecap="butt"`, `linejoin="miter"`.

| Case | Inherited | `filled` | `line` | Verdict |
|---|---|---|---|---|
| **1. Nothing set** | cap `butt`, join `miter` | sharp triangle, tip at end point | sharp chevron, flat wing ends | ✅ classic arrow, unchanged |
| **2. Only `linecap="round"`** (line, arc) | cap `round`, join `miter` | as case 1, tip advanced by `strokewidth / 2` | round wing ends, sharp tip | ✅ common icon look |
| **3. Only `linejoin="round"`** (polyline) | cap `butt`, join `round` | **rounded triangle** (new) | **rounded tip, flat wing ends** (mixed look) | ⚠️ user probably only wanted smooth path corners |
| **4. `linecap="round"` + `linejoin="round"`** | cap `round`, join `round` | rounded triangle | fully rounded chevron | ✅ consistent "soft" style |

Case 3 is the critical one: it needs `arrowjoin="miter"` for a sharp tip on a rounded polyline.

---

## 5. Implementation Sketch

- **Attributes:** add `arrowcap`, `arrowjoin` (default `null`) to the four arrow shapes' `observedAttributes` and defaults.
- **`resolveArrow`:** use `arrowjoin ?? linejoin` for the join extension (`line` tip vertex) — the tip position itself still comes from `linecap` only.
- **`drawArrows` (`line`):** set `ctx.lineCap = arrowcap ?? linecap` and `ctx.lineJoin = arrowjoin ?? linejoin` for the chevron stroke (no restore needed — stroke state is always set before stroking).
- **`filled` with `bevel` / `round` corners:** inset the triangle so that filling **and** stroking it with `lineWidth = strokewidth` and the chosen join produces an outline of the original size. Derivation needed for the exact inset and for keeping the visible tip on the cap boundary (analogous to the chevron's `joinExt`).
- **Small heads:** if the triangle is too small for the corner size, clamp the corner size to what fits (to be specified, must stay continuous when the size is animated).
- **Performance:** one extra `??` per attribute and draw; `filled` with `bevel` / `round` needs one extra `stroke()` call per shape. Zero allocations unchanged.

---

## 6. Open Decisions

1. **Inheritance scope** (see case 3):
   - **A — full inheritance** (`arrowcap` ← `linecap`, `arrowjoin` ← `linejoin`): one simple rule; case 3 documented ("set `arrowjoin="miter"` for a sharp tip on a rounded path"). *Current preference.*
   - **B — only `arrowcap` inherits**, `arrowjoin` defaults to `miter`: cases 1–3 behave as most people expect, case 4 needs `arrowjoin="round"`.
2. **Default `arrowstyle`: `filled` (today) or `line`?**
   - **Pro `line`:** the arrowhead is the end of the same stroke, so both inherited attributes are fully meaningful by default; the open `filled` questions (corner rounding, small-head fallback) only affect people who opt in; chevrons scale naturally with the stroke width.
   - **Con `line`:** many people picture a filled triangle as "an arrow"; thin chevrons are less prominent at very thin strokes; case 3 remains.
   - **Migration:** only 5 shapes in `docs/` and `examples/` rely on the default `arrowstyle` (checked 2026-10-15).
   - Decision aid: which arrow fits typical Kilopixel use (diagrams, technical illustrations, animated explainers)?
3. **`filled` corner geometry:** exact inset for `round` / `bevel` corners and the fallback for small heads.
4. **Naming:** `arrowcap` / `arrowjoin` (preferred) vs. descriptive names like `arrowtip` / `arrowwings`.

---

## 7. Next Steps

- [ ] Decide §6.1 (inheritance scope) and §6.2 (default `arrowstyle`).
- [ ] Derive the `filled` corner geometry (§6.3), including tip alignment and small-head fallback.
- [ ] Test page in `scratch/`: all four cases from §4 × both styles × relevant overrides.
- [ ] Implement, `node build.js`, regression check with `scratch/arrows/grid.html` and `examples/test24.html`.
- [ ] Docs: `arrows.html` (section 4 Line Joins becomes "Arrow Joins & Caps" or similar, callout "Sharp Tips on Rounded Paths" replaced by `arrowjoin`), `KILOPIXEL.md` Arrowhead System.
