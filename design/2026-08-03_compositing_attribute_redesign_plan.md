# Kilopixel — Compositing Redesign Implementation Plan

## Goal

Redesign the attribute inheritance model for `<pxl-layer>`, `<pxl-group>`, and shapes to be
consistent, predictable, and GPU-efficient. The core changes are:

1. **Groups become transform-only containers** — compositing attributes removed entirely
2. **Layer compositing moves to CSS** — `alpha`, `blend`, `filter`, `blur`, `shadow*` applied
   via CSS properties on the `<canvas>` DOM element (group-flattened, GPU compositor)
3. **Shapes keep Canvas 2D** — compositing applied per draw call as before
4. **Two new attributes** — `blur` (responsive, replaces blur inside `filter`) and `composite`
   (shape-only Porter-Duff operators, replaces misuse of `blend` for masking)
5. **`cssOnly` fast path** — layers with only animated compositing (no animated transforms,
   no dirty children) skip canvas clearRect + redraw entirely

---

## Reference Tables

### Table 1 — Transform Attributes (Always Canvas 2D, All Levels)

| Attribute | Layer | Group | Shape | Responsive | Notes |
|---|---|---|---|---|---|
| `x`, `y` | Canvas 2D | Canvas 2D | Canvas 2D | ✅ `× u` | CTM compounds down the tree |
| `dx`, `dy` | Canvas 2D | Canvas 2D | Canvas 2D | ✅ `× u` | CTM, applied post-rotation |
| `rotate` | Canvas 2D | Canvas 2D | Canvas 2D | — (degrees) | CTM compounds |
| `scale`, `scalex`, `scaley` | Canvas 2D | Canvas 2D | Canvas 2D | — (multiplier) | CTM compounds |
| `skewx`, `skewy` | Canvas 2D | Canvas 2D | Canvas 2D | — (degrees) | CTM compounds |

---

### Table 2 — Compositing Attributes (CSS on Layer, Canvas 2D on Shape, Removed from Group)

| Attribute | Layer | Group | Shape | Responsive | Notes |
|---|---|---|---|---|---|
| `alpha` | **CSS** `canvas.style.opacity` | ❌ removed | **Canvas 2D** `ctx.globalAlpha *= alpha` | — (0–1) | **Layer:** GPU compositor, group-flattened, cheap to animate. **Shape:** per draw call, starts from 1.0 (no compounding). **Why no group:** would compound per-shape, not flatten — use a layer instead |
| `blend` | **CSS** `canvas.style.mixBlendMode` | ❌ removed | **Canvas 2D** `ctx.globalCompositeOperation` | — | **Layer:** blends whole layer bitmap against everything behind it. **Shape:** per draw call against existing canvas pixels. **Values (both):** `normal` · `multiply` · `screen` · `overlay` · `darken` · `lighten` · `color-dodge` · `color-burn` · `hard-light` · `soft-light` · `difference` · `exclusion` · `hue` · `saturation` · `color` · `luminosity`. `source-over` accepted as alias for `normal` — normalized at output |
| `composite` | ❌ not on layer | ❌ not on group | **Canvas 2D** `ctx.globalCompositeOperation` | — | **Shape only.** Porter-Duff operators requiring layer isolation. **Values:** `source-over` · `source-in` · `source-out` · `source-atop` · `destination-over` · `destination-in` · `destination-out` · `destination-atop` · `copy` · `xor` · `lighter`. Takes priority over `blend` if both set |
| `blur` | **CSS** `canvas.style.filter = blur(blur×u px)` | ❌ removed | **Canvas 2D** `ctx.filter = blur(blur×u px)` | ✅ `× u`, recalc on resize | **Layer:** GPU blur on finished bitmap, one pass for all content, no JS per frame if static. **Shape:** per draw call, combined with `filter` string via if/else (no array). **Why no group:** no own canvas for CSS; use a layer |
| `filter` | **CSS** `canvas.style.filter = rawString` | ❌ removed | **Canvas 2D** `ctx.filter = rawString` | ❌ raw `px` | Raw CSS passthrough. **Values:** `blur(5px)` · `brightness(1.5)` · `contrast(2)` · `grayscale(0.5)` · `hue-rotate(90deg)` · `saturate(2)` · `sepia(0.3)`. Not responsive — user controls units. When combined with `blur`, blur is applied first |
| `shadowcolor` | **CSS** `drop-shadow()` in `canvas.style.filter` | ❌ removed | **Canvas 2D** `ctx.shadowColor` | ✅ offsets/blur `× u` | **Layer:** one GPU shadow on whole layer silhouette. **Shape:** CPU Gaussian blur per draw call. **Values:** any valid color: `#ff0000` · `rgba(0,0,0,0.5)` · `hsl(200,80%,50%)` · `none`/`transparent` to cancel |
| `shadowblur` | Part of CSS `drop-shadow()` | ❌ removed | **Canvas 2D** `ctx.shadowBlur = val × u` | ✅ `× u` | Logical unit number. Always set together with `shadowcolor` |
| `shadowx`, `shadowy` | Part of CSS `drop-shadow()` | ❌ removed | **Canvas 2D** `ctx.shadowOffsetX/Y = val × u` | ✅ `× u` | Logical unit offsets. Default `0` |
| `hidden` | Canvas 2D early-exit | Canvas 2D early-exit | Canvas 2D early-exit | — | Independent per level — hides entire subtree because children never render |

---

### Table 3 — When CSS Fires vs. Canvas Fires

| Trigger | CSS (layer only) | Canvas 2D (layer + shape) |
|---|---|---|
| Element connects to DOM | `syncCSS(u)` once | Defaults written to `attributeValues` |
| Attribute value changes | `syncCSS(u)` | Value compiled, flags updated |
| Stage resizes (`u` changes) | `syncCSS(newU)` — recalculates all `blur`, `shadow*` px | Recalculated live at draw time |
| Animated frame — compositing only | `_syncAnimatedCSS(u)` — writes only animated CSS props | Not called — canvas skipped (cssOnly fast path) |
| Animated frame — transforms or dirty children | `_syncAnimatedCSS(u)` + full canvas redraw | Full `evaluateAnimations(t)` + draw |
| Content redraws, compositing is static | **Nothing** — compositor re-applies automatically | `ctx.filter`, `ctx.shadowBlur` re-set each frame |

---

## Decisions

| Topic | Decision |
|---|---|
| `blend` default name | **Changed from `'source-over'` to `'normal'`** in all constructors. Accept both — normalize at output: `'source-over'` → `'normal'` for CSS; `'normal'` → `'source-over'` for Canvas 2D. Breaking change: `hasCompositing` check uses `blend !== 'normal'` — if default stayed `'source-over'` every shape would incorrectly trigger compositing path |
| Example files | **All 40 example files** audited and updated |
| `will-change` hint | **Dropped.** Browser auto-promotes canvases when opacity/filter are dynamically set. Wastes GPU memory if set universally |
| `hasStateChanges` split | **One unified `ctx.save/restore` block** — no extra save/restore calls. Split is `hasTransforms \|\| hasCompositing`. Real win at layer level: pure-compositing layers skip the save/restore wrapping all children |
| `cssOnly` fast path | **Option B implemented.** When `_anyCompositingAnimated && !_transformsAnimated && !isDirty` → skip clearRect + child redraw, only call `_syncAnimatedCSS(u)` + `invalidate()` |
| Animation flag detection | **Use compiler output** — check `typeof compiledAttr === 'function'` once at attribute-parse time. Flags set on instance (`_alphaAnimated`, `_blurAnimated`, etc.), zero per-frame cost |
| GC in hot path | **No array allocations in syncCSS** — use if/else branches. Cache last written CSS values (`_cssAlpha`, `_cssFilter`, `_cssBlend`) and skip DOM write when unchanged. Animated blur quantized to `.toFixed(1)` to reduce unique string count |

---

## Breaking Changes

> [!WARNING]
> All existing Kilopixel markup using the affected attributes must be updated.
> A `console.warn` will be emitted in group's `attributeChangedCallback` for removed
> attributes. Static attributes on shapes now default to `blend: 'normal'` — any code
> checking the raw default will need updating.

| Old markup | New markup | Reason |
|---|---|---|
| `<pxl-group alpha="0.5">` | `<pxl-layer alpha="0.5">` | Groups no longer have `alpha` |
| `<pxl-group blend="multiply">` | `<pxl-layer blend="multiply">` | Groups no longer have `blend` |
| `<pxl-group filter="blur(5px)">` | `<pxl-layer filter="blur(5px)">` | Groups no longer have `filter` |
| `<pxl-group shadowcolor="red">` | `<pxl-layer shadowcolor="red">` | Groups no longer have shadow |
| `blend="destination-in"` on shape | `composite="destination-in"` | Porter-Duff moves to `composite` |
| `blend="source-over"` (explicit) | Can stay — `source-over` remains a valid alias | No change needed |
| `filter="blur(20px)"` (responsive intent) | `blur="20"` | New responsive blur attribute |
| Default `blend` value | `'normal'` instead of `'source-over'` | Internal default changed — any code comparing to `'source-over'` must update |

---

## Proposed File Changes

---

### `js/graphics.js`

#### [MODIFY] Split `applyContextState` into two functions

**`pxl.applyTransforms(ctx, u, v)`** — transforms only, called by layer, group, and shape:
```javascript
// translate(x*u, y*u) → rotate → scale → skew → translate(dx*u, dy*u)
// Identical to current transform section of applyContextState
```

**`pxl.applyShapeCompositing(ctx, u, v)`** — compositing only, called by shape only.
No array allocations — uses if/else branches:
```javascript
pxl.applyShapeCompositing = function(ctx, u, v) {
  const { alpha, blend, composite, blur, filter, shadowcolor,
          shadowblur, shadowx, shadowy } = v;

  if (alpha !== 1)
    ctx.globalAlpha *= alpha;

  // blend: normalize 'normal' → 'source-over' for Canvas 2D
  if (blend !== 'normal')
    ctx.globalCompositeOperation = blend === 'source-over' ? 'source-over' : blend;

  // composite overrides blend if set (Porter-Duff)
  if (composite !== 'source-over')
    ctx.globalCompositeOperation = composite;

  // blur + filter: if/else, no array, no join
  if (blur > 0 && filter !== 'none') {
    ctx.filter = 'blur(' + (blur * u).toFixed(1) + 'px) ' + filter;
  } else if (blur > 0) {
    ctx.filter = 'blur(' + (blur * u).toFixed(1) + 'px)';
  } else if (filter !== 'none') {
    ctx.filter = filter;
  }

  if (shadowcolor && shadowcolor !== 'none' && shadowcolor !== 'transparent') {
    ctx.shadowColor    = shadowcolor;
    ctx.shadowBlur     = shadowblur * u;
    ctx.shadowOffsetX  = shadowx * u;
    ctx.shadowOffsetY  = shadowy * u;
  }
};
```

Keep `applyContextState` as a deprecated alias for `applyTransforms` to avoid breaking
user code that calls it directly.

---

### `js/elements/layer.js`

#### [MODIFY] Move compositing to CSS with full GC-conscious implementation

**`observedAttributes`:** Add `blur`.

**`constructor` defaults:** Add `blur: 0`. Change `blend: 'source-over'` → `blend: 'normal'`.

**New instance fields:**
```javascript
// Compositing animation flags — set once at attribute-parse time, never per-frame
this._alphaAnimated          = false;
this._blurAnimated           = false;
this._filterAnimated         = false;
this._shadowAnimated         = false;
this._anyCompositingAnimated = false;
this._transformsAnimated     = false;

// Cached CSS values — skip DOM write if value unchanged
this._cssAlpha  = 1;
this._cssBlend  = '';
this._cssFilter = '';
```

**New `_updateAnimationFlags()` method** — called once at attribute-parse time.
Leverages compiler output: functions = animated, raw values = static:
```javascript
_updateAnimationFlags() {
  const c = this.compiledAttrs;
  this._alphaAnimated  = typeof c.alpha  === 'function';
  this._blurAnimated   = typeof c.blur   === 'function';
  this._filterAnimated = typeof c.filter === 'function';
  this._shadowAnimated = typeof c.shadowcolor === 'function' ||
                         typeof c.shadowblur  === 'function' ||
                         typeof c.shadowx     === 'function' ||
                         typeof c.shadowy     === 'function';
  this._anyCompositingAnimated = this._alphaAnimated || this._blurAnimated ||
                                 this._filterAnimated || this._shadowAnimated;
  this._transformsAnimated = typeof c.x === 'function'      ||
                             typeof c.y === 'function'      ||
                             typeof c.rotate === 'function' ||
                             typeof c.scale  === 'function' ||
                             typeof c.scalex === 'function' ||
                             typeof c.scaley === 'function' ||
                             typeof c.dx === 'function'     ||
                             typeof c.dy === 'function';
}
```

**Full `syncCSS(u)` method** — called at connect, resize, static attribute change.
No array, no join, cached writes, if/else branches only:
```javascript
syncCSS(u) {
  const v = this.attributeValues;

  // opacity
  const alpha = v.alpha !== 1 ? v.alpha : '';
  if (alpha !== this._cssAlpha) {
    this.canvas.style.opacity = alpha;
    this._cssAlpha = alpha;
  }

  // mix-blend-mode (normalize source-over / normal both → clear to default)
  const blend = (v.blend === 'normal' || v.blend === 'source-over') ? '' : v.blend;
  if (blend !== this._cssBlend) {
    this.canvas.style.mixBlendMode = blend;
    this._cssBlend = blend;
  }

  // filter: blur (responsive) + raw filter + drop-shadow (responsive)
  // if/else only — no array, no join
  const hasShadow = v.shadowcolor && v.shadowcolor !== 'none'
                                   && v.shadowcolor !== 'transparent';
  const shadow = hasShadow
    ? 'drop-shadow(' + (v.shadowx * u).toFixed(1) + 'px '
                     + (v.shadowy * u).toFixed(1) + 'px '
                     + (v.shadowblur * u).toFixed(1) + 'px '
                     + v.shadowcolor + ')'
    : '';
  const hasBlur   = v.blur > 0;
  const hasFilter = v.filter !== 'none';

  let filterStr;
  if      (hasBlur && hasFilter && hasShadow)
    filterStr = 'blur(' + (v.blur * u).toFixed(1) + 'px) ' + v.filter + ' ' + shadow;
  else if (hasBlur && hasFilter)
    filterStr = 'blur(' + (v.blur * u).toFixed(1) + 'px) ' + v.filter;
  else if (hasBlur && hasShadow)
    filterStr = 'blur(' + (v.blur * u).toFixed(1) + 'px) ' + shadow;
  else if (hasFilter && hasShadow)
    filterStr = v.filter + ' ' + shadow;
  else if (hasBlur)
    filterStr = 'blur(' + (v.blur * u).toFixed(1) + 'px)';
  else if (hasFilter)
    filterStr = v.filter;
  else if (hasShadow)
    filterStr = shadow;
  else
    filterStr = '';

  if (filterStr !== this._cssFilter) {
    this.canvas.style.filter = filterStr;
    this._cssFilter = filterStr;
  }
}
```

**Hot-path `_syncAnimatedCSS(u)`** — called every frame only for animated attrs.
Only updates CSS properties that are actually time-dependent:
```javascript
_syncAnimatedCSS(u) {
  const v = this.attributeValues;

  if (this._alphaAnimated) {
    const alpha = v.alpha !== 1 ? v.alpha : '';
    if (alpha !== this._cssAlpha) {
      this.canvas.style.opacity = alpha;
      this._cssAlpha = alpha;
    }
  }

  if (this._blurAnimated || this._filterAnimated || this._shadowAnimated) {
    this._syncFilterCSS(u); // rebuilds only the filter string portion
  }
}
```

**`render(u, t)` — with cssOnly fast path:**
```javascript
render(u, t) {
  if (this.attributeValues.hidden) return;

  this.evaluateAnimations(t);

  if (this._anyCompositingAnimated) this._syncAnimatedCSS(u);

  // cssOnly fast path: compositing animates but canvas content is unchanged
  if (this._anyCompositingAnimated && !this._transformsAnimated && !this.isDirty) {
    this.invalidate(); // keep rAF loop alive
    return;           // skip clearRect + child redraw
  }

  // Full redraw
  const ctx = this.ctx;
  ctx.clearRect(0, 0, this._cw, this._ch);
  this.isDirty = false;

  const v = this.attributeValues;
  const hasTransforms = v.x || v.y || v.dx || v.dy || v.rotate ||
                        v.scale !== 1 || v.scalex !== 1 || v.scaley !== 1 ||
                        v.skewx || v.skewy;
  if (hasTransforms) { ctx.save(); pxl.applyTransforms(ctx, u, v); }

  const len = this.childList.length;
  for (let i = 0; i < len; i++) this.childList[i].render(ctx, u, t);

  if (hasTransforms) ctx.restore();
  if (this.isAnimated) this.invalidate();
}
```

**`resize(w, h, dpr)`:** Call `syncCSS(w / 1000)` after canvas resize.

**`connectedCallback`:** Call `_updateAnimationFlags()`, `syncCSS(this.stage?.unit || 1)`,
and — critically — `this.invalidate()` after super:
```javascript
connectedCallback() {
  super.connectedCallback();
  this._updateAnimationFlags();
  this.syncCSS(this.stage?.unit || 1);
  this.invalidate(); // ← REQUIRED for cssOnly safety (see reparenting note below)
}
```
`invalidate()` sets `isDirty = true` which prevents the cssOnly fast path from firing on
the first render in a new stage context. Without it, a layer moved between stages could show
stale canvas content while only updating CSS properties.

Note: `unit` fallback of `1` is corrected on the first `resize()` call from the stage.

**`attributeChangedCallback`:** After super, call `_updateAnimationFlags()` then
`syncCSS(this.stage?.unit || 1)` for compositing attributes.

---

### `js/elements/group.js`

#### [MODIFY] Remove all compositing attributes, add deprecation warnings

**`observedAttributes`:** Remove `alpha`, `blend`, `filter`, `shadowcolor`, `shadowblur`,
`shadowx`, `shadowy`. Keep: `x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`,
`skewx`, `skewy`, `hidden`.

**`constructor` defaults:** Remove all compositing attribute defaults.

**`render(ctx, u, t)`:**
- `hasStateChanges` checks transforms only
- Call `pxl.applyTransforms(ctx, u, v)` instead of `pxl.applyContextState(ctx, u, v)`

**`attributeChangedCallback`:** Warn on removed attributes:
```javascript
const removed = ['alpha','blend','filter','shadowcolor','shadowblur','shadowx','shadowy'];
if (removed.includes(name)) {
  console.warn(`[kilopixel] <pxl-group> no longer supports "${name}". Use <pxl-layer>.`);
}
```

> [!NOTE]
> **Porter-Duff inside groups:** Shapes using `composite="destination-in"` inside a group
> operate on the shared LAYER canvas — not an isolated group surface. Porter-Duff compositing
> requires a dedicated `<pxl-layer>` for correct isolation. Must be documented clearly.

---

### `js/elements/shape.js`

#### [MODIFY] Add `blur` and `composite`, unified save/restore, no array allocations

**`observedAttributes`:** Add `blur`, `composite`.

**`constructor` defaults:** Add `blur: 0`, `composite: 'source-over'`.
Change `blend: 'source-over'` → `blend: 'normal'`.

**`render(ctx, u, t)`** — one unified save/restore block:
```javascript
render(ctx, u, t) {
  this.evaluateAnimations(t);
  const v = this.attributeValues;
  if (v.hidden) return;

  const hasTransforms  = v.x || v.y || v.dx || v.dy || v.rotate ||
                         v.scale !== 1 || v.scalex !== 1 || v.scaley !== 1 ||
                         v.skewx || v.skewy;
  const hasCompositing = v.alpha !== 1 || v.blend !== 'normal' ||
                         v.composite !== 'source-over' || v.blur > 0 ||
                         v.filter !== 'none' || v.shadowcolor;

  if (hasTransforms || hasCompositing) {
    ctx.save();
    if (hasTransforms)  pxl.applyTransforms(ctx, u, v);
    if (hasCompositing) pxl.applyShapeCompositing(ctx, u, v);
    this.draw(ctx, u, t);
    ctx.restore();
  } else {
    this.draw(ctx, u, t);
  }
}
```

---

### Example Files

#### [MODIFY] All 40 example files — audit for:

1. Any Porter-Duff value in `blend` on shapes → rename to `composite="..."`
2. `<pxl-group alpha/blend/filter/shadow*>` → convert to `<pxl-layer>`
3. `filter="blur(Xpx)"` where responsive intent → convert to `blur="X"`
4. `blend="source-over"` explicit → can stay (alias), but consider updating to `normal`

Specifically confirmed: `examples/test40.html` — clipping mask circles:
```html
<!-- Before -->
<pxl-circle ... blend="destination-in"></pxl-circle>

<!-- After -->
<pxl-circle ... composite="destination-in"></pxl-circle>
```

---

## Known Limitations & Notes

> [!NOTE]
> **Filter ordering:** When both `blur` and `filter` are set, `blur` is always applied first.
> CSS filters are applied left-to-right. Order is not user-configurable — document as
> expected behavior.

> [!NOTE]
> **Layer blur with full-canvas background:** If a layer contains a full-screen background
> rect AND other shapes, layer-level blur affects everything — the background is no longer
> invisible to the blur. Shapes bleed into it rather than into transparency. Separate
> background into its own unblurred layer.

> [!NOTE]
> **cssOnly fast path dependency:** Requires children to correctly call
> `parentLayer.invalidate()` when they change. This is the existing contract — no new
> requirements.

> [!IMPORTANT]
> **Reparenting — shapes/groups moved between layers:** No new issues. Shapes and groups
> have no CSS properties — they are pure Canvas 2D. Moving them changes which canvas context
> they draw into. Both the source and target layers must be invalidated. Existing
> `disconnectedCallback`/`connectedCallback` lifecycle handles child list updates.
>
> **Reparenting — layer moved between stages:** Four concerns:
> 1. **CSS recalc (`u` change):** `connectedCallback` calls `syncCSS(newStage.unit)` →
>    responsive `blur`/`shadow*` values automatically recalculated for the new stage size. ✅
> 2. **Animated CSS in render loop:** `_syncAnimatedCSS(u)` receives `u` as a parameter
>    from the calling stage per frame → correct new-stage unit used immediately. ✅
> 3. **cssOnly stale canvas** *(new risk from this redesign):* If `isDirty` is `false` when
>    the layer first renders in the new stage, the cssOnly fast path would skip the canvas
>    redraw and show stale content from the old stage. **Fixed by `invalidate()` in
>    `connectedCallback`** — this guarantees `isDirty = true` on the first render. 🔴→✅
> 4. **Canvas size mismatch:** Resizing to the new stage dimensions depends on the stage
>    calling `resize()` after the layer connects. ResizeObserver fires asynchronously —
>    one frame may show incorrect dimensions. Pre-existing concern, not new to this redesign.

---

## Verification Plan

### Automated
- Run `node build.js` after all JS changes to confirm minified output builds correctly

### Manual — Core Features
- [ ] Layer `alpha` fades whole layer as flat image — overlapping shapes do not bleed through each other
- [ ] Layer `blend="multiply"` composites against layers below
- [ ] Layer `blur="20"` scales responsively on window resize
- [ ] Layer `shadowcolor` produces one shadow on whole layer silhouette (not per-shape)
- [ ] Shape `alpha` makes individual shape transparent (`ctx.globalAlpha` starts at 1.0)
- [ ] Shape `composite="destination-in"` punches hole (must be inside a `<pxl-layer>`)
- [ ] Shape `blur="10"` blurs only that shape, scales with `u`
- [ ] `blend="source-over"` and `blend="normal"` produce identical results
- [ ] Group with removed compositing attribute logs `console.warn`, does not crash

### Manual — GC & Performance
- [ ] Animated `alpha="wave(2)"` on layer with static children → canvas NOT cleared or redrawn (cssOnly fast path active). Verify: renderAvg ≈ 0ms in performance monitor
- [ ] Static `blur="20"` on layer with animated children → `syncCSS` not called in hot loop
- [ ] Animated `blur="wave(2)*20"` → single string allocation per frame, no array (verify via browser memory profiler)
- [ ] `benchmark.html` — overall frame time equal or better than before

### Manual — Reparenting
- [ ] Shape moved from Layer A to Layer B → both layers redraw correctly, shape compositing attributes unchanged, no visual glitches
- [ ] Layer with `alpha="wave(2)"` moved to a different stage → CSS opacity updates with new stage's frame loop, no stale canvas content on first frame
- [ ] Layer with `blur="20"` moved to a stage with different size → blur scales to new stage's `u` value immediately after move
