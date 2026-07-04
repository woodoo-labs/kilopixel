# Kilopixel — Complete Framework Reference

> **Purpose of this document:** A comprehensive, source-verified technical reference for the Kilopixel declarative canvas framework. Written so that an AI assistant can understand the full architecture, every element, every attribute, every function, and every performance pattern — without needing to read the source code.

---

## 1. What Kilopixel Is

Kilopixel is a **declarative, reactive animation engine for HTML5 Canvas** built with Web Components. Instead of writing imperative `ctx.beginPath()` / `ctx.fill()` / `requestAnimationFrame` code, users describe canvas scenes in HTML — and the framework compiles, evaluates, and renders everything at 60fps automatically.

**Zero build step.** Just `<script src="pxl.min.js">` and start writing HTML. No imports, no initialization, no config files.

```html
<script src="pxl.min.js"></script>
<pxl-stage id="main" ratio="16/9">
  <pxl-layer>
    <pxl-circle x="500" y="500" r="100" fill="hsl(wave(3) * 360, 80, 60)" />
  </pxl-layer>
</pxl-stage>
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  window.pxl  (null-prototype global object)                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ engine.js│  │compiler.js│  │graphics.js│  │monitor.js │  │
│  │ Pub-Sub  │  │ Expression│  │ Transform │  │  FPS &    │  │
│  │ Registry │  │ Compiler  │  │ Pipeline  │  │  Perf     │  │
│  │ Bindings │  │ Scope/Fns │  │ Anchors   │  │  Metrics  │  │
│  └──────────┘  └───────────┘  └──────────┘  └───────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Elements                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ <pxl-stage>    Root container, rAF loop, hit testing    ││
│  │   <pxl-layer>  Own canvas, compositing unit             ││
│  │     <pxl-group>  Nestable transforms, shares ctx        ││
│  │       <pxl-circle|rect|ellipse|line|polyline|text|grid> ││
│  │     <pxl-var>    Reactive variable (no visual output)   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Source File Map

| File | Size | Role |
|------|------|------|
| `js/engine.js` | ~10 KB | Global `pxl` object, pub-sub, attribute compilation bridge, hit-test infrastructure |
| `js/compiler.js` | ~10 KB | Expression classifier, compilation pipeline, built-in scope (time drivers, colors, math) |
| `js/graphics.js` | ~2.7 KB | Transform pipeline (`applyContextState`), anchor maps, polyline point parser |
| `js/monitor.js` | ~2 KB | Self-terminating FPS/render-time monitor |
| `js/elements/stage.js` | ~9 KB | Root element, canvas management, resize, pointer events, render loop, hit testing |
| `js/elements/layer.js` | ~5.5 KB | Compositing layer with own canvas |
| `js/elements/group.js` | ~4.2 KB | Nestable transform container |
| `js/elements/shape.js` | ~11 KB | Base shape class (28 attributes, gradient system, style resolution, arrow drawing) |
| `js/elements/variable.js` | ~2.5 KB | `<pxl-var>` reactive variable element |
| `js/elements/shapes/circle.js` | ~4 KB | Arcs, pie slices, donuts, arrowheads |
| `js/elements/shapes/ellipse.js` | ~4.4 KB | Elliptical arcs, donuts, arrowheads |
| `js/elements/shapes/rect.js` | ~2 KB | Per-corner radii, anchor system |
| `js/elements/shapes/line.js` | ~2.9 KB | Arrowheads, line shortening |
| `js/elements/shapes/polyline.js` | ~7.4 KB | Per-coordinate animation, Catmull-Rom smoothing, relative mode |
| `js/elements/shapes/text.js` | ~7.6 KB | 3-tier caching, word-wrap, reveal/typewriter effect |
| `js/elements/shapes/grid.js` | ~3.7 KB | Coordinate grid with auto-sizing and number labels |

### Build System

`node build.js` concatenates all files (in dependency order) into an IIFE, minifies with Terser, and outputs to `dist/pxl.min.js` (~46 KB minified). No module system — pure concatenation with IIFE isolation.

---

## 3. Core Data Structures

### `window.pxl` — The Global Object

```js
window.pxl = Object.create(null);  // null-prototype, no inherited properties
```

| Property | Type | Purpose |
|----------|------|---------|
| `pxl.nodes` | `Object (id → attributeValues)` | Flat ID→values registry. Any element with an `id` registers here. O(1) lookup. |
| `pxl.stages` | `Stage[]` | All active `<pxl-stage>` instances. |
| `pxl._subscriptions` | `Object (string → Element[])` | Pub-sub bus. Keys are `"ref.{id}"` strings. Values are arrays of subscriber DOM elements. |
| `pxl.hitTestRequestedIds` | `Set<string>` | Element IDs referenced via `ref.X.isHovered` or `ref.X.isPressed` in any expression. |
| `pxl.scope` | `Object` | Built-in function scope for compiled expressions (colors, math, utilities). |
| `pxl.drivers` | `Object` | Time driver functions (wave, glide, etc.). |
| `pxl.animationCache` | `Map<string, Function>` | Cache of compiled animation functions. |
| `pxl.staticCache` | `Map<string, any>` | Cache of compiled static values. |
| `pxl.dummyCtx` | `CanvasRenderingContext2D` | 1×1 off-screen context for hit testing with monkey-patched fill/stroke. |
| `pxl.perf` | `Object` | Performance monitor instance. |

### Per-Element Data Model

Every element (Stage, Layer, Group, Shape, Variable) has:

```js
this.attributeValues       // Object — current evaluated values (read by renderer)
this.attributeExpressions  // Object — raw compiled expressions (functions or static values)
this.animatedAttributeKeys // string[] — keys needing 60fps evaluation
this.reactiveAttributeKeys // string[] — keys needing on-change evaluation
```

`attributeValues` also has a **non-enumerable `.set(key, value)` method** that calls `this.setAttribute(key, value)` on the DOM element. This is the imperative API for mutations from event handlers:
```html
onclick="ref.counter.set('value', ref.counter.value + 1)"
```

---

## 4. The Compilation Pipeline

### Attribute Classification (3 Tiers)

Every HTML attribute value goes through the compiler and is classified into one of three tiers:

| Tier | When Evaluated | Storage | Example |
|------|---------------|---------|---------|
| **Static** | Once at parse time | Stored directly in `attributeValues` | `fill="red"`, `r="50"`, `x="500"` |
| **Reactive** | When a referenced variable changes | `reactiveAttributeKeys[]` + pub-sub | `fill="ref.btn.isHovered ? 'red' : 'blue'"` |
| **Animated** | Every frame (60fps) | `animatedAttributeKeys[]` | `x="wave(2) * 500"`, `rotate="t * 60"` |

### Fast Path Classification (cheapest first)

The compiler checks progressively — the cheapest check runs first:

| Priority | Check | Example | Cost |
|----------|-------|---------|------|
| 1 | Null/empty | `""` | Zero |
| 2 | Hex color (`#...`) | `#ff0000` | Zero — returned as string |
| 3 | Template literal (backtick) | `` `drop-shadow(${wave(2)}px)` `` | Always compiled |
| 4a | Pure alphabetical — special cases | `t` → compiled; `true`/`false` → boolean; `PI` → 3.14159... | Zero for non-`t` |
| 4b | Pure alphabetical — plain word | `red`, `center`, `bold` | Zero — returned as string |
| 5 | Static CSS color function | `rgb(255,0,0)`, `hsl(120,80%,50%)` | Zero — returned as string |
| 6 | Static CSS filter function | `drop-shadow(0 0 5px red)` | Zero — returned as string (warns if animation detected inside) |
| 7 | Quoted string | `'Hello World'` | Zero — quotes stripped |
| 8 | Pure number | `42`, `3.14`, `-7` | Zero — parsed to Number |
| 9 | Expression (has operators/parens/dots/`ref.`) | `wave(2) * 100` | Compiled to function |
| 10 | Block (contains `return`) | `if (t>1) { return 'red'; } ...` | Compiled to function |

### Expression Compilation (Factory Closure Pattern)

For animated/reactive expressions:

```js
// The compiler generates this ONCE at parse time:
const outerFn = new Function('scope', 'ref', `
  const { sin, cos, abs, PI, hsl, rgb, lerp, clamp, map, linear, radial, ... } = scope;
  let t;
  const loop = (d) => (t % d) / d;
  const wave = (d) => 0.5 - cos((t/d) * PI * 2) * 0.5;
  // ... all 8 time drivers
  return function(_t) { t = _t; return ${userExpression}; };
`);

// Called once:
const evaluator = outerFn(pxl.scope, pxl.nodes);

// Called every frame:
const value = evaluator(currentTimeInSeconds);
```

**Key properties set on compiled functions:**
- `fn.isTimeDependent` — boolean, true if expression uses `t` or any time driver
- `fn.variableDependencies` — string[], list of `"ref.{id}"` keys this expression subscribes to

### Automatic Behaviors During Compilation

1. **Optional chaining injection**: `ref.player.x` → `ref.player?.x` (prevents TypeError before elements connect)
2. **CSS percentage sanitization**: `100%` near commas → `'100%'` (wrapped in quotes)
3. **Smart return detection**: If expression has no `return`, wraps in `return (...);`. If it has `return`, used as-is (block mode).
4. **Interaction detection**: If expression references `isHovered`, `isPressed`, or any `on*` event — the element is automatically upgraded to interactive.
5. **`t` aliasing**: Time is passed as `_t` parameter, aliased to `t` inside the expression.

---

## 5. Built-In Expression Scope

### Time Drivers (8 functions)

All accept a **duration** parameter in seconds. All return values in **0–1** range by default.

| Driver | Waveform | Formula | Behavior |
|--------|----------|---------|----------|
| `loop(d)` | Sawtooth | `(t % d) / d` | 0→1, jumps back to 0 |
| `yoyo(d)` | Triangle | `1 - abs((t % (d*2)) / d - 1)` | 0→1→0 linear |
| `wave(d)` | Sine | `0.5 - cos((t/d) * π * 2) * 0.5` | 0→1→0 smooth |
| `bounce(d)` | Abs-sine | `abs(sin((t/d) * π))` | 0→1→0 bouncy |
| `strobe(d)` | Square | `(t % d < d * 0.5 ? 1 : 0)` | Binary on/off |
| `glide(d)` | Smoothstep | `l²(3−2l)` where `l=(t%d)/d` | 0→1 eased |
| `pulse(d)` | Sharp spike | `pow(sin((t/d) * π), 6)` | Brief spike |
| `glitch(d)` | Pseudo-random | `abs(sin(floor(t/d) * 437.58)) % 1` | Random steps |

### Color Functions (4)

| Function | Signature | Returns |
|----------|-----------|---------|
| `hsl(h, s, l)` | h: 0-360, s: 0-100, l: 0-100 | `"hsl(h,s%,l%)"` string |
| `hsla(h, s, l, a)` | + alpha 0-1 | `"hsla(h,s%,l%,a)"` string |
| `rgb(r, g, b)` | 0-255 each | `"rgb(r,g,b)"` string |
| `rgba(r, g, b, a)` | + alpha 0-1 | `"rgba(r,g,b,a)"` string |

These are **JavaScript functions** that return CSS color strings. Because they contain parentheses, they automatically bypass the Fast Path and are safely compiled. They NEVER need backticks.

### Gradient Functions (2)

Return lightweight **descriptor objects** (not `CanvasGradient` instances). The actual gradient is created at draw-time when the bounding box is known.

**`linear(direction, colorsArray)`**
- Angle mode: `linear(45, ['red', 'blue'])` — degrees, true CSS geometry
- Coords mode: `linear([0, 0, 1, 1], ['red', 'blue'])` — proportional to bounding box (0=top/left, 1=bottom/right)

**`radial(radiusOrConfig, colorsArray)`**
- Simple: `radial(1, ['red', 'blue'])` — radius `1` stretches to the edge, centered
- Config: `radial([0.3, 0.3, 0.8], ['red', 'blue'])` — explicit center (cx, cy) and radius

**Color stop formats:**
- Simple: `['red', 'blue']` — auto-distributed evenly
- Explicit offsets: `[0, 'red', 0.5, 'white', 1, 'blue']`

### Math Utilities (3)

| Function | Signature | Description |
|----------|-----------|-------------|
| `lerp(a, b, alpha)` | Three numbers | Linear interpolation: `a + (b - a) * alpha` |
| `clamp(val, min, max)` | Three numbers | Clamp to range |
| `map(val, inMin, inMax, outMin, outMax)` | Five numbers | Remap from one range to another |

### Raw Math (from `Math.*`)

All standard Math functions and constants are available directly (no `Math.` prefix needed):

`abs`, `acos`, `acosh`, `asin`, `asinh`, `atan`, `atan2`, `atanh`, `cbrt`, `ceil`, `clz32`, `cos`, `cosh`, `exp`, `expm1`, `floor`, `fround`, `hypot`, `imul`, `log`, `log10`, `log1p`, `log2`, `max`, `min`, `pow`, `random`, `round`, `sign`, `sin`, `sinh`, `sqrt`, `tan`, `tanh`, `trunc`, `PI`, `E`, `LN2`, `LN10`, `LOG2E`, `LOG10E`, `SQRT1_2`, `SQRT2`

### Time Variable

- **`t`** — Current time in **seconds** (not milliseconds). The framework converts `requestAnimationFrame`'s millisecond timestamp by dividing by 1000.
- `t * 60` = 60 degrees per second rotation
- `wave(2)` = 2-second sine cycle

---

## 6. The Reactive System

### Unified `ref.*` Namespace

The framework uses a **100% explicit, zero-DOM-traversal, flat ID namespace**. All legacy magic context (`v.*`, `s.*`, `sys.*`) has been eliminated.

**The Golden Rule:** If you want to reference something in math, give it an HTML `id`.

| Element | Registration | Access Pattern | Example |
|---------|-------------|----------------|---------|
| `<pxl-stage id="main">` | `pxl.nodes["main"] = stage.attributeValues` | `ref.main.mouseX` | `x="ref.main.mouseX"` |
| `<pxl-layer id="bg">` | `pxl.nodes["bg"] = layer.attributeValues` | `ref.bg.x` | `x="ref.bg.x + 100"` |
| `<pxl-group id="arm">` | `pxl.nodes["arm"] = group.attributeValues` | `ref.arm.rotate` | `rotate="ref.arm.rotate * 0.5"` |
| `<pxl-circle id="player">` | `pxl.nodes["player"] = circle.attributeValues` | `ref.player.x` | `x="ref.player.x"` |
| `<pxl-var id="speed">` | `pxl.nodes["speed"] = var.attributeValues` | `ref.speed.value` | `dx="ref.speed.value * t"` |

### Built-In Readable Properties

**Stage properties** (via `ref.{stageId}.*`):

| Property | Type | Description |
|----------|------|-------------|
| `mouseX` | number | Pointer X in logical coords (0–1000). Default: 500 |
| `mouseY` | number | Pointer Y in logical coords. Default: 500 |
| `isHovered` | boolean | Pointer is over the canvas |
| `width` | number | Always `1000` (fixed logical width) |
| `height` | number | Dynamic based on aspect ratio (e.g., 562.5 for 16:9) |
| `fps` | number | Frames per second (updated by monitor) |
| `renderAvg` | string | Average render time in ms (e.g., "0.42") |
| `renderMax` | string | Peak render time in ms (e.g., "1.20") |

**Layer properties** (via `ref.{layerId}.*`):

| Property | Type | Description |
|----------|------|-------------|
| All 14 observed attributes | various | x, y, dx, dy, rotate, scale, etc. |
| `fps` | number | Per-layer frames per second |

**Shape properties** (via `ref.{shapeId}.*`):

| Property | Type | Description |
|----------|------|-------------|
| All observed attributes | various | x, y, fill, stroke, r, etc. |
| `isHovered` | boolean | Pointer is over the shape |
| `isPressed` | boolean | Pointer is held down on the shape |

**Variable properties** (via `ref.{varId}.*`):

| Property | Type | Description |
|----------|------|-------------|
| `value` | any | The variable's current value |

### Pub-Sub Mechanism

```
Element changes → pxl.broadcast("ref.{id}")
  → iterates pxl._subscriptions["ref.{id}"] backwards
    → each subscriber's variableChangedCallback(key) is called
      → pxl.evaluateAttributesForVariable(element, varName)
        → re-evaluates only affected reactive attributes
        → if value changed: element.invalidate()
```

The `evaluateAttributesForVariable` function returns a **2-bit bitmask**:
- Bit 1: variable is still needed by at least one expression → stay subscribed
- Bit 2: at least one value actually changed → broadcast + invalidate
- If bit 1 is 0: auto-unsubscribe (lazy cleanup)

### Imperative Mutation via `.set()`

All elements expose a non-enumerable `.set(key, value)` method on their `attributeValues`:

```html
<pxl-var id="count" value="0" />
<pxl-circle onclick="ref.count.set('value', ref.count.value + 1)" />
```

This calls `setAttribute()` on the DOM element, triggering the full recompile → broadcast → invalidate cycle. This is the bridge between imperative events and reactive state.

---

## 7. The Transform Pipeline

Applied in **strict order** by `pxl.applyContextState()`:

```
1. Translate to pivot:     ctx.translate(x * u, y * u)
2. Rotate:                 ctx.rotate(rotate * π / 180)   // degrees → radians
3. Scale:                  ctx.scale(finalScaleX, finalScaleY)
4. Skew:                   ctx.transform(1, skewy, skewx, 1, 0, 0)
5. Offset (post-rotation): ctx.translate(dx * u, dy * u)
6. Alpha (multiplicative): ctx.globalAlpha *= alpha
7. Blend mode:             ctx.globalCompositeOperation = blend
8. Filter:                 ctx.filter = filter
```

### The `x/y` vs `dx/dy` Split

- **`x, y`** — Absolute position. Acts as the **pivot point** for rotation and scaling.
- **`dx, dy`** — Local offset applied **after** rotation and scaling. This allows an element to orbit its pivot without changing the center of rotation.

```html
<!-- Planet orbiting: pivot at center, offset by 200 units, rotating 60°/sec -->
<pxl-circle x="500" y="500" dx="200" rotate="t * 60" r="20" fill="red" />
```

### Alpha Compounding

Alpha is **multiplicative** through the hierarchy: `ctx.globalAlpha *= alpha`. A shape with `alpha="0.5"` inside a group with `alpha="0.5"` renders at 25% opacity.

### The Responsive Unit `u`

All spatial values are multiplied by `u` before being passed to the canvas context:

```
u = stage.clientWidth / 1000
```

This maps a fixed **logical width of 1000** to any physical canvas size. `x="500"` is always the horizontal center. The height is dynamic based on the aspect ratio and is accessible via `ref.{stageId}.height`.

**Why raw numbers are preferred over expressions:** `x="500"` hits the Fast Path (zero evaluation cost), while `x="ref.main.width / 2"` requires compilation, proxy lookups, and per-frame evaluation to produce the same result.

---

## 8. Element Reference

### `<pxl-stage>` — Root Container

| Attribute | Default | Description |
|-----------|---------|-------------|
| `ratio` | `16 / 9` | Sets CSS `aspect-ratio`. Parsed as expression. |
| `id` | — | Required if any element needs to reference stage properties |

**What it does:**
- Creates a `<canvas>` in its own Shadow DOM
- Uses `ResizeObserver` with `device-pixel-content-box` for DPI-aware sizing
- Calculates `unit = clientWidth / 1000` and `dpr = devicePixelRatio`
- Manages all pointer events → publishes `mouseX/mouseY` in logical coordinates
- Runs the `requestAnimationFrame` render loop
- Owns all hit testing via `processHitTesting()`
- Supports multiple independent stages per page
- **Self-terminating rAF loop**: Stops when no layers are animated; restarts on any `invalidate()`

**Pointer event handling** uses the `EventTarget.handleEvent` interface pattern (not individual bound functions).

**First paint on resize is synchronous** — `resize()` calls `render()` directly, not via rAF.

---

### `<pxl-layer>` — Compositing Layer

Each layer owns its own `<canvas>` element, absolutely positioned inside the stage's shadow root.

| Attribute | Default | Description |
|-----------|---------|-------------|
| `x` | 0 | Pivot X position |
| `y` | 0 | Pivot Y position |
| `dx` | 0 | Post-rotation X offset |
| `dy` | 0 | Post-rotation Y offset |
| `rotate` | 0 | Rotation in degrees |
| `scale` | 1 | Uniform scale |
| `scalex` | 1 | X-axis scale (overrides `scale`) |
| `scaley` | 1 | Y-axis scale (overrides `scale`) |
| `skewx` | 0 | X-axis skew |
| `skewy` | 0 | Y-axis skew |
| `alpha` | 1 | Opacity (0–1, multiplicative) |
| `blend` | `source-over` | CSS `globalCompositeOperation` |
| `filter` | `none` | CSS filter string |
| `hidden` | false | Hide layer |

**Key behaviors:**
- Per-layer clearing (only dirty layers redraw)
- `hidden` optimization: if hidden AND canvas already cleared → skip even the `requestRender()` call
- Per-layer FPS tracking (independently counted)
- `isDirty` flag drives selective rendering

---

### `<pxl-group>` — Nestable Transform Container

Same 14 attributes as Layer. Does NOT own a canvas — draws into parent's context. Groups can nest infinitely.

```html
<pxl-group x="500" y="500" rotate="t * 30">
  <pxl-group dx="200" rotate="t * -60">
    <pxl-circle r="20" fill="red" />
  </pxl-group>
</pxl-group>
```

---

### `<pxl-var>` — Reactive Variable

| Attribute | Default | Description |
|-----------|---------|-------------|
| `value` | 0 | The variable's value (supports expressions) |

**Key behaviors:**
- Invisible (`display: none`)
- **Participates in the render tree**: Registers as a child of its parent container, gets `render()` called every frame. This is how animated variables (e.g., `value="t * 10"`) get their expressions evaluated at 60fps.
- Broadcasts `ref.{id}` when value changes
- Mutation via: `ref.myVar.set('value', 42)` from event handlers

---

### Shape Elements — Base Class (28 Observed Attributes)

All shapes inherit from `Shape` which provides:

**Transform attributes** (same as Layer/Group): `x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `alpha`, `blend`, `filter`, `hidden`

**Style attributes:**

| Attribute | Default | Description |
|-----------|---------|-------------|
| `fill` | null | Fill color, CSS color string, or gradient descriptor |
| `stroke` | null | Stroke color or gradient descriptor |
| `strokewidth` | 1 | Stroke width (scaled by `u`) |
| `linecap` | `butt` | `butt`, `round`, `square` |
| `linejoin` | `miter` | `miter`, `round`, `bevel` |
| `miterlimit` | 10 | Miter limit for joins |
| `linedash` | null | Dash pattern array, e.g., `[10, 5]` |
| `dashoffset` | 0 | Dash offset (scaled by `u`) |

**Event handler attributes:** `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove`

**Built-in reactive states:** `isHovered` (boolean), `isPressed` (boolean)

---

### `<pxl-circle>` — Circle / Arc / Pie / Donut

Adds 10 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `r` | 0 | Radius |
| `ir` | 0 | Inner radius (for donut/ring shapes) |
| `start` | 0 | Arc start angle in **degrees** |
| `end` | null | Arc end angle in **degrees** |
| `sweep` | null | Arc sweep angle in degrees (overrides `end` if set) |
| `pie` | false | Draw as pie slice (lines from arc endpoints to center) |
| `anticlockwise` | false | Draw arc counterclockwise |
| `arrowstart` | 0 | Arrow size at arc start (`'auto'` = `strokewidth * 3.6`) |
| `arrowend` | 0 | Arrow size at arc end |
| `arrowstyle` | `filled` | `'filled'` (closed triangle) or `'line'` (open V) |

**Draw behavior:**
- Full circle if no `start`/`end`/`sweep`
- Arc path if partial angle specified
- Donut if `ir > 0` (draws inner arc in reverse)
- Pie slice if `pie=true` (lines from center to arc endpoints)
- For filled arrows: shortens the drawn arc so the arrowhead fills the gap cleanly

---

### `<pxl-ellipse>` — Elliptical Arc / Pie / Donut

Adds 12 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `rx` | 0 | X-axis radius |
| `ry` | 0 | Y-axis radius |
| `irx` | 0 | Inner X-axis radius (elliptical donut) |
| `iry` | 0 | Inner Y-axis radius (elliptical donut) |
| `start` | 0 | Arc start angle in degrees |
| `end` | null | Arc end angle in degrees |
| `sweep` | null | Arc sweep angle in degrees |
| `pie` | false | Pie slice mode |
| `anticlockwise` | false | Counterclockwise drawing |
| `arrowstart` | 0 | Arrow at start |
| `arrowend` | 0 | Arrow at end |
| `arrowstyle` | `filled` | Arrow style |

**How it differs from Circle:** Uses `ctx.ellipse()` with independent rx/ry. Arrow tangent calculation uses ellipse parametric derivative (handles non-uniform speed along the ellipse).

---

### `<pxl-rect>` — Rectangle

Adds 8 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `w` | 0 | Width |
| `h` | 0 | Height |
| `r` | null | Uniform corner radius |
| `r1` | null | Top-left corner radius (overrides `r`) |
| `r2` | null | Top-right corner radius |
| `r3` | null | Bottom-right corner radius |
| `r4` | null | Bottom-left corner radius |
| `anchor` | `center` | Alignment anchor |

**Anchor system** — 9 named positions:

```
top-left     top      top-right
left        center    right
bottom-left  bottom   bottom-right
```

The anchor determines which point of the rect sits at the `(x, y)` position. Default is `center`.

**Per-corner radii** follow CSS `roundRect` order: r1=top-left, r2=top-right, r3=bottom-right, r4=bottom-left. Uses a pre-allocated `_radii = [0,0,0,0]` array (zero-GC).

---

### `<pxl-line>` — Line Segment

Adds 7 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `x1` | 0 | Start X |
| `y1` | 0 | Start Y |
| `x2` | 0 | End X |
| `y2` | 0 | End Y |
| `arrowstart` | 0 | Arrow at start |
| `arrowend` | 0 | Arrow at end |
| `arrowstyle` | `filled` | Arrow style |

**Special behaviors:**
- For `linecap='square'`: adds half-strokewidth offset to arrow tip position
- For filled arrows: shortens the line by `arrowSize * 0.75` to prevent stroke bleed-through

---

### `<pxl-polyline>` — Multi-Point Path

Adds 7 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `points` | — | Space/comma/semicolon-separated coordinates. Each value can be an independent expression. |
| `closed` | false | Close the path |
| `smooth` | false | Enable Catmull-Rom spline smoothing. `true` = tension 1.0; a number = custom tension. |
| `mode` | `absolute` | `'absolute'` or `'relative'` (each coordinate pair relative to previous) |
| `arrowstart` | 0 | Arrow at first point |
| `arrowend` | 0 | Arrow at last point |
| `arrowstyle` | `filled` | Arrow style |

**Per-coordinate animation:** When the `points` attribute is parsed, each coordinate value is compiled as a **separate expression** with synthetic keys (`p0`, `p1`, `p2`, ...). This means individual coordinates can animate independently:

```html
<pxl-polyline points="0,0; wave(1)*500,100; 500,wave(2)*200" />
```

Coordinates are stored in a `Float32Array` (flat cache, zero-GC). Only animated coordinates are re-evaluated each frame.

**Point format:** Comma `,` separates X from Y; semicolons `;` separate point pairs; spaces work as delimiters too. Parentheses are depth-tracked so `min(a, b)` inside coordinates won't break parsing.

**Catmull-Rom smoothing:** Uses cubic Bézier curves computed from 4-point sliding windows. Tension controls curve tightness (higher = tighter). Closed shapes wrap indices with modulo; open shapes clamp to endpoints.

---

### `<pxl-text>` — Text Renderer

Adds 13 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `text` | `''` | Text content. Supports `\n` for line breaks. Strings must be quoted in expressions: `text="'Hello'"` |
| `size` | 16 | Font size (scaled by `u`) |
| `font` | `sans-serif` | Font family |
| `align` | `start` | `start`, `center`, `end`, `left`, `right` |
| `baseline` | `alphabetic` | `alphabetic`, `top`, `middle`, `bottom`, `ideographic` |
| `weight` | `normal` | Font weight (`bold`, `100`-`900`) |
| `fontstyle` | `normal` | Font style (`italic`, `oblique`) — named `fontstyle` to avoid HTML `style` conflict |
| `maxwidth` | 0 | Maximum render width (compresses text if exceeded, via Canvas API) |
| `width` | 0 | **Triggers auto word-wrap** at this logical width. Different from `maxwidth`! |
| `lineheight` | 1.2 | Line height multiplier for wrapped text |
| `letterspacing` | 0 | Letter spacing. When > 0, switches to per-character rendering. |
| `reveal` | null | Typewriter reveal (0.0–1.0). `reveal="glide(2, 0, 1)"` = 2-second typewriter |
| `direction` | null | Text direction for RTL support |

**3-Tier caching system:**
1. **Font State Cache** — Rebuilds font string only when size/family/weight/style change
2. **Text Layout Cache** — Auto word-wrap, caches line breaks. Dirty when text or width change.
3. **Bounding Box Cache** — Uses `ctx.measureText()` for pixel-accurate metrics

**`width` vs `maxwidth`:** `width` triggers auto word-wrapping (text is split into multiple lines). `maxwidth` compresses a single line of text to fit within the specified width (via Canvas API's `maxWidth` parameter).

---

### `<pxl-grid>` — Coordinate Grid

Adds 5 attributes to the base 28:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `spacing` | 20 | Grid line spacing (clamped to ≥ 1 to prevent infinite loops) |
| `bounds` | null | Grid extent. If null, auto-sizes to fill viewport diagonal. |
| `numbers` | true | Show coordinate labels at intersections |
| `size` | 12 | Label font size |
| `font` | `monospace` | Label font family |

**Unique behaviors:**
- **Overrides default styling**: `stroke: 'rgba(255,255,255,0.1)'`, `fill: 'rgba(255,255,255,0.5)'` — the only shape that has non-null defaults for stroke/fill
- **Auto-bounds**: If `bounds` is null, calculates diagonal: `ceil(sqrt(1000² + height²))`. Ensures full coverage even when the grid is rotated.
- **Label anti-overlap**: If spacing < 40, steps up to prevent labels overlapping
- **String cache** (`_textCache`): Caches `toString()` results for coordinate labels (zero-GC)
- Grid is symmetric around origin (0,0), draws in all 4 quadrants
- Uses a fill-suppression hack: temporarily sets `fill = null` before `applyStyle()` so only stroke is applied to grid lines, then restores fill for labels

---

## 9. The Interaction System

### Dual Architecture: States vs Events

**Declarative States** (used in expressions for styling):
- `isHovered` — true while pointer is over the shape
- `isPressed` — true while pointer is held down on the shape
- Used directly in math: `fill="ref.btn.isHovered ? 'red' : 'blue'"`

**Imperative Events** (executed once per event, as JS blocks):
- `onenter` — pointer enters shape bounds
- `onleave` — pointer leaves shape bounds
- `ondown` — pointer button pressed on shape
- `onup` — pointer button released on shape (fires on element under cursor, not the originally pressed element)
- `onclick` — pointer click (down + up on same shape)
- `onmove` — pointer moves while over shape
- Used for logic: `onclick="ref.score.set('value', ref.score.value + 1)"`

### Automatic Interactive Registration

You do NOT need `interactive="true"`. The compiler scans attribute values for `isHovered`, `isPressed`, or `on*` patterns. If found, the shape is automatically registered as interactive.

Additionally, if Element A references `ref.B.isHovered` in an expression, Element B is retroactively upgraded to interactive (via `pxl.hitTestRequestedIds`).

### Hit Testing Pipeline (in `stage.processHitTesting()`)

1. Runs at the END of every render frame
2. Only runs if stage `isHovered` (pointer is over the canvas)
3. Uses a **1×1 dummy canvas** with monkey-patched `fill()` and `stroke()` that call `isPointInPath()` / `isPointInStroke()`
4. Iterates `_interactiveElements` **back-to-front** (DOM order = z-order, last = top)
5. For each element, walks up the parent chain collecting all transforms into a pre-allocated `_hitStack[50]`
6. If any ancestor has `hidden: true`, the element is skipped
7. Applies the full transform chain top-down onto the dummy context
8. Calls `element.draw(dummyCtx, unit, 0)` — the shape's draw method naturally calls fill/stroke, which are intercepted
9. **First hit wins** — breaks immediately

**Press semantics:** `isPressed` is cleared on the **originally pressed** element when pointer is released, even if the cursor has moved off. `onup` fires on whatever element is currently under the cursor.

### Event Handler Compilation

Event handlers are compiled differently from expressions — they are **imperative blocks**, not per-frame evaluators:

```js
new Function('scope', 'ref', `
  const { sin, cos, lerp, clamp, ... } = scope;
  ${handlerBody}
`).bind(shapeElement)(pxl.scope, pxl.nodes);
```

Inside event handlers, `this` refers to the shape DOM element. They have access to the full scope including `ref.*`.

---

## 10. The Render Loop

### Per-Frame Data Flow

```
stage.requestRender()
  → if not already pending AND not awaiting first resize:
    → pxl.perf.wakeUp()
    → requestAnimationFrame(stage.frameCallback)

stage.render(t)  [t in seconds]
  → performance.now() start
  → if _isMouseDirty: broadcast ref.{stageId}, clear flag
  → if isOrderDirty: sort layers by DOM position
  → for each layer where layer.isDirty === true:
  │   → layer.render(t, u)
  │     → sort children if dirty
  │     → evaluate animatedAttributeKeys → attributeValues
  │     → broadcast if subscribers exist
  │     → ctx.clearRect()
  │     → if hidden: mark canvas empty, return
  │     → ctx.save() + applyContextState()
  │     → for each child (group/shape/variable):
  │     │   → child.render(ctx, u, t)
  │     │     → evaluate animated attributes
  │     │     → broadcast if changed
  │     │     → if group: recurse into children
  │     │     → if shape: applyContextState → draw → applyStyle
  │     │     → if variable: evaluate, broadcast if changed
  │     │     → if animated: invalidate parent (heartbeat)
  │     └─ ctx.restore()
  │     → if layer.isAnimated: layer.invalidate() (heartbeat)
  └─ stage.processHitTesting()
  → accumulate render timing
  → isUpdatePending = false
```

### Sleep/Wake Mechanism

The rAF loop is **self-terminating**:
- After each render, if no layer's `isDirty` flag is set and nothing calls `invalidate()`, no new `requestAnimationFrame` is scheduled
- The loop restarts when ANY element calls `invalidate()` → parent layer → stage → `requestRender()` → rAF
- This guarantees **0% CPU** when the scene is fully static (no animations, no mouse movement)

### Dirty Flag Cascade

```
shape.invalidate()
  → parentLayer.invalidate()
    → layer.isDirty = true
    → if hidden AND canvas empty: no-op (skip)
    → else: stage.requestRender()
      → requestAnimationFrame
```

---

## 11. The Gradient Cache System

Shapes maintain a 5-field gradient cache to avoid re-creating `CanvasGradient` objects:

```js
this._cachedGradient      // The CanvasGradient object
this._lastGradientConfig  // Reference to the gradient descriptor
this._lastGradientU       // The `u` value when gradient was created
this._lastBoxWidth        // Bounding box dimensions when created
this._lastBoxHeight
this._lastBoxLeft
this._lastBoxTop
```

**Cache validation:** Checks **reference identity** (`===`) of the descriptor AND all bounding box dimensions + `u`. This means:
- Static gradients with static shapes: cached perfectly, zero cost per frame
- Static gradients with animated shapes: cache busts when bounds change (correct stretching)
- Animated gradients: always miss (new descriptor object each frame — by design)

---

## 12. Arrow System (Shared)

All shapes with arrows (`circle`, `ellipse`, `line`, `polyline`) use the base Shape's `drawArrow()`:

- Arrow size: specified value or `'auto'` (= `strokewidth * 3.6`)
- Wing angle: 30° (π/6)
- Two styles:
  - `'filled'` — closed triangle, filled with strokeStyle
  - `'line'` — open V stroked
- For filled arrows on arcs/lines: the drawn path is **shortened** by `arrowSize * 0.75` so the arrow fills the gap cleanly (prevents stroke bleed-through)

---

## 13. Zero-GC Performance Patterns

1. **Swap-and-pop array removal** (`removeFromArray`) — avoids `splice()` allocations
2. **Pre-allocated `boundingBox`** on every shape — mutated in place, never recreated
3. **Pre-allocated `_scaledDash[]`** — length adjusted, reused
4. **Pre-allocated `_emptyDash[]`** — empty array constant for `setLineDash()`
5. **Pre-allocated `_hitStack[50]`** on Stage — fixed-size, index-accessed
6. **Gradient cache** — reference equality + dimension check, avoids CanvasGradient creation
7. **Text 3-tier cache** — font string, layout lines, bounding box — dirty-flagged
8. **Grid string cache** (`_textCache`) — caches `toString()` for coordinate labels
9. **Polyline `Float32Array`** — typed array for point data, no object boxing
10. **Rect `_radii[4]`** — pre-allocated, mutated in place
11. **Factory closure pattern** — outer function called once, inner function captures scope via `let` (no per-frame allocation)
12. **`Object.create(null)`** for all lookup objects — no prototype chain overhead
13. **Backwards iteration in `broadcast()`** — supports safe in-place unsubscribing
14. **Bitmask return from `evaluateAttributesForVariable()`** — single integer instead of object/tuple
15. **Self-terminating performance monitor** — stops scheduling when `totalFrames === 0`
16. **No `performance.now()` inside render loops** — only on Stage frame boundaries (V8 `HeapNumber` avoidance)

---

## 14. Expression Syntax Reference

### Simple Expressions (auto-wrapped in `return`)
```html
x="500"                                    <!-- Static number -->
fill="red"                                 <!-- Static string -->
fill="#ff0000"                             <!-- Hex color -->
x="wave(2) * 500"                          <!-- Animated -->
fill="ref.btn.isHovered ? 'red' : 'blue'"  <!-- Reactive -->
r="lerp(20, 100, wave(3))"                 <!-- Nested functions -->
fill="hsl(t * 60, 80, 60)"                <!-- Color function -->
fill="linear(45, ['red', 'blue'])"         <!-- Gradient -->
```

### Block Mode (contains `return`)
```html
fill="if (t % 2 < 1) { return 'red'; } else { return 'blue'; }"
```

### Strings Inside Expressions
Strings must be quoted:
```html
text="'Hello World'"                       <!-- Static text -->
text="ref.btn.isHovered ? 'Hover!' : 'Click me'"  <!-- Conditional -->
```

### Template Literals (for animated filters)
```html
filter="`drop-shadow(0 0 ${wave(2)*15}px red)`"
```
Backticks force compilation, bypassing the static CSS filter Fast Path.

### Event Handlers (imperative blocks)
```html
onclick="ref.counter.set('value', ref.counter.value + 1)"
onenter="ref.label.set('text', 'Hovering!')"
```

---

## 15. Coordinate System Summary

```
Logical Space: 0 → 1000 (horizontal, fixed)
                0 → height (vertical, dynamic per aspect ratio)

Center:         x="500", y="{ref.main.height / 2}" or raw value
Unit Scale:     u = clientWidth / 1000

All spatial values (x, y, dx, dy, r, w, h, strokewidth, etc.)
are multiplied by `u` before being passed to the canvas context.
```

**DPI Handling:** Canvas physical pixels = logical pixels × `devicePixelRatio`. Applied via `ctx.scale(dpr, dpr)` on each layer.

---

## 16. Quick Reference — All Element Attributes

### Transform Attributes (Layer, Group, Shape)
`x`, `y`, `dx`, `dy`, `rotate`, `scale`, `scalex`, `scaley`, `skewx`, `skewy`, `alpha`, `blend`, `filter`, `hidden`

### Style Attributes (Shape only)
`fill`, `stroke`, `strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`

### Event Attributes (Shape only)
`onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove`

### Per-Shape Specific Attributes

| Element | Specific Attributes |
|---------|-------------------|
| `pxl-circle` | `r`, `ir`, `start`, `end`, `sweep`, `pie`, `anticlockwise`, `arrowstart`, `arrowend`, `arrowstyle` |
| `pxl-ellipse` | `rx`, `ry`, `irx`, `iry`, `start`, `end`, `sweep`, `pie`, `anticlockwise`, `arrowstart`, `arrowend`, `arrowstyle` |
| `pxl-rect` | `w`, `h`, `r`, `r1`, `r2`, `r3`, `r4`, `anchor` |
| `pxl-line` | `x1`, `y1`, `x2`, `y2`, `arrowstart`, `arrowend`, `arrowstyle` |
| `pxl-polyline` | `points`, `closed`, `smooth`, `mode`, `arrowstart`, `arrowend`, `arrowstyle` |
| `pxl-text` | `text`, `size`, `font`, `align`, `baseline`, `weight`, `fontstyle`, `maxwidth`, `width`, `lineheight`, `letterspacing`, `reveal`, `direction` |
| `pxl-grid` | `spacing`, `bounds`, `numbers`, `size`, `font` |
| `pxl-var` | `value` |
| `pxl-stage` | `ratio` |
