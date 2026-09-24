# Circle API: `closed` Attribute vs. `mode` Enum

**Date:** 2026-09-24  
**Status:** Design Discussion (Decision Pending)  
**Supersedes Section 4.5 of:** `2026-09-23_circle_geometry_hardening_and_annular_sector_plan.md`  
**Target Component:** `js/elements/shapes/circle.js`

---

## 1. Context

The [approved hardening plan](2026-09-23_circle_geometry_hardening_and_annular_sector_plan.md) proposed replacing the existing `pie` boolean with a three-state `mode` enum (`"open"` | `"chord"` | `"pie"`). During a design review on 2026-09-24, we re-evaluated this decision and found a simpler alternative that avoids a breaking change and better fits the framework's API patterns.

### The Missing Piece

The current `<pxl-circle>` cannot draw a **stroked chord** (circular segment / D-shape). The path closure logic has no branch that calls `ctx.closePath()` on a partial arc without going through center:

```javascript
// Current code (circle.js, lines 78-89)
if (ir > 0) {
  // annular sector — always closed
} else if (isPie && !isFull) {
  ctx.lineTo(0, 0);   // spokes to center
  ctx.closePath();
} else if (isFull) {
  ctx.closePath();
}
// ← No branch for "just close the path" (chord)
```

---

## 2. Two Competing Approaches

### 2.1 Option A: `mode` Enum (from the original plan)

Replace `pie` with a single attribute:
```
mode="open" | "chord" | "pie"    (default: "open")
```

**Pros:**
- Mutually exclusive by construction — impossible to set contradictory states
- Industry-aligned (p5.js, Java 2D use `OPEN / CHORD / PIE`)
- One attribute to learn

**Cons:**
- **Breaking change** — requires migrating 7 files from `pie="true"` → `mode="pie"`
- String enums feel less HTML-native than boolean flags
- Users must remember enum values
- Elevates `chord` to equal prominence with `pie`, even though its use cases are far narrower

### 2.2 Option B: Keep `pie` + Add `closed` Boolean (recommended)

Keep the existing `pie` attribute untouched. Add a new `closed` boolean:
```
pie="true|false"       (existing, unchanged)
closed="true|false"    (new, default: false)
```

**Pros:**
- **Zero breaking change** — `pie="true"` stays untouched across all existing files
- **Consistent with polyline** — `<pxl-polyline>` already has `closed` with identical semantics
- **No enum strings to remember** — just boolean flags
- Matches the framework's boolean-flag DNA (`hidden`, `anticlockwise`, `closed`, `smooth`)
- Priority chain makes `closed` a **harmless no-op** on every archetype where it's irrelevant
- Honest API — `closed` doesn't pretend to be a "geometry mode"; it's literally `ctx.closePath()`

**Cons:**
- Contradictory state possible (`pie="true" closed="true"`) — but `pie` naturally wins in the priority chain, making `closed` a harmless no-op (same as `sweep` winning over `end`)

---

## 3. Priority Chain

The path closure branches are checked in this order. The first match wins:

```
1. if (ir > 0)       →  annular sector     (outer arc + reversed inner arc + closePath)
2. else if (pie)     →  pie slice           (lineTo(0,0) + closePath)
3. else if (isFull)  →  full circle         (closePath)
4. else if (closed)  →  chord              (closePath — straight line connecting endpoints)
5. else              →  open arc            (path left open)
```

This means `closed="true"` is **structurally unreachable** when any higher-priority branch fires. A user can set `closed` on any archetype and nothing breaks.

---

## 4. `closed="true"` on Every Archetype

| Archetype | Attributes | With `closed="true"` | Effect |
|---|---|---|---|
| **Full disc** | `r="100"` | `isFull` fires first | **No-op** |
| **Full ring** | `r="100" ir="50"` | `ir > 0` fires first | **No-op** |
| **Donut wedge** | `r="100" ir="50" sweep="270"` | `ir > 0` fires first | **No-op** |
| **Pie slice** | `sweep="270" pie="true"` | `pie` fires first | **No-op** (pie already closes with spokes) |
| **Open arc** | `sweep="180" stroke="#fff"` | ✅ Reaches `closed` branch | **Chord drawn** |
| **Arc + arrows** | `sweep="180" arrowend="auto"` | Reaches `closed` branch | Chord + arrows (unusual but explicit) |

---

## 5. Canvas Fill vs. Stroke Behavior (Key Insight)

Canvas `fill()` and `stroke()` treat unclosed paths differently:

- **`ctx.fill()`** always **implicitly auto-closes** the path (invisible chord drawn for fill)
- **`ctx.stroke()`** only strokes the **actual declared path segments** (no implicit closing)

This means `closed` primarily affects **stroke** behavior:

### Open Arc × Paint Mode Matrix

| Paint Mode | Without `closed` | With `closed="true"` | Visual Difference |
|---|---|---|---|
| **Fill only** | Canvas auto-closes → D-shape fill | Same (explicit `closePath` redundant for fill) | **None** |
| **Stroke only** | Open arc, endpoints get `linecap` | Arc + chord line stroked (D-shape wireframe) | ✅ Chord appears |
| **Fill + Stroke** | Fill = D-shape, stroke = arc only (**mismatch!**) | Fill = D-shape, stroke = full D outline | ✅ Stroke matches fill |

### The fill+stroke mismatch

Without `closed`, a filled-and-stroked partial arc has a visual mismatch — the fill extends to the chord boundary but the stroke only traces the arc:

```
               ╭───────╮
Fill reaches → │░░░░░░░│ ← stroke only here (arc)
here too       │░░░░░░░│
               ╰ · · · ╯ ← implicit chord: filled but NOT stroked
```

With `closed="true"`, the stroke fully outlines the filled region.

### Real use cases for `closed="true"`

1. **Stroke-only D-shape** wireframe (circular segment outline)
2. **Fill+stroke** where the stroke should match the filled boundary
3. **Hit-testing the chord line** (`isPointInStroke` only tests actual path segments)

For **fill-only** arcs, `closed` is a visual no-op (Canvas already auto-closes for fill).

---

## 6. When Does a User Need Each Attribute?

With `pie` kept and `closed` added, most use cases require **zero closure attributes**:

### Attributes Irrelevant (engine handles automatically)

| Use Case | Attributes | Why no `pie`/`closed` needed |
|---|---|---|
| Full disc | `r="100"` | `isFull` auto-closes |
| Full ring | `r="100" ir="50"` | `ir > 0` auto-closes |
| Donut wedge | `r="100" ir="50" sweep="270"` | `ir > 0` auto-closes |
| Open arc (stroke) | `sweep="180" stroke="#fff"` | Default = open |
| Arc with arrows | `sweep="180" arrowend="auto"` | Default = open |
| Animated spinner | `sweep="270" rotate="t*360"` | Default = open |
| Gauge / meter | `sweep="wave(2)*270" arrowend="auto"` | Default = open |

### Needs `pie="true"`

| Use Case | Why |
|---|---|
| Pie slice / sector | Needs radial spokes to center |
| Pac-Man | Needs spokes to form the mouth |
| Pie chart wedges | Each wedge needs center-connected geometry |

### Needs `closed="true"`

| Use Case | Why |
|---|---|
| Stroked circular segment (D-shape wireframe) | Chord line needs to be in the stroke path |
| Fill+stroke arc with matching outline | Stroke should follow the fill boundary |

### Summary: 6 of 9 archetypes need nothing. `pie` covers 3. `closed` covers 2 niche stroke cases.

---

## 7. Comparison with `mode` — Why Booleans Win Here

| Concern | `mode` enum | `pie` + `closed` booleans |
|---|---|---|
| Breaking change | Yes (7-file migration) | **None** |
| Framework consistency | New pattern | **Matches existing** (`closed` on polyline, boolean flags throughout) |
| Default covers most cases | Yes (`"open"`) | Yes (both default `false`) |
| Contradictory state | Impossible | Possible but harmless (`pie` wins) |
| Cognitive load | Remember 3 string values | Two intuitive booleans |
| Prominence of chord | Equal to pie (overweighted) | Appropriately quiet |

---

## 8. Implementation Sketch

### 8.1 Changes to `circle.js`

```javascript
// observedAttributes: add 'closed', keep 'pie'
static get observedAttributes() {
  return [...super.observedAttributes,
    'r', 'ir', 'start', 'end', 'sweep', 'pie', 'closed',
    'anticlockwise', 'arrowstart', 'arrowend', 'arrowstyle'];
}

// defaults: add closed
const defaults = {
  r: 0, ir: 0, start: 0, end: null, sweep: null,
  pie: false, closed: false,
  anticlockwise: false, arrowstart: 0, arrowend: 0, arrowstyle: 'filled'
};

// Path closure (inside draw()):
if (safeIR > 0) {
  // Annular sector — always closed
  if (isFull) {
    ctx.moveTo((safeIR * u) * Math.cos(drawEndRadians), (safeIR * u) * Math.sin(drawEndRadians));
  }
  ctx.arc(0, 0, safeIR * u, drawEndRadians, drawStartRadians, !isAnti);
  ctx.closePath();
} else if (isPie && !isFull) {
  ctx.lineTo(0, 0);
  ctx.closePath();
} else if (isFull) {
  ctx.closePath();
} else if (closed === true) {
  ctx.closePath();  // ← chord: straight line connecting arc endpoints
}
```

### 8.2 Changes to `ellipse.js`

Mirror the same changes: add `closed` attribute with identical priority chain logic.

### 8.3 Changes to KILOPIXEL.md

- Update Element Reference — Circle: add `closed` attribute to the table
- Update Element Reference — Ellipse: add `closed` attribute to the table
- No need to modify any `pie` references

### 8.4 Changes to `docs/circle.html`

- Add a new section (or extend Section 4) demonstrating `closed="true"` for circular segments
- Show both stroke-only and fill+stroke examples

### 8.5 No Migration Required

All existing files with `pie="true"` remain untouched.

---

## 9. Remaining Items from the Hardening Plan

The following items from the original hardening plan are **unchanged** and should still be implemented alongside `closed`:

1. **Zero-GC safety clamping** — `const safeR = Math.max(0, r)` to prevent `DOMException` on negative radii
2. **Precision full-circle threshold** — `Math.PI * 2 - 1e-4` instead of `Math.PI * 1.99` (fixes 358.2° snap)
3. **Division-by-zero guard** — `safeR > 0` check before arrow `Math.asin()` calculations
4. **Natural zero-span geometry** — no early exit on `sweep === 0` (preserves animation continuity)

---

## 10. Decision Log

| Date | Decision |
|---|---|
| 2026-09-23 | Original plan proposed `mode="open\|chord\|pie"` enum |
| 2026-09-24 | Design review: `mode` reconsidered. Key insight: chord is primarily a stroke-path concern, not a geometry mode. Canvas `fill()` already auto-closes with an implicit chord. The `mode` enum overweights chord's importance and forces a breaking migration. |
| 2026-09-24 | **Recommendation: keep `pie` + add `closed` boolean.** Zero migration. Consistent with `<pxl-polyline closed>`. Harmless no-op on all non-applicable archetypes via priority chain. |
| 2026-09-24 | Status: pending final approval before implementation |
