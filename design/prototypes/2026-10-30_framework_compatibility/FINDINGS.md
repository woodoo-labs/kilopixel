# Kilopixel in React 19 and Vue 3.5 (2026-10-30)

Pages: `react.html` (React 19.1 + htm from esm.sh), `vue.html` (Vue 3.5.13 global build, `isCustomElement` for `pxl-*`), `vue_debug.html` (`vue.html` plus a log of `pxl.Stage` lifecycle calls, for the sizing problem).
Each page renders two instances of a component with a stage, a sun, an orbiting moon and a click counter.

| Scenario | React 19 | Vue 3.5 |
|---|---|---|
| Elements upgrade, stages size and animate | ✅ | ✅ |
| Two instances, unique ids from `useId()` (`:r0:` / `v-0` stripped to `pr0` / `pv0`) | ✅ isolated | ✅ isolated |
| Numeric binding (`r={r}` / `:r="r"`) | ✅ | ✅ |
| Expression binding that changes per render (`x="220 + sin(t / 400) * 20"`) | ✅ draws, but every new string is compiled and cached: `pxl.animationCache` 4 → 74 after 71 slider steps | ✅ same, 4 → 74 |
| `undefined` removes the attribute → default (`zoom` back to 1) | ✅ | ✅ |
| Unmount / remount (`showMoon`) | ✅ removed from `pxl.nodes`, re-registered | ✅ |
| Kilopixel `onclick="…"` string | ❌ dropped: no attribute, `element.onclick` is React's noop; workaround: set it in a ref callback (`el?.setAttribute('onclick', …)`), verified | ✅ set as attribute, clicks counted |
| Framework click handler on a shape (`onClick` / `@click`) | ❌ never fires: the browser event targets the layer canvas, not `<pxl-circle>` | ❌ same |
| Kilopixel hover (`ref.<id>.isHovered`) | ✅ | ✅ |
| Reading engine state from the framework (`pxl.nodes[id]`) | ✅ on demand; no push into framework state | ✅ same |

Test-environment notes (not framework issues):
- A hidden browser pane stops ResizeObserver and rAF: stages stay unsized (`unit` 0). The first Vue run failed for this reason.
- Real clicks in an emulated (scaled) viewport landed at wrong coordinates; synthetic pointer events with exact client coordinates were used.

Possible engine follow-ups:
1. Dispatch DOM events (`click`, `pointerenter`, `pointerleave`, …) on shape elements when Kilopixel's hit test finds them. Then React `onClick` and Vue `@click` work natively, and React's dropped `onclick` string matters less.
2. Bound the expression caches (or don't cache strings compiled at runtime after the first frame), so frameworks that rebuild expression strings per render don't grow memory without limit.
3. Docs page "Using Kilopixel with React / Vue": `isCustomElement`, unique ids, prefer numbers or `<pxl-var>` over rebuilt expression strings, the React `onclick` workaround.
