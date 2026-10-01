# Design Plan: Single-Function Tween Animation Engine & Quiescence Lifecycle

**Date**: 2026-10-01  
**Status**: Draft  
**Files affected**: [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js), [`js/elements/node.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js), [`js/elements/layer.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js), [`js/elements/stage.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/stage.js), [`.agents/KILOPIXEL.md`](file:///c:/Users/micha/woodoo-labs/kilopixel/.agents/KILOPIXEL.md)

---

## 1. Problem Statement & Motivation

Kilopixel provides robust continuous time drivers ([`loop()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L123), [`yoyo()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L124), [`wave()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L125), [`bounce()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L126), [`strobe()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L127), [`glide()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L128), [`pulse()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L129), [`glitch()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L130), [`time()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js#L131)). These drivers are periodic and run indefinitely.

However, declarative canvas UI and interactive graphics fundamentally require **finite, one-shot transitions**:
1. **Entrance / Exit Transitions**: Moving a modal, badge, or card from $A \to B$ over a set duration when mounted or shown.
2. **Interactive State Changes**: Smoothly animating a button, slider, or entity position when a reactive variable mutates (e.g., `ref.game.playerX`).
3. **Physical Settling & Damped Oscillations**: Elastic overshoots, bouncy drops, and impact shakes that dissipate and come to rest.
4. **Quiescence (Layer Sleep)**: Infinite drivers force the canvas render loop to run at 60 FPS permanently. A finite transition engine must allow layers to automatically shut down their render loops (0% CPU) once all animations on the layer have settled.

---

## 2. API & Syntax Specification

### 2.1 Single-Function Dual Overload

Rather than fragmenting the API into multiple functions (`tween`, `transition`, `lerpTo`, etc.), Kilopixel implements a single unified `tween()` function with an intuitive signature overload:

```javascript
// Full Form: Interpolates from 'from' to 'to'
tween(from, to, duration, [ease = 'ease'], [delay = 0])

// Normalized Ratio Form: Interpolates from 0.0 to 1.0 (convenience overload)
tween(duration, [ease = 'ease'], [delay = 0])
```

#### Examples in Declarative Markup:
```html
<!-- Spatial translation from -200 to 500 over 1.5s with back overshoot -->
<pxl-rect x="tween(-200, 500, 1.5, 'back', 0.2)" width="80" height="80" fill="teal" />

<!-- Color / opacity fade-in -->
<pxl-circle alpha="tween(0, 1, 0.8)" radius="40" fill="coral" />

<!-- Normalized ratio used as envelope multiplier -->
<pxl-shape scale="1 + tween(0.5, 'elastic') * 0.5" />
```

### 2.2 Built-In Easing Catalog (`pxl.easings`)

Kilopixel provides a high-performance, zero-allocation easing table accessible by string name:

| Easing Name | Mathematical Character | Common Use Cases |
| :--- | :--- | :--- |
| `'linear'` | Constant velocity ($k$) | Marquees, timers, progress rings |
| `'ease'` *(default)* | Quadratic In-Out smooth curve | General natural motion, UI panels |
| `'in'` / `'quadIn'` | $k^2$ acceleration | Drop falls, exits |
| `'out'` / `'quadOut'` | $k(2 - k)$ deceleration | UI snaps, entrances, drawer slides |
| `'inOut'` / `'quadInOut'` | Smooth bilateral acceleration | Camera pans, smooth transfers |
| `'cubicIn'` | $k^3$ steep acceleration | Heavy gravity acceleration |
| `'cubicOut'` | $1 - (1 - k)^3$ gentle stop | Crisp UI snapping |
| `'cubicInOut'` | Smooth S-curve | Seamless scene transitions |
| `'back'` / `'backOut'` | Overshoots target and pulls back | Punchy UI buttons, lively popups |
| `'backIn'` | Anticipates backward before leaping forward | Dramatic launches, jump takeoffs |
| `'backInOut'` | Anticipates $\to$ shoots $\to$ overshoots $\to$ settles | Hero character transitions |
| `'elastic'` / `'elasticOut'` | Spring-damper ringing oscillation | Rubber-band drops, jelly bounces |
| `'bounce'` / `'bounceOut'` | Decay bounce against floor | Falling balls, physical collisions |

*Custom curves*: In addition to string keywords, `tween()` accepts a custom JavaScript unary function: `(p) => p * p * (3 - 2 * p)`.

---

## 3. The Bounded Lifespan Contract & Hybrid Drivers

A fundamental architectural distinction separates **finite lifecycle boundaries** from **continuous signal modulators**.

### The Rule: "The Outermost Wrapper Governs the Lifespan"

```
┌────────────────────────────────────────────────────────┐
│  INSIDE tween(...)   →  Finite Lifespan               │
│                         Freezes & completes at t_end.  │
│                         Allows layer to SLEEP (0% CPU).│
├────────────────────────────────────────────────────────┤
│  OUTSIDE tween(...)  →  Infinite Lifespan              │
│                         Runs forever at 60 FPS.        │
│                         Keeps layer AWAKE.             │
└────────────────────────────────────────────────────────┘
```

### 3.1 Inside `tween()`: Finite Transitions & Damped Settling
Any driver placed inside `tween(...)` is subject to the tween's duration boundary. Once $t \ge t_{\text{start}} + \text{duration} + \text{delay}$, the animation ceases, the final value is locked, and the layer can sleep:

```html
<!-- Damped impact shake: shakes at +-20px, decays to 0, then STOPS and SLEEPS -->
<pxl-rect dx="tween(wave(0.1) * 20, 0, 1.2, 'out')" width="100" height="100" />
```
* Once 1.2 seconds elapse, `to = 0` is locked. The wave inside expires. The layer enters quiescence.

### 3.2 Outside `tween()`: Unbounded Envelopes & Harmonic Overlays
When continuous motion is intended to persist indefinitely after an intro transition, the infinite driver is placed **outside** the `tween()`:

* **Additive Overlay** (Continuous wave around an animated anchor):
  ```html
  <!-- Moves from 0 to 500 over 2s, but wobbles continuously forever -->
  <pxl-circle x="tween(0, 500, 2) + wave(2) * 30" radius="25" />
  ```
  *The tween finishes at 500, but `wave(2) * 30` is outside, keeping the layer awake and oscillating indefinitely.*

* **Multiplicative Envelope** (Spins up wave amplitude from 0% to 100%):
  ```html
  <!-- Ramps wave amplitude from 0 to 50 over 2s, then oscillates forever -->
  <pxl-circle x="tween(0, 1, 2) * (wave(2) * 50)" radius="25" />
  ```
  *`tween(0, 1, 2)` acts as an amplitude attack envelope. Once complete, it stays locked at `1.0`, and `1.0 * (wave(2) * 50)` continues running at 60 FPS.*

---

## 4. Edge Cases & Engineering Solutions

### Case 1: Late Mount & SPA Dynamic Elements
* **Problem**: In web applications, elements are added dynamically minutes after the page loaded. Global time $t = \text{performance.now()} / 1000$ could be at `125.4s`. If a tween compared against $t = 0$, the tween would be finished before the element even connected to the DOM.
* **Solution**: The compiled expression closure captures `_startTime = null` on initial compilation. On the very first frame the element evaluates, it records `if (_startTime === null) _startTime = t;`. This anchors the origin $t_0$ precisely to the element's first visible tick.

### Case 2: Overshoot Easing (`back`, `elastic`)
* **Problem**: Clamping progress $\tau = \text{clamp}(elapsed / duration, 0, 1)$ prevents values $< 0$ or $> 1$. However, `'back'` easing exceeds $1.0$ (e.g. $1.15$), and `'elastic'` oscillates between $-0.2$ and $1.2$.
* **Solution**: Time ratio $\tau$ is clamped to $[0, 1]$, but the easing output $E(\tau)$ is **not** clamped. Only after $elapsed \ge duration$ is the final target `to` locked.

### Case 3: Zero or Negative Duration
* **Problem**: User passes `duration = 0` or negative values. Division by zero yields `NaN` or `Infinity`.
* **Solution**: Guard check: `if (duration <= 0) return to;`.

### Case 4: Pre-Start Delay
* **Problem**: When `delay > 0`, $elapsed = t - t_{\text{start}} - delay < 0$.
* **Solution**: `if (elapsed <= 0) return from;`. The starting value is returned statically with zero interpolation overhead until the delay passes.

### Case 5: Final Value Precision & Freeze Lock
* **Problem**: Due to floating-point imprecision in variable frame rates (16.666ms), the final frame might evaluate at $elapsed = 1.498$ or $1.502$. If `to` is a dynamic calculation, evaluating it past duration might cause jitter.
* **Solution**: When $elapsed \ge duration$, the tween captures `_finalValue = to`, sets `_isComplete = true`, and returns `_finalValue` permanently on all subsequent frames.

### Case 6: Custom Easing Callbacks vs Named Curves
* **Problem**: Users may pass a string `'back'` or a lambda `(p) => Math.pow(p, 4)`.
* **Solution**: The easing resolver checks:
  ```javascript
  const easeFn = typeof ease === 'function' ? ease : (pxl.easings[ease] || pxl.easings.ease);
  ```

### Case 7: Multiple Tweens in a Single Expression
* **Problem**: An expression like `tween(0, 100, 1) + tween(0, 50, 2)` contains two distinct timelines.
* **Solution**: Expression compiler assigns separate closure states (`_tweenState[0]`, `_tweenState[1]`) so each tween instance tracks its own `_startTime`, `_isComplete`, and `_finalValue` independently.

### Case 8: Reactive Retriggering
* **Problem**: When a reactive variable changes (e.g. `<pxl-circle x="tween(0, ref.state.targetX, 1.0)" />`), the tween must restart its trajectory to the new destination.
* **Solution**: In [`variableChangedCallback`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js#L78), whenever an expression depends on the mutated variable, its internal `_startTime` is reset to `null` and `_isComplete = false`. On the next render frame, it automatically captures the new starting time and animates smoothly to the new value.

---

## 5. Quiescence & Layer Auto-Sleep Engine

Currently, [`PxlNode.evaluateAnimations`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js#L88) sets `this.isAnimated = true` for any attribute using a time driver, causing [`Layer.render`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js#L152) to invoke [`stage.requestRender()`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/stage.js#L152) on every single frame indefinitely.

### 5.1 Driver Classification in Compiler

In [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js), we classify expressions into:
1. **Infinite Drivers**: Expressions containing `wave()`, `loop()`, `yoyo()`, `bounce()`, `strobe()`, `glide()`, `pulse()`, `glitch()`, `time()`, or direct `t`.
2. **Finite Drivers**: Expressions containing ONLY `tween()` and no uncontained infinite drivers.

```javascript
const infiniteDrivers = 'loop|yoyo|wave|bounce|strobe|glide|pulse|glitch|time';
pxl.infiniteDriverRegex = new RegExp(`(^|[^.])\\bt\\b|\\b(${infiniteDrivers})\\s*\\(`);
pxl.finiteDriverRegex   = /\btween\s*\(/;
```

### 5.2 Quiescence State Machine

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

### 5.3 Layer-Level Sleep Check

In [`Layer.render(u, t)`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js#L73):
```javascript
// Check if any element on this layer is actively demanding render frames
let layerNeedsAnimation = false;
for (let i = 0; i < this.childList.length; i++) {
  if (this.childList[i].isActivelyAnimating) {
    layerNeedsAnimation = true;
    break;
  }
}

// Only request next frame if an infinite driver exists or a tween is still in-flight
if (layerNeedsAnimation) {
  this.stage?.requestRender();
}
```

When all tweens settle, `layerNeedsAnimation` becomes `false`, the layer skips `requestRender()`, and the stage goes completely silent until an event or variable mutation occurs.

---

## 6. Implementation Specification

### 6.1 `pxl.easings` Library (in `js/compiler.js`)

```javascript
pxl.easings = {
  linear: (t) => t,
  ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  backIn: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
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
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
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

### 6.2 The `_createTweenInstance` Factory (in `js/compiler.js`)

Each compiled animation function receives a private state slot array `_tw` for zero-GC state isolation:

```javascript
function _createTween(slots, index) {
  let s = slots[index];
  if (!s) {
    s = slots[index] = { t0: null, done: false, val: null };
  }
  return function(a, b, c, d, e) {
    let from, to, duration, ease, delay;
    if (typeof b === 'number' && (typeof c === 'number' || typeof c === 'undefined')) {
      // Overload 1: tween(from, to, duration, [ease], [delay])
      from = a; to = b; duration = c; ease = d; delay = e || 0;
    } else {
      // Overload 2: tween(duration, [ease], [delay])
      from = 0; to = 1; duration = a; ease = b; delay = c || 0;
    }

    if (duration <= 0) return to;
    if (s.t0 === null) s.t0 = t;

    const elapsed = t - s.t0 - delay;
    if (elapsed <= 0) return from;

    if (elapsed >= duration) {
      if (!s.done) {
        s.done = true;
        s.val = to;
      }
      return s.val;
    }

    const progress = elapsed / duration;
    const easeFn = typeof ease === 'function' ? ease : (pxl.easings[ease] || pxl.easings.ease);
    return from + (to - from) * easeFn(progress);
  };
}
```

---

## 7. Verification & Testing Plan

### 7.1 Automated Unit Tests
* **Late-Mounting Accuracy**: Mount element with `tween(0, 100, 1)` at $t = 10.0$. Verify value at $t = 10.5$ is $\approx 50$ (or eased equivalent), not $100$.
* **Overshoot Precision**: Test `'back'` and `'elastic'` output exceeding $1.0$ during interval, but resolving strictly to `to` at completion.
* **Duration = 0 Guard**: Verify instant return of `to` with zero errors.
* **Overload Equivalence**: Verify `tween(0, 100, 1)` produces identical values to `tween(1) * 100`.

### 7.2 Quiescence & CPU Verification
* Create test harness with `<pxl-layer>` containing one `<pxl-circle x="tween(0, 400, 1.0)" />`.
* Monitor stage rAF ticks.
* **Expected Outcome**: At $t = 1.0\text{s} + 1\text{ frame}$, stage render requests drop to zero. Browser CPU consumption drops to 0%.
* Trigger reactive mutation `ref.circle.x = 200`. Verify stage wakes up, renders transition, and goes back to sleep.

---

## 8. Summary & Next Steps

This plan establishes `tween()` as a first-class, bulletproof animation primitive in Kilopixel:
* **Single function** with intuitive signature overloads.
* **Zero-GC closure isolation** for reliable late-mounting and retriggering.
* **Clear separation of lifespans** (inside = finite/freeze, outside = infinite/modulation).
* **Automatic layer quiescence** (0% CPU on completion).

Upon approval, implementation will proceed systematically through [`js/compiler.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/compiler.js), [`js/elements/node.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/node.js), and [`js/elements/layer.js`](file:///c:/Users/micha/woodoo-labs/kilopixel/js/elements/layer.js), followed by `node build.js` verification.
