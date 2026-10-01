# Tween Animation Plan (Unified Specification)

**Date**: 2026-10-01  
**Status**: Approved Specification  
**Files affected**: [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js), [`js/elements/node.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js), [`js/elements/layer.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js), [`js/elements/stage.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/stage.js), [`.agents/KILOPIXEL.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md)

---

## 1. Goal & Architecture Overview

Introduce a native `tween()` driver into Kilopixel that provides high-performance, declarative, one-shot animations. 

This specification unifies the **$0 \to 1$ normalized driver philosophy** of Kilopixel with **direct value interpolation convenience**, while solving **multi-element expression caching** and introducing an **automatic 0% CPU quiescence (sleep) engine**.

---

## 2. API Specification

`tween()` supports an intuitive dual-overload signature:

```javascript
// Overload 1: Normalized Ratio Form (0.0 -> 1.0 clamped)
tween(duration, [ease = 'ease'], [delay = 0])

// Overload 2: Direct Value Form (Interpolates from -> to)
tween(from, to, duration, [ease = 'ease'], [delay = 0])
```

### Overload 1: Normalized Ratio Form (`0 -> 1`)
Consistent with all other Kilopixel time drivers ([`loop()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L123), [`wave()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L125), [`yoyo()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L124)), this form produces a normalized progress value that clamps at `1.0` upon completion:
```html
<!-- Opacity fade-in over 0.8s -->
<pxl-circle alpha="tween(0.8)" radius="40" fill="coral" />

<!-- Rotation: 0° -> 360° over 1s, then stops -->
<pxl-rect rotate="tween(1) * 360" width="60" height="60" fill="violet" />

<!-- Elastic scale entrance -->
<pxl-circle scale="1 + tween(0.5, 'elastic', 0.2) * 0.5" radius="30" fill="gold" />
```

### Overload 2: Direct Value Form (`from -> to`)
Provides zero-boilerplate convenience for spatial movement, avoiding forced `lerp(...)` wrappers for standard coordinates:
```html
<!-- Direct slide from -200 to 500 over 1.5s with back overshoot -->
<pxl-rect x="tween(-200, 500, 1.5, 'back')" width="80" height="80" fill="teal" />

<!-- Direct stroke width transition -->
<pxl-circle strokewidth="tween(1, 10, 0.6, 'out')" radius="50" stroke="white" />
```

> [!TIP]
> Both forms are mathematically equivalent: `tween(a, b, d, ease, delay)` is internally compiled as `lerp(a, b, tween(d, ease, delay))`.

---

## 3. Composition with Infinite Drivers

Tween drivers compose cleanly with continuous time drivers (`wave`, `loop`, `pulse`, etc.) via standard arithmetic:

```html
<!-- Moves to 500 over 2s, then oscillates continuously forever -->
<pxl-circle x="tween(0, 500, 2) + wave(2) * 30" radius="25" fill="cyan" />

<!-- Ramps wave amplitude from 0 to 50 over 2s (attack envelope), then oscillates forever -->
<pxl-circle x="tween(2) * wave(1) * 50" radius="25" fill="lime" />
```

**The Quiescence Rule**:
* If an expression contains any infinite driver (`wave`, `loop`, `t`, etc.) **anywhere**, the node remains permanently animated (`hasInfiniteDriver = true`), keeping the layer awake at 60 FPS.
* If an expression consists **only** of `tween()` calls, the node automatically shuts off its animation demand once all tweens complete, allowing the layer to enter **0% CPU sleep**.

---

## 4. Solving the Multi-Element Cache Problem

### 4.1 The Challenge
In Kilopixel, [`pxl.compileExpression`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L215) caches compiled evaluation functions in `pxl.animationCache`:
```javascript
if (this.animationCache.has(str)) return this.animationCache.get(str);
```
If two separate elements share the same markup (e.g. 5 circles with `alpha="tween(0.8)"`), they receive the **exact same function reference `fn`**.

If state slots were stored inside the compiled function closure:
* Element A mounts at $t = 0$. The closure sets `t0 = 0` and eventually `done = true`.
* Element B mounts at $t = 5$. It calls the same `fn` and sees `done = true`.
* **Element B skips animation completely!**

### 4.2 The Solution: Element-Scoped Slot Storage
Tween state slots are stored on the **element instance** (`this`), not in the shared closure:

```javascript
// Structure on PxlNode instance:
this._twSlots = {}; // Keyed by attribute name: { x: [slot0, slot1], alpha: [slot0] }
```

When `fn.call(this, t)` executes:
1. `this` is the specific DOM element.
2. The compiled expression looks up `this._twSlots[attrKey]`.
3. If no slots exist on that element yet, it initializes them locally for that element.

This guarantees:
* **Total Timeline Isolation**: Elements mounting at different times animate independently, even when sharing identical expressions.
* **Zero Cache Pollution**: The compiled function remains purely stateless and 100% cacheable in `pxl.animationCache`.
* **Zero Garbage Collection**: State slots are pre-allocated plain objects created once per element attribute.

---

## 5. Easing Catalog (`pxl.easings`)

A zero-allocation easing table defined in [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js):

| Name | Formula / Behavior | Common Use Cases |
| :--- | :--- | :--- |
| `'linear'` | $t$ | Progress bars, linear scrolls |
| `'ease'` *(default)* | Quadratic In-Out | General UI motion |
| `'in'` / `'quadIn'` | $t^2$ | Drops, exits, fall-offs |
| `'out'` / `'quadOut'` | $t(2 - t)$ | Snappy entrances, drawer opens |
| `'inOut'` / `'quadInOut'` | Symmetric quad S-curve | Smooth bilateral camera moves |
| `'cubicIn'` | $t^3$ | Steep acceleration, gravity |
| `'cubicOut'` | $1 - (1 - t)^3$ | Gentle stops, organic deceleration |
| `'cubicInOut'` | Smooth cubic S-curve | Scene transitions |
| `'back'` / `'backOut'` | Overshoots $1.0$, then pulls back | Buttons, popups, lively badges |
| `'backIn'` | Anticipates backwards before launching | Dramatic takeoffs, catapults |
| `'backInOut'` | Anticipates $\to$ leaps $\to$ overshoots $\to$ settles | Hero transitions |
| `'elastic'` / `'elasticOut'` | Spring-damper oscillation | Rubber-band drops, jelly bounces |
| `'bounce'` / `'bounceOut'` | Decaying floor bounce | Dropping balls, physical impacts |

*Custom Easing*: Accepts custom lambdas: `tween(1, (p) => Math.pow(p, 4))`.

```javascript
pxl.easings = {
  linear:     (t) => t,
  ease:       (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in:         (t) => t * t,
  out:        (t) => 1 - (1 - t) * (1 - t),
  inOut:      (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicIn:    (t) => t * t * t,
  cubicOut:   (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  backIn: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  backInOut: (t) => {
    const c1 = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c1 + 1) * 2 * t - c1)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c1 + 1) * (t * 2 - 2) + c1) + 2) / 2;
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  },
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

// Aliases
pxl.easings.quadIn = pxl.easings.in;
pxl.easings.quadOut = pxl.easings.out;
pxl.easings.quadInOut = pxl.easings.inOut;
pxl.easings.backOut = pxl.easings.back;
pxl.easings.elasticOut = pxl.easings.elastic;
pxl.easings.bounceOut = pxl.easings.bounce;
```

---

## 6. Implementation Architecture

### 6.1 The Element-Bound Runtime Helper (`_evalTween`)

Defined in `compiler.js` and available to all expressions:

```javascript
pxl._evalTween = function(node, attrName, slotIndex, t, a, b, c, d, e) {
  // Parse Overload Signatures:
  let from, to, duration, ease, delay;
  if (typeof b === 'number' && (typeof c === 'number' || typeof c === 'undefined')) {
    // Overload 2: tween(from, to, duration, [ease], [delay])
    from = a; to = b; duration = c; ease = d; delay = e || 0;
  } else {
    // Overload 1: tween(duration, [ease], [delay])
    from = 0; to = 1; duration = a; ease = b; delay = c || 0;
  }

  if (duration <= 0) return to;

  // Retrieve or initialize element slot
  const slots = (node._twSlots[attrName] ||= []);
  let s = slots[slotIndex];
  if (!s) {
    s = slots[slotIndex] = { t0: null, done: false, val: from };
  }

  // Late-mount anchor: capture first tick
  if (s.t0 === null) s.t0 = t;

  const elapsed = t - s.t0 - delay;
  if (elapsed <= 0) return from;

  if (s.done) return s.val;

  // Completion clamp & freeze
  if (elapsed >= duration) {
    s.done = true;
    s.val = to;
    return to;
  }

  const progress = elapsed / duration;
  const easeFn = typeof ease === 'function'
    ? ease
    : (pxl.easings[ease || 'ease'] || pxl.easings.ease);

  const k = easeFn(progress);
  return from + (to - from) * k;
};
```

### 6.2 Expression Compiler Transformation

In [`pxl.compileExpression`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L213):

1. **Detection & Classification**:
   ```javascript
   const infiniteRegex = /(^|[^.])\bt\b|\b(loop|yoyo|wave|bounce|strobe|glide|pulse|glitch|time)\s*\(/;
   const hasTweens = /(?<!\.\s*)\btween\s*\(/.test(sanitizedStr);
   const hasInfinite = infiniteRegex.test(sanitizedStr);

   const isAnimated = hasTweens || hasInfinite;
   ```

2. **Callsite Rewriting**:
   Each `tween(...)` call in the expression string is rewritten to pass `this`, the current attribute name, and an incremental callsite index:
   ```javascript
   let tweenIndex = 0;
   sanitizedStr = sanitizedStr.replace(/(?<!\.\s*)\btween\s*\(/g, () => {
     return `pxl._evalTween(this, _attrKey, ${tweenIndex++}, t, `;
   });
   ```

3. **Closure Metadata**:
   The generated function wraps `_attrKey` and exposes metadata:
   ```javascript
   fn.isTimeDependent = isAnimated;
   fn.hasInfiniteDriver = hasInfinite;
   fn.tweenCount = tweenIndex;
   ```

---

## 7. Quiescence & Auto-Sleep Engine

```
                   ┌────────────────────────────────────────┐
                   │           Expression Mount             │
                   └───────────────────┬────────────────────┘
                                       │
                      Has infinite drivers outside tween?
                                      / \
                                Yes  /   \ No
                                    /     \
                                   ▼       ▼
                        ┌─────────────┐ ┌──────────────┐
                        │   AWAKE     │ │   TWEENING   │
                        │ 60 FPS loop │ │ Running 60FPS│
                        │ Never sleeps│ └──────┬───────┘
                        └─────────────┘        │
                                          All tweens on
                                         node complete?
                                               │ Yes
                                               ▼
                                        ┌──────────────┐
                                        │    SLEEP     │
                                        │  0 FPS, 0%CPU│
                                        │ Stops rAF    │
                                        └──────┬───────┘
                                               │
                                 Reactive mutation / click
                                               │
                                               ▼
                                        Re-arm & Wake Up
```

### 7.1 Node-Level Activity Check

At the end of [`PxlNode.prototype.evaluateAnimations`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js#L88):

```javascript
// Determine if node still demands render frames
if (this.animatedAttributeKeys.length > 0) {
  let stillActive = false;
  const numKeys = this.animatedAttributeKeys.length;
  for (let i = 0; i < numKeys; i++) {
    const key = this.animatedAttributeKeys[i];
    const fn = this.attributeExpressions[key];

    // Infinite drivers never sleep
    if (fn.hasInfiniteDriver) {
      stillActive = true;
      break;
    }

    // Check if any tween slot on this attribute is still running
    const slots = this._twSlots[key];
    if (slots) {
      for (let j = 0; j < slots.length; j++) {
        if (!slots[j].done) {
          stillActive = true;
          break;
        }
      }
    }
    if (stillActive) break;
  }
  this.isAnimated = stillActive;
}

// Invalidate layer ONLY while node is actively animating
if (this.isAnimated) this.parentLayer?.invalidate();
```

### 7.2 Layer Heartbeat & Stage Sleep

In [`Layer.prototype.render`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js#L152):
```javascript
// Check if layer itself or any child is still actively animating
let layerNeedsAnimation = this.isAnimated;
if (!layerNeedsAnimation) {
  const len = this.childList.length;
  for (let i = 0; i < len; i++) {
    if (this.childList[i].isAnimated) {
      layerNeedsAnimation = true;
      break;
    }
  }
}

// Request next frame ONLY if active
if (layerNeedsAnimation) {
  this.stage?.requestRender();
}
```

When all elements settle:
1. `this.isAnimated` becomes `false` on every child.
2. `layerNeedsAnimation` becomes `false`.
3. `this.stage?.requestRender()` is **not** called.
4. The stage rAF loop stops. **CPU usage drops to 0%**.

### 7.3 Automatic Wake-Up Triggers

The stage and layer automatically awaken on:
1. **DOM Attribute Changes**: [`attributeChangedCallback`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js#L23) sets `this.isAnimated = true` and invalidates the layer.
2. **Reactive Variable Changes**: [`variableChangedCallback`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js#L78) resets the attribute's tween slots (`t0 = null`, `done = false`), sets `this.isAnimated = true`, and requests a render.
3. **Pointer / Touch Interaction**: [`InteractionEngine`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/interaction.js) calls `stage.requestRender()` on mouse move, enter, leave, and click.

---

## 8. Summary of Files Affected

| File | Changes |
| :--- | :--- |
| [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js) | Add `pxl.easings` table, `pxl._evalTween` runtime helper, regex classification (`hasInfiniteDriver`, `hasTweens`), rewrite call sites. |
| [`js/engine.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/engine.js) | Ensure `_attrKey` context is passed during attribute compilation and reactive evaluation. |
| [`js/elements/node.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js) | Pre-allocate `this._twSlots = {}`, reset slots on variable changes, add dynamic `isAnimated` calculation at end of `evaluateAnimations()`. |
| [`js/elements/layer.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js) | Guard layer heartbeat in `render()` so it only calls `requestRender()` if `this.isAnimated` or any child `child.isAnimated` is true. |
| [`.agents/KILOPIXEL.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md) | Full API reference, syntax examples, and easing table documentation. |

---

## 9. Verification & Acceptance Criteria

1. **Overload Equivalence**:
   Verify `<pxl-circle x="tween(0, 500, 1.5)" />` and `<pxl-circle x="lerp(0, 500, tween(1.5))" />` animate identically.
2. **Multi-Element Cache Independence**:
   Mount 5 elements with `<pxl-rect alpha="tween(0.8)" />` at staggered intervals (e.g. 0s, 2s, 4s). Verify all 5 elements execute complete fade-ins independently without skipping.
3. **Quiescence / CPU Drop**:
   Mount a stage with a 1-second tween. Verify that after $t = 1.05\text{s}$, `stage.render()` stops firing and browser CPU drops to 0%.
4. **Reactive Wake-Up**:
   Mutate `ref.test.val` on a sleeping stage. Verify the stage wakes up, animates to the new state, and returns to sleep.
