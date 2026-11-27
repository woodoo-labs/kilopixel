# Kilopixel — Engine Internals

How the engine works: source files, classes, compiler, reactivity, the frame, drawing, matrices, hit testing and events, build. What the elements and attributes mean for authors: `.agents/KILOPIXEL.md` (section numbers "§N" there are "language §N" here). Code rules (namespace, `_` ownership, zero allocations per frame, no defensive fallbacks): `.claude/CLAUDE.md` "Engine Code Rules" and "Engine Code Style". Why something was decided, and the measurements: the plans, linked as "Design: …".

---

## 1. Source Files

Build order (`files` in `build.js`):

| # | File | Contents |
|---|---|---|
| 1 | `js/engine.js` | `pxl` namespace, generic helpers, reactivity (`pxl.nodes`, subscriptions, `broadcast`), attribute compilation bridge, property accessors |
| 2 | `js/matrix.js` | `pxl.Matrix` (Float64Array affine matrices, written in place), `pxl.toLocal` |
| 3 | `js/compiler.js` | expression scope, time drivers, `parseAttributeValue`, `compileExpression` |
| 4 | `js/interaction.js` | `pxl-on-*` handlers, `pxl.InteractionEngine`: hit testing, states, DOM events, cursor |
| 5 | `js/graphics.js` | anchor tables, `resolveRadius`, transform and compositing state, isolation canvas, arc angles, arrowhead constants, line dash helper, points parser |
| 6 | `js/monitor.js` | `pxl.perf` |
| 7 | `js/elements/stage.js` | `pxl._frame`, default styles, `pxl.Stage` |
| 8 | `js/elements/node.js` | `pxl.PxlNode` |
| 9 | `js/elements/layer.js` | `pxl.Layer` |
| 10 | `js/elements/group.js` | `pxl.Group` |
| 11 | `js/elements/shape.js` | `pxl.Shape`: style, gradients, isolation, hit box, arrowheads; `pxl.defineShape()` |
| 12–18 | `js/elements/shapes/*.js` | circle, ellipse, rect, line, polyline, text, grid |
| 19 | `js/elements/variable.js` | `pxl.Variable` |

```
HTMLElement
├── Stage (pxl-stage)        the root, not a PxlNode
└── PxlNode
    ├── Layer, Group, Variable
    └── Shape → Circle, Ellipse, Rect, Line, Polyline, Text, Grid
```

**Namespace:** classes are expressions on `pxl` (`pxl.Line = class Line extends pxl.Shape`): `class pxl.Line` isn't valid JavaScript, and a declaration would be a page global (a user script with the same name fails; a global `Text` would hide the DOM's `Text`). The class keeps its readable name (`pxl.Line.name === 'Line'`). Custom shapes extend `pxl.Shape` like the built-in ones. Design: `design/done/2026-10-17_bundle_scope_plan.md`.

## 2. `PxlNode` (`js/elements/node.js`)

Base of layers, groups, shapes and variables.

**State**

- `static defaults`: per class, read-only, extended by spreading (`{ ...pxl.Shape.defaults, r: 0 }`). The constructor copies them into `expressions` and `values`; `pxl.resolveEmptyAttribute` reads them for bare and removed attributes (language §3.5).
- `expressions`: per name the compiled function or the static value. `values`: the current values, read by drawing and by `ref.<id>` (`pxl.nodes[id]` is this object). Hidden (non-enumerable) properties on it: `set(key, value)` (→ `pxl.setFromRef()`), `$node` (the element), getters `tx` / `ty` (the local matrix translation).
- Key lists: `animatedAttributeKeys` (use `t`, evaluated every frame), `reactiveAttributeKeys` (read `ref.*`, evaluated on change), `toLocalAttributeKeys` (reactive keys using `toLocal()`, also re-evaluated when the element's own space moves). `isAnimated` = animated keys exist.
- `parentLayer` (`closest('pxl-layer')`; a layer is its own), `parentContainer` (closest group or layer above), `childList` (layers and groups; `null` for shapes and variables, an own field so walks don't search the prototype chain).
- Matrices (§7.2), `_failedFrame` (§5.5), `_broadcastNesting` (§4.3), `_cssStyle` (computed style, created on first use), filter cache, error dedup fields.

**Methods**

- `attributeChangedCallback()`: `id` → registry (§4.1); `pxl-on-*` → `setHandler()` (§8.7); everything else → `setValue(name, value)`.
- `setValue(name, value)`, the one path for attributes and properties: unchanged value → nothing; a function → warn once (`pxl.warnFunctionValue`); a string or `null` → `pxl.compileAttribute()`; anything else → `pxl.storeValue()`. Then `valueChanged(name)`: `isAnimated`, local matrix dirty for transform keys (`pxl.isSpatialKey`), broadcast `refKey`, and `parentLayer.invalidate()` for a key where `affectsPixels()` is true, otherwise `compositingChanged()` (only a layer does something there, §5.3) and, for an animated element, `parentLayer.wake()` (§5.2).
- `affectsPixels(key)`: whether a changed value changes the layer's pixels. Default: `true`, except while the element is hidden (only `hidden` itself counts then; a hidden element is still evaluated). A layer: not for `alpha`, `blend`, `filter` (CSS on its canvas). A variable: never (its readers redraw their own layers).
- `connectedCallback()`: properties set before the upgrade (`_pendingProperties`, §4.5), `parentLayer` / `parentContainer`, `registerChild()` on the container (once per connect, no `includes()` check: that made inserting n children quadratic), `_lastParentMatrixVersion = -1` (a new parent may have the old one's version), subscriptions restored, reactive attributes evaluated (their refs and `toLocal()` need the element in the DOM), registry entry and broadcast for an `id`, `_isRegistered = true`.
- `disconnectedCallback()`: registry entry removed (only if it points to this element), own subscriptions cleared, `unregisterChild()`. Shapes and groups also call `interaction.releaseElement()` (§8.5).
- `evaluateAnimations(t)`: while animated, first `parentLayer.markAnimated()` (the keep-alive, §5.2; before evaluating, so an element whose evaluation fails keeps the frames coming and an error that depends on `t` recovers). Then evaluates the animated keys, stores changed values, marks the local matrix dirty for transform keys, broadcasts `refKey` if a value changed and someone subscribes, and calls `parentLayer.invalidate()` only if a changed value `affectsPixels()`, otherwise `compositingChanged()` if any value changed.
- `reportError(error)`: warns once per distinct message, at most 3 times per element (the third says more are hidden; browser messages may contain changing values). The same error object again returns at once (a cached gradient error allocates nothing).

## 3. Compiler (`js/compiler.js`)

`pxl.parseAttributeValue()` implements language §3.1 (`pxl.CSS_HSL_REGEX`, `pxl.CSS_COLOR_FUNCTION_REGEX` for the CSS colors kept as text). Code goes to `pxl.compileExpression(str)`:

1. **Cache:** `pxl.staticCache` (results of static expressions) and `pxl.animationCache` (functions), Maps keyed by the source string, at most `pxl.COMPILE_CACHE_LIMIT` (2,000) entries each; `pxl.cacheExpression()` drops the oldest (insertion order). A framework that rebuilds strings every render would grow them without end; elements keep their functions.
2. **`pxl.splitStringLiterals()`** splits once into code and string literals (`'…'`, `"…"`, the text of `` `…` ``; code inside `${…}` is code). Steps 3–6 read and rewrite code only. Regex literals and comments aren't recognized.
3. **CSS percentages:** `50%` before `,` or `)` → `'50%'` (a quoted CSS color in a gradient stays as written).
4. **Time:** `pxl.timeDriverRegex` finds `t` (not after a `.`) or a driver call; `toLocal(` sets `usesToLocal` (and `pxl.checkToLocalProperties` warns once about unknown literal property names).
5. **`pxl.rewriteExpression()`** (shared with handlers): `ref.a.b` → `ref.a?.b`; `toLocal(` → `pxl.toLocal(this, `.
6. **Dependencies:** every `ref.<id>` → `variableDependencies` (`'ref.<id>'` keys).
7. **Return:** without the word `return` in the code, wrapped in `return …;`.

Animated or reactive (time or refs), one outer function per distinct string, shared by every element using it:

```javascript
const fn = new Function('scope', 'ref', `
  const { PI, sin, cos, ... } = scope;   // pxl.scopeKeys
  let t;
  const _d = new Date();
  const loop = (d) => (t % d) / d;       // pxl.timeDrivers, from pxl.drivers
  return function(_t) { t = _t; <code> };
`)(pxl.scope, pxl.nodes);
```

Flags on the function: `isTimeDependent`, `variableDependencies` (only when there are refs), `usesToLocal`. It is called as `fn.call(element, t)` (`this` = the element, for `toLocal`). Static expressions: evaluated once with `new Function`, the result cached (an `undefined` result keeps the source string). A string that doesn't compile warns, is cached and used as text. `pxl.scope` is a whitelist (`Object.create(null)`), so polyfills can't leak in.

## 4. Reactivity (`js/engine.js`)

### 4.1 Registry

- `pxl.nodes`: `{ id: values }`, the `ref` object of every compiled function. Connect registers and broadcasts `ref.<id>`, so readers written before the element re-evaluate.
- `id` is observed: once registered (`_isRegistered`, set at the end of `connectedCallback()`), a changed id moves the entry (`pxl.renameNode()`: the old entry is removed only if it points to this element, `refKey` follows, both names are broadcast, readers of the old name read `undefined`). Frameworks such as Angular and Alpine set `id` after insertion; during an upgrade the attributes arrive before `connectedCallback()`, which registers the id itself.

### 4.2 Classification and Subscriptions

`pxl.compileAttribute(element, name, value)` (bare / removed values resolved first by `pxl.resolveEmptyAttribute`):

| Result | Storage | Evaluated |
|---|---|---|
| static value | `pxl.storeValue()`: `values[name]`, removed from all key lists | never again |
| function with `isTimeDependent` | `animatedAttributeKeys` | every frame (`evaluateAnimations`) |
| function with `variableDependencies` only | `reactiveAttributeKeys` (+ `toLocalAttributeKeys` if `usesToLocal`), subscribed to each dependency, evaluated at once if connected | when a dependency broadcasts |

- `pxl._subscriptions`: `{ 'ref.id': [element, …] }`. `pxl._subscribedKeys`: `WeakMap` element → `Set` of its keys, so `subscribeToVariable()` checks the set and `clearAllVariableSubscriptions()` removes an element only from its own keys (removing many elements with readers stays linear; design: `design/done/2026-10-30_framework_compatibility_plan.md` §20). `restoreVariableSubscriptions()` on connect.
- Readers with `t` don't subscribe; they read their sources when evaluated.
- Granularity is the element: any change of `ref.<id>` re-evaluates every reader of any of its values (unchanged results stop there).

### 4.3 Propagation

```
pxl.broadcast('ref.a')                         subscribers walked backwards (one may unsubscribe itself)
  → element.variableChangedCallback('ref.a')
    → pxl.evaluateAttributesForVariable()      re-evaluates the reactive keys that depend on it; bitmask:
         1 = still needed (0 → unsubscribe), 2 = a value changed, 4 = a changed value changes pixels
    → if 2: broadcast own refKey, then parentLayer.invalidate() (4) or compositingChanged()
```

- Recursive and depth first. A reader's own error is reported by the reader; the element that changed isn't blamed, the other readers still update.
- **Cycles:** a cycle whose values keep changing re-enters an element from inside its own broadcast. `_broadcastNesting` counts that and stops at `pxl.MAX_CYCLE_ROUNDS` (100) with `pxl.CYCLE_MESSAGE` through `reportError()`. Chains, diamonds and elements with many inputs are entered one after the other, so the count doesn't grow for them. A cycle of n elements nests n × 100 calls, below the stack limit up to about 200 elements. An attribute reading another attribute of its own element follows after one extra round.
- **Diamonds:** a reader reached on two paths is evaluated once per path and may first see one new and one old input; only final values are drawn. Design: `design/done/2026-11-12_reactive_propagation_plan.md`.

### 4.4 `toLocal` Reactivity

- **Target side:** readers subscribe to `ref.<target>`. When an ancestor's transform changes, `setLocalMatrixDirty()` → `broadcastGlobalMatrixChange()` walks its subtree and broadcasts every child someone subscribes to.
- **Reader side:** the same walk calls `pxl.evaluateToLocalAttributes()` on children with `toLocalAttributeKeys` (bitmask: 1 changed, 2 matrix dirtied, in which case `setLocalMatrixDirty()` already walked the subtree, 4 a changed value `affectsPixels()`). The walk runs before drawing, so there is no lag. Time-dependent `toLocal` expressions are evaluated every frame anyway and not listed. Design: `design/done/2026-10-26_tolocal_fix_plan.md`.

### 4.5 Properties

Language §3.7 is the contract. Mechanics (design: `design/done/2026-10-30_framework_compatibility_plan.md` §24):

- `pxl.defineAccessors(Class)`: a getter / setter per observed attribute on the class prototype, the first time an instance is created (`pxl._accessorClasses`), so custom shapes get them. Skipped: hyphenated names, and names the prototype already has (`id`, `hidden` native; `Text`'s `text`, `Polyline`'s `points` have their own). Setter → `setValue(name, value === undefined ? null : value)`.
- Values set before the upgrade are own properties hiding the accessors: the constructor reads `Object.keys(this)` before adding any field, and `pxl.takeOwnProperties()` takes them out as `[name, value, …]`; `connectedCallback()` sets them again (`pxl.setPendingProperties()`), after the attributes. An element upgraded without being connected gets them on insertion.
- `pxl.setFromRef()` (`ref.<id>.set`): a string → `setAttribute()`, otherwise the property; an unknown name warns once per element type and name (`pxl._unknownSetNames`).
- `Text.text` stores a string with `pxl.storeValue()` (never compiled). `Polyline.points` → `setPoints()` (§6.5). Stage `ratio` / `alwaysrender`: setters `reflectAttribute()`, getters return the parsed ratio and `isAlwaysRender()`.
- Costs measured with `design/prototypes/2026-10-30_framework_compatibility/w3_property_costs.html`.

## 5. The Frame

### 5.1 Requests

`Stage.requestRender()` schedules one `requestAnimationFrame` (no frame while invisible, before the first size, already pending, or while `render()` runs: a change during a frame, such as a pointer reader or a handler at its start, is drawn in that frame, and `render()` decides about the next one, §5.2). Callers: `Layer.invalidate()` (sets `isDirty`; a hidden layer whose canvas is already empty returns early), `Layer.wake()`, the keep-alive at the end of `render()`, `Variable.valueChanged()`, pointer events, `compositingChanged()`, resize, font arrival (`invalidateLayers()`).

`isDirty` means only "pixels out of date": a layer redraws in a frame only when something in it changed. A `floor(t)` clock redraws once per second, a finished `clamp(t * 100, 0, 300)` stops redrawing; values that are new objects every frame (an animated gradient descriptor, an array) count as changed. Frames still run while anything is animated, so the clock notices the next second. Design: `design/2026-11-20_evaluation_model_plan.md` (step 2).

### 5.2 `Stage.render(t)` (`t` in seconds)

```
pxl._frame++; _isRendering = true             per-frame state is stored as the frame it belongs to (no resets)
runFrame(t), in try / finally (_isRendering = false whatever happens):
  interaction.process()                       pointer first: broadcast the stage's mouse values, hit test against
                                              the last update (the picture on screen), hover states and events;
                                              their readers update now and are drawn in this frame (§8.4)
  sort layers and stage-level variables by DOM position (if _isOrderDirty)
  stage-level <pxl-var>: update(t)
  UPDATE PHASE, layers with isDirty || hasAnimatedContent:
    layer.update(t)
      sort children (if dirty)
      evaluateAnimations(t)                   marks the layer if animated; error → _failedFrame, reportError
      unless failed or hidden: child.update(t)   group: sort, evaluate (error: skip subtree), unless hidden its
                                              children; shape: evaluate (also when hidden); variable: evaluate.
                                              Animated ones call markAnimated(); a changed value that
                                              affectsPixels() calls invalidate(): isDirty
      hasAnimatedContent = marked in this frame
  DRAW PHASE, layers where needsRender():     isDirty || _isCompositingDirty (isDirty also catches a later
    layer.render(u)                           layer's broadcast after this layer's update)
      failed this frame → return (keeps its pixels and stays dirty)
      write CSS opacity / mix-blend-mode / filter if changed; _isCompositingDirty = false
      not dirty → return: the CSS-only path (§5.3)
      isDirty = false; clearRect
      hidden → canvas empty, return
      save; scale(u, u); applyTransformState if a transform is set; children render(ctx, u); restore
needsNextFrame()                              the keep-alive: an animated stage-level variable, or a layer with
  → requestRender()                           hasAnimatedContent or still dirty (a failed update keeps its request)
perf counters (hit testing included)
```

- **`hasAnimatedContent`** is recomputed in every update of the layer, never counted: elements come and go and switch between static and animated, and each such change already invalidates the layer (or calls `wake()`), so the next walk finds it. `wake()` is for an animated value that changes no pixels: a hidden shape or a variable made animated with `setAttribute()`.
- Static layers cost nothing per frame, and a layer with animated content costs only its update when nothing changed. Design: `design/done/2026-11-12_two_phase_frame_plan.md` (evaluation before drawing: readers drawn before their targets see this frame's values; readers with `t` excepted).

### 5.3 CSS-Only Fast Path

A layer's `alpha`, `blend` and `filter` don't `affectsPixels()`: when only they change, animated or from outside (`valueChanged()`, `variableChangedCallback()`), the layer gets `compositingChanged()` (sets `_isCompositingDirty`, asks for a frame) instead of `invalidate()`, writes only its canvas CSS and keeps its pixels. Any other change in the same frame still redraws. Design: two-phase plan §7.1, framework plan §29.

### 5.4 Hidden Subtrees

A hidden shape is evaluated and not drawn, and its changes don't redraw its layer (`affectsPixels()`; only `hidden` itself does). A hidden group or layer doesn't update its children: values that follow `t` freeze (also in a `<pxl-var>` inside), values that follow refs keep updating through broadcasts. Stage-level variables aren't affected. Design: `design/done/2026-11-07_safe_shape_render_plan.md` §5.1.

### 5.5 Errors

Nothing that throws breaks the frame (design: `design/done/2026-11-07_safe_shape_render_plan.md`):

- **Shape:** `update()` catches evaluation errors (`_failedFrame`: the draw phase skips it); `render()` catches drawing errors; the canvas state is always restored.
- **Group, layer, variable:** a failed evaluation skips the element with its children in both phases; a layer keeps its pixels and its request, a variable its value.
- **Readers** evaluated by a broadcast or the `toLocal` walk catch their own errors (§4.3), also outside frames.
- Not covered: an expression that fails at once in `setAttribute()` surfaces as an uncaught error of the custom element reaction (the old value stays). Handler errors: §8.7.

## 6. Drawing

### 6.1 `Shape.render(ctx, u)`

Skips a failed or hidden shape; `needsIsolation()` → `renderIsolated()`; otherwise `ctx.save()`, `pxl.applyContextState()` (= `pxl.applyTransformState()`, steps in language §2, each skipped at its default, + `pxl.applyCompositingState()`: alpha multiplied, mask or blend, `resolveFilter()` (before it, `pxl.checkCanvasFilter()` asks the context's prototype once per page whether it has `filter`, and warns if not), shadow only with `shadowcolor`, `none` / `transparent` reset it; canvas shadows and filters ignore the canvas transform, so their lengths are scaled by `u` × the layer's `dpr`), `draw(ctx)`, `ctx.restore()` in `finally`. Every shape draws in its own canvas state, so a custom shape can't leak state. Custom shapes override `draw()`, not `update()` or `render()`. Groups apply only `applyTransformState()`, and only around their children when a transform isn't at its default; a layer always scales by `u` first (below).

**Logical units:** everything inside a layer draws in the units of the HTML. `Layer.render()` scales its context by `u` once, so transforms, paths, line widths, dashes, gradients and font sizes are written as the attributes say, and nothing that `draw()` measures depends on the stage size; `renderIsolated()` and the hit test set the global matrix × `u` instead. `u` reaches `Shape.render()` only for what ignores the canvas transform is scaled by the engine before `draw()`: shadows and `ctx.filter` (`u` × `dpr`, above). Pixel access ignores it too (`getImageData()`): a shape that reads or writes pixels uses `this.stage.unit`. `draw()` gets no time: time-dependent values are evaluated in `update()`, so a hit test sees what is drawn. Design: `design/done/2026-11-20_custom_shapes_plan.md` §5.3, §5.4.

**Defining a shape:** `pxl.defineShape(tag, Class)` (`shape.js`), for the built-in shapes and custom shapes alike. It warns once per class at define time: a `defaults` key with capitals (HTML lowercases attribute names), no `draw()`, no own `getBoundingBox()` (the base method returns an empty box silently; `needsExactHitTest()` then skips the box check). A tag that is already defined (a script loaded twice) gets a warning instead of the browser's `NotSupportedError`. Then `pxl.hideShapeTag()` and `customElements.define()`. `setBoundingBox(left, top, right, bottom)` writes `boundingBox` and returns it (the built-ins use it too); `paint(ctx, 'fill' | 'stroke')` returns the attribute as a canvas style through `createGradient()` (§6.3). The Star and the Gauge of the docs (`docs/js/shapes/`) are loaded as a second script by the test pages too. Design: `design/done/2026-11-20_custom_shapes_plan.md` §4, §5.5, §5.7.

- `applyStyle(ctx)`: `hasFill()` → `fillStyle` (gradient slot 0), `fill()`; `isStroked()` (stroke not none / transparent and `strokewidth > 0`) → `applyStrokeState()`, `stroke()`.
- `applyStrokeState(ctx)`: `strokeStyle` (slot 1), `lineWidth`, caps, joins, miter limit, `applyLineDash()`. Every stroke goes through it (also text's `strokeText`): stroke state is set before stroking and never reset.
- `applyLineDash(ctx)`: the pattern as written (`setLineDash()` copies it); one number through the reused `_singleDash`; solid, or any other value, → `pxl._emptyDash`. `pxl.hasLineDash()`: not null, `'none'` or `'0'`.
- `resolveFilter(filter, scale)` (layers and shapes): an array joined with spaces, then `pxl.scaleResponsiveFilter()` multiplies every number before `px` by the scale (exponent notation included: JavaScript prints values near 0 as `1.2e-15`); cached per (string, scale). The scale is `u` for a layer's CSS `filter` (CSS pixels) and `u` × `dpr` for a shape's `ctx.filter` (bitmap pixels).

### 6.2 Isolation

Design: `design/done/2026-11-01_isolated_shape_compositing_plan.md`.

- `needsIsolation()` = `hasCompositingState()` (`mask`, `blend`, `filter`, or a visible `shadowcolor`; not `alpha`) and `drawsMoreThanOnce()`. Path shapes: `fillsAndStrokesOrHasArrows()` (fill and stroke, or `hasArrowheads()`); text: fill and stroke, a wrap `width`, or a line break in `text`; grid: `major > 0` or fill and stroke; the base class (custom shapes): `true`.
- `renderIsolated()`, on the shared scratch canvas (`pxl.getIsolationContext(w, h)`: one per page, grows to the largest layer canvas, never shrinks), inside its `save()` / `restore()`: `prepare(scratch)` (false: nothing to draw; text lays out there, so its box is current), then the **device box**: `getHitBox()` padded by `hitPadding()`, the four corners through the global matrix × `u` × `layer.dpr` (unrolled, no allocation), rounded outwards with one more device pixel, clamped to the canvas; empty or `NaN` → nothing. `hasBoxBeforeDraw()` false (a shape without its own box, `needsExactHitTest()`; the grid, whose box is the visible area computed in `draw()`) → the whole canvas. Clears only the box at the scratch canvas's origin, `setTransform()` of the global matrix × `u` × `layer.dpr` shifted by the box's corner (same pixels as the transform chain to 1 / 255), `draw(scratch)`, then `drawImage()` of the box onto the layer with an identity transform and `applyCompositingState()`. The scratch canvas is never cleared as a whole: a shape composites only its own box, which it cleared first. Shadows and filters apply at the composite step: they ignore the transform, so sizes match the direct path, they may reach beyond the box, and their GPU work covers only the box; a bitmap's shadow blurs its soft edge slightly differently (up to 16 / 255). Masks that erase outside the drawn image (`destination-in`, `copy`, …) still erase the whole layer: the canvas treats the area outside the image as transparent. Isolation never nests (groups have no compositing). Hit testing doesn't isolate. Design: `design/done/2026-11-26_isolation_box_plan.md`.

### 6.3 Gradients

`createGradient(ctx, value, slot)` returns values that aren't descriptors (`isGradient: true`) unchanged. Each shape caches two slots (`_gradCache[0]` fill, `[1]` stroke) keyed by descriptor object, the four box values and `strokewidth`; while all match, the `CanvasGradient` is reused. A build that throws (a typo in a stop color, a `NaN` box) is cached as the error and thrown again (about 1 µs instead of a new exception, about 6 µs). `buildGradient()` sizes the stroke area to at least `strokewidth` per side (design: `design/done/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md`), places linear / radial / conic in the box, `pxl.resolveRadius()` for keyword radii, and clamps stop offsets (`addColorStop` throws outside 0–1). An animated descriptor is a new object every frame, so it builds every frame. `getBoundingBox()` must exist on custom shapes; the base version warns and returns a zero box.

### 6.4 Arrowheads

Design (derivations): `design/done/2026-10-14_unified_arrowhead_geometry_plan.md`. All distances in logical units (§6.1).

- `pxl.arrowSize(value, strokewidth)`: `'auto'` = 3.6 × width; ≤ 0 → 0.
- `resolveArrow(rec, value)` writes `size`, `len` (= size × `pxl.ARROW_COS30`), `tipAdvance` and `inset` into a pre-allocated record (`pxl.createArrowRecord()`, all fields doubles: one hidden class). Cap extension `capExt` = 0 (butt) or sw / 2.
  - `'line'`: the stroked chevron corner reaches beyond its vertex by `joinExt` = sw (miter), sw / 2 (round), sw / 4 (bevel): `tipAdvance = capExt − joinExt`, `inset = joinExt` (the shaft ends at the chevron vertex).
  - `'filled'`: shaft depth behind the tip `D = min(max(Dmin, 0.6 × len), len + capExt)` with `Dmin` = 0.866·sw (butt), 1.366·sw (square), sw (round) — continuous, so animated sizes never jump; `tipAdvance = capExt`, `inset = D − capExt`.
- `aimArrow(rec, px, py, vx, vy)`: unit direction out of the path, tip = end + `tipAdvance` · dir; returns the vector length.
- **One trim definition:** the shaft end and the head base lie `inset` / the head length from the tip in a straight line, on every shape. Lines: along the line. Circles: `2·asin(d / 2R)`. Ellipses: 12 bisection steps on the angle (a local estimate fails at thin tips). Smooth polylines: 12 bisection steps on the end Bézier segment (`trimParameter`), split with de Casteljau; `_flatCache` is never changed. The head points along the chord over its own length, so its base sits on the curve.
- `drawArrows(ctx, a, b)`: both heads in one path, one `fill()` (filled: `fillStyle = strokeStyle`) or one `stroke()` (chevrons: dash off, miter limit raised to at least 4, since a 60° miter needs 2). Always the last call of `draw()`: it leaves `fillStyle`, dash and miter limit changed, and `render()` restores them. `traceArrow()` adds one head; wings are the direction rotated by ±30° with `pxl.ARROW_COS30` / `pxl.ARROW_SIN30` (no trig per head). Shapes without heads skip all of it.

### 6.5 Per Shape

- **Circle / ellipse:** `pxl.arcEndRadians(start, end, sweep)` (sweep wins, neither: full turn), `pxl.isFullTurn()`; ring: the inner arc in reverse, then close; pie: `lineTo(0, 0)`, close. Arrows: §6.4.
- **Rect:** origin `(-w·ax, -h·ay)` from `pxl.anchorX` / `pxl.anchorY`; `roundRect()` with radii clamped to ≥ 0 (it throws on negatives) when any is > 0, else `rect()`; radii in the pre-allocated `_radii`.
- **Line:** without arrows `moveTo` / `lineTo`; with arrows one `sqrt`, the shaft trimmed by each inset, only heads if the insets exceed the length.
- **Polyline:**
  - `setPoints(value)` (attribute and property): a string through `pxl.parsePointsIntoArray()` (parenthesis-aware split into coordinate strings), an array read in place. Only when the count changes, `resizePoints()` removes keys beyond it (from all key lists) and adds `p0, p1, …` and a new `Float64Array` buffer; kept keys keep their value until set again. Each coordinate: a string → `pxl.compileAttribute(this, 'pN', s)`, a number stored (written directly when the key holds no expression). Then `isAnimated`, broadcast, invalidate.
  - `loadPoints()` fills `_flatCache` (Float64 like the matrices, so relative sums carry no Float32 error) with the values, accumulates relative mode, and returns false if any value isn't finite (`probe += v * 0`, no extra loop).
  - Smooth: `loadSegment()` serves drawing, arrow trimming and the hit box, so they always agree (6 `sqrt` per segment, no allocation). Handles at P with incoming Δin (length dIn), outgoing Δout (dOut), `aIn = √dIn`, `aOut = √dOut`: tangent `T = dIn·Δout + dOut·Δin`, outgoing handle `k·T / (3·aIn·(aIn + aOut))`, incoming `−k·T / (3·aOut·(aIn + aOut))` (`k` = `smooth`); evenly spaced points give `(pNext − pPrev)·k/6`. Design: `design/done/2026-10-23_smooth_polyline_spline_plan.md`.
  - Arrows skip end segments shorter than 0.01 px.
- **Text:** `layout(ctx)` sets the context's text state and keeps three caches, each rebuilt only when its inputs change, and returns false for an empty text; `draw()` calls it first, an isolated text also in `prepare()`, so its box is current before the engine reads it: (1) the font string and letter spacing (size, font, weight, style, letter spacing, `pxl._fontGeneration`; a resize measures nothing again); (2) the lines (`_lines`, `_totalChars`; word wrap with `measureText()` when `width > 0`; `\n` written as text becomes a line break); (3) the box and first baseline (`_startY`; align, baseline, line height, direction, `maxwidth`): `measureText()` ignores `maxWidth`, so a line wider than `maxwidth` has both box sides scaled by `maxwidth / width`. An animated `maxwidth` measures every line every frame (accepted). Context state (font, letter spacing, align, baseline, direction) is set on every draw. `_hasInk` is true only when something was painted; `hitTest(ctx)` adds the box (padded by half the stroke) and calls the intercepted `fill()`. **Late web fonts:** `pxl.fontsArrived()` raises `pxl._fontGeneration` and calls `invalidateLayers()` on every stage in `pxl.perf.stages`. It runs when `ready` resolves: once at start (fonts that began loading before the engine), and after every `loading` event of `document.fonts`, whose handler reads the new batch's `ready`. The listener sits on a kept reference, `pxl._fonts` (Safari drops the listeners of an unreferenced `document.fonts`, and sends no `loadingdone`). Usually twice per batch, and once after parsing on every page. Design: `design/done/2026-11-06_text_box_accuracy_plan.md`, `design/done/2026-11-22_late_web_fonts_plan.md`.
- **Grid:** the four stage corners mapped through the inverse of its global matrix give the visible area, which becomes its bounding box; snapped to `step` with one extra step per side; minor lines in one path and `applyStyle()`, major lines in a second path at 2 × width (only when stroked), labels with `fillText`. `step <= 0` returns at once (the loops would never end).

## 7. Matrices and `toLocal` (`js/matrix.js`)

### 7.1 `pxl.Matrix`

Static functions writing into `Float64Array(6)` `[a, b, c, d, tx, ty]` (Float64 keeps attribute values exact in `tx` and `toLocal()`: Float32 turned `333.3` into `333.29998779296875`): `create()`, `updateLocal(out, x, y, dx, dy, rotate, scalex, scaley, skewx, skewy)` (the order of language §2; callers pass `zoom × scalex`, `zoom × scaley`), `multiply(out, a, b)`, `invert(out, a)` (identity when singular, e.g. `zoom="0"`). Scratch matrices: `pxl._scratchMatrixA`, `pxl._scratchMatrixB`, `pxl._identityMatrix`.

### 7.2 Lazy Versions

Each `PxlNode` has `_localMatrix`, `_globalMatrix`, `_isLocalMatrixDirty` (set by transform changes), `_localMatrixVersion` / `_globalMatrixVersion` (raised on recompute), `_lastLocalMatrixVersion` / `_lastParentMatrixVersion` (what the global was built from). `getLocalMatrix()` rebuilds when dirty; `getGlobalMatrix()` walks up the parents and multiplies only when a version changed; `getInverseGlobalMatrix()` (hit testing) inverts only when the global version changed, created on first use.

### 7.3 `pxl.toLocal(caller, target, property)`

The compiler rewrites `toLocal(` to `pxl.toLocal(this, `. Delta = inverse(caller's parent global) × target global; the target's offset in that space `tdx = d[0]·dx + d[2]·dy`, `tdy = d[1]·dx + d[3]·dy`; `det = d[0]·d[3] − d[1]·d[2]`:

| Property | Value |
|---|---|
| `'x'`, `'y'` | `d[4] − tdx`, `d[5] − tdy` |
| `'dx'`, `'dy'` | `tdx`, `tdy` |
| `'tx'`, `'ty'` | `d[4]`, `d[5]` |
| `'rotate'` | `atan2(d[1], d[0])` in degrees |
| `'scalex'` | `√(d[0]² + d[1]²)` |
| `'scaley'` | `det / scalex` |
| `'skewx'` | `atan((d[0]·d[2] + d[1]·d[3]) / scalex²)` in degrees |
| `'zoom'` | `√|det|` |

Rotate, scalex, scaley and skewx decompose any 2×2 matrix in Kilopixel's order with `skewy = 0` (mirrors included). Names not in `pxl.toLocalProperties` return `0`. Design: `design/done/2026-10-29_tolocal_decomposition_plan.md`.

## 8. Interaction (`js/interaction.js`)

Design: `design/done/2026-10-30_framework_compatibility_plan.md` §22–§23.

### 8.1 Browser Events

The stage passes them to its `InteractionEngine` (`handleEvent`): `Stage.POINTER_EVENTS` (`pointermove`, `pointerenter`, `pointerleave`, `gotpointercapture`, `lostpointercapture`) in the bubble phase, `Stage.ARRIVING_EVENTS` (`pointerdown`, `pointerup`, `pointercancel`, `pointerout`, `mousedown`, `mouseup`, `click`, `dblclick`, `contextmenu`) in the capture phase.

- Events over a canvas arrive retargeted to their layer (the canvas is in its shadow root). Any other target inside the stage (a shape holding capture, `shape.click()`, HTML in a layer) passes unchanged. The engine ignores its own dispatched event (`_dispatching`).
- Position in stage units: `offsetX / unit` over a canvas; otherwise `clientX` minus the stage's box (`readPosition()`).
- `pointermove`: stores the event, sums `movementX` / `movementY`, marks the pointer dirty, asks for a frame. Hit testing waits for the frame.
- Press, release, click, `dblclick`, `contextmenu`: hit-tested at their own position when they arrive (`hitAt()`, cached for that position until the pointer moves or a frame runs: one click brings up to five events). A press or release first moves the pointer and updates the hover (enter events before the press). Over a shape: `redispatch()` stops the browser's event at the stage and dispatches the same type on the shape; `preventDefault()` is passed back.
- **Click target:** `pointerup` decides it, `commonNode(pressed, released)` (`_isClickDecided`, `_clickTarget`); a click without a press on this stage is hit-tested.
- `pointerout` of a layer with `relatedTarget` outside the stage: hover cleared and leave events dispatched at once, before the page sees it. `pointerleave` / `pointerenter`: the stage's `isHovered`.
- **Press outside:** while a press is held, capture listeners on `window` for `pointerup` / `pointercancel` end it if `composedPath()` doesn't contain the stage (works in shadow roots); `pointercancel` on the stage too, without a click.
- **Capture:** `gotpointercapture` from a shape sets `_captured`; the browser then sends moves, release and click to the shape itself, the engine sends no `pointermove` of its own, and the release ends the press.
- **Secondary touches** (`isPrimary === false` with a `pointerType`): own hit test and redispatch for press, release, click; no hover, no `mouseX`.

### 8.2 Hit Testing

- `pxl.dummyCtx`: a 1×1 canvas context whose `fill()` / `stroke()` set `pxl._hitResult` from `isPointInPath` / `isPointInStroke` at (`pxl._hitX`, `pxl._hitY`): a shape's own `draw()` is its hit test.
- `findShapeAt(x, y)`: layers in reverse, skipping `hidden` ones and ones CSS hides (`display: none`, `visibility: hidden` from `cssStyle()`); `findShapeIn()` walks `childList` backwards, recursing into groups, skipping `hidden`. A layer's `pointer-events` isn't read (its shapes inherit it).
- `hitsShape()`: (1) `mayContainPoint()`: the point mapped through `getInverseGlobalMatrix()`, compared with `getHitBox()` (`getBoundingBox()`, or for a smooth polyline its points plus all Bézier handles via `loadSegment()`) padded by `hitPadding()` (half the stroke, a miter up to `miterlimit` × half, a square cap's corner, arrowheads); min / max for mirrored rects; `needsExactHitTest()` (no own `getBoundingBox()`) skips the check. (2) `cssStyle().pointerEvents !== 'none'`. (3) the exact test: the global matrix × `u` on `pxl.dummyCtx` (logical units, as in §6.1), `hitTest(ctx)` if the shape has one, else `draw(ctx)`, in `try` / `finally` with `save` / `restore` (a throwing shape counts as not hit). The box is read from current values every time, so a shape changed by `setAttribute()` is hit at its new place.
- Cost: about 0.4–0.8 µs per shape with warm caches, about 10× in a real frame; 1–4 exact tests per hit test.

### 8.3 States

`_hovered`, `_pressed`: the innermost node; its groups up to the layer share the state (`setChain()`, `setState()` broadcasts the node's `refKey` only on change). A group without an id broadcasts nothing; state changes never invalidate a layer, only readers redraw.

### 8.4 `process()`, at the Start of Every Frame

1. If the pointer changed: broadcast the stage's `refKey`.
2. Stage not hovered or pointer over HTML content: `hover(null)`. Otherwise hit test when the pointer changed or `pxl.RESTING_HIT_INTERVAL` (100 ms) has passed (a moving shape under a resting pointer), then `hover()` and `updateCursor()`.
3. The pointer moved and no capture: queue one `pointermove` and one `mousemove` on the hovered shape with the summed movement.
4. `flush()` the queue.

Design: `design/done/2026-11-17_pointer_frame_order_plan.md`. A static page asks for one frame per browser move and none while the pointer rests; with the pointer resting, `process()` costs 0.03–0.16 ms for 1,000–5,000 animated shapes.

### 8.5 Boundary Events, Dispatch, Release

- `hover(next)` queues in the browser's order, pointer then mouse types: `…out` on the shape left (or the layer, when coming from empty space), `…leave` up its chain until a node that contains the new shape (states cleared on the way), `…over` on the new shape (or the layer, going to empty space), `…enter` from the outermost new node down (filled backwards into the queue). `relatedTarget`: the node left / entered, the layer for empty space.
- `flush()` dispatches the queue after the hit test (listeners may change or remove shapes); events a listener causes are appended and dispatched by the running loop; references are cleared afterwards. Arrays grow once and are reused.
- `dispatch()`: a new `PointerEvent` / `MouseEvent` per event (fields are read-only, frameworks may keep it), built from one reused init object: the browser event's `pxl.EVENT_INIT_KEYS`, `composed: true`, `bubbles` / `cancelable` false only for enter / leave, `movementX` / `Y` summed for moves. About 6 µs each; a hover change dispatches about 8, plus 4 per group.
- `releaseElement(el)` (disconnect of a shape or group): hover and press inside it pass to its nearest group still connected, without events; capture and click target are dropped. `reset()` (stage disconnected): everything cleared without events, cursor removed.
- `updateCursor()`: the hovered shape's computed `cursor` (`auto` → none), written with `Layer.setCursor()` on every layer canvas inside its shadow root (no framework style binding overwrites it), only when it changes.

### 8.6 Allocations

None in the walk, box check, boundary walk and queue; one event object per dispatched event.

### 8.7 Handlers

`pxl.HANDLER_EVENTS` maps `pxl-on-*` to event types; `pxl.createHandlers()` makes the per-element record (`handlers.click`, …). `setHandler(name, source)` removes the old listener (a removed or empty handler leaves `handlers.<type>` `null`) and adds `pxl.compileHandler()`'s: the source through `pxl.rewriteExpression()`, compiled with the scope and `ref`, wrapped in a listener that calls it with `this` = the element and logs a throw with `console.error`. Design: `design/archive/2026-11-15_handler_errors_plan.md`.

## 9. Stage and Layer Internals

- **Default styles** (`pxl.defaultStyles()`, `stage.js`): `@layer pxl { … }` with the stage's display / position / width, `pxl-stage:state(fallback)` (`contain: inline-size; contain-intrinsic-inline-size: 300px; min-width: 0`), `display: none` for `pxl-var`, `pxl-group` and every tag `pxl.defineShape()` defined (`pxl._shapeTags`), `pxl-grid { pointer-events: none }`, the handler cursor rule. `pxl.addDefaultStyles(root)` prepends one `<style data-pxl>` to `<head>` at load and to a shadow root when a stage connects inside one, and keeps it in `pxl._styleElements`; `pxl.hideShapeTag(tag)` adds a tag and rewrites them all, so a shape defined later (a custom shape's script) is hidden in existing roots too. Content inside a shape tag shows until its script has defined the tag. The first declared cascade layer ranks lowest, so any page rule wins, also in the page's own layers (Tailwind v4); `adoptedStyleSheets` and `:where()` would beat layered rules.
- **Layer canvas:** in an open shadow root with `pxl.Layer.STYLES` (`:host` absolute, `inset: 0`; the canvas fills it) and a `<slot>` for light-DOM children; `innerHTML` and frameworks can't remove it. Engine and tests reach it as `layer._canvas`. `resize(w, h, dpr)` sets the canvas size (which resets the context) and scales by `dpr` again.
- **Sizing:** a `ResizeObserver` with `device-pixel-content-box` (fallback `content-box`, Safari) → `resize()`: `unit`, height broadcast, every layer resized, an immediate render. Width 0 → `markFallbackWidth()` (the custom state through `attachInternals()`, field `_internals`; skipped without a box; older browsers without custom states stay 0). Also checked once in the frame after connect (an observer needn't report a box that stays 0); `disconnectedCallback()` removes the state. Design: `design/done/2026-11-04_stage_sizing_plan.md`.
- **Visibility:** an `IntersectionObserver` pauses rendering out of view unless `isAlwaysRender()`.
- **Lists:** `layers` and `_variables` (stage-level `<pxl-var>`, registered when a variable has no `parentLayer`), sorted by DOM position when `_isOrderDirty` (`pxl.sortByDOMPosition`). Layers and groups keep `childList` sorted the same way, in their update.
- `values` is created in the constructor and kept on reconnect (pointer and stats survive a move). `id` is observed like on nodes.

## 10. Performance Monitor (`js/monitor.js`)

`pxl.perf.stages`; a stage registers on connect. Each `Stage.render()` adds to `perfFrames`, `perfAccumulated`, `perfMax`. A 1-second `setInterval` (`_timer`, running while any stage is registered) publishes `fps = round(frames / seconds since the last publish)` (timers fire late in background tabs), `renderAvg`, `renderMax`, into the stage's `values`, broadcasts `ref.<stage>`, and resets the counters. Not from `render()`: an idle page would freeze at its last values. Frame counting (only frames that drew) and per-layer metrics: `design/2026-11-12_layer_throttling_plan.md` (D4, C2).

## 11. Build (`build.js`)

1. `readSources()` / `bundleSource()` concatenate the 19 files; `require('./build.js')` builds nothing and exports them with `checkSources()` for `tools/check_build.js`.
2. `checkSources()` refuses: a top-level `class` / `const` / `let` / `var` / `function`; trailing whitespace; a `_` field used in another engine file or a plain field used only in its own (found by name, equal names in different classes count together).
3. The bundle sets `window.pxl = { version: '0.1.0' }` inside a function that returns without a browser (server-side rendering) or when `<pxl-stage>` is already defined (warns `[pxl] Kilopixel is already loaded …`, the first copy keeps working).
4. Typings: `tools/build_types.js` runs the bundle in a Node `vm` with a stubbed DOM, reads `observedAttributes` and `static defaults` of every element, and writes `kilopixel.d.ts` plus one file per framework (React, Preact, Solid, Vue, Svelte) to `dist/types/` and `docs/download/types/`. Types come from the default's type plus a table in the script (keywords, colors, arrays, `points`, `text`, nullable numbers); an attribute with a `null` default the table doesn't cover stops the build. Every value also accepts `PxlExpression` (`string & {}`, keeps keyword suggestions). `node tools/run_tests.js --types` checks them against the real framework types (`tests/types/`).
5. Terser through `npx` (`--compress passes=2 --mangle --keep-classnames`, so classes keep their names); outputs `dist/kilopixel-v0.1.0(.min).js`, `dist/pxl(.min).js`, copies in `docs/js/` and `docs/download/`, the starter-kit zip from `docs/download/index.html`; reports the sizes. No `node_modules` in the project (CLAUDE.md "Build").

## 12. Adding an Attribute

1. `static defaults` of the class, grouped like the tables in `.agents/KILOPIXEL.md`. Every attribute starts there (no defensive fallbacks), and every key is observed: `PxlNode`'s `observedAttributes` getter returns the keys plus `id`, `Shape` and `Group` add the `pxl-on-*` handlers, Polyline adds `points` (stored as `p0`, `p1`, …, so it has no default). Keys are lowercase (HTML lowercases attribute names). Runtime state that isn't an attribute (`isHovered`, `isPressed`) is set in the constructor instead.
2. Use it from `values` in `draw()` (and `getBoundingBox()` / `hitPadding()` / `drawsMoreThanOnce()` if it changes them). A `false` / `true` default makes a presence attribute (`pxl.resolveEmptyAttribute()`: bare = `true`); a transform key goes into `pxl.isSpatialKey`.
3. `tools/build_types.js`: a table entry if the default doesn't tell the type (keywords, colors, arrays, `null`).
4. Tests: default, empty value, removed value, main effect (Rule A, `tests/unit.html` and `tests/index.html`).
5. `.agents/KILOPIXEL.md` table, the docs page and its API table, `node build.js`, sizes (CLAUDE.md "File size after a build").
