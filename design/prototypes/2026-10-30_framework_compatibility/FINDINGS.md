# Kilopixel in React 19 and Vue 3.5 (2026-10-30)

Pages: `react.html` (React 19.1 + htm from esm.sh), `vue.html` (Vue 3.5.13 global build, `isCustomElement` for `pxl-*`), `vue_debug.html` (`vue.html` plus a log of `pxl.Stage` lifecycle calls, for the sizing problem).
Each page renders two instances of a component with a stage, a sun, an orbiting moon and a click counter.
These pages use the API from before W1 (`onclick` strings, no DOM events on shapes), so they no longer work as described here; they stay as history. The current framework pages are in `tests/smoke/` (second part below).

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

# Smoke Pages After W1 and W3 (2026-11-19)

Pages (moved on the same day to `tests/smoke/`: `react.html`, `vue.html`, `tailwind.html`, with `checks.js`; run with `node tools/run_tests.js --smoke`): `smoke_react.html` (React 19.1.0 + htm 3.1.1 from esm.sh), `smoke_vue.html` (Vue 3.5.13, the ES module build with the template compiler, from jsDelivr), `smoke_tailwind.html` (Tailwind CSS 4.1.7, the browser build, plain HTML), all loading Kilopixel as a script tag (`/dist/pxl.min.js`) and no build step. React and Vue render the same scene and run the same checks from `smoke_checks.js` (`window.runSceneChecks()`); the Tailwind page has its own (`window.runTailwindChecks()`). Plan: `design/2026-10-30_framework_compatibility_plan.md` §25.

| Scenario | React 19 | Vue 3.5 |
|---|---|---|
| Two instances, unique ids from `useId()` | ✅ | ✅ |
| Number prop is a property (`r={r}` / `:r="r"`), no attribute written | ✅ | ✅ |
| `ratio={2}`, `alwaysrender={true}` on the stage | ✅ | ✅ |
| Array prop (`linedash`), points as pairs from state | ✅ | ✅ |
| `text={"alert(1)"}` is text, not run | ✅ | ✅ |
| Expression string props animate (`x="300 + cos(t * 1.5) * 140"`) | ✅ | ✅ |
| 120 color changes through state (`hsl(…, 70%, 55%)`) | ✅ nothing compiled | ✅ |
| `onClick` / `@click` on a shape: once, `event.target` is the shape; the card around gets one click | ✅ | ✅ |
| `stopPropagation()` / `@click.stop` keeps the click from the card | ✅ | ✅ |
| Enter / leave on a group, from empty space and from another shape; over its label | ✅ (since `660b6d5`, see below) | ✅ |
| `style={{ cursor }}` / `:style` on a group | ✅ | ✅ |
| Click on a group's rect | ✅ | ✅ |
| Click on empty space reaches the card as the browser sent it | ✅ | ✅ |
| Unmount / mount | ✅ | ✅ |
| Scripted checks | 21/21 | 21/21 |
| Real mouse in the browser pane (hover the button from empty space, over its label, out; click the button and a shape) | ✅ | ✅ |
| Console | clean | clean |

Tailwind 4.1.7 (11/11, real mouse checked for the cursors and the click through a decoration):
- `w-1/2` on a stage beats its default `width: 100%`; the ratio holds; the canvas fills the stage inside its border (`border` class with the base styles' `box-sizing: border-box`).
- `pointer-events-none` on a decoration: the click reaches the group below; on a layer, with `pointer-events-auto` on one shape in it.
- `cursor-pointer` on a group shows the hand; `cursor-default` beats the hand a click handler gets from the default styles; a class switched while the pointer rests on the shape shows in the next hit test.
- `hidden` and `invisible` on layers: not shown, not hit.
- Known limit, as documented: `hover:` variants never match a shape.
- The only console message is Tailwind's own: its browser build is not meant for production.

Found and fixed:
- **React's `onPointerEnter` never fired when the pointer came from empty space** (found with the real mouse; the scripted checks had reached the group from another shape). React builds enter / leave only from `pointerout` and ignores a `pointerover` whose `relatedTarget` is an element it rendered. Fixed in `660b6d5`: the layer gets `pointerout` / `pointerover` when the pointer moves between empty space and a shape (plan §23.8).

Not a bug, but easy to trip over: a shape drawn later takes the pointer where it overlaps, also a thin line. The initial chart line has a corner exactly at the sun's center, so a click there goes to the chart, as it would in the DOM.

Test-environment notes:
- In a hidden browser pane `setTimeout` is throttled to about once per second; `checks.js` waits for renders with `MessageChannel` tasks instead. A hidden pane also leaves stages unsized for real mouse input; the scripted checks size the stage themselves.

Not covered yet: Angular (needs a build; planned as an npm app outside the CDN pages, plan §25), Preact, Lit, Solid, Svelte, Alpine, htmx.
