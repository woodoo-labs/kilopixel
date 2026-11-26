# Kilopixel — Language Reference

> **Version**: 0.1.0 | **Status**: Pre-release (API may change, no backwards compatibility) | **Total Source**: ~70KB minified | **Zero Dependencies** | **Zero Build Step for Users**

How to write Kilopixel: elements, attributes, expressions, interaction. Each fact is stated once; sections link each other. How the engine does it (source files, frame, reactivity, hit testing, drawing): `.agents/ENGINE.md`. Docs pages also follow `docs/DOCS_STANDARDS.md`.

Kilopixel is a declarative, reactive animation engine for HTML5 Canvas built on Web Components. A page describes a scene with custom elements; attribute values are expressions that may depend on time (`t`) and on other elements (`ref.*`).

```html
<script src="pxl.min.js"></script>  <!-- in <head>: elements upgrade while the page is parsed -->
<pxl-stage id="main" ratio="16 / 9">
  <pxl-layer>
    <pxl-circle x="500" y="300" r="50" fill="red" rotate="t * 90"></pxl-circle>
  </pxl-layer>
</pxl-stage>
```

---

## 1. Scene Structure

| Element | Role |
|---|---|
| `<pxl-stage>` | the root: a box on the page, the unit system, the frame loop |
| `<pxl-layer>` | its own `<canvas>`; composited with CSS (`alpha`, `blend`, `filter`) |
| `<pxl-group>` | transforms its children together; nestable; draws into its layer |
| shapes | `<pxl-circle>`, `<pxl-ellipse>`, `<pxl-rect>`, `<pxl-line>`, `<pxl-polyline>`, `<pxl-text>`, `<pxl-grid>` |
| `<pxl-var>` | a value others read (`ref.<id>.value`); draws nothing |

- Shapes go inside a layer (directly or in groups), layers inside a stage. A shape outside every layer isn't drawn. Stages don't nest; a page may have several.
- A layer draws its children in DOM order, back to front; layers stack in DOM order.
- Always write closing tags: `<pxl-circle></pxl-circle>`. Custom elements aren't void elements; `<pxl-circle />` nests the following elements inside it.
- Shapes, groups and variables are `display: none` (default styles in a cascade layer, so any page CSS wins): their content, such as `<pxl-text>{label}</pxl-text>` in JSX, would otherwise show as page text. Content placed directly in a layer (accessible text, buttons) is shown through the layer's `<slot>`.
- The script is a classic `<script>`, not a module: it works without a build step and from `file://`. Only `pxl` is global; type `pxl` in the console to browse the engine.
- **Content Security Policy:** expressions and handlers are compiled with `new Function`; a CSP without `'unsafe-eval'` can't run Kilopixel.

## 2. Units and Coordinates

- **Logical width 1000** on every stage. The unit `u = clientWidth / 1000`; lengths (`x`, `y`, `dx`, `dy`, radii, `w`, `h`, `strokewidth`, `dashoffset`, `linedash`, shadow and filter sizes, `size`, …) are multiplied by `u` when drawing. Height: `1000 / ratio` (`ref.<stage>.height`). `x="500"` is always the horizontal center, at any stage size.
- Write fixed positions as numbers (`x="500"`), not `x="ref.main.width / 2"`: a number is parsed once; the expression subscribes to the stage.
- Each layer canvas has `devicePixelRatio` pixels per CSS pixel.
- **Center and offset**, the same for layers, groups and shapes: `x`, `y` is the center, the point that rotation, scaling and skew turn around. `dx`, `dy` is an offset applied after them: it moves the drawing, not the center. So a rotating element with an offset orbits its center:

```html
<!-- Orbit around (500, 300), radius 200, 60° per second: one element, no group, no trigonometry -->
<pxl-circle x="500" y="300" dx="200" rotate="t * 60" r="20" fill="red"></pxl-circle>
```

- **Transform order** (each step skipped at its default): translate `x`, `y` → `rotate` (degrees) → scale `zoom * scalex`, `zoom * scaley` → skew (`skewx`, `skewy`, degrees, as `transform(1, tan(skewy), tan(skewx), 1)`) → translate `dx`, `dy`. Then a shape draws around `(0, 0)`.
- **`zoom` multiplies** `scalex` / `scaley` (the two arguments of the canvas `scale()`; two attributes, because splitting one `scale="x, y"` expression at commas isn't safe): `zoom="2" scalex="1.5"` draws at 3 / 2, so an animated `zoom` (pulse, hover) combines with a stretched shape. `zoom="-1"` turns by 180°.
- **Transform attributes** (layers, groups, shapes), "the ten" below: `x`, `y`, `dx`, `dy` (`0`), `rotate` (`0`), `zoom`, `scalex`, `scaley` (`1`), `skewx`, `skewy` (`0`).
- `ref.<id>.tx` / `ty`: the element's drawn origin in its parent space, `x` / `y` plus the offset turned by its own rotate, scale and skew (equal to `x + dx` only without those). For readers in another space: `toLocal()`, §9.

## 3. Values and Expressions

### 3.1 How an Attribute Value Is Read

In this order; most values never reach the compiler:

1. `#ff0000`, `#fff`: a hex color, kept as text.
2. `` `…` ``: a template literal, always compiled.
3. Words (letters and spaces only): text (`red`, `none`, `Hello World`), except `t` (time), `true` / `false` (booleans) and Math constant names (`PI`: the number). Static CSS colors are text too, never compiled: `rgb()` / `rgba()` with numbers only, `hsl()` / `hsla()` with `%` on saturation and lightness (also the space syntax), and `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()` without nested parentheses. Kilopixel's own `hsl(200, 50, 40)` (no `%`) is compiled. (Compiling a color costs about 90 µs and a cache slot, which a color changed in every frame would pay each time.)
4. One quoted string (`'Hello World'`): the text between the quotes. Escapes aren't read (`'It\'s'` stays raw: write `It's` without quotes, or backticks); a written `\n` reaches a text shape, which breaks the line there.
5. A number (`100`, `-50`, `0.25`, `.5`).
6. Anything that looks like code: `t`, `ref.`, `toLocal(`, parentheses, brackets, operators next to numbers, `+` next to a quote. Compiled.
7. Anything else: text.

Text with digits next to operators, parentheses or brackets looks like code (`text="Level 2-3"`): quote it (`text="'Level 2-3'"`). Words inside quoted strings are never code: `'Press return: ' + ref.score.value` keeps its `return`, a lone `t` or `ref.a.b` inside quotes adds no dependency.

### 3.2 Expressions

- **JavaScript expressions** evaluated with the scope below. Without the word `return` an expression is returned as it is (`t > 10 ? 'red' : 'blue'`); with it, it is a code block (`if (t < 10) { return 'red'; } return 'blue';`).
- **CSS percentages** inside code are allowed: `hsl(120, 50%, 40%)` works as an expression.
- **Static** (no `t`, no `ref`): evaluated once. **Animated** (uses `t` or a time driver): every frame. **Reactive** (reads `ref.*`, no `t`): when a referenced element changes. A string that doesn't compile warns and is used as text.
- Text inside an expression is quoted: `fill="t > 5 ? 'red' : 'blue'"`, `` text="`Score: ${ref.score.value}`" ``. Colors as function arguments are strings too: `dropShadow(0, 20, 20, '#0ff')` (without quotes: a SyntaxError).
- Function calls need no backticks: `fill="hsl(t * 36, 80, 50)"`, `fill="linear(45, ['red', 'blue'])"`.

### 3.3 Scope

| Kind | Names |
|---|---|
| Time | `t` (seconds); drivers §3.4 |
| Math, without `Math.` | `PI`, `E`, `LN2`, `LN10`, `LOG2E`, `LOG10E`, `SQRT1_2`, `SQRT2`, `abs`, `acos`, `acosh`, `asin`, `asinh`, `atan`, `atan2`, `atanh`, `cbrt`, `ceil`, `clz32`, `cos`, `cosh`, `exp`, `expm1`, `floor`, `fround`, `hypot`, `imul`, `log`, `log10`, `log1p`, `log2`, `max`, `min`, `pow`, `random`, `round`, `sign`, `sin`, `sinh`, `sqrt`, `tan`, `tanh`, `trunc` (radians; `Math.cos` works too, docs use the short form) |
| Colors | `rgb(r, g, b)`, `rgba(r, g, b, a)`, `hsl(h, s, l)`, `hsla(h, s, l, a)`: strings; numbers for `s`, `l` get a `%` |
| Gradients | `linear()`, `radial()`, `conic()`, §5.2 |
| Filters | `blur()`, `dropShadow()`, `brightness()`, `contrast()`, `hueRotate()`, `invert()`, `saturate()`, `grayscale()`, `sepia()`, `opacity()`, §5.3 |
| Utilities | `lerp(a, b, f)`, `clamp(v, low, high)`, `map(v, inMin, inMax, outMin, outMax)` |
| References | `ref.<id>.<name>`, `toLocal(ref.<id>, '<property>')` §9 |

### 3.4 Time Drivers

`t` is in **seconds**. Each driver takes a duration `d` in seconds and returns 0–1; multiply to scale, add to offset (`r="30 + wave(2) * 70"`, `fill="hsl(loop(5) * 360, 80, 50)"`).

| Driver | Formula | Shape |
|---|---|---|
| `loop(d)` | `(t % d) / d` | sawtooth 0 → 1 |
| `yoyo(d)` | `1 - abs((t % (d*2)) / d - 1)` | linear 0 → 1 → 0 |
| `wave(d)` | `0.5 - cos((t/d) * PI * 2) * 0.5` | smooth 0 → 1 → 0 |
| `bounce(d)` | `abs(sin((t/d) * PI))` | bouncing ball |
| `strobe(d)` | `t % d < d*0.5 ? 1 : 0` | on / off |
| `glide(d)` | `l*l*(3-2*l)`, `l = (t%d)/d` | ease in-out |
| `pulse(d)` | `pow(sin((t/d) * PI), 6)` | sharp spike |
| `glitch(d)` | `abs(sin(floor(t/d) * 437.58)) % 1` | pseudo-random steps |

`time(unit)` reads the local clock, with decimals so hands sweep smoothly: `'ms'` (0–999), `'s'` (0–59.999), `'m'` (0–59.999), `'h'` (0–23.999), `'day'` (0–6, Sunday 0), `'date'` (1–31), `'month'` (1–12), `'year'`. Second hand: `rotate="time('s') / 60 * 360"`; ticking: `floor(time('s'))`; 12-hour hand: `rotate="(time('h') % 12) / 12 * 360"`.

### 3.5 Empty and Removed Attributes (Rule A)

| Incoming | Boolean attribute | `<pxl-var>` `value` | Any other attribute |
|---|---|---|---|
| bare (`''`: `<pxl-polyline closed>`, `el.hidden = true`, `toggleAttribute`) | `true` | `''` | the class default |
| removed (`removeAttribute`, `el.hidden = false`, a framework dropping `null`) | the default (`false`) | `0` | the class default |

- Boolean attributes are those with a `false` / `true` default: `hidden`, `closed`, `smooth`, `pie`, `anticlockwise`, `labels`. Only bare, `"true"` and `"false"` are booleans: `closed="1"` is not `true`. Examples write `="true"` for readability.
- The resolved value is static: removing an animated or reactive attribute also stops its animation or subscription.
- Defaults that are `null` on purpose mean "not set" (rect `r1`–`r4` fall back to `r`; circle `end` / `sweep`: a full circle).
- Not handled: whitespace-only values (`" "` parses to `0`) and invalid values (`miterlimit="abc"`).

### 3.6 References (`ref.*`)

- Every element with an `id` is readable as `ref.<id>.<name>`: its current attribute values (`ref.box.x`), a variable's `ref.speed.value`, a stage's pointer and size (§6.1), states `isHovered` / `isPressed` (§8).
- `ref.player.x` reads `undefined` (not a TypeError) while `player` isn't connected yet; a reader updates when it connects.
- **Ids in camelCase:** `id="orbitSpeed"`. A hyphen is a minus sign: `ref.orbit-speed.x` reads as `ref.orbit - speed.x`.
- Readers see this frame's values of their targets, whatever the DOM order. Exception: a reader whose expression also uses `t` reads its target when it is evaluated itself, so placed before an animated target it lags one frame.
- A self-reference with `t` reads the previous frame's value (the "follow" effect: `x="ref.me.x + (100 - ref.me.x) * 0.1 + t * 0"`).
- A `ref` cycle whose values keep changing (`a = b + 1`, `b = a + 1`) stops after 100 rounds with a warning; a cycle that settles (`a = b`, `b = a`) keeps its values.
- **Setting from handlers:** `ref.<id>.set(name, value)`: a string is compiled like the attribute (`setAttribute()`), any other value goes through the property (numbers aren't compiled, arrays stay arrays). An unknown name warns once per element type and name.

### 3.7 Properties (JavaScript and Frameworks)

Users' guide: `docs/frameworks.html`. Every observed attribute (not the hyphenated `pxl-on-*`) is also a property: `el.r = 50`, `el.x = '500 + sin(t) * 100'`.

| Value set | Result |
|---|---|
| number, boolean, array, object (a gradient descriptor) | stored as it is: no parsing, no compiling. Arrays are kept by reference and never changed by the engine: assign a new array to change one |
| string | compiled like the attribute string (CSS colors stay text, §3.1). Except `text`, below |
| `undefined` / `null` | the default, as a removed attribute; `''` like a bare one |
| a function | not supported: warned once per element, the value stays |
| the same parsed value again | nothing happens (no redraw) |

- The getter returns the evaluated value (same as `ref.<id>.<name>`).
- No reflection: a property doesn't write the attribute. The last change wins; setting an attribute to the text it already has is no change.
- **`text` is literal** as a property: shown as it is, never compiled, because frameworks bind data to it (compiling would run `alert(1)` or fail on `Q1 - 2024`). Every other string property is code like an attribute value: never pass untrusted strings to them (colors from data: `#hex`, `rgb()` and the CSS color functions stay text).
- Values set before the element upgraded (a script loaded late) are applied on connect, after the attributes, so a framework value wins over server HTML.
- Special: `<pxl-polyline>` `points` (§11.5); `<pxl-var>` `value` also asks for a frame; `<pxl-stage>` `ratio` and `alwaysrender` write the attribute (`false`, `null`, `undefined` remove it); `id` and `hidden` are the native ones (`hidden` reflects).
- Cost: a number property about 0.5 µs per set, `setAttribute()` about 4–5 µs, a new CSS color string about 1 µs. Nothing per frame.

## 4. Compositing

- **Layers use CSS** on their canvas: `alpha` → `opacity`, `blend` → `mix-blend-mode` (`source-over` → `normal`, `lighter` → `plus-lighter`), `filter` → `filter`. The finished canvas is composited with the layers below and the page; shapes inside don't inherit these values. Changing them (animated, a property, a `ref`) doesn't redraw the layer's shapes.
- **Shapes use the canvas context**, in this order after the transform: `alpha` multiplies `globalAlpha`; `mask` or `blend` set `globalCompositeOperation` (`mask` wins); `filter`; shadow (`shadowcolor`, `shadowblur`, `shadowx`, `shadowy`, only when `shadowcolor` is set). They affect how the shape combines with the shapes drawn before it in the same layer.
- **Groups only transform:** no `alpha`, `blend`, `filter` or shadow. Use a layer, or set them on the shapes.
- **`blend`** (layers and shapes) mixes colors (`screen`, `multiply`, `overlay`, `lighter`, …). **`mask`** (shapes only) is alpha compositing and clipping (`destination-in`, `destination-out`, `source-atop`, …): CSS `mix-blend-mode` has no such modes.
- **Shadows** only on shapes. One shadow of a layer's whole silhouette: `filter="dropShadow(…)"` on the layer.
- **Isolated shapes:** a shape that draws more than once (fill and stroke, arrowheads, several text lines, a grid's major lines and labels) and has `mask`, `blend`, `filter` or a visible shadow is drawn as one unit, like an SVG group: its own fill isn't masked away by its stroke, its stroke casts no shadow onto its fill. `alpha` stays per draw call. Cost: about 0.3 ms of CPU per frame for the first isolated shape, about 1 ms for 5–20; from about 50 per frame the GPU limits it (100: 26 fps). An isolated text with `direction` unset draws left-to-right, also on a right-to-left page.

## 5. Colors, Gradients, Filters

### 5.1 Colors

Any CSS color string, or the scope functions `rgb()`, `rgba()`, `hsl()`, `hsla()` (§3.3). `none` / `transparent` for `fill` or `stroke` draw nothing.

### 5.2 Gradients

`linear()`, `radial()` and `conic()` return descriptors; the gradient is built at draw time in the shape's bounding box (path geometry without the stroke). A static gradient is built once, an animated one in every frame (≈ 0.8 µs).

**Color stops** (second argument of all three): `['red', 'yellow', 'blue']` (evenly spaced) or `[0, 'red', 0.8, 'blue', 1, 'yellow']`. Offsets are clamped to 0–1 (an overshooting animated stop parks at the end; `NaN`, e.g. a `ref` not connected yet, becomes 0).

- **`linear(angle, colors)`**: degrees in canvas orientation, `0` left → right, `90` top → bottom (CSS `0deg` points up). The line goes through the box center with half-length `|w/2·cos| + |h/2·sin|`, reaching the farthest corners like CSS. **`linear([x1, y1, x2, y2], colors)`**: relative to the box, `[0, 0]` top-left, `[1, 1]` bottom-right.
- **`radial(config, colors)`**, config with 1, 3 or 6 values (the arguments of `createRadialGradient`), centers relative to the box:

| Values | Meaning |
|---|---|
| `radial([r1], …)` or `radial(r1, …)` | centered `(0.5, 0.5)`, radius `0` → `r1` |
| `radial([x0, y0, r1], …)` | centered on `(x0, y0)`, `0` → `r1` |
| `radial([x0, y0, r0, x1, y1, r1], …)` | start circle and end circle: off-center highlights, cones, hollow cores |

  A radius is a logical number (`200`, drawn as `|r × u|`); a side (`'top'`, `'bottom'`, `'left'`, `'right'`: the perpendicular distance from the center to that edge, e.g. `'top'` = `y · h · u`); a point on the box (corners `'top-left'` …, edge midpoints `'top-center'` … also written `'center-top'`: the straight distance to it); or a CSS keyword `'closest-side'`, `'farthest-side'`, `'closest-corner'`, `'farthest-corner'` (the `closest-` ones are at least `0.001`, so a center on an edge still draws).
- **`conic(angle, colors)`**: start angle in degrees around the box center; **`conic([angle, cx, cy], colors)`** with a center relative to the box.
- **Stroke gradients:** each side of the gradient area is at least `strokewidth`, centered on the box: a line or flat polyline (a box side of `0`) still gets a visible gradient. Fill gradients use the box.

### 5.3 Filters

`filter` takes CSS filter strings written with the helpers, which add the units: `blur(radius)` and `dropShadow(x, y, blur, color = '#000')` in logical lengths (scaled by `u`); `brightness`, `contrast`, `invert`, `saturate`, `grayscale`, `sepia`, `opacity` in percent; `hueRotate(deg)`. Several filters: an array, `filter="[blur(2), dropShadow(0, 0, wave(2) * 15, 'red')]"`. Animated: any expression, `filter="blur(wave(2) * 10)"`. On a shape, `filter` uses the canvas's `ctx.filter`, which Safari has only behind its "Canvas Filters" feature flag, off by default: without it the shape is drawn unfiltered, and the console shows one warning per page, naming the first filtered shape (TODO §49). A layer's `filter` is CSS and works everywhere.

Every `px` value in the final string is multiplied by `u`, also in backticks (`` `blur(${t * 10}px)` ``): `px` means logical units. `%` and `deg` aren't scaled. Backticks are only needed for filters without a helper (`url(#svgFilter)`); there a missing unit makes the whole string invalid, and the browser ignores it silently.

## 6. Stage, Layer, Group

### 6.1 `<pxl-stage>`

| Attribute | Default | Meaning |
|---|---|---|
| `ratio` | `16 / 9` | CSS `aspect-ratio`; an expression (`10 / 3`); bare or removed: `16 / 9` |
| `alwaysrender` | `false` | `true` or bare: keep rendering when scrolled out of view (normally an `IntersectionObserver` pauses it, also inside scroll containers) |

Readable as `ref.<stage>.*`: `mouseX`, `mouseY` (pointer in stage units, default `500`), `isHovered`, `width` (always 1000), `height` (`1000 / ratio`), `fps` (frames in the last second, `0` on an idle page), `renderAvg`, `renderMax` (ms per frame, strings with 2 decimals, published once per second). `toLocal(ref.<stage>, …)` returns `0` (no frame of its own).

- Default styles: `display: block`, `position: relative`, `width: 100%`; any page CSS wins. Only `aspect-ratio` is written inline.
- A parent that sizes itself to its content (centered flex item, `inline-block`, absolute card) would give the stage 0 width: it then reports 300 px like `<canvas>` (custom state `:state(fallback)`, shrinkable as a flex or grid item).

### 6.2 `<pxl-layer>`

The ten transform attributes (§2), `alpha` (`1`), `blend` (`'source-over'`), `filter` (`'none'`), `hidden` (`false`). Its canvas fills the stage (`position: absolute; inset: 0`). Compositing values are CSS (§4). A layer redraws only in frames where something in it changed (a `floor(t)` clock: once per second; a finished `clamp(t * 100, 0, 300)`: never again), and a static layer costs nothing per frame. One change redraws the whole layer, so put shapes that change into their own layer. Layers don't nest.

### 6.3 `<pxl-group>`

The ten transform attributes, `hidden`, the handlers (§8.2); states `isHovered`, `isPressed` (§8.1). Transforms only (§4). A hidden group or layer skips its children: their values that follow `t` stay frozen until it is shown (values that follow other refs keep updating). A hidden shape is still evaluated, so `ref.*` to it stays current.

## 7. Shapes: Common Attributes

Every shape: the ten transform attributes and

| Attribute | Default | Meaning |
|---|---|---|
| `fill` | `null` | color or gradient (§5); `none` / `transparent`: no fill |
| `stroke` | `null` | color or gradient |
| `strokewidth` | `1` | scaled by `u`; `0`: no stroke |
| `linecap` | `'butt'` | `butt`, `round`, `square` |
| `linejoin` | `'miter'` | `miter`, `round`, `bevel` |
| `miterlimit` | `10` | |
| `linedash` | `null` | dash pattern, scaled by `u`: an array `"[20, 10]"` (brackets required; `"20, 10"` stays text; expressions inside: `"[wave(2) * 20, 10]"`), one number `"20"`, or solid: `"none"`, `"0"`, removed. As a property: `el.linedash = [20, 10]`; `null` resets. `setAttribute('linedash', [20, 10])` gives the string `"20,10"` (no pattern), `setAttribute('linedash', null)` the string `"null"` |
| `dashoffset` | `0` | scaled by `u` |
| `alpha`, `blend`, `mask`, `filter` | `1`, `'source-over'`, `'none'`, `'none'` | §4 |
| `shadowcolor`, `shadowblur`, `shadowx`, `shadowy` | `null`, `0`, `0`, `0` | lengths in logical units |
| `hidden` | `false` | |
| `pxl-on-click`, `-enter`, `-leave`, `-down`, `-up`, `-move` | | handlers, §8.2 |

States `isHovered`, `isPressed` (§8.1). Fill first, then stroke on top (half the stroke width covers the fill). A shape with neither `fill` nor `stroke` is invisible. A shape that throws while evaluating or drawing is skipped for that frame with a warning (at most 3 per element); the rest of the frame goes on.

## 8. Interaction

### 8.1 States (for Expressions)

`isHovered`: the pointer is over the shape; on a group, over any shape inside it (like `:hover` on a parent). `isPressed`: a press started on it (or inside the group) and isn't released yet, wherever the pointer is now. Every shape and group has them; layers don't (`ref.<stage>.isHovered` covers the stage). Readers are drawn in the same frame as the pointer change.

```html
<!-- A button: handler and states on the group, so the label belongs to it. The hand comes with pxl-on-click -->
<pxl-group id="btn" x="500" y="300" zoom="ref.btn.isPressed ? 0.95 : (ref.btn.isHovered ? 1.05 : 1)"
  pxl-on-click="ref.counter.set('value', ref.counter.value + 1)">
  <pxl-rect w="120" h="50" r="10" fill="ref.btn.isPressed ? '#222' : (ref.btn.isHovered ? '#555' : '#888')"></pxl-rect>
  <pxl-text text="'Add'" size="20" fill="#fff" align="center" baseline="middle"></pxl-text>
</pxl-group>
```

### 8.2 Handlers (`pxl-on-*`)

JavaScript statements in an attribute of a shape or group, with the expression scope, `ref` and `this` = the element. Each is a listener for a DOM event:

| Attribute | Event | Runs when |
|---|---|---|
| `pxl-on-click` | `click` | a click on the shape; on a group, on any shape inside it |
| `pxl-on-enter` / `pxl-on-leave` | `pointerenter` / `pointerleave` | the pointer enters / leaves the shape, or the group as a whole |
| `pxl-on-down` / `pxl-on-up` | `pointerdown` / `pointerup` | a press starts / ends over the shape |
| `pxl-on-move` | `pointermove` | the pointer moves over the shape (at most once per frame) |

- They run in the DOM's order with framework listeners: the shape's, then its groups' outwards; a framework listener's `stopPropagation()` stops the outer ones. No event object.
- Not `onclick`: that is the browser's own handler attribute (page JavaScript, no `ref`), and frameworks treat `on…` names as their listeners. A plain `onclick` on a shape runs on Kilopixel's `click`, as browser code.
- A handler that throws is logged (`[pxl] <pxl-rect id="btn"> pxl-on-click failed:` with the stack); the other listeners still run. Removed or empty: no listener. Any `click` runs it, also `shape.click()`.

### 8.3 DOM Events (for JavaScript and Frameworks)

Shapes and groups get real DOM events, so `addEventListener()`, React `onClick` / `onPointerEnter`, Vue `@click`, Angular `(click)`, Svelte, Solid, Lit, Alpine and htmx work on them as on HTML elements:

| Events | When |
|---|---|
| `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`, `dblclick`, `contextmenu` | when the browser's event arrives, hit-tested at its own position. Over a shape, listeners see one event with the shape as `target`; over empty space the browser's event passes unchanged (target: the layer) |
| `pointerover`, `pointerout`, `pointerenter`, `pointerleave` and the `mouse…` versions | when the hovered shape changes; enter / leave also on every group entered or left, outermost first. `relatedTarget`: the shape left or entered, or the layer for empty space. The layer gets `pointerout` when the pointer moves onto a shape and `pointerover` when it moves off (React builds `onPointerEnter` / `onPointerLeave` from those) |
| `pointermove`, `mousemove` | once per frame while the pointer moves over a shape; `movementX` / `movementY` summed since the last one |

- `preventDefault()` reaches the browser's event (no mouse events after `pointerdown`, no context menu).
- **Click target:** the nearest shape or group that holds both the press and the release; pressed on one shape and released on another (outside a common group), Kilopixel sends no click. A click without a press (synthetic) goes to the shape under it.
- `offsetX` / `offsetY` equal `clientX` / `clientY`: use `clientX`, or `ref.<stage>.mouseX` / `mouseY` for stage units.
- `setPointerCapture()` on a shape works (drags). Multi-touch: hover, `isPressed` and `mouseX` follow the primary pointer; other touches get their own presses, releases and clicks. A release outside the stage ends the press; `pointercancel` (touch scrolling) too, without a click.
- **Known limits:** capture listeners above the stage (React `onClickCapture`) see the browser's click before Kilopixel's; CSS `:hover` never matches a shape; `getBoundingClientRect()` of a shape is empty; shapes take no keyboard focus; test tools that click an element (`page.click('pxl-circle')`) need coordinates.

### 8.4 What Is Hit

- Every visible shape, like elements in the DOM: no registration needed. The hit area is the shape's own path with its stroke width (text: its bounding box, padded by half the stroke; nothing when it shows nothing). Alpha, blend, mask, filter and shadows don't change it. The topmost shape wins; a group's shapes are part of it.
- Out of hit testing: CSS `pointer-events: none` on a shape, group or layer (inherited; `auto` on a shape inside brings it back, as in the DOM); `hidden` shapes, groups, layers; layers hidden by CSS. `<pxl-grid>` has `pointer-events: none` by default (it covers the stage).
- A decoration on top of a clickable shape catches the pointer too: give it `pointer-events: none`, or put both into a group with the handler on the group (`examples/test37.html`).
- A shape that moves under a resting pointer is hovered within 100 ms.

### 8.5 Cursor

Only CSS: the hovered shape's computed `cursor` (inherited from its groups, layer, stage). `[pxl-on-click], [pxl-on-down], [pxl-on-up]` get `cursor: pointer` from the default styles (overridable; inherited by a group's shapes). A framework listener gets no hand by itself: `style="cursor: pointer"` or Tailwind `cursor-pointer`. Reading `isPressed` gives no hand.

## 9. Coordinate Mapping (`toLocal`)

`toLocal(target, property)` gives a target's frame in the caller's parent space: the space where the caller's own `x`, `y` are read, so the result is directly an attribute value. Readers update when either side moves.

| Property | Meaning |
|---|---|
| `'x'`, `'y'` | the target's pivot (without its offset) |
| `'dx'`, `'dy'` | its offset vector, turned into the caller's space |
| `'tx'`, `'ty'` | its drawn position: `'x' + 'dx'` |
| `'rotate'` | direction of its x axis, degrees |
| `'scalex'` | length of its x axis (all zooms included) |
| `'scaley'` | height perpendicular to it, signed (negative: mirrored) |
| `'skewx'` | lean of its y axis, degrees |
| `'zoom'` | total uniform zoom (area factor as a length; `zoom="2"` inside a layer with `zoom="1.5"`: 3): exact while nothing between is stretched, otherwise read `'scalex'` / `'scaley'` |

- **Totals, not attributes:** a target with `zoom="2"` reports `'scalex'` 2, one with `scalex="2"` reports `'zoom'` 1.41. `'skewy'` isn't offered (not unique; always 0). Unknown literal names warn once at compile time; at run time they return `0`.
- **Clone rule** (exact copy of a frame from another space): `x="toLocal(ref.el, 'x')" y="toLocal(ref.el, 'y')" rotate="toLocal(ref.el, 'rotate')" skewx="toLocal(ref.el, 'skewx')" scalex="toLocal(ref.el, 'scalex')" scaley="toLocal(ref.el, 'scaley')" dx="ref.el.dx" dy="ref.el.dy"`, `skewy` and `zoom` left at their defaults (`zoom="1.1"`: an outline 10 % larger).
- **Variant:** `'tx'` / `'ty'` with the same four frame values and no `dx` / `dy` draws the same shape around the drawn position: the copy's own `zoom` or `rotate` then acts around the shape (outlines), with `'x'` / `'y'` + `dx` / `dy` around the target's pivot (orbits).
- Use `'tx'` / `'ty'` to connect drawn positions (lines between shapes), `'x'` / `'y'` for the pivot (orbit rings). `ref.el.tx` is the same as `toLocal(ref.el, 'tx')` only for a reader in the same space.
- Targets: shapes, groups, layers. A stage or a target not connected yet gives `0`, a `<pxl-var>` `NaN`.

```html
<pxl-line x1="toLocal(ref.planet, 'tx')" y1="toLocal(ref.planet, 'ty')" x2="0" y2="0" stroke="white"></pxl-line>
<pxl-circle x="toLocal(ref.planet, 'tx')" y="toLocal(ref.planet, 'ty')"
  r="ref.planet.r * toLocal(ref.planet, 'zoom') + 10" stroke="white" fill="none"></pxl-circle>
```

## 10. Arrowheads

On `<pxl-line>`, `<pxl-polyline>`, `<pxl-circle>`, `<pxl-ellipse>`: `arrowstart`, `arrowend` (size, or `'auto'` = `strokewidth × 3.6`; `≤ 0`: none; default `0`), `arrowstyle` (`'filled'` default, or `'line'` chevrons).

- An equilateral triangle (60° tip); the size is its side, the base width. Length tip to base `size × cos 30° ≈ 0.866 × size`. No minimum size.
- The tip ends where the line cap ends: at the end point for `butt`, `strokewidth / 2` beyond it for `square` and `round`.
- The stroke under a head is shortened so it never shows beside or in front of it. Chevrons follow the shape's `linejoin` and stay sharp with a low `miterlimit`; they are always solid, also on dashed strokes. Heads use the stroke's color or gradient.
- **Open, stroked paths only:** ignored with `pie`, `closed`, rings (`ir`, `irx` / `iry`), closed polylines, and without `stroke` (or `strokewidth="0"`). A full 360° sweep with arrows stays an open arc.
- A path shorter than both shortenings shows only the heads. A 2-point polyline is straight even with `smooth`; polyline heads skip zero-length end segments (none if all points are equal).
- Geometry and formulas: `.agents/ENGINE.md` "Arrowheads".

## 11. Shapes

Each shape draws around `(0, 0)` after its transform; the bounding box is in its own units (gradients use it, hit testing pre-checks it).

### 11.1 `<pxl-circle>`

Bounding box `±r`.

| Attribute | Default | Meaning |
|---|---|---|
| `r` | `0` | outer radius |
| `ir` | `0` | inner radius; > 0 draws a ring |
| `start` | `0` | start angle, degrees |
| `end` | `null` | end angle, degrees, absolute |
| `sweep` | `null` | angle relative to `start`, wins over `end`; neither set: full circle |
| `pie` | `false` | lines from the arc ends to the center (not on a full circle) |
| `closed` | `false` | a chord between the arc ends |
| `anticlockwise` | `false` | reverses the direction |
| `arrowstart`, `arrowend`, `arrowstyle` | `0`, `0`, `'filled'` | §10 |

### 11.2 `<pxl-ellipse>`

The circle's attributes and defaults, with `rx`, `ry` instead of `r` and `irx`, `iry` instead of `ir` (all `0`). Bounding box `±rx`, `±ry`.

### 11.3 `<pxl-rect>`

Bounding box `{ left: -w·ax, right: w·(1 − ax), top: -h·ay, bottom: h·(1 − ay) }` (`ax`, `ay` from the anchor).

| Attribute | Default | Meaning |
|---|---|---|
| `w`, `h` | `0` | width, height (negative: mirrored) |
| `r` | `null` | radius of all corners |
| `r1`–`r4` | `null` | per corner (top-left, top-right, bottom-right, bottom-left), falling back to `r`; negative counts as `0` |
| `anchor` | `'center'` | the point of the rect at `x` / `y`: `center`, `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right` (proportions 0 / 0.5 / 1 of `pxl.anchorX` / `pxl.anchorY`). An unknown name draws nothing |

### 11.4 `<pxl-line>`

`x1`, `y1`, `x2`, `y2` (`0`), arrowheads (§10). Bounding box: min / max of the end points.

### 11.5 `<pxl-polyline>`

| Attribute | Default | Meaning |
|---|---|---|
| `points` | none | `"x,y; x,y; …"`, see below |
| `closed` | `false` | closes the path (strict: bare or `"true"`, not `"1"`) |
| `smooth` | `false` | a curve through the points; a number scales every handle (`true` = `1`, `0` straight, negative: loops) |
| `mode` | `'absolute'` | `'relative'`: each point is relative to the previous one |
| `arrowstart`, `arrowend`, `arrowstyle` | `0`, `0`, `'filled'` | §10, open polylines only |

- **Points:** semicolons between points, commas between x and y; each coordinate is its own expression and animates on its own: `points="100,wave(2)*200; 200,wave(3)*200; 300,0"`. Commas inside parentheses belong to the expression (`min(a, b)`). An x without its y is dropped. At least 2 points.
- **`points` property:** a string like the attribute, or an array, flat `[x0, y0, x1, y1, …]` or pairs `[[x0, y0], …]`, each coordinate a number or an expression string; an incomplete pair ends the list. With the same number of coordinates nothing is allocated (200 numbers: about 20 µs; `setAttribute()` with the same points about 110 µs). Reading `el.points` returns the evaluated coordinates, flat, in a new array.
- **Invalid coordinate** (a `ref` not connected yet, `NaN`, a division by zero): the polyline draws nothing and isn't hit until all are valid, without a warning.
- **Smoothing:** a centripetal Catmull-Rom spline (alpha 0.5, like D3 `curveCatmullRom`). Free ends of an open path get no handle. Duplicate points make a corner, and handles shrink continuously as points move together. Ending on the start point makes a corner there: for a smooth loop use `closed` and write each point once (`closed` only adds the closing segment). A 2-point polyline is straight.
- **Reading points (internal, not in the public docs):** `ref.<id>.pN` is coordinate N (point k: `p(2k)`, `p(2k+1)`), as written: before the polyline's own transform (same-space readers only), offsets in relative mode, `undefined` for a removed coordinate. The docs recommend a `<pxl-var>` read by both shapes instead.

### 11.6 `<pxl-text>`

| Attribute | Default | Meaning |
|---|---|---|
| `text` | `''` | the text (§3.1: plain words need no quotes; inside expressions quote it; `\n` breaks lines). As a property: literal (§3.7) |
| `size` | `16` | font size, logical units |
| `font` | `'sans-serif'` | font family |
| `weight` | `'normal'` | `normal`, `bold`, `100`–`900` |
| `fontstyle` | `'normal'` | `normal`, `italic`, `oblique` |
| `align` | `'start'` | `start`, `end`, `left`, `right`, `center` |
| `baseline` | `'alphabetic'` | `alphabetic`, `top`, `middle`, `bottom`, `hanging`, `ideographic` |
| `direction` | `null` | `ltr`, `rtl`; unset: inherited |
| `maxwidth` | `0` | squeeze lines wider than this (canvas `maxWidth`) |
| `width` | `0` | wrap words at this width |
| `lineheight` | `1.2` | line height factor |
| `letterspacing` | `0` | logical units |
| `reveal` | `null` | typewriter, 0 (nothing) → 1 (all): shows `floor(reveal × (characters + 1))` characters |

- The bounding box is measured from the glyphs (ascent, descent, all lines, alignment, baseline, `maxwidth`). The hit area is that box, not the glyph shapes; partially revealed text keeps the full box; nothing visible, no hit.
- Web fonts that arrive late correct the text on their own (glyphs, wrap, box); until the whole font batch has loaded, text stays in its fallback font.
- Stroke attributes (`strokewidth`, `linecap`, `linejoin`, `miterlimit`, `linedash`, `dashoffset`) work as on the other shapes.

### 11.7 `<pxl-grid>`

| Attribute | Default | Meaning |
|---|---|---|
| `step` | `50` | spacing, logical units (`≤ 0`: nothing) |
| `major` | `0` | every Nth line is major (twice the stroke width); `0`: none |
| `labels` | `false` | coordinates at the major intersections (needs `major`) |
| `labelsize` | `12` | label font size |

An infinite grid: it draws exactly the visible part, at any zoom, rotation or nesting. Major lines only with a stroke; labels in monospace, in the fill color (or the stroke color without a fill; neither: none). Its bounding box is the visible area, so gradients span the screen. `pointer-events: none` by default.

### 11.8 `<pxl-var>`

`value` (default `0`; bare `''`, so a cleared text input gives `''`; removed `0`). Static, animated or reactive.

```html
<pxl-var id="speed" value="100"></pxl-var>
<pxl-circle r="ref.speed.value" pxl-on-click="ref.speed.set('value', ref.speed.value + 10)"></pxl-circle>
```

- From JavaScript or a framework: `document.getElementById('speed').value = 20`, React `<pxl-var value={speed}>` (numbers aren't compiled).
- **Inside a layer** it is evaluated by that layer, like a shape: frozen while the layer or a group around it is hidden. **Stage-level** (in a stage, outside every layer): evaluated before the layers, every reader sees this frame's value; a static one keeps the page at 0 FPS. **Outside every stage:** static and reactive values work, `t` doesn't.
- **Several inputs, one attribute:** give each input its own variable and read them all, `fill="linear([ref.x0.value, ref.y0.value, ref.x1.value, ref.y1.value], ['red', 'blue'])"`; a slider then sets one value (the docs pages call this Tier 2, `docs/DOCS_STANDARDS.md` §4).

## 12. Custom Shapes

A class that extends `pxl.Shape`, in a script after `pxl.min.js`, written like the built-in shape files. Docs page: `docs/custom-shapes.html`; the Star and the Gauge there (`docs/js/shapes/`) are also the test shapes. Design: `design/done/2026-11-20_custom_shapes_plan.md`.

```javascript
pxl.Star = class Star extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };
  draw(ctx) { /* path around (0, 0), lengths as in the HTML */ this.applyStyle(ctx); }
  getBoundingBox() { const { r } = this.values; return this.setBoundingBox(-r, -r, r, r); }
};
pxl.defineShape('pxl-star', pxl.Star);
```

| | Name | Meaning |
|---|---|---|
| **write** | `class … extends pxl.Shape` | on `pxl` like the built-ins, or a plain class |
| | `static defaults` | every attribute with its default, after `...pxl.Shape.defaults`. Each key is an observed attribute (Rule A, §3.5) and a property (§3.7). Keys lowercase (HTML lowercases attribute names). A `false` / `true` default makes a presence attribute (bare = `true`) |
| | `draw(ctx)` | the drawing around the shape's origin. The canvas is scaled by `u`, so lengths are written as in the HTML. Reads only `this.values`: no time (animate through attributes, `rotate="t * 30"` or an own `spin="t * 90"`), no DOM, as little allocation as possible |
| | `getBoundingBox()` | the box around the outline, without the stroke, through `setBoundingBox()`. Gradients span it; hit testing checks it (padded by `hitPadding()`) before the exact test. Without it, gradients collapse to a point and every hit test is exact |
| | `pxl.defineShape(tag, Class)` | defines the tag (`pxl-` by convention) and hides content inside it (`display: none`; before the script runs, the content shows). Warns once per class: a key with capitals, no `draw()`, no `getBoundingBox()`; a tag already defined (a script loaded twice) warns and keeps the first class |
| **may override** | `hitTest(ctx)` | the hit area: a path and `ctx.fill()` / `ctx.stroke()` (they test the pointer instead of painting). Default: what `draw()` fills and strokes |
| | `drawsMoreThanOnce()` | whether `draw()` makes more than one paint call (`fill()`, `stroke()`, `fillText()`, `drawImage()`), which decides isolation with `mask`, `blend`, `filter` or a shadow (§4). Default `true`; one path through `applyStyle()`: `this.hasFill() && this.isStroked()` |
| | `hitPadding()` | how far the paint reaches beyond the box (default: from the stroke) |
| **may read** | `this.values` | the current values (the object `ref.<id>` reads), also `isHovered`, `isPressed` |
| | `this.stage.unit` | CSS pixels per unit, for pixel access (`getImageData()` ignores the canvas transform) |
| **may call** | `applyStyle(ctx)` | fill (if set), then stroke (if set) the current path, gradients and dashes included |
| | `applyStrokeState(ctx)` | stroke style, width, caps, joins, miter limit, dash, without stroking |
| | `paint(ctx, 'fill' | 'stroke')` | the fill or stroke as a canvas style: a color as written, a gradient in the shape's box |
| | `hasFill()`, `isStroked()` | whether a fill, or a stroke with a width above 0, is set |
| | `setBoundingBox(left, top, right, bottom)` | writes the box and returns it, no allocation |

Everything else on `pxl.Shape` (names with `_`, `update()`, `render()`, matrices, arrowheads) is internal. **Guarantees:** the transform (with `u`), `alpha`, `blend` / `mask`, `filter` and the shadow are set before `draw()`; the canvas state is restored afterwards; an error in `draw()` is reported once and skips the shape for that frame; the shape redraws when one of its values changes.

**TypeScript:** `PxlShapeAttributes` and `PxlShapeElement` (generated) hold what every shape has; a custom shape's declaration extends them with its own attributes and adds its tag to `HTMLElementTagNameMap`, and for JSX to the framework's tag list (the docs page shows both).

## 13. Performance Monitor

`ref.<stage>.fps`, `renderAvg`, `renderMax` (§6.1), published once per second. An FPS display is itself a reader: on an otherwise idle page it alternates between 0 and 1. Every frame counts, also frames that redrew nothing: while anything is animated, frames keep running even when no value changed.

```html
<pxl-text x="20" y="30" text="ref.main.fps + ' FPS | ' + ref.main.renderAvg + 'ms'" font="monospace" size="14" fill="#0f0"></pxl-text>
```

## 14. Pitfalls

- Closing tags always (§1); shapes inside a layer.
- `pxl-on-click` …, not `onclick` / `onhover` (§8.2).
- Raw numbers for fixed coordinates (§2); `t` in seconds (`t * 90` = 90° per second).
- `fill` or `stroke`, or the shape is invisible.
- Quote text in expressions and colors as arguments (§3.2); ids in camelCase (§3.6).
- Filters with helpers, also animated; filter and shadow sizes are logical units (§5.3).
- Arrowheads need an open, stroked path (§10).
- In JavaScript or a framework: DOM events on shapes and groups; no hand cursor without CSS (§8.5); stage units from `ref.<stage>.mouseX`, not `event.offsetX`.
