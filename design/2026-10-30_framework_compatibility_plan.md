# Framework Compatibility: Kilopixel as a Well-Behaved Custom Element

- **Status**: 🟡 **Proposed** (2026-11-19, typings built, §27.2; `docs/frameworks.html` built, §26.4; state and next steps §26 (§3 updated); smoke pages for React, Vue and Tailwind built, §25 (in `tests/smoke/`); W3 built: properties for every attribute, §24; W1 built: step 3 (DOM events on shapes and groups, handlers as listeners, mouse events, cursor on the canvases, layer `pointer-events` fix) §23.8; 2026-11-18, W1 build plan decided, §23, step 1 (handler rename) built, §23.5, step 2 (every shape hit-tested) built, §23.7: three steps, E1–E10, E1 changes D5 (no listener counts, the cursor only CSS), E10 adds handlers and hover / press states to groups, React / Vue / Tailwind expectations and known limits §23.6, E2 settles §22.5 (hit walk over the layer tree); 2026-11-17, DOM-like event model decided, §22: every shape gets events, no `interactive`, D5, D10, D11 decided; `process()` moved to the start of the frame, §4.1 and §15; steps 1–2 of §19.4 built: quick fixes §20, conformance tests `tests/frameworks.html` §21; D1, D4, D6, D7 decided; W2 built with the stage sizing plan; steps 5–6 of §19.4 not built)
- **Date**: 2026-10-30
- **Related**: `design/prototypes/2026-10-30_framework_compatibility/review_checks.html` (review §19); `design/prototypes/2026-10-30_framework_compatibility/d4_clicks.html` (D4); the React 19 and Vue 3.5 prototypes `react.html`, `vue.html`, `vue_debug.html` with `FINDINGS.md` in the same folder, `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A: removed attributes fall back to defaults, already written with frameworks in mind), `design/archive/2026-10-15_interactive_state_auto_registration_plan.md` (which shapes are hit-tested), `design/archive/events_implementation_plan.md` (the current `on*` handlers), `design/2026-11-07_safe_shape_render_plan.md`, `design/2026-10-30_space_attribute_plan.md`, `design/2026-11-04_stage_sizing_plan.md` (builds W2)
- **Target Implementation**: `js/interaction.js`, `js/elements/shape.js`, `js/elements/node.js`, `js/elements/layer.js`, `js/elements/stage.js`, `js/elements/variable.js`, `js/compiler.js`, `js/engine.js`; a new test page `tests/frameworks.html`; docs and examples that use `on*` handlers

---

## 1. Goal and Principle

Kilopixel should work in **any** framework (React, Preact, Vue, Svelte, Solid, Angular, Lit, Alpine, htmx, server templates) without framework-specific code in the engine.

**Principle: target the DOM contract, not the frameworks.** Whatever their syntax, frameworks do a small set of things to an element: create it, set attributes or properties, add listeners, insert, move and remove it, and sometimes manage its `style` and children. If Kilopixel behaves correctly for each of these operations, every framework works, because frameworks only use these operations. This is the approach of the "Custom Elements Everywhere" test suite, which scores frameworks on exactly these operations; current versions of React, Preact, Vue, Svelte, Angular, Solid and Lit pass it. The remaining gaps are on Kilopixel's side.

**Non-goals:**

- No adapters or wrapper components in the engine (`@kilopixel/react` etc.). Thin optional packages may come later, outside the core, if the DOM contract proves insufficient for a framework.
- No change to the declarative, no-JavaScript usage. Plain HTML pages stay the primary use case; everything here must keep them working or make them better.
- No virtual-DOM-style diffing inside Kilopixel.

## 2. The DOM Contract: What Frameworks Do to an Element

| # | Operation | Who does it | What Kilopixel must do |
|---|---|---|---|
| C1 | Create the element detached, set attributes / properties, append children, then insert the whole subtree | all (React, Vue, Svelte, Solid, Lit templates) | initialize from attributes set before connect; connect children in any order |
| C2 | Set attributes **after** insertion | Angular (bindings after the first change detection), Alpine, htmx swaps, any framework on update | react to every attribute change after connect, **including `id`** |
| C3 | Set **properties** instead of attributes | React 19 and Vue (when `name in element`), Preact (same rule), Svelte 5, Angular `[x]`, Lit `.x`, Solid `prop:x` | accept properties for the public attributes; never break when a property is set before the element is upgraded |
| C4 | Remove an attribute (value `null` / `undefined` / `false`) | all | fall back to the default (done: Rule A) |
| C5 | Listen to events, **directly** (`addEventListener` on the element) | Vue `@click`, Lit `@click`, Angular `(click)`, Solid `on:click`, Alpine `@click` | dispatch real DOM events on the element |
| C6 | Listen to events by **delegation** (one listener at the root, events must bubble) | React (`onClick`), Svelte 5 (`onclick`), Solid (`onClick`) | dispatched events must bubble (and be `composed` for shadow roots) |
| C7 | Treat `on*` names specially | React (drops string `onclick` on custom elements), Vue (`on` + uppercase = listener), Svelte 5 / Solid (`onclick` = listener) | public attribute names must not start with `on` |
| C8 | Move a node: disconnect and connect in the same task | keyed list reordering in all frameworks | survive disconnect + connect without losing state or registrations |
| C9 | Reconcile children: keep, move or remove the child nodes the framework rendered | all virtual-DOM / fine-grained frameworks | don't insert own nodes into children the framework manages |
| C10 | Manage `style` and `class` on the element | all (`style={…}`, `:style`, `[style.x]`, `class`) | don't depend on inline styles that the framework may overwrite |
| C11 | Hydrate server-rendered HTML | Next.js, Nuxt, SvelteKit, Angular SSR, Astro | the server HTML (plain tags) must match the client DOM; no extra nodes the framework doesn't expect |
| C12 | Render component content inside the component's **own shadow root** | Lit, Stencil, Angular `ShadowDom` encapsulation, framework-built web components | either work across shadow boundaries or say clearly that the Kilopixel tree must be in light DOM |
| C13 | Reuse a component many times on one page | all | ids / names must not collide between instances |
| C14 | Re-render often (every state change) | all | repeated identical values are free; changing values must not leak memory |
| C15 | Load the library after the markup, or define elements late (code splitting) | all bundlers, `<script defer>`, `type="module"` | upgrade correctly; values set before the upgrade must not be lost |
| C16 | Install and import the library: `npm install`, `import 'kilopixel'`, evaluated on the server during SSR, sometimes twice (a script tag plus an import, micro-frontends, Storybook) | all bundler-based setups; Next.js, Nuxt, SvelteKit, Astro, Angular SSR | an import entry point; importing on the server does nothing; a second copy doesn't break the first; typings for TypeScript projects (added 2026-11-15, §19) |
| C17 | Render content as children (`<pxl-text>{label}</pxl-text>`) | JSX, Vue / Svelte templates | children of shapes must not show up as page content (added 2026-11-15, §19) |

## 3. Current State (Audit 2026-10-30)

**State column updated 2026-11-19** (the dated entries); the Detail column keeps the audit of 2026-10-30. Overall assessment: §26.

From the React 19 / Vue 3.5 prototypes (`design/prototypes/2026-10-30_framework_compatibility/FINDINGS.md`) and the code:

| # | State | Detail |
|---|---|---|
| C1 | ✅ | both prototypes: elements upgrade, stages size and animate (with the browser pane visible) |
| C2 | ✅ (2026-11-16, §20) | before: attributes after connect worked, **except `id`**: `id` isn't an observed attribute, so an `id` set or changed after connect is never registered in `pxl.nodes` (`node.js` `connectedCallback` reads it once). Measured 2026-11-15 (§19.1): a renamed element also keeps its **old** entry in `pxl.nodes` after it is removed (`disconnectedCallback()` deletes only the current id), so readers of the old id keep reading a removed element |
| C3 | ✅ (2026-11-19, §24) | no properties: `el.r = 50` creates a plain JS property and changes nothing. React / Vue only worked because `r` isn't a property of `HTMLElement` and they fell back to attributes. Collisions with `HTMLElement` (checked in the browser over all 82 observed attribute names): `hidden` (harmless, it reflects to the attribute) and `onclick` (see C7) |
| C4 | ✅ | Rule A; verified (`zoom={undefined}` → attribute removed → `1`) |
| C5 | ✅ (2026-11-19, W1, §23.5–§23.8; React and Vue verified, §25) | Kilopixel dispatches no DOM events; `@click` never fires (the browser's click targets the layer canvas, which isn't inside `<pxl-circle>`) |
| C6 | ✅ (2026-11-19, W1, §23.8; React's delegated `onClick` and `onPointerEnter` verified, §25) | same; React `onClick` never fires |
| C7 | ✅ (2026-11-18, `pxl-on-*`, §23.5) | `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove` are the declarative handlers. `onclick` is also a **native event handler content attribute**: the browser compiles it as global JavaScript on every HTML element. React 19 drops it (no attribute; `element.onclick` is React's noop). Vue keeps it (string `on*` values on native handler names stay attributes). Svelte 5 / Solid treat `onclick` as a listener prop (not verified here) |
| C8 | ✅ (tested 2026-11-17, §21) | `disconnectedCallback` unregisters, `connectedCallback` re-registers; unmount / remount verified in both prototypes |
| C9 | ✅ (2026-11-15, W2: the canvas in the layer's shadow root) | each `<pxl-layer>` appends its `<canvas>` as a light-DOM child (`layer.js` `connectedCallback`). Frameworks keep nodes they didn't create in client rendering, but full child replacement (`innerHTML`, htmx swaps of a layer's content) removes it, and hydration sees an unexpected node. Confirmed 2026-11-05 (`scratch/gradient_stops/thin_shapes.html` (not kept), first version): after `layer.innerHTML = …` the engine keeps drawing into the removed canvas, so the new shapes are invisible and nothing is logged. A real case: `examples/test13.html` filled its layer with `innerHTML` and showed nothing since 2026-11-03 (the engine script moved into the head, so the canvas existed before the page script ran); fixed in the example with `insertAdjacentHTML()` on 2026-11-13 |
| C10 | ✅ (2026-11-15, W2: default styles in a stylesheet; only the stage's `aspect-ratio` is inline, D7) | inline styles written by the engine: stage (`display`, `position`, `width`, `aspect-ratio`), layer (`display`, `position`, `inset`), var (`display: none`), stage `cursor`. A framework binding `style` can overwrite them (Vue `:style` and React `style` set individual properties, Angular `[style]` and Lit `style=${…}` can replace the whole attribute) |
| C11 | ✅ (2026-11-15, W2; T-H1 compares the markup; not tried with a real server-rendering setup, §26) | server HTML has no canvases; the client adds them inside `<pxl-layer>` (C9) → hydration mismatch warnings in React / Vue |
| C12 | ✅ / ⚠️ (2026-11-17: a whole stage in a component's shadow root works, §21; a tree split across shadow roots doesn't, W6 on demand) | parents are found with `closest('pxl-layer')`, `parentElement.closest('pxl-group, pxl-layer')`, `closest('pxl-stage')`: they stop at a shadow root. Slotted children are fine (they stay in the light tree of the host) |
| C13 | ⚠️ (2026-11-19: unchanged, D2 open, §26) | `pxl.nodes` is one flat registry per document. Each instance needs unique ids; `useId()` values (React `:r0:`, Vue `v-0`) aren't valid in `ref.<id>` and must be cleaned (`'p' + id.replace(/[^a-zA-Z0-9]/g, '')`) |
| C14 | ✅ / ⚠️ (2026-11-19: numbers, colors, `text` and points cost no compiling, §24; caches bounded, §20; expression strings rebuilt per render still compile) | identical values are skipped (`oldValue === newValue`); numbers aren't compiled. But every distinct **expression** string is compiled and cached forever (`pxl.animationCache` / `pxl.staticCache`): 71 slider steps of a rebuilt `x="${base} + sin(t / 400) * 20"` grew `animationCache` from 4 to 74 entries |
| C15 | ✅ (2026-11-19, §24) | upgrading after the markup works (attributes are read on upgrade). Properties set before the upgrade would shadow future accessors (only relevant once C3 exists) |
| C16 | ⚠️ (guard built 2026-11-16, §20; typings built as downloads 2026-11-19, §27; the npm package later with publishing, §26) | (2026-11-15, §19.1) no npm package and no import entry point; the bundle starts with `window.pxl = …` and extends `HTMLElement`, so importing it on a server throws; a second copy replaces `window.pxl`, empties the registry and throws `TypeError`s on the elements of the first copy; no typings |
| C17 | ✅ (2026-11-16, §20) | (2026-11-15, §19.1) a shape's children are slotted into the layer's shadow root (D6) and render as visible HTML text above the canvas |

Test-environment notes from the prototypes (not framework problems): a hidden browser pane stops `ResizeObserver` and `requestAnimationFrame`, so stages stay unsized; real clicks in a scaled (emulated) viewport land at wrong coordinates. The conformance tests (§11) must dispatch synthetic events with exact coordinates and must not depend on the pane being visible where possible.

## 4. Workstream W1: Events (C5, C6, C7)

The most important workstream: today no framework can react to clicks on shapes with its own syntax, and the declarative `onclick` collides with the platform.

### 4.1 Dispatch Real DOM Events on Shapes

After the hit test in `InteractionEngine.process()`, Kilopixel dispatches DOM events on the shape elements, mirroring the native pointer model:

| Kilopixel moment (today's handler) | DOM events dispatched on the shape | Bubbles | Notes |
|---|---|---|---|
| pointer enters a shape (`enter`) | `pointerover`, then `pointerenter` | `pointerover` yes, `pointerenter` no | like native: `*enter` / `*leave` don't bubble, `*over` / `*out` do; React builds `onPointerEnter` from `pointerover` / `pointerout` |
| pointer leaves a shape (`leave`) | `pointerout`, then `pointerleave` | `pointerout` yes, `pointerleave` no | |
| pointer moves over a shape (`move`) | `pointermove` | yes | only while over a shape |
| press (`down`) | `pointerdown` | yes | |
| release (`up`) | `pointerup` | yes | |
| click (`click`) | `click` | yes | |

- **Event objects**: `new PointerEvent(type, init)` / `new MouseEvent('click', init)` with `clientX`, `clientY`, `screenX`, `screenY`, `button`, `buttons`, `pointerId`, `pointerType`, `isPrimary`, `ctrlKey`, `shiftKey`, `altKey`, `metaKey` copied from the native event that the stage received (stored in `handleEvent`). `bubbles` as in the table, `composed: true` (so listeners outside a shadow root see it, C12), `cancelable: true` for `pointerdown` / `click`.
- **Logical coordinates**: users read `ref.<stage>.mouseX` / `mouseY` (already there). Optionally the event could carry them; a plain `PointerEvent` has no free field, and adding own properties to native event objects is fragile across frameworks that wrap events (React's synthetic events copy only known fields). Decision §13 D3: no extra fields; document `ref.<stage>.mouseX`, or `stage.attributeValues.mouseX` in JS.
- **`event.target`** is the shape element, so delegated framework handlers (React, Svelte 5, Solid) find the right component, and `event.currentTarget` works for direct listeners.
- **Order**: the declarative handler (§4.3) runs first, then the DOM event; both after the state broadcast (`isHovered` / `isPressed` already updated), like today.
- **When**: `click`, `pointerdown` and `pointerup` are hit-tested and dispatched **when the browser's event arrives** (D4, below). The other events (`pointerover` / `pointerenter` / `pointerout` / `pointerleave` / `pointermove`) come from `process()`, which runs at the start of `Stage.render()`, before the update phase (since 2026-11-17, `design/2026-11-17_pointer_frame_order_plan.md`; before, it ran after all layers drew and its effects showed one frame late). Dispatching there runs user code synchronously inside the frame. Frameworks schedule their re-render (React / Vue / Svelte batch), but a direct listener may call `setAttribute` synchronously; that invalidates layers before the update phase, so the change is drawn in the same frame. To keep `process()` simple, events are collected during `process()` in a small preallocated queue and dispatched at its end.
- **One event per user action (D4, decided 2026-11-10)**: the browser's own `click` targets the layer canvas and bubbles up through the stage. If Kilopixel only added its own `click` on the shape, handlers on the stage or above would run **twice** for one click. Today the engine stores a click and hit-tests it in the next frame, so when the browser's click passes the stage, Kilopixel doesn't know yet whether a shape was hit. Decision: for `click`, `pointerdown` and `pointerup`, the stage hit-tests **when the browser's event arrives** (a capture listener on the stage, positions from the last frame). Over a shape, it stops the browser's event (`stopPropagation()`) and dispatches Kilopixel's event on the shape right away; over empty space, the browser's event passes unchanged. Every framework then sees exactly one event per action, with the shape as `target`, and `stopPropagation()` in a shape handler protects the parents as usual. `pointermove` keeps both events (many per second, also over empty space; stage-level move listeners usually want the native coordinates); documented.
  - **Prototype** (`design/prototypes/2026-10-30_framework_compatibility/d4_clicks.html`, 2026-11-10, React 19 and Vue 3.5, a shim in place of the engine): with both events (option a), a card around the stage that toggles on click received **two** clicks per circle click (the toggle cancelled itself), and a circle handler's `stopPropagation()` didn't stop the card from toggling, because the browser's click had passed one frame earlier. With option (b) every case was correct in both frameworks: one card call, `stopPropagation()` respected, background clicks unchanged.
  - **Cost**: one hit test per click / press / release (rare compared to moves). The test uses the matrices of the last drawn frame, at most one frame old.

### 4.2 Which Shapes Are Hit-Tested

**Decided 2026-11-17 (§22, D10):** every shape is hit-tested, with a bounding-box pre-check (measured: 5–25× faster than testing every path); the registration below and `interactive` are not needed for testing. This section is the model before that decision.

Today only shapes with a declarative handler, or whose `isHovered` / `isPressed` someone reads, are hit-tested (`_interactiveElements`, auto-registration plan). A framework listener must also register the shape. Two ways in, both needed:

1. **Direct listeners**: `pxl.Shape` overrides `addEventListener` / `removeEventListener`. For the pointer types in §4.1 and `click`, it counts listeners per element (a small integer field) and registers / releases the shape like `hasEventHandlers()` does today. Covers Vue, Lit, Angular, Solid `on:`, Alpine, plain JS.
2. **Delegated listeners** (React `onClick`, Svelte 5 `onclick`, Solid `onClick`): the framework never calls `addEventListener` on the shape, so Kilopixel can't see them. New boolean attribute **`interactive`**: the shape is always hit-tested and emits events. Documented as "add `interactive` when your framework delegates events (React, Svelte, Solid)".

   Alternative considered: hit-test every shape whenever any delegated framework might be present. Rejected: hit testing runs a path per registered shape per pointer move; scenes with thousands of shapes would pay for it.

`interactive` also helps plain pages that use `addEventListener` on the stage and read `event.target`.

### 4.3 Rename the Declarative Handlers

Once a real `click` is dispatched on the shape, the browser runs the shape's native `onclick` content attribute as global JavaScript, where `ref` doesn't exist (ReferenceError). Together with C7 (frameworks treat `on*` specially), the declarative handlers need names that:

- don't start with `on` (React, Vue, Svelte, Solid rules),
- aren't a property or method of `HTMLElement` (React 19 / Vue / Preact would set a property instead of the attribute; e.g. `click` is the method `HTMLElement.click()`),
- contain a hyphen (frameworks pass hyphenated names to custom elements as attributes; HTML defines no hyphenated attributes except `data-*` / `aria-*`).

Candidates (§13 D1):

| Name | Reads | Checks |
|---|---|---|
| **`pxl-on-click`, `pxl-on-enter`, `pxl-on-leave`, `pxl-on-down`, `pxl-on-up`, `pxl-on-move`** | "Kilopixel: on click" | all three rules ✓; reads as an event, can't be mistaken for a tag; like Datastar `data-on-click` / htmx `hx-on-click` |
| `pxl-click`, `pxl-enter`, … | "Kilopixel's click" | all three rules ✓, but `pxl-enter` reads like a tag name (`<pxl-enter>`) and nothing says "event" |
| `pxl-onclick`, `pxl-onenter`, … | "on enter" | ✓; close to `onclick`, but `onenter`, `onleave`, `ondown` blur together |
| `pxl-on:click`, … | like Alpine `x-on:click` | ❌ React's JSX doesn't accept a colon in attribute names |
| `do-click`, `do-enter`, … | "do on click" | ✓ |
| `on-click`, … | familiar | ❌ Vue treats `on` + non-lowercase character as a listener (`on-click` → event `-click`) |
| `click`, `enter`, … | short | ❌ `click` is `HTMLElement.click()` |
| `action`, … | only one event | ❌ doesn't scale to six events |

**Decided 2026-11-09: `pxl-on-click`, `pxl-on-enter`, `pxl-on-leave`, `pxl-on-down`, `pxl-on-up`, `pxl-on-move`.** They are the only prefixed Kilopixel attributes, on purpose: every other attribute is safe without a prefix, only the handlers must stay clear of `on…`.

**Handlers stay attribute-only:** no JavaScript property (no `pxlOnEnter`), no accessor (§6.1), not readable through `ref.*` (they are compiled into `this.handlers`, not stored in `attributeValues`). The hyphens are therefore harmless, unlike `stroke-width` for a drawing value: nothing reads a handler in dot notation, and React / Vue set the attribute because no matching property exists. Frameworks use their own event syntax instead (§4.1).

Implementation: `pxl.Shape.HANDLER_EVENTS` keys change; `observedAttributes` change; the `on*` names are removed (pre-release, no compatibility). A compile-time warning for the old names would help migration: if a shape has an `onclick` / `onenter` / … attribute at connect, warn once ("use pxl-on-click"). Remove the warning later. (Dropped 2026-11-18: no warning, Kilopixel needs no backwards compatibility, §23.5.)

Migration count (2026-10-30): **25 handlers on Kilopixel elements** in `examples/test32.html` (20: enter / leave / down / up), `examples/test37.html` (4 clicks) and `tests/index.html` (1). Plus docs text and KILOPIXEL.md (Events section, AI guide), `design/` plans as history (unchanged). The other ~320 `onclick` hits in the repository are ordinary HTML buttons on docs pages.

### 4.4 Cursor

**Decided 2026-11-17 (§22.3, D5):** no `interactive`; for delegated listeners the shape's CSS `cursor` decides, read when the pointer enters the shape.

The hand cursor (`isClickable()`) should also show for shapes that a framework listens to. With a direct `click` listener (§4.2 count) Kilopixel knows it. With delegated listeners it can't know whether a click handler exists. Options (§13 D5): `interactive` implies "may be clicked" and shows the hand, or a separate `cursor` attribute. Recommended: `interactive` implies the hand cursor; simple and predictable.

### 4.5 Performance

- Event dispatch happens only on user input over shapes (not per frame unless the pointer moves over shapes). One event object per dispatched event, like the browser's own events; no allocations in frames without input.
- `pointermove` over a shape: one `PointerEvent` per frame while moving. Acceptable (the browser itself allocates one native event per move); could be limited to shapes with a `pointermove` listener or `pxl-on-move` handler (the listener count from §4.2 per type makes that cheap). Recommended: count per type, dispatch only types that have listeners or `interactive`.
- `addEventListener` override: one string comparison and an integer update per call; listeners are added at mount, not per frame.

## 5. Workstream W2: DOM Ownership (C9, C10, C11)

**Moved to `design/2026-11-04_stage_sizing_plan.md` (2026-11-14), built there on 2026-11-15**, together with the stage sizing fix, because both remove the engine's inline default styles. Summary:

- **Layer canvas in a shadow root** (C9, C11): each `<pxl-layer>` attaches an open shadow root with a `<style>` (`:host` defaults, canvas styles), its `<canvas>` and a `<slot>`. `innerHTML`, htmx swaps and frameworks can't remove the canvas, and the light DOM is exactly the rendered markup. Measured 2026-11-14: `mouseX` / `mouseY` stay exact across the shadow boundary, so the `offsetX` fallback first proposed here isn't needed (sizing plan §4.4).
- **Default styles in a stylesheet** (C10): `pxl-stage` and `pxl-var` defaults in `@layer pxl { … }`, in a `<style>` element at the start of `<head>` (or of the shadow root the stage sits in, C12). The first proposal here, `:where()` selectors in an adopted stylesheet, was dropped: both an adopted sheet and a rule outside any layer beat classes in the page's own cascade layers (Tailwind v4), measured in the sizing plan §4.1.
- **D6** (`<slot>`: yes) and **D7** (`aspect-ratio` stays inline, documented) are decided (§13).

## 6. Workstream W3: Properties (C3, C15)

### 6.1 Generated Accessors

**Built 2026-11-19 (§24)** with these differences: one `setValue()` path for attributes and properties; any non-string value is stored as given (D8 for every attribute); a string set as `text` is literal; a function value warns; accessors are defined lazily per class.

For every observed attribute of an element class, define a getter / setter on the prototype once (at class definition), named like the attribute:

```js
// For each name in observedAttributes (except names HTMLElement already defines: hidden, id)
Object.defineProperty(Class.prototype, name, {
  get() { return this.attributeValues[name]; },          // current evaluated value
  set(value) { pxl.setAttributeValue(this, name, value); },
  configurable: true
});
```

`pxl.setAttributeValue(element, name, value)`:

| Value type | Behaviour |
|---|---|
| `number`, `boolean`, `null` / `undefined` | stored directly: like `compileAttribute` with an already parsed value (`attributeExpressions[name] = value`, removed from animated / reactive / toLocal keys, `attributeValues[name] = value`, spatial dirty, broadcast, invalidate). `null` / `undefined` → default (Rule A). **No compilation, no cache entry** |
| `string` | same path as an attribute string today (`compileAttribute`), so `el.x = 'sin(t) * 100'` is an expression |
| `array` (e.g. `linedash`, `filter` arrays, `points` as numbers) | stored directly where the attribute's parsed form is an array; per-attribute check (§13 D8) |
| `function` | later: a JS function as an expression (`el.x = (t) => …`) needs the flags the compiler sets (`isTimeDependent`, `variableDependencies`); out of scope for the first version |

- **No reflection** to the attribute (like Lit's default): reflecting would trigger `attributeChangedCallback` and recompile. The DOM attribute then shows the last attribute value, not the property; documented. When both are used, the last write wins.
- **Getter returns the evaluated value**, so `el.x` reads the current animated value, the same as `ref.<id>.x`. Useful for frameworks reading values back.
- **Name collisions** with `HTMLElement` (audit §3 C3): `hidden` (native property reflects to the attribute; keep native) and the handler attributes (renamed to `pxl-on-*` by W1, attribute-only, §4.3). `id` is native. No accessor for these.
- **Effect on frameworks**: React 19, Vue, Preact set properties when `name in element`; with accessors they pass numbers as numbers (C14 fix for the common case: no string, no compilation). Angular `[x]="…"`, Lit `.x=${…}`, Svelte 5 and Solid `prop:x` get a working target.
- **Cost**: accessors live on the prototype (no per-instance cost). `pxl.setAttributeValue` for numbers is cheaper than today's string path (no `Number()` parse, no regex checks).

### 6.2 Properties Set Before the Upgrade (C15)

**Built 2026-11-19 (§24, P7):** the constructor takes the own properties (`Object.keys(this)` before any field exists), `connectedCallback()` sets them again after the attributes.

If a framework sets `el.r = 50` before `customElements.define` ran (library loaded later, code splitting), `r` becomes an own property of the element and shadows the accessor. Standard fix in the constructor or `connectedCallback`:

```js
// Values set as plain properties before the upgrade: move them through the accessor
for (const name of this.constructor.observedAttributes) {
  if (Object.prototype.hasOwnProperty.call(this, name)) {
    const value = this[name];
    delete this[name];
    this[name] = value;
  }
}
```

Runs once per element at upgrade; ~80 `hasOwnProperty` checks for a shape. Acceptable at creation time (not per frame).

## 7. Workstream W4: Expression Cache Bound (C14)

`pxl.animationCache` and `pxl.staticCache` (`compiler.js`) grow with every distinct string. With W3, frameworks pass numbers as properties, which removes the most common source. For strings that frameworks rebuild per render, cap the caches:

- `Map` keeps insertion order. On `set`, if `size > pxl.COMPILE_CACHE_LIMIT` (e.g. 2,000), delete the oldest key (`map.keys().next().value`). Evicting is safe: elements keep their compiled function; only a later identical string compiles again.
- Optional: refresh on hit (delete + set) for true LRU; one extra `Map` operation per cache hit, only at compile time. Not needed for correctness.
- Cost: one `size` comparison per compile; no per-frame cost.
- Static pages never reach the limit (the whole docs site compiles a few thousand distinct strings at most; to measure: count `pxl.animationCache.size + pxl.staticCache.size` on the largest docs page and on `examples/test40.html`).
- Docs: "Prefer numbers (properties) or a `<pxl-var>` over rebuilding expression strings on every render."

## 8. Workstream W5: Ids and Names (C2, C13)

### 8.1 Observe `id` (C2, bug-level)

Add `id` handling: when the `id` attribute changes on a connected element, unregister the old key (`delete pxl.nodes[old]` if it points to this element, unsubscribe nothing), register the new one, set `refKey`, broadcast both keys. `id` is not in `observedAttributes` today; add it to the base class lists and handle it before the generic path (it isn't a drawing attribute). Readers of the old key re-evaluate and get `undefined`, readers of the new key get the element. Cheap, and needed for Angular-style late bindings (C2) and for any page that changes ids.

### 8.2 Scoped Names (C13, decision)

Global ids force every component instance to generate unique ids and clean them for `ref.<id>`. Options (§13 D2):

| Option | How | Pro | Con |
|---|---|---|---|
| A. Keep global ids, document `useId()` cleanup | — | no engine change | every component needs the cleanup helper; easy to get wrong |
| B. Stage-scoped lookup | `ref.sun` resolves to the element with `id="sun"` **in the reader's own stage** first, then globally | components with one stage can use fixed ids; most components are one stage | duplicate DOM ids are invalid HTML (browsers tolerate them; `getElementById` returns the first); readers across stages still need global ids |
| C. A separate `name` attribute, scoped per stage | `name="sun"` + `ref.sun` within the stage; `id` stays global | valid HTML, clear rule | a second naming concept |

Recommended: **C** if scoping is wanted; it keeps HTML valid. Implementation sketch: each stage has its own `nodes` map; compiled functions receive the reader's stage map merged with the global map via a `Proxy` or a per-stage object with the global map as prototype (`Object.create(pxl.nodes)`), so `ref.x` looks up the stage first and the globals second without a per-access cost beyond the prototype chain. Compiled functions are shared across elements today (cache by string); with stage scoping the `ref` argument must come from the reader (pass it at call time instead of binding it at compile time). That changes the compiler's closure shape (`(scope, ref)` factory runs once per string today). Needs its own plan if chosen.

## 9. Workstream W6: Shadow DOM Boundaries (C12)

Today the Kilopixel tree must be connected through light DOM. Two steps:

1. **Document it** (now): "Stage, layers, groups and shapes must be in the same light DOM tree. A framework component may wrap them (slots are fine) but must not render shapes inside its own shadow root."
2. **Optional later**: walk up across shadow boundaries when `closest()` returns `null`: `parent = node.parentElement ?? node.getRootNode().host`. Needed in `node.js` (`parentLayer`, `parentContainer`), `shape.js` / `layer.js` (`stage`). DOM-order sorting (`pxl.sortByDOMPosition`, `compareDocumentPosition`) across shadow roots returns "disconnected"-style results; ordering would need the composed tree order. Larger than it looks; only if a real use case appears (e.g. a Lit design system that renders charts with Kilopixel inside its components).

## 10. Workstream W7: Lifecycle Robustness (C1, C8, C15) and Small Items

Mostly verification (§11), plus:

- **`ref.<id>.set(name, …)` with an unknown attribute name** silently sets a DOM attribute that nothing observes. Found today: `examples/test32.html` still calls `set('scale', …)` 20 times after the `zoom` rename (fixed separately). A warning for names that aren't in the element's `observedAttributes` would have caught it. Only in `set()` (Kilopixel's API), not for DOM attributes in general (frameworks add `class`, `style`, `data-*`, `aria-*`). **Built 2026-11-19 (§24, P6):** a warning once per element type and name.
- **`pxl-stage` without size** (hidden containers, `display: none` parents, background tabs): document that the stage sizes itself when it becomes visible (`ResizeObserver`), and that frameworks rendering into hidden tabs see `unit = 0` until then.

## 11. Conformance Test Page (`tests/frameworks.html`)

The core deliverable: the DOM contract as automated tests, **without any framework**, in the style of `tests/index.html` (result in the tab title and `window.kilopixelTests`). Each test does what frameworks do, with plain DOM calls:

| ID | Contract | Test |
|---|---|---|
| T-C1 | C1 | build stage → layer → circle detached (`createElement`, `setAttribute`, `appendChild`), insert at once: circle registered, values evaluated, drawn |
| T-C1b | C1 | insert stage first, then layer, then circle (one at a time) |
| T-C1c | C1 | children appended before their attributes are set |
| T-C2 | C2 | set `id` after connect: `pxl.nodes[id]` points to the element; a reader `ref.<id>.x` resolves |
| T-C2b | C2 | change `id`: old key gone, new key works, readers of both re-evaluated |
| T-C3 | C3 | `el.r = 50` (number): `attributeValues.r === 50`, nothing compiled (cache sizes unchanged), layer invalidated |
| T-C3b | C3 | `el.x = 'sin(t) * 100'`: animated like the attribute |
| T-C3c | C3 | `el.r = undefined`: default |
| T-C3d | C3 | getter returns the evaluated (animated) value |
| T-C4 | C4 | `removeAttribute` for every observed attribute of each element class: default, no throw (extends Rule A tests) |
| T-E1 | C5 | `addEventListener('click')` on a circle; synthetic pointer events at the circle's position on the stage: listener called once, `event.target` is the circle |
| T-E2 | C6 | listener on `document` (delegation) + `interactive` on the circle: called, `target` is the circle (with §22: without `interactive`) |
| T-E3 | C6 | without `interactive` and without a direct listener: not hit-tested (registration rule; inverts with §22: every shape is hit-tested) |
| T-E4 | §4.1 | enter / leave sequence: `pointerover`, `pointerenter`, `pointerout`, `pointerleave` in order; `pointerenter` doesn't bubble |
| T-E5 | §5 | with the canvas in a shadow root: `mouseX` / `mouseY` correct (offset retargeting) |
| T-E6 | §4.3 | `pxl-on-click` handler runs; a leftover `onclick` warns once (changed 2026-11-18: no warning, a plain `onclick` on a shape is not compiled, §23.5) |
| T-E7 | §4.1 | a listener that calls `setAttribute` on another shape during dispatch: no error, change drawn in the same frame (since `design/2026-11-17_pointer_frame_order_plan.md`; first written as "next frame") |
| T-M1 | C8 | move a circle to another group in the same task (`appendChild` to the new parent): registered once, new matrix (extends the existing matrix test) |
| T-M2 | C8 | remove and re-insert a whole stage: layers resized, animation resumes, listeners still work |
| T-M3 | C9 | `layer.innerHTML = '<pxl-circle …>'`: canvas survives (shadow root), new circle drawn |
| T-S1 | C10 | `stage.style.cssText = 'border: 1px solid'` (full replacement): stage still `display: block`, width 100 % (stylesheet), aspect ratio per D7 |
| T-S2 | C10 | `pxl-stage { width: 600px }` in page CSS wins without `!important` |
| T-H1 | C11 | server-like HTML (stage / layer / shapes) inserted via `innerHTML`: after upgrade, the light DOM is exactly the inserted markup (no canvas, no added nodes), so a hydrating framework sees no mismatch |
| T-U1 | C15 | element created and `el.r = 40` set before its class is defined (test defines a fresh subclass name to simulate late definition): value applied after upgrade |
| T-K1 | C14 | 1,000 distinct expression strings set on one element: cache size ≤ the limit |
| T-K2 | C14 | 1,000 numeric property sets: cache sizes unchanged |
| T-N1 | §10 | `ref.x.set('scale', 1)` warns (unknown attribute) |

Each test that needs rendering forces it (`stage.resize()` / `alwaysrender`) so the result doesn't depend on the browser pane being visible (lesson from the prototypes).

**Built 2026-11-17 (§21):** `tests/frameworks.html` has T-C1, T-C1b, T-C1c, T-H1 and further tests as `test()`; T-C3…T-C3d, T-U1, T-K2, T-E1, T-E2, T-E4, T-E6, T-E7, the listener part of T-M2 and T-N1 as `test.known()` (the acceptance tests of steps 3 and 4 in §19.4); T-E3 as `test()`, for hover only, so it holds with either answer to D10. Elsewhere: T-C2, T-C2b, T-M1, T-M3, T-S1, T-S2, T-E5 and the drawing part of T-M2 in `tests/index.html`, T-C4 in `tests/unit.html`, T-K1 in `tests/scaling.html`. **2026-11-19:** all W1 tests are ordinary tests and pass (§23.8); T-E2 runs without `interactive`, T-E3 is inverted (every shape is hit-tested).

## 12. Framework Smoke Pages and Docs

**Smoke pages** (built 2026-11-19 for React, Vue and Tailwind, §25; in `design/prototypes/2026-10-30_framework_compatibility/`; promote one or two to `examples/` later): the same component (two instances, number binding, expression binding, removal via `undefined`, mount / unmount, a click handler in the framework's own syntax, hover state shown in the framework's UI) in:

| Framework | Load without a build | Event syntax to check |
|---|---|---|
| React 19 | ✅ esm.sh + htm (exists) | `onClick`, `onPointerEnter` (delegated; no extra attribute since §22) |
| Vue 3.5 | ✅ global build (exists) | `@click` (direct) |
| Preact 10 | ✅ esm.sh + htm | `onClick` (Preact uses direct listeners) |
| Lit 3 | ✅ esm.sh | `@click` (direct); also a shadow-root component for C12 |
| Solid | ✅ `solid-js/html` | `onClick` (delegated) and `on:click` (direct) |
| Alpine 3 | ✅ CDN | `@click` / `x-on:click`, `:r` bindings |
| htmx 2 | ✅ CDN | swap a layer's content (C9 / T-M3) |
| Svelte 5 | needs the compiler (esm.sh `svelte/compiler` in the page, or `npx`) | `onclick` (delegated) |
| Angular | needs a build (`npx @angular/cli`, not in the repo) | `(click)`, `[attr.x]`, `[x]`; optional |

**Docs page** `docs/frameworks.html` (built 2026-11-19, §26.4; "Using Kilopixel with Frameworks"), after W1–W3:

- The DOM contract in one paragraph: "Kilopixel elements are standard custom elements; your framework sets attributes or properties and listens to events."
- Per framework: the one setting needed (Vue `isCustomElement`, Angular `CUSTOM_ELEMENTS_SCHEMA`, Svelte none, React none), the event syntax (no attribute is needed, also for delegating frameworks, since §22), and the cursor through CSS (`cursor: pointer`, Tailwind `cursor-pointer`).
- Angular with zone.js (before zoneless): the stage's frames come from the patched `requestAnimationFrame`, so every frame of an animated stage runs change detection; create the stage outside the zone (`runOutsideAngular()`) (found 2026-11-19, §23.8).
- Drags on touch screens: `touch-action: none` on the stage or layer, not on the shape (the browser decides scrolling on the canvas).
- Rules: unique ids per instance (or the scoped-name option once decided), numbers or `<pxl-var>` instead of rebuilt expression strings, Kilopixel tree in light DOM, don't replace the whole `style` of a stage.
- TypeScript / JSX typings: a `kilopixel.d.ts` with the elements and attributes for `JSX.IntrinsicElements` (React, Preact, Solid) and `HTMLElementTagNameMap` (Angular, Lit, Vue volar). Generated from `observedAttributes` + `static defaults` by a small script in `tools/`. Optional, but frameworks with TypeScript reject unknown tags without it. Belongs to the docs workstream or a follow-up.

Sidebar: a new entry under "Engine & Reactivity" or a new section "Integration".

## 13. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Names of the declarative handlers | `pxl-on-click` / `pxl-click` / `pxl-onclick` / other (§4.3) | **decided 2026-11-09:** `pxl-on-click`, `pxl-on-enter`, `pxl-on-leave`, `pxl-on-down`, `pxl-on-up`, `pxl-on-move`; attribute-only |
| D2 | Scoped names | A global ids / B stage-scoped ids / C `name` attribute (§8.2) | decide later; A for now, C if components need it. **2026-11-15 (§19.3):** design it together with the evaluation model (`design/2026-11-15_per_frame_evaluation_plan.md` D1), because both change how `ref` is resolved |
| D3 | Logical coordinates on events | extra fields / none (§4.1) | none; `ref.<stage>.mouseX`. **Built 2026-11-19** as recommended (§23.8); `offsetX` equals `clientX` on shape events, documented in the events tab of the API reference |
| D4 | Native canvas `click` next to the synthetic shape `click` | (a) accept both / (b) hit-test when the event arrives and stop the native event over a shape / (c) Kilopixel owns every click in the stage (§4.1) | **decided 2026-11-10: (b)** for `click`, `pointerdown`, `pointerup`; `pointermove` keeps both (prototype `d4_clicks.html`) |
| D5 | Hand cursor for framework listeners | `interactive` implies pointer / separate `cursor` attribute (§4.4) / **the shape's CSS `cursor`** (§22.3) | **decided 2026-11-17:** the shape's CSS `cursor`, no `interactive` (§22.3); before: `interactive` implies pointer. **Changed 2026-11-18 (§23 E1):** no listener counts; the cursor is only CSS, and the hand for `pxl-on-click` / `-down` / `-up` comes from a rule of the default styles |
| D6 | `<slot>` in the layer's shadow root | yes / no (§5) | **decided 2026-11-14:** yes |
| D7 | Stage `aspect-ratio` | inline / CSS custom property (§5) | **decided 2026-11-14:** inline, documented ("set single properties on a stage's `style`, don't replace the whole attribute") |
| D8 | Properties for array-valued attributes | direct arrays / strings only (§6.1) | direct where the parsed form is an array. **Built 2026-11-19 (§24, P3):** every non-string value is stored as given, for every attribute |
| D9 | Scope of the first implementation | all workstreams / W1 + W2 + W5.1 + tests first | W1, W2, W5.1, W4, tests (§14 phase 1); W3 next; W5.2 / W6 only on demand. **2026-11-15:** replaced by the order in §19.4 (quick fixes first, distribution W8 added) (closed) |
| D10 | Clicks on shapes without `interactive` (§19.2) | `interactive` needed for every delegated listener (§4.2) / `click`, `pointerdown`, `pointerup` hit-test every shape of the stage when they arrive, `interactive` only for hover with delegated listeners | the second: React / Svelte / Solid `onClick` then works without an extra attribute; needs D11. **Decided 2026-11-17 (§22):** a third option, every shape hit-tested for clicks **and** hover with a bounding-box pre-check (measured 5–25× faster than testing every path): no `interactive` at all |
| D11 | Shapes that should not catch clicks (with D10, a decorative shape on top catches the click, as in the DOM) | a `pointer-events`-like attribute / only shapes with a fill or stroke at the point count (as today) and nothing else / **CSS `pointer-events: none`** (§22.3) | **decided 2026-11-17:** CSS `pointer-events: none`, inherited, so a layer or group with it leaves its subtree out; read with `getComputedStyle()` for layers, groups and the box-check candidates only (§22.4) |
| D12 | Text children of shapes (C17) | hide them (one rule in `pxl.DEFAULT_STYLES`) / hide them and use the text content of `<pxl-text>` when `text` is not set | hide now (W9); the text content as a fallback is a separate API decision |

## 14. Phases and Steps

**2026-11-15:** the review in §19 adds quick fixes, distribution (W8) and text children (W9), and puts the steps in a new order (§19.4). The phases below are the original plan and stay for their details.

**Phase 1: the contract that breaks today** (one plan approval, several commits)

1. `tests/frameworks.html` with the tests that pass today (T-C1…, T-C4, T-M1, T-M2) as a baseline; the others added with their features.
2. W5.1 observe `id` (+ T-C2, T-C2b). `fix(engine): register ids set or changed after connect`.
3. (Built differently 2026-11-18 / 2026-11-19: no `addEventListener` override, no `interactive`, no warning for the old names; §22, §23.) W1 events: dispatch DOM events, `addEventListener` override, `interactive`, rename `on*` → D1 names, warning for the old names; migrate the 25 handlers (`test32`, `test37`, `tests/index.html`), KILOPIXEL.md Events + AI guide, docs pages that mention `onclick` on shapes (+ T-E1…T-E7). `feat(engine)!: DOM events on shapes; pxl-on-click replaces onclick`.
4. W2 canvas in a shadow root + stylesheet defaults (+ T-M3, T-S1, T-S2, T-H1, T-E5): built 2026-11-15 with `design/2026-11-04_stage_sizing_plan.md`; its tests are in `tests/index.html` (sizing plan §7).
5. W4 cache bound (+ T-K1). `perf(compiler): bound the expression caches`.
6. Smoke pages in `design/prototypes/2026-10-30_framework_compatibility/` for the frameworks in §12 that load without a build; record results in `FINDINGS.md`.

**Phase 2: properties**

7. (Built 2026-11-19, §24.) W3 accessors + pre-upgrade properties (+ T-C3…, T-U1, T-K2). `feat(engine): attribute properties on all elements`.
8. Re-run the smoke pages; React / Vue now pass numbers as properties.

**Phase 3: docs and typings**

9. `docs/frameworks.html`, sidebar entry, KILOPIXEL.md section "Framework Integration".
10. Optional: `kilopixel.d.ts` generator in `tools/`.

**Later / on demand:** W5.2 scoped names (own plan), W6 shadow boundary crossing (own plan).

Every engine step: `node build.js`, update the `pxl.min.js` size, `tests/index.html` and `tests/frameworks.html` all green, console clean.

## 15. Interplay with Other Plans

- **Stage sizing** (`2026-11-04_stage_sizing_plan.md`, ✅ 2026-11-15): built W2 (§5) together with overridable stage sizes and a 300 px fallback width.
- **Always save / restore** (`2026-11-07_safe_shape_render_plan.md`, built 2026-11-07): independent; both touch `Shape.render()` only lightly (W1 doesn't change rendering).
- **`space` attribute** (`2026-10-30_space_attribute_plan.md`): hit testing of space elements is unchanged; DOM events work the same for them. W3 accessors would include `space` (its value is a ref object, set as a property it could be the element itself: `el.space = otherEl` is a natural framework API; note for that plan).
- **Two-phase frame** (TODO §29): event dispatch at the end of `process()` fits the update / draw split (step 1 built 2026-11-13). Since 2026-11-17 `process()` runs at the start of the frame (`design/2026-11-17_pointer_frame_order_plan.md`): hover and move events are hit-tested against the picture on screen, the same one D4 uses for clicks when they arrive.
- **Interactive state auto-registration** (`design/archive/2026-10-15_interactive_state_auto_registration_plan.md`, ⚪): was to be extended by §4.2 (listener counts, `interactive`); since §23 step 2 every shape is hit-tested and nothing is registered, so the plan is archived.

## 16. Risks

- **API change of the handlers (W1)**: pre-release; 34 uses migrated (§23.5). The old-name warning was dropped (no backwards compatibility).
- **Shadow root on layers (W2)**: checked 2026-11-14 (sizing plan §4.4): pointer coordinates are exact across the shadow boundary, and nothing in the repo reads the canvas with `querySelector`.
- **Accessors (W3)**: a framework that sets a property Kilopixel doesn't expect (e.g. `style`, `className`) is unaffected (no accessor); a user who set expando properties with attribute names on elements (`el.x = …` as a private field) would now change the drawing. Unlikely; documented.
- **Event duplication (D4)**: solved for `click`, `pointerdown` and `pointerup` by option (b); stage-level `pointermove` listeners see the native and the Kilopixel event (documented). Code that listens on the stage for the browser's click over a shape now gets Kilopixel's click instead (`target` = the shape, `isTrusted` = false). Since §23.8 `mousedown`, `mouseup`, `dblclick` and `contextmenu` follow the same rule.

## 17. Effort Estimate (2026-10-30)

Rough estimates from the code read for this plan; "session" = one working session like the ones that implemented the toLocal / `zoom` plan.

| Phase | Engine | Other work | Estimate |
|---|---|---|---|
| **1**: `id` fix, DOM events + `interactive`, handler rename, canvas in a shadow root, stylesheet defaults, cache bound (the shadow root and the stylesheet defaults moved to the stage sizing plan on 2026-11-14) | ~250–350 lines in 7 files (`interaction.js`, `shape.js`, `node.js`, `layer.js`, `stage.js`, `variable.js`, `compiler.js`) | `tests/frameworks.html` (~20 tests, ~400 lines); migrate 25 handlers (`test32`, `test37`, `tests/index.html`); KILOPIXEL.md Events section and AI guide; smoke pages for 5–7 frameworks | 2–3 sessions |
| **2**: property accessors, properties set before the upgrade | ~100–150 lines (generated accessors, `pxl.setAttributeValue`) | ~6 tests; re-run the smoke pages | 1 session |
| **3**: `docs/frameworks.html`, sidebar, KILOPIXEL.md section | none | docs page per `docs/DOCS_STANDARDS.md`; optional typings generator in `tools/` | 1 session (+1 for typings) |

**What takes the time:**

1. **Decisions before code**: D1 (handler names) and D4 (one click per user click) are decided (2026-11-09 / 2026-11-10); D5–D8 are smaller.
2. **Shadow root on layers**: pointer coordinates across the shadow boundary verified 2026-11-14 (exact, no fallback needed); W2 moved to the stage sizing plan.
3. **Testing in the dev environment**: a hidden browser pane stops layout, `ResizeObserver` and `requestAnimationFrame` (seen in the prototypes and the `test32` check on 2026-10-30). The conformance tests force rendering (`stage.resize()`, `stage.render()`) and fall back to calling compiled handlers where pointer input needs layout.

Phase 1 alone delivers most of the value (framework events, no `on*` collisions, no hydration / reconcile conflicts, bounded memory). Phase 2 is an improvement, not a requirement.

## 18. Performance Summary

**2026-11-19:** the W1 rows below (per-type listener counts, the `addEventListener` override, `interactive`) are the plan of 2026-10-30. W1 as built dispatches every event type without counts or attribute: its costs are in §23.4 and §23.8.

No per-frame cost for pages that don't use the new features; some paths get cheaper.

| Change | Per frame | Other cost | Gain |
|---|---|---|---|
| DOM events (W1) | none without input; on pointer actions over shapes only, and only for event types with a listener (per-type counts, §4.5) | one event object per dispatched event, like the browser's own events | — |
| `addEventListener` override (W1) | none | one comparison per `addEventListener` call (at mount) | — |
| `interactive` (W1) | only for shapes the user marks: hit-tested on pointer moves, like shapes with handlers today (2026-11-17, §22: every shape with a box pre-check instead, 0.1–0.4 µs per shape per pointer frame) | — | — |
| Canvas in a shadow root (W2) | none: drawing and compositing unchanged | one shadow root and `<style>` per layer, once | canvas can't be removed by `innerHTML` or frameworks |
| Stylesheet defaults (W2) | none | one `<style>` per page (or per shadow root with a stage), once | users override styles without `!important` |
| Property accessors (W3) | none | defined once on the prototype; the pre-upgrade check runs once per element at creation (~80 `hasOwnProperty` checks) | numbers set as properties skip parsing and compiling (as built: one `Object.keys()` per element, §24) |
| Cache bound (W4) | none | one size check per compile | bounded memory |
| `id` observed (W5.1) | none | only when an `id` changes | — |

- **File size**: about +2–3 KB minified (estimated 2026-10-30, when `pxl.min.js` was ~53 KB; from ~57 KB on 2026-11-13 that means about 59–60 KB); the main measurable cost.
- **Worst case avoided by design**: `pointermove` dispatched every frame while the pointer moves over many shapes. Only the shape under the pointer gets events, and only for types with listeners.
- **Check**: run `design/prototypes/2026-10-30_framework_compatibility/perf_run.html` before and after phase 1 (same pages, interleaved rounds). In this environment it resolves differences above ~20 % only (`design/prototypes/2026-10-30_framework_compatibility/perf_results.md`); smaller effects need a quiet machine or more rounds.

## 19. Review 2026-11-15: Findings, New Workstreams, Order

A review of this plan against the goal "Kilopixel works in the major frameworks out of the box", with checks on the current engine (`design/prototypes/2026-10-30_framework_compatibility/review_checks.html`: plain DOM calls that do what frameworks do; results in a table and in `window.reviewChecks`).

### 19.1 Measured on the Current Engine

| Check | Result | Who hits it |
|---|---|---|
| `id` set after insertion (C2) | not registered; a reader of it gets `null` | Angular `[id]`, Alpine `:id`, htmx |
| `id` renamed, element removed (C2) | the new id is not registered; the **old entry stays in `pxl.nodes`** after removal | any changing id binding |
| Removing 1,000 shapes + 1,000 readers (C8, C14) | 54–59 ms | route change, list unmount |
| Removing 2,000 shapes + 2,000 readers | **374–389 ms**, 97 % of it in `pxl.clearAllVariableSubscriptions()`, which scans every subscription key for every removed element (quadratic). Inserting the same: 28–40 ms. Without readers: under 2 ms | same, a visible freeze |
| Script loaded twice (C16) | `window.pxl` replaced, the first copy's registry is lost, `TypeError`s on every element of the first copy, readers compute wrong values | a script tag plus an import, micro-frontends, Storybook |
| `<pxl-text>{label}</pxl-text>` (C17) | the text is visible as HTML above the stage (slotted into the layer) | JSX, templates |
| `linedash={[20, 10]}` in JSX (C3) | stored as the string `"20,10"`: no dash | React, Preact; every array prop until W3 (D8) |
| 2,000 `setAttribute()` per frame (C14) | 1.9–2.4 ms; 3.2–3.3 ms when each shape has one reader | animation driven by framework state |
| Hit test, pointer over empty space | 0.07–0.19 ms (100 shapes), 0.6–1.1 ms (1,000), 1.7–3.3 ms (3,000) per pointer frame | clickable charts |
| `hidden="false"` or an animated `hidden` on a layer | visible as intended: the layer's `:host` style beats the browser's `[hidden]` rule | — |

### 19.2 What the Plan Didn't Cover

**W8: Distribution (C16).** "Out of the box" in a bundler-based project means `npm install kilopixel` and `import 'kilopixel'`; none of it exists yet.

- **Guard in `build.js`** (no change to the source files): wrap the bundle in a function that returns early when `typeof window === 'undefined'` (an import during SSR does nothing) or when `window.pxl` already exists (warn once: "Kilopixel loaded twice; the second copy is ignored"). The namespace check of `build.js` runs on the source files and is not affected.
- **npm package:** `package.json` with `exports` / `main` pointing to the bundle, `"sideEffects": true` (a side-effect import must not be removed by tree shaking), `types`. The ES-module entry stays a side-effect file plus optional named exports (`design/2026-10-17_bundle_scope_plan.md`, "later, only if needed": now needed).
- **Typings are required, not optional** (§12 called them optional): TypeScript React, Solid and Angular projects reject unknown tags and attributes without them. Generated from `observedAttributes` and `static defaults` by a script in `tools/` (§12).
- **Framework settings Kilopixel can't avoid:** Vue's `isCustomElement` (without it Vue renders the elements but warns), Angular's `CUSTOM_ELEMENTS_SCHEMA`. One line each in `docs/frameworks.html`.
- **Smoke tests with SSR** (Next.js, Nuxt) need `npm install`, which CLAUDE.md doesn't allow in the repository. Open: a folder outside the repository, or only the no-build smoke pages of §12.

**W9: Text children (C17, D12).** Shapes draw nothing as elements, but their children are slotted and shown. Fix: `pxl.DEFAULT_STYLES` hides the content of shape elements (one rule; shapes don't use layout, so drawing and hit testing are unaffected). The layer's `<slot>` stays for accessible content placed directly in a layer (D6). Using the text content of `<pxl-text>` as its `text` is a separate decision.

**Quick fix: removal cost (C8, C14).** `clearAllVariableSubscriptions()` loops over all keys of `pxl._subscriptions` for every removed element. Each element knows its own keys (the `variableDependencies` of its reactive attributes, as `restoreVariableSubscriptions()` uses them on connect), so it can unsubscribe only those: removal becomes linear. A subscription left by an attribute that changed from reactive to static is currently dropped lazily on the next broadcast; `compileAttribute()` should drop it when it replaces the function, so nothing stale is left for the new removal path.

**W5.1 extended:** handling `id` changes must delete the **old** key as well (the measured leak), not only register the new one.

**D10 (clicks without `interactive`).** D4 hit-tests `click`, `pointerdown` and `pointerup` when the browser's event arrives. Testing every shape of the stage at that moment, not only registered ones, costs 0.6–1.1 ms per 1,000 shapes once per click, not per frame. React, Svelte and Solid `onClick` then work without an extra attribute; `interactive` remains only for hover and move events with delegated listeners, which are tested every pointer frame. With every shape testable, a decorative shape on top catches a click like an element in the DOM does: D11.

**Sets that only grow** (W4 extended): `pxl._interactiveIds`, `pxl._pressableIds` and `pxl._stickyIds` keep every id ever read; with framework-generated ids that change on remount, they grow slowly. Bound or clean them with the caches. (Resolved 2026-11-19, §20.)

### 19.3 Relation to the Evaluation Model (TODO §29, §39, §40)

- **Not on the critical path.** Events (W1), properties (W3), ids (W5.1), the cache bound (W4) and distribution (W8) work with today's broadcasts and with `design/2026-11-15_per_frame_evaluation_plan.md`. Where they broadcast (the `setAttribute` path, `id` changes), the per-frame plan replaces the call with `pxl.markChanged()`.
- **Framework work first** gives the per-frame plan a safety net: `tests/frameworks.html` covers insert, move, remove and late ids, the lifecycle paths a core rewrite is most likely to break.
- **Scoped names (D2) belong to the evaluation model.** Compiled functions are shared by source string and bound to the global `pxl.nodes`, and subscription keys are global `'ref.<id>'` strings; N component instances with their own ids therefore compile N copies of each expression. Resolving `ref` per stage changes exactly the code the per-frame plan rewrites (`ref` passed at call time, lookups by id at check time), so D2 is designed together with that plan's D1.
- **Timing:** with the per-frame plan, a reactive value is updated in the next frame, not inside `setAttribute()`. A framework that reads a derived value back through a W3 getter right after setting its source would see the old value; the same question as the per-frame plan's D5.
- **The removal fix** (§19.2) is needed only until subscriptions go away (per-frame plan); it is small enough to build now.

### 19.4 Order

| # | Step | Contents | Size |
|---|---|---|---|
| 1 | Quick fixes (built 2026-11-16, §20) | removal cost, W5.1 (`id` observed, old key deleted), W8 guard in `build.js`, W4 cache bound and the growing sets, W9 hidden text children. Acceptance tests: the four `test.known()` in `tests/index.html`, section "Known bugs (framework review)" (2026-11-16, `design/2026-11-15_testing_plan.md` §14); the removal cost gets a scaling check there (step 6) | 1 session |
| 2 | Conformance tests (built 2026-11-17, §21) | `tests/frameworks.html` (§11), plus tests for step 1 | 1 session |
| 3 | Events (W1), built 2026-11-18 / 2026-11-19 (§23.5–§23.8) | DOM events, `pxl-on-*` handlers (D1), D10 / D11 | 1–2 sessions |
| 4 | Properties (W3), built 2026-11-19 (§24) | accessors, arrays (D8), values set before the upgrade | 1 session |
| 5 | Distribution and docs (W8) | smoke pages (built 2026-11-19, §25), `docs/frameworks.html` (built 2026-11-19, §26.4), typings (built 2026-11-19 as downloads, §27), the Angular app; the npm package later, with publishing (§26) | 1–2 sessions |
| 6 | Evaluation model | two-phase step 2, the per-frame prototype, its D1, scoped names (D2) in the same design | several sessions |

Plans that assume the evaluation model (throttling `maxfps`, tweens, `<pxl-clip>`, `space`) come after step 6.

### 19.5 Performance

- Steps 1–5 add no per-frame work for pages that don't use the new features. Events allocate only on input; `pointermove` is dispatched only for types with listeners (§4.5). (Changed with §22: every type is dispatched; while the pointer moves over a shape, one `pointermove` and one `mousemove` per frame, §23.8.)
- Framework-driven animation (state updated every frame) costs about 1 µs per `setAttribute()` on Kilopixel's side, before the framework's own rendering. The docs recommend `t`, drivers or a `<pxl-var>` for continuous motion and framework state for changes; W3 makes numeric writes cheaper.
- Hit testing grows linearly, about 0.6–1.1 µs per shape per pointer frame; fine up to about 1,000 interactive shapes. A bounding-box check before the path test is the next step if a page needs more. **Measured 2026-11-17 (§22.2):** with it, every shape can be tested (1–4 exact tests per frame, 0.1–0.4 µs per shape).

## 20. Step 1 Built 2026-11-16: Quick Fixes

All six framework-review bugs that were `test.known()` (testing plan §14, §16) pass now and are ordinary tests; `node tools/run_tests.js` passes (build checks 11, `tests/index.html` 112, `tests/render.html` 40, `tests/scaling.html` 8, `tests/unit.html` 61 + 5 known, 79 pages).

| Fix | Code | Measured / tested |
|---|---|---|
| Removal cost (C8, C14) | `pxl._subscribedKeys` (`engine.js`): a `WeakMap` element → `Set` of its keys, kept by `subscribeToVariable()` / `unsubscribeFromVariable()`; `clearAllVariableSubscriptions()` removes the element only from its own keys. Subscribing checks the set instead of scanning the subscriber list | Same pane, alternating with the engine of `a4cdbf5` (copies of `review_checks.html`, not kept): 2,000 shapes + 2,000 readers removed in 3.9–4.3 ms instead of 622–732 ms; 1,000 + 1,000 in 1.8–1.9 ms instead of 89–90 ms; inserting (44–47 ms → 48–50 ms) and `setAttribute()` unchanged. Scaling test "removing shapes with readers is linear"; "removed readers leave no subscriptions" (also an attribute that stopped reading) |
| Insert cost (found in testing step 6) | `registerChild()` in `layer.js` and `group.js` without the `includes()` scan (called once per connect) | scaling test "inserting shapes with readers is linear" |
| `id` after insertion, renamed, removed (C2, W5.1) | `id` in `observedAttributes` of layer, group, shapes, variable and stage; `pxl.renameNode()` (`engine.js`) moves the registry entry and broadcasts both names, once the element is registered (`isRegistered` in `PxlNode`, `_isRegistered` in `Stage`; during an upgrade `connectedCallback()` registers it). A shape whose new id is read for `isHovered` / `isPressed` registers for hit testing. The stage's `disconnectedCallback()` now removes its entry too | tests: late id with a reader; renamed id (new name, no old entry, none after removal); removed id (readers read `undefined`); late id of a hover target; renamed and removed stage. The Rule A sweep (`tests/unit.html`) skips `id`, which is not a drawing value |
| SSR import and double load (C16, W8 guard) | `bundleSource()` in `build.js` wraps the bundle in a function that returns without `window` / `customElements` and, when `<pxl-stage>` is already defined, warns once and returns | test: a second copy warns once, the first keeps working, no errors; build check: `dist/pxl.js` and `dist/pxl.min.js` run in Node's `vm` without a window and define nothing |
| Cache bound (C14, W4) | `pxl.COMPILE_CACHE_LIMIT` = 2,000 per cache, `pxl.cacheExpression()` drops the oldest entry | scaling test "expression caches stay bounded" (3,000 distinct strings) |
| Text children (C17, W9, D12) | `pxl.DEFAULT_STYLES`: `display: none` for `pxl-var`, `pxl-group` and the built-in shapes, in `@layer pxl` | test: `<pxl-text>` content is not visible |

- **File size:** `pxl.min.js` 57.46 → 58.70 KB (the docs say ~59KB; gzipped 17.43 KB, still ~17KB). The build check caught the outdated sizes.
- **Not done: the sets that only grow** (`pxl._interactiveIds`, `pxl._pressableIds`, `pxl._stickyIds`, §19.2). They record that some expression reads an id's `isHovered` / `isPressed`; removing an id is only safe once no reader exists, and readers are not tracked per id. They hold strings, one per distinct id ever read: small. Revisit with the per-frame plan (`design/2026-11-15_per_frame_evaluation_plan.md`), whose `pxl._readIds` has the same question. **Resolved 2026-11-19:** all three sets are gone (`pxl._interactiveIds` and `pxl._stickyIds` in §23.7, `pxl._pressableIds` in §23.8).
- **Custom shapes** (`class Star extends pxl.Shape`, own tag): their content is not hidden by the default rule; a page that writes content into them adds `star-shape { display: none }`. Noted in KILOPIXEL.md.
- **Next:** §19.4 step 2, `tests/frameworks.html` (built 2026-11-17, §21).

## 21. Step 2 Built 2026-11-17: Conformance Tests

`tests/frameworks.html`: 36 tests, 16 passing and 20 known, about 1.5 s headless; `node tools/run_tests.js --tests` picks the page up by itself. Plain DOM calls, no framework; every test that draws adds its own stage, sizes and draws it by hand (`stage.resize()`, `stage.render()`) and removes it. The helpers (`withStage()`, `pointerAt()`, `hover()`, `alphaAt()`) are copies of those in `tests/index.html`; the page lists in its introduction which §11 tests live on the other pages.

| Section | `test()` | `test.known()` |
|---|---|---|
| Create and insert (C1) | T-C1 (detached tree with a stage-level `<pxl-var>`), T-C1b (one element at a time; the late layer gets the stage size), T-C1c (attributes after the children, or only after insertion), a reader before its target in one inserted tree | — |
| Attributes after insertion (C2, C4, C14) | a removed attribute on a connected shape is redrawn at the default; setting the same values again compiles nothing and leaves the layer clean | — |
| Properties and late definition (C3, C15) | the native `hidden` property; attributes written before `customElements.define()` (a fresh subclass of `pxl.Circle`) | T-C3, T-C3b, T-C3c, T-C3d, an array property (`linedash`, D8), T-K2, T-U1 (W3) |
| Events (C5, C6, C7) | a click over empty space reaches a listener around the stage once (D4: unchanged), T-E3 | T-E1, a listener added before insertion (Vue, Lit and Solid add them at creation), D4 one click with the shape as `target`, D4 `stopPropagation()`, T-E2, T-E4, `pointermove` on the shape and on the stage, a removed listener releases the shape, T-E6, C7 attribute names, T-E7, T-M2 listeners after moves (W1) |
| Move and remove (C8) | keyed reordering (`insertBefore`) changes the draw order and the topmost hit; a stage inserted again is still hit-tested; unmounting a tree leaves no registry entries, subscriptions, stage variables or monitor entry | — |
| Style, hydration, shadow DOM (C10–C12) | one style property keeps the aspect ratio (D7); T-H1 (server markup compared node by node with a `<template>` copy, which isn't upgraded: only the stage's inline `aspect-ratio` and `cursor` differ); a stage inside a component's shadow root draws and hit-tests | — |
| Small items (§10) | — | T-N1 |

- **What the known tests expect** (decided details, so steps 3 and 4 can flip them to `test()`): events with `bubbles` and `composed`; one `click` per action around the stage, with the shape as `target`; `pointerenter` / `pointerleave` not bubbling; a `pointermove` on the shape and the browser's move on the stage; a `pxl-on-click` handler runs and a plain `onclick` on a shape is not compiled (changed 2026-11-18: no warning for the old names, §23.5); `set()` warns once per unknown name and not for known ones; properties as in §6.1. Each click test also runs the frame after the event, so it passes whether the click is dispatched when it arrives (D4) or in `process()`.
- **C7 today:** the only names that start with `on` or are properties of `HTMLElement` are the six handlers (`onclick` … `onmove`) on every shape; no other observed attribute collides.
- **Checked that the tests can fail:** a copy of the page in `scratch/` (not kept) broke one engine function per run. Every one of the 16 passing tests failed under at least one break: `Layer.registerChild()` (the C1 tests, removed attribute, `hidden`, late definition, reordering, shadow root), `InteractionEngine.process()` (reordering, re-inserted stage, shadow root), `Stage.registerVariable()` (T-C1, unmount), `clearAllVariableSubscriptions()` and a registry entry kept on disconnect (unmount), `pxl.broadcast()` (reader before target), a canvas in the layer's light DOM (T-H1), the pointer listeners lost on re-insert (re-inserted stage), the same-value guard removed from `attributeChangedCallback()` (re-render), a default of 500 for a removed `x`, `hidden` ignored, clicks stopped at the stage (empty space), every shape registered (T-E3), `aspect-ratio` cleared on resize (style test), `sortByDOMPosition()` returning 0 (reordering). The known tests fail with messages that name the missing feature (no events, `attributeValues` unchanged by properties).
- **Lesson for such checks:** custom elements read their lifecycle callbacks (`connectedCallback`, `attributeChangedCallback`, …) once, at `customElements.define()`. Replacing them on the prototype afterwards does nothing; a break must replace a method they call (`registerLayer()`, `pxl.perf.registerStage()`) or use a modified copy of the bundle.
- **Found:** no new bugs.
- **Left out:** C13 scoped names (D2 open), the hand cursor for `interactive` (D5 open), crossing shadow boundaries (W6, on demand).
- **Next:** §19.4 step 3, events (W1).

## 22. Hit Testing Every Shape (Measured 2026-11-17): a DOM-like Event Model

### 22.1 Question

W1 as planned (§4.2) hit-tests only registered shapes: those with a handler, a direct listener (counted in the `addEventListener` override), or the new attribute `interactive`. React, Svelte and Solid delegate their listeners to the document root, so Kilopixel can't see them; their users would have to add `interactive` to every shape that should get hover events or a hand cursor, and with D10 still for clicks only. That is not what React users know: in the DOM, in SVG and in react-konva every element gets events, and a CSS `cursor` gives the hand. Vue, Angular, Lit and Alpine attach their listeners to the element, so the `addEventListener` override sees them and they work without `interactive` in either model. PixiJS is the one canvas library with an opt-in (`eventMode`, until v7 `interactive`), for the same reason as here: testing every object on every pointer move is expensive. So: can every shape be hover-tested in every pointer frame?

### 22.2 Measurement

Prototype `design/prototypes/2026-10-30_framework_compatibility/hover_hit_every_shape.html`: 10 rotated groups (static, or rotating with `t`) with circles, rings, rects (anchors, rotation), lines (some with `arrowend="auto"`), text and polylines (half of them smooth); the pointer walks across the stage, frames driven by hand, only the hit test timed. Three variants, all on every shape, topmost first:

- **Exact:** the per-element body of `InteractionEngine.process()` (`isPointInPath` / `isPointInStroke` on the shape's own path) for every shape: what `process()` would cost if every shape were registered.
- **Box first:** the pointer is mapped into the shape's own space (inverse of `getGlobalMatrix()`) and compared with `getBoundingBox()`, padded by what a stroke can reach beyond the path (half the width, a miter up to `miterlimit` × half the width, a square cap's corner, arrowheads); only shapes inside it get the exact test. Smooth polylines, the grid and custom shapes without `getBoundingBox()` always get the exact test.
- **Box cached:** the same, with the inverse matrix and the padded box kept per shape until its global matrix version changes (or every frame for an animated shape).

**Correctness:** 900 pointer positions (half of them near a shape, about 450 on one), 1,000 and 5,000 shapes, static and rotating: all three variants found the same shape every time.

**Time** per pointer frame, ms, median of 3 runs × 60 frames, headless Chrome on this laptop (noisy: the same run varied by up to 2×; headless measured about 2–3× slower than the normal browser for the exact test, §19.1). Scene without smooth polylines:

| Shapes | Exact | Box first | Box cached | Exact tests per frame | Drawing the frame |
|---|---|---|---|---|---|
| 1,000, static | 3.1 | 0.34 | 0.17 | 1.2 | 3.7 |
| 1,000, rotating | 3.1 | 0.38 | 0.41 | 1.4 | 2.3 |
| 5,000, static | 9.2 | 1.16 | 0.39 | 3.5 | 11.9 |
| 5,000, rotating | 11.1 | 1.8 | 1.8 | 4.0 | 14.9 |

- **The box check is 5–25× faster than testing every path,** and leaves 1–4 exact tests per frame.
- **Static scenes:** with the cache, about 0.1–0.2 µs per shape. **Animated scenes:** the matrices change every frame, so the cache doesn't help: about 0.4 µs per shape (an inverse, a box and the parent chain per shape).
- **Smooth polylines** (about 6 % of the shapes in the other run) always got the exact test: 70–180 exact tests per frame, roughly twice the time. Not needed: a Bézier curve stays inside the box of its control points, which `Polyline.draw()` computes anyway; cached with the box, they would be checked like the others.
- For scale: 1,000 animated shapes cost about 0.4 ms per pointer frame headless (probably 0.15–0.2 ms in the browser); 5,000 animated shapes about an eighth of their drawing. Hit testing runs only while the pointer is over the stage.

### 22.3 Decided: Every Shape Gets Events, CSS Decides the Rest

Decided 2026-11-17, after comparing it with the `interactive` model (§22.6). Replaces the registration model of §4.2 and the `interactive` attribute.

| | Proposal |
|---|---|
| **Box pre-check** | build it in any case (with the cache and the control-point box for smooth polylines): it also makes today's hit test of registered shapes faster |
| **D10** | every shape is hit-tested, for clicks **and** for hover / move: React `onClick` and `onPointerEnter`, Svelte, Solid and delegated listeners on the stage work as written, without an attribute. `isHovered` / `isPressed` work for every shape; the auto-registration of `pxl._interactiveIds`, `pxl._stickyIds` and `releaseIfUnused()` (`design/archive/2026-10-15_interactive_state_auto_registration_plan.md`) and the listener counts of §4.2 are then only needed to decide which **events** to dispatch (§4.5), not which shapes to test |
| **D5** | no `interactive`. The hand cursor: as today for `pxl-on-click` / `-down` / `-up` and `isPressed` readers, plus a direct `click` / `pointerdown` / `pointerup` listener (§4.2 counts); otherwise the shape's CSS `cursor` (`style="cursor: pointer"`, Tailwind `cursor-pointer`), read when the pointer enters the shape, not per frame |
| **D11** | CSS `pointer-events: none` on a shape lets clicks and hover through to the shape below, as in the DOM. It is inherited, so `<pxl-layer style="pointer-events: none">` or a group with it takes a whole subtree out of hit testing: the way to keep large decorative scenes (particles) out of it. How it is read: §22.4 |

### 22.4 Reading `pointer-events` (Checked 2026-11-17)

`pointer-events` can come from the shape's `style`, from a class in a stylesheet, or inherited from a group or layer, whose class can change without any change on the shape. So Kilopixel reads the computed value (`getComputedStyle()`); watching the shape's attributes is not enough. Checked in the browser:

- It works on shape elements, although they are `display: none`: an inline value reads `none`, a value inherited from a group's class reads `none`, and after the class is removed from the group the shape reads `auto`.
- One read costs about 1 µs when nothing changed, about 8 µs right after a class change (the browser recalculates styles first). Rough numbers (hidden browser pane).

Approach: read it once per frame for each layer and group (a handful; a layer or group with `none` takes its subtree out of the box checks), and for the 1–4 shapes per frame that pass the box check. Never for every shape: 5,000 reads would cost about 5 ms. No cache and no `MutationObserver` needed. About 20–30 lines.

### 22.5 Open Before Building

Settled 2026-11-18 by the build plan, §23: the hit list (E2: a walk over the layer tree, no list), skipping subtrees (E2, E3), which events to dispatch (every type, as below), transparent hit areas (not in W1), the listener counts of §22.3 (dropped, E1).

- **The hit list with every shape:** `registerElement()` checks with `includes()` and `unregisterElement()` removes with `indexOf()` (`js/interaction.js`), both O(n) per shape. Measured 2026-11-17 (`design/prototypes/2026-10-30_framework_compatibility/open_points_dom_model.html`, headless), registering / unregistering every shape: 1,000 shapes 0.6 / 0.8 ms, 5,000 3.2 / 1.8 ms, 10,000 11.1 / 5.3 ms; with an index per shape (`removeFromArray()` swaps in the last element, the index follows it) 0.3–0.4 ms at every size. Only on insert and remove, never per frame: small, but build the index (about 10 lines) with a scaling check, and sort only when the order is dirty, as today.
- **Skipping a subtree:** the hit list is flat (every shape, DOM order across layers). To leave out a layer or group with `pointer-events: none` without walking every shape's parent chain, either keep one list per layer and skip whole layers, and check groups only for candidates, or mark the shapes under such a group once per frame (a frame stamp). To decide while building; layers are the common case (particles).
- **Which events to dispatch:** §4.5 dispatches only event types that have listeners (per-type counts). Delegated listeners can't be counted, so in the DOM-like model the enter / leave events (`pointerover`, `pointerenter`, `pointerout`, `pointerleave`) are dispatched on every change, and `pointermove` on the shape under the pointer in every pointer frame: one event object per frame while the pointer moves over a shape, like the browser's own events. Measured 2026-11-17 (same prototype): about 6 µs per `pointermove` created and dispatched on a shape, with no listener, with one on `document`, or with five more on the way up. Settled: dispatch every type.
- **Transparent hit areas:** `hasFill()` treats `fill="transparent"` like `none`, so such a shape is never hit (today and in both models). In SVG, a transparent fill catches events, and an invisible, larger hit area around a small shape is a common idiom. Decide whether `transparent` (and fully transparent colors) count for hit testing but not for drawing. Today's workaround: `fill="rgba(0,0,0,0)"`, which `hasFill()` accepts.
- **Text before its first draw:** its box comes from `draw()` (`_hasInk` false until then), so it can't be hit before it was drawn once; the same as today.
- **Custom shapes without `getBoundingBox()`** keep the exact test (slower, correct); the shape authoring plan (`design/2026-10-17_shape_authoring_plan.md`) already asks for `getBoundingBox()`.
- **Code size:** estimated 2026-11-17 for the whole of W1 (engine, comments included): about 160–195 lines with `interactive`, about 200–265 with the DOM-like model (+40–70 lines, about +1 KB minified), of which 130–155 are common (event dispatch, D4, event objects, listener counts, the rename).
- **Tests that change:** T-E3 (§11: a shape without a listener is not hit-tested) inverts; T-E2 drops `interactive`; the "every shape registered" break of §21 no longer fails a test. New: hit with the box pre-check equals the exact test (the prototype's check as a test), `pointer-events: none` on a shape, inherited from a group, on a layer, CSS `cursor`, inserting and removing 5,000 shapes stays linear (a scaling check).
- **Docs:** `docs/frameworks.html` without the `interactive` rule; the AI guide's "Interactive Elements"; a rule for decorations: `pointer-events: none`, or a group around the parts of a button (events bubble from a shape to its group).
- **Existing pages:** every visible shape now catches clicks and hover, so a label or helper drawn on top of a shape with `pxl-on-click` takes the click, and `isHovered` of a covered shape turns false. Check the interactive pages by hand (`examples/test32.html`, `test33.html`, `test37.html`, `test52.html`, and any docs page with hover or click); the page sweep only finds console messages.

### 22.6 The Two Models Compared (2026-11-17, Before the Decision)

| | `interactive` model (§4.2) | DOM-like model (§22.3, decided) |
|---|---|---|
| Engine code for W1 (estimate) | about 160–195 lines | about 200–265 lines |
| Existing pages | behave as today | decorations on top need `pointer-events: none` (§22.5) |
| Vue, Angular, Lit, Alpine, plain JS | work without an attribute | work without an attribute |
| React, Svelte, Solid (delegated listeners) | `interactive` on every shape they listen to; forgetting it fails silently | work as written |
| Hand cursor | handlers, click listeners, `interactive` | handlers, click listeners, CSS `cursor` |
| Known from | PixiJS (`eventMode`, formerly `interactive`) | DOM, SVG, react-konva |
| Hit testing | as today, unless the box pre-check is built too | 5–25× faster than testing every path |

`interactive` was simpler and changed nothing for existing pages; the DOM-like model fits the main goal (frameworks work as written), and its technical open points measured small (§22.4, §22.5). Pre-release, so the behavior change for decorations costs nothing; after a release, switching in either direction would have been a breaking change.

## 23. W1 Build Plan (Decided 2026-11-18)

Review of §4 and §22 against the engine after the pointer frame order change (`design/2026-11-17_pointer_frame_order_plan.md`), with edge cases, size and per-frame cost. Checked in the browser on 2026-11-18: `pointer-events` and `cursor` on a layer or group reach the shapes by CSS inheritance (through the layer's `<slot>`); an object from `getComputedStyle()` stays live, a new call returns a new object, and one read costs about 1 µs either way; an event dispatched on a shape (`display: none`) reports `offsetX` / `offsetY` equal to `clientX` / `clientY`.

### 23.1 Steps (One Commit Each)

| Step | Contents | Tests that turn into `test()` |
|---|---|---|
| 1 | Rename the handlers (D1): `pxl-on-click`, `pxl-on-enter`, `pxl-on-leave`, `pxl-on-down`, `pxl-on-up`, `pxl-on-move`; no warning and no fallback for the old names (pre-release, no backwards compatibility). Migrate `examples/test32.html`, `examples/test37.html`, the test pages, KILOPIXEL.md | T-E6, C7 |
| 2 | Hit-test every shape (D10, D11): E2–E5 below; `pxl._interactiveIds`, `pxl._stickyIds`, `releaseIfUnused()`, `registerElement()` / `unregisterElement()` and the auto-registration in `pxl.trackInteractiveRefs` go (`pxl._pressableIds` stays until step 3, for the cursor). Measurement gate (§23.4) | T-E3 inverted |
| 3 | DOM events on shapes (§4.1, D4, D5): E1, E6–E10; `process()` dispatches enter / leave / over / out and `pointermove`, collected during the hit walk and dispatched after it; `click`, `pointerdown`, `pointerup` are hit-tested when they arrive. The cursor becomes CSS only (E1): the handler rule in `pxl.DEFAULT_STYLES`; `pxl._pressableIds`, `isClickable()` and what is left of `pxl.trackInteractiveRefs` go; pages that relied on "`isPressed` read → hand" get `cursor: pointer`. Groups get handlers and hover / press states (E10); `examples/test37.html` then writes each node as a group (rect + icon, handler on the group) and drops the `pointer-events: none` of step 2. Check `examples/test32.html`, `test33.html`, `test37.html`, `test52.html` by hand | the other known tests of `tests/frameworks.html` (T-E2 without `interactive`, the removed-listener test moved to the new model); new: group handlers, group enter / leave only at the group's edge, group `isHovered` / `isPressed`, the bubbling order shape → group → outer group, the inherited hand cursor (E10) |

Each step: `node build.js`, the sizes in the docs, KILOPIXEL.md in the same change, `node tools/run_tests.js` passing.

### 23.2 Decisions E1–E9

| # | Decision | Why |
|---|---|---|
| E1 | **No `addEventListener` override, no listener counts; the cursor is only CSS.** The engine shows the shape's computed CSS `cursor` (read when the pointer enters a shape, inherited from groups and layers); over empty space, or when it is `auto`, it removes its inline `cursor`, so page CSS applies. The hand for handlers is a rule of the default styles, like the browser's own rule for links: `[pxl-on-click], [pxl-on-down], [pxl-on-up] { cursor: pointer }` in `@layer pxl` (`pxl.DEFAULT_STYLES`), so a page can override it. The rule "`isPressed` is read somewhere → hand" (`pxl._pressableIds`) goes; such pages write `cursor: pointer`. Replaces the listener part of D5 (changed 2026-11-18, after the comparison with React, Vue and Tailwind habits, §23.6) | Listeners removed with `{ once: true }` or an `AbortSignal` never pass `removeEventListener()`, and a listener added twice is kept once: counts drift. The DOM shows no hand for an element with a click listener either (React `<div onClick>`). One mechanism: before, `pxl-on-click` gave a hand and a framework's `@click` didn't, so replacing one with the other lost the hand without anything visible changing. The `isPressed` rule can't be written in CSS |
| E2 | **Hit-test by walking the layer tree in reverse** (layers, then `childList`), not a flat list of every shape; the exact test sets the shape's global matrix (translation × `u`) on `pxl.dummyCtx` instead of walking its parents | A flat list needs sorting: 5,000 shapes cost about 30 ms with `compareDocumentPosition()`, and particles inserted out of order would sort it while the pointer is over the stage. The walk reuses the sorted `childList`, needs no index and no registration, and skips hidden subtrees on the way |
| E3 | **`pointer-events`** is read for each layer once per pointer frame (also `display` and `visibility`, so a layer hidden by CSS isn't hit) and for the 1–4 shapes that pass the box check; groups and shapes inherit it. The `getComputedStyle()` objects are cached per element | A read costs about 1 µs; pages with hundreds of groups would pay for reading every group |
| E4 | **`pxl-grid { pointer-events: none }`** in `pxl.DEFAULT_STYLES` | The grid's box is infinite, so it would get the exact test (its whole path with labels) in every pointer frame on almost every docs stage, and catch hover between its lines. A page can set `pointer-events: auto` |
| E5 | **Box check:** only the inverse matrix is cached (per shape, by global matrix version, allocated on the first test); the padded box (stroke, miter, square cap, arrowheads) is computed in every test. Smooth polylines and custom shapes without their own `getBoundingBox()` get the exact test; the latter are detected by comparing the method with `pxl.Shape.prototype.getBoundingBox`, without calling it | The prototype's cache of the box goes stale after `setAttribute('r', …)` on a static shape (`r` doesn't change the matrix). The base `getBoundingBox()` warns on every call |
| E6 | **`pointerenter` / `pointerleave` also on the groups entered or left** (from the common ancestor down), and **`relatedTarget`** on `pointerover` / `pointerout` (the shape left or entered, or the layer) | React builds `onPointerEnter` from `pointerover` / `pointerout` and their `relatedTarget`; with `null` it treats the pointer as coming from outside the page. A group around the parts of a button needs its own enter / leave |
| E7 | **`click` on a shape only when `pointerdown` and `pointerup` hit the same shape**; otherwise the browser's click passes to the stage | DOM rule: pressing on A and releasing on B is no click on B |
| E8 | **`pointercancel` resets `isPressed`** (like a release without `pxl-on-up` and `click`) | On touch devices, scrolling cancels the pointer; `isPressed` would stay `true` (also today) |
| E9 | **Documented limitation:** capture listeners above the stage (React `onClickCapture`) see the browser's `click` (target: the layer) before Kilopixel's | Avoiding it needs a capture listener on `window` per stage; more code for a rare case |
| E10 | **Groups get handlers and hover / press states, in addition to shapes** (added 2026-11-18): `pxl-on-click`, `-down`, `-up` (the press or click hit a shape inside the group), `pxl-on-enter` / `-leave` (the pointer enters or leaves the group as a whole: moving between shapes inside it fires nothing on the group, as `pointerenter` / `pointerleave` in the DOM), `pxl-on-move` (moving over any shape inside it), and `ref.<group>.isHovered` / `isPressed` (true while a shape inside it is hovered or pressed, like CSS `:hover` on a parent). Shape handlers stay. With handlers on both, the shape's runs first, then its group's, then the groups further out (the DOM's bubbling order); `pxl-on-*` handlers get no event object, so a shape can't stop its group's handler (framework listeners can, with `stopPropagation()` on the DOM event). The hand cursor of E1 comes along: `[pxl-on-click]` matches the group, and CSS inheritance passes `cursor: pointer` to every shape inside it. Layers get no handlers: a layer fills the stage, and `ref.<stage>.isHovered` covers "the pointer is over it". The group states change only when the hovered or pressed shape changes: the engine walks up from the old and the new shape to their common group, which E6 does anyway; no per-frame work | In the DOM, a button's label sits inside the button, and a click on the label bubbles up to it. With handlers and states only on shapes, a label or icon can only sit next to the clickable shape, on top of it, and catches the pointer: in `examples/test37.html` the icon texts covered 7 % of the nodes (a text is hit on its whole box, `design/2026-10-13_text_hit_testing_plan.md`; thin lines on top covered 0.4 %, only on their own pixels, measured 2026-11-18). With group handlers, `<pxl-group pxl-on-click="…"><pxl-rect …><pxl-text …></pxl-group>` needs no `pointer-events: none` |

Not in W1 (unchanged): `fill="transparent"` as a hit area (§22.5; today `rgba(0,0,0,0)`), coordinates on events (D3: none), properties (W3).

### 23.3 Edge Cases

- **Kilopixel's own events reach the stage's listeners:** its `pointermove`, `pointerdown`, `pointerup` and `click` bubble from the shape to the stage, and the D4 capture listener sees them in the capture phase. The stage ignores events it dispatched itself (a flag while dispatching); `isTrusted` can't decide it, because the tests dispatch untrusted events.
- **Hit test when `click`, `pointerdown` or `pointerup` arrives** (D4): with the event's own position, so a tap without a move before it is hit too (`design/archive/2026-11-15_handler_errors_plan.md` §5). The handlers and `isPressed` run then, outside the frame; their changes are drawn in the next frame, which is the frame of the event.
- **`preventDefault()`** on Kilopixel's `pointerdown` or `click` is passed on to the browser's event.
- **Listeners during `process()`** may remove shapes or stages: the events are collected during the hit walk and dispatched after it, from a preallocated queue. A listener that throws is reported by the browser and doesn't stop the dispatch.
- **A shape removed while hovered or pressed** clears its state and broadcasts (`unregisterElement()` did this until now).
- **Decorations on top catch events** (labels, helpers, `mask` shapes used as erasers): `pointer-events: none` in the markup. The four interactive example pages are checked by hand.
- **`offsetX` / `offsetY`** on shape events equal `clientX` / `clientY` (measured above); documented: use `clientX` or `ref.<stage>.mouseX`.
- **`setPointerCapture()`** on a shape (drag libraries call it on `event.target`): no error with an inactive pointer; with a real drag, check by hand in step 3.

### 23.4 Size, Per-Frame Cost and GC (Estimated 2026-11-18)

| Step | Engine lines (net, with comments) | Minified |
|---|---|---|
| 1 | +15 | +0.3 KB |
| 2 | +120 / −50 ≈ +70 | +1.3 KB |
| 3 | +130, and +40–60 for E10 (added 2026-11-18) | +2.2 KB, +0.8 KB for E10 |
| Total | ≈ +265 (`interaction.js` about 262 → 450) | 59.3 → about 64 KB; gzipped 17.7 → about 19 KB |

Based on about 17–18 minified bytes per source line (60.8 KB for about 3,450 lines). Tests: about +250 lines.

- **Drawing and the update phase:** unchanged.
- **Pointer outside the stage, or a static page:** no cost (no frames without animation; hit testing only while the pointer is over the stage).
- **Pointer over an animated stage:** the hit walk runs every frame. Prototype (§22.2, headless, 2–3× slower than the browser): 0.1–0.4 µs per shape, so 1,000 animated shapes about 0.15–0.4 ms per frame, 5,000 about 0.4–1.8 ms. **Gate after step 2:** measured in the engine in the browser; above about 0.3 ms for 1,000 animated shapes, a resting pointer is re-tested at most every 100 ms (about 6 lines).
- **Allocations:** none per frame in the walk and the box check (inverse matrices once per shape on its first test, style objects cached). Events allocate only on change or movement: one `PointerEvent` per frame while the pointer moves over a shape (about 6 µs), plus enter / leave events when the hovered shape changes; one reused init object.
- **Memory:** about 100 bytes per shape for the inverse matrix, only for shapes the pointer has reached (5,000 shapes: about 0.5 MB).

### 23.5 Step 1 Built 2026-11-18: Handler Rename

- **Engine** (+12 / −8 lines, comments included): `Shape.HANDLER_EVENTS` and `observedAttributes` use `pxl-on-click` … `pxl-on-move`; the message of a failing handler names `pxl-on-<event>`. **No warning for the old names:** built first (once per name and page), then removed the same day, because Kilopixel needs no backwards compatibility. A leftover `onclick` on a shape does nothing until step 3; afterwards the browser runs it as page JavaScript on Kilopixel's `click`, where `ref` doesn't exist.
- **Size:** 59.34 → 59.41 KB minified (+0.07 KB, estimated +0.3 with the warning), gzipped 17.67 → 17.66 KB; the docs keep ~59KB and ~18KB.
- **Migrated:** 34 handlers in `examples/test32.html` (25), `test33.html` (5, missed by the count of §4.3, found by the page sweep through the warning before it was removed) and `test37.html` (4); the test pages (`tests/index.html`, `tests/scaling.html`, `tests/unit.html`, which now takes the handler names from `pxl.Shape.HANDLER_EVENTS`); `.agents/KILOPIXEL.md`; the docs API reference of the events tab (`docs/js/api-tabs.js`). The prototypes in `design/prototypes/` keep the old names as history.
- **Tests:** T-E6 and C7 in `tests/frameworks.html` are ordinary tests now (18 passing, 18 known); `node tools/run_tests.js` passes, no console messages on the 79 pages.

### 23.6 What React, Vue and Tailwind Users Expect (Checked 2026-11-18)

**As in the DOM, so as expected:** a `<div onClick>` (React) or `<div @click>` (Vue) shows no hand until `cursor: pointer` is set, and so does a shape with a framework listener; `style={{ cursor: 'pointer' }}`, `:style`, and Tailwind `cursor-pointer` / `pointer-events-none` on a shape, group or layer work (CSS, E1, E3). Canvas libraries are less convenient here: in react-konva, for example, the cursor is typically changed by hand in `onMouseEnter` / `onMouseLeave`.

**Inconsistent before, fixed in E1:** a `pxl-on-click` handler gave the hand automatically and a framework's `@click` didn't. The handler hand is now a rule of the default styles, so both go through CSS, and a page can override it.

**Known limits** (not part of W1; each needs its own decision):

| Expected | Today and after W1 | Next |
|---|---|---|
| `:hover` in CSS, Tailwind `hover:` classes | Never match a shape: the browser doesn't know that the pointer is over a drawn circle. Hover styling stays `fill="ref.btn.isHovered ? …"`. The cursor needs no `hover:` variant: `cursor-pointer` only shows while the pointer is over the shape | Docs (`docs/frameworks.html`). Possible later: a custom state on hovered and pressed shapes (`pxl-circle:state(hover)`), for CSS properties such as `cursor`; drawing attributes (`fill` …) are no CSS properties |
| `event.target.getBoundingClientRect()` for tooltips and popovers | Zeros: shapes are `display: none` in the page | Not planned yet: a way to get a shape's box on the page (a method, or `ref` values in page coordinates); its own plan |
| Keyboard and focus for clickable things (Tab, Enter) | Shapes can't be focused and don't react to keys | Accessibility, its own plan later |
| `offsetX` / `offsetY` on shape events | Equal to `clientX` / `clientY` (§23.3) | Docs note: use `clientX` or `ref.<stage>.mouseX` |

### 23.7 Step 2 Built 2026-11-18: Every Shape Is Hit-Tested

- **Engine** (+208 / −152 lines in `js/`, comments included):
  - `js/interaction.js`: `InteractionEngine.findShapeAt(x, y)` walks `stage.layers` and their `childList` in reverse drawing order (E2); `hitsShape()` runs the box check, then the shape's CSS `pointer-events`, then the exact test with the shape's global matrix set on `pxl.dummyCtx`; layers are skipped for `hidden`, `pointer-events: none`, `display: none` and `visibility: hidden` (E3). `releaseElement()` clears the states of a shape that leaves the DOM. Gone: `_interactiveElements`, `registerElement()`, `unregisterElement()`, `releaseIfUnused()`, `pxl._interactiveIds`, `pxl._stickyIds`, `pxl.INTERACTIVE_STATES`, the parent-chain transform stack. `pxl.trackInteractiveRefs()` became `pxl.trackPressedRefs()` (only `isPressed`, for the cursor until step 3).
  - `js/elements/shape.js`: `mayContainPoint()`, `needsExactHitTest()`, `hitPadding()` (E5); `hasEventHandlers()` and the registration in `attributeChangedCallback()` / `connectedCallback()` are gone. `js/elements/shapes/polyline.js`: smooth polylines need the exact test. `js/graphics.js`: `pxl.arrowSize()`, shared with `resolveArrow()`.
  - `js/elements/node.js`: `getInverseGlobalMatrix()` (created on first use, inverted again only when the global matrix version changed), `cssStyle()` (the live `getComputedStyle()` object, kept per element), and `childList = null` on every node, so the hit walk and the matrix walk read an own property instead of searching `HTMLElement`'s prototype chain (measured: the walk without box checks went from 0.28 to 0.11 ms for 1,000 shapes). `isRegistered` became `_isRegistered` (only `node.js` uses it now).
  - `js/elements/stage.js`: `pxl-grid { pointer-events: none }` in `pxl.DEFAULT_STYLES` (E4); `_layers` became `layers` (read by the hit walk).
- **Measurement gate** (`design/prototypes/2026-10-30_framework_compatibility/hit_walk_bench.html`, browser pane, hidden, frames by hand): one full hit test costs about 0.4–0.6 ms for 1,000 shapes and 2–4 ms for 5,000 (0.4–0.8 µs per shape; the estimate of §23.4 was 0.1–0.4). Two things found while measuring: `save()` / `restore()` around every shape's test (about 1 µs per pair, now only around the exact test) and the `childList` lookup above. Above the gate's 0.3 ms, so **a resting pointer is tested again at most every `pxl.RESTING_HIT_INTERVAL` (100 ms)**; any pointer event tests in its frame. `process()` with the pointer resting: 0.03–0.04 ms per frame for 1,000 animated shapes, 0.11–0.16 ms for 5,000. While the pointer moves, the full walk runs in every frame. Possible later, if a page needs it: cache the padded box per shape (`hitPadding()` and the destructuring cost about 0.2 µs per shape).
- **Size:** 59.41 → 59.95 KB minified, gzipped 17.66 → 17.89 KB; the docs say ~60KB and ~18KB.
- **Behavior change on the example pages** (checked with a script that samples the clickable shapes' own hit areas): in `examples/test37.html` the icon texts and two connecting polylines drawn on top of the four clickable nodes covered about 9 % of each node; they got `pointer-events: none`. test32, test33 and test52 had nothing on top of their interactive shapes.
- **Tests:** `tests/index.html` 123 (+1 known): every shape is hit-tested with or without handlers or readers; the box check finds the same shape as the exact test at 2,000 points in a scene with strokes, miter corners, square caps, arrowheads, a negative width, rotated, skewed and mirrored groups, text and a smooth curve (checked that it fails without the stroke padding: 20 of 2,000 points); CSS `pointer-events: none` on a shape, a group (with `auto` inside it) and a layer; a layer hidden by CSS; the grid out by default and in with `pointer-events: auto`; a shape changed with `setAttribute()` is hit at its new size and place; the resting-pointer interval; a hovered and pressed shape that is removed gives up both states. Replaced: the lazy-unregister test and the lifecycle test that read the registration list (now: a shape moved to another stage is hit there). `tests/frameworks.html`: T-E3 inverted (a plain shape is hit-tested). `tests/scaling.html`: the hit-testing check times `findShapeAt()` on plain shapes (`process()` now skips the walk while the pointer rests). Three tests that set `mouseX` directly now also mark it like a `pointermove`.
- **Archived:** `design/archive/2026-10-15_interactive_state_auto_registration_plan.md` (⚪ superseded: nothing is registered any more).

### 23.8 Step 3 Built 2026-11-19: DOM Events on Shapes and Groups

Built as decided in §23.1–§23.3, with five changes agreed before building (A–E) and eight additions for framework compatibility (F–M). Together with steps 1 and 2, W1 is complete.

- **Layer `pointer-events` (found in `examples/test54.html` on 2026-11-18):** `findShapeAt()` skips a layer only for `hidden`, `display: none` and `visibility: hidden`. Its `pointer-events` is inherited by its shapes, so a shape with `pointer-events: auto` inside a layer with `none` is hit, as in CSS and for groups since step 2. **Cost** (`design/prototypes/2026-10-30_framework_compatibility/hit_walk_bench_layer_none.html`, browser pane): such a layer now costs what any layer costs, 0.35–0.4 ms per full walk for 1,000 shapes and about 2.5 ms for 5,000 (before: nothing). With a resting pointer the 100 ms interval keeps it small; while the pointer moves, a 5,000-shape layer with `none` adds about 2.5 ms per frame. There is no cheap way left to take a layer out of the walk; an explicit opt-out could come later if a page needs it.
- **Changes to the plan (A–E):**
  - **A.** `pxl-on-*` handlers are listeners on their element for the matching DOM event (`pxl.HANDLER_EVENTS`: `click`, `pointerenter`, `pointerleave`, `pointerdown`, `pointerup`, `pointermove`), compiled by `pxl.compileHandler()` and swapped by `PxlNode.setHandler()`. The engine only dispatches DOM events; group handlers (E10) come through bubbling; a shape's handler runs before its group's. Differences from §4.1 / E10: on one element, handlers and framework listeners run in the order they were added, and a framework listener's `stopPropagation()` also stops the handlers of the groups further out (as with inline handlers in HTML). Any `click` on the element runs `pxl-on-click`, also `shape.click()` and Testing Library `fireEvent`.
  - **B.** E7 follows the DOM rule: the click goes to the nearest shape or group that holds both the press and the release (rect and label of one group → the group); pressed on one shape and released on another, the browser's click passes to the stage.
  - **C.** The stage ignores its own events by identity (the event it is dispatching), not with a flag, and hit-tests only events whose target is a layer or the stage (the canvas). Other targets (a captured shape, `shape.click()`, HTML content in a layer) pass unchanged.
  - **D.** A press or release that arrives without a move before it first moves the pointer and runs the hover change, so `pointerover` / `pointerenter` come before `pointerdown`.
  - **E.** One innermost hovered and one innermost pressed node (a shape or a group). A shape or group removed from the page passes its state to its nearest group still in the page, which stays hovered without new enter events.
- **Additions (F–M):** mouse events with the pointer events (`mouseover` … `mouseleave`, `mousemove`; `mousedown` / `mouseup` handled like `pointerdown` / `pointerup`) (F); `dblclick` and `contextmenu` like `click` (G); `mouseX`, hover and `isPressed` follow the primary pointer, other touch points get their own presses, releases and clicks (H); a capture listener on `window` while a press is held ends a press released outside the stage, also for a stage in a shadow root (`composedPath()`) (I); the cursor on the layer canvases (`Layer.setCursor()`), read in every hit test, never inline on the stage (J); more fields on the events (pen fields, `movementX` / `movementY` summed since the last dispatch) (K); leaving the stage dispatches the leave events when the browser's `pointerout` of the layer arrives, before the page sees it (L); events caused during a dispatch go into the same queue (M).
- **Engine** (+531 / −177 lines in `js/`, comments included; `interaction.js` 258 → 597 lines):
  - `js/interaction.js`: `handleEvent()` handles the arriving events (capture phase) and the moves; `hover()` sets `isHovered` on the nodes left and entered and queues the boundary events with `relatedTarget`; `press()` / `endPress()` / `cancelPress()`; `releaseElement()` / `reset()`; `updateCursor()`; `queue()` / `flush()` / `dispatch()` / `redispatch()`; the hit cache for the events of one click (`hitAt()`); pointer capture (`gotpointercapture`, `lostpointercapture`, positions from `clientX` and the stage's box). Gone: `pxl._pressableIds`, `pxl.trackPressedRefs()`, `callHandler()`, `_hoveredElements`, the click / down / up flags of `process()`.
  - `js/elements/node.js`: `setHandler()`; `attributeChangedCallback()` passes handler attributes to it. `js/elements/shape.js`: no own `attributeChangedCallback()` and no `isClickable()` any more. `js/elements/group.js`: the six handler attributes, `isHovered` / `isPressed` in `defaults`, `stage`, and `releaseElement()` on disconnect. `js/elements/stage.js`: `ARRIVING_EVENTS` (capture phase), the handler cursor rule in `pxl.DEFAULT_STYLES`, `interaction.reset()` on disconnect. `js/elements/layer.js`: `setCursor()`. `js/engine.js`: no `trackPressedRefs()` call.
- **Size:** 59.93 → 66.25 KB minified, gzipped 17.88 → 19.55 KB (the docs say ~66KB and ~20KB). More than the estimate of §23.4 (about 64 KB): `interaction.js` alone grew from 4.4 to 10.5 KB minified, with more lines than estimated (mouse events, `dblclick` / `contextmenu`, multi-touch, pointer capture, the release outside the stage); property names are not mangled.
- **Hand checks** (browser pane, real mouse input through the pane):
  - A real `setPointerCapture()` drag (`design/prototypes/2026-10-30_framework_compatibility/w1_drag_capture.html`): capture taken in Kilopixel's own `pointerdown` works; the browser then sends trusted moves, the release and the click to the shape; one `pointermove` per frame (no duplicates from Kilopixel), `isPressed` true during the drag and false after it, exactly one click, no errors. Checked before building on a plain page: `setPointerCapture()` works on a `display: none` element, and the captured events report `offsetX` equal to `clientX`.
  - A static layer with handlers, listeners and a group but no readers (`design/prototypes/2026-10-30_framework_compatibility/w1_idle_layer.html`): moves, a click and hover over shapes and empty space ran one frame per browser event, none while the pointer rested, and the layer was never updated or drawn; the group's `pxl-on-click` ran once; the cursor showed over a shape with a CSS `cursor`.
  - `examples/test32.html` (enter / leave / down / up handlers), `test33.html` (static; its layer redraws because it reads `ref.main.mouseX`), `test37.html` (nodes as groups: hovering the icon hovers the node, one click counts once, the hand on all four canvases), `test52.html`, `test54.html` (over the 12 o'clock tick the face stays hovered): every interactive shape is the topmost hit at its center, and real hover and clicks work.
- **Examples:** `examples/test37.html` writes each node as a group (rect + icon, handler and states on the group), without `pointer-events: none` on the icons; the two connecting polylines keep it (decorations crossing the scene). test33 needed nothing: its bars have `pxl-on-click`, which gives the hand.
- **Tests:** all ten W1 `test.known()` of `tests/frameworks.html` are ordinary tests (T-E2 without `interactive`, now with `relatedTarget`; the removed-listener test checks `removeEventListener()`, `{ once: true }` and an `AbortSignal`); T-E7 probed the rect's edge and now probes its center. New in `tests/frameworks.html` (43 tests, 8 known: W3 and T-N1): mouse events in order, `dblclick` / `contextmenu` with `preventDefault()`, `preventDefault()` passed on, E7 with a group, `pointercancel`, a release outside the stage (also in a shadow root), a second touch point, pointer capture, own events don't move `mouseX`, `movementX` summed, the leave order when leaving the stage, a listener that moves the pointer during dispatch, an unmount in `pointerdown`, the CSS cursor (also after a change while hovered, never on the stage); T-H1 now allows only `aspect-ratio` inline on the stage. New in `tests/index.html` (128): the handler cursor rule (also on a group, overridden by page CSS, none for an `isPressed` reader), group handler order (shape, inner group, outer group; nothing on the group between its shapes), group `isHovered` / `isPressed`, a removed shape leaves its group hovered, a layer without animations or readers is neither updated nor drawn by any pointer input, `pointercancel` and a release outside the stage; the layer fix in the `pointer-events` test; the handler-error click test dispatches a real click. `tests/unit.html`: handlers set, emptied and removed on shapes and groups, as listeners. `node tools/run_tests.js` passes, no console messages on the 80 pages.
- **Docs:** the events tab of the API reference (`docs/js/api-tabs.js`): the handlers (also on groups), the states, and a new part "DOM Events (JavaScript and Frameworks)" with the events, `offsetX` (use `clientX` or `ref.<stage>.mouseX`), cursor and `pointer-events`, `touch-action` for drags on touch screens, and the known limits (E9, `:hover`). `.agents/KILOPIXEL.md`: Interaction System (new parts States, Handlers and DOM Events; Cursor), Group reference, Event Handling, AI guide §7 (a button as a group).
- **Found, not part of W1:** with zone.js (Angular before zoneless), every frame of an animated stage runs change detection, because the frames come from patched `requestAnimationFrame`; worth a docs note (`runOutsideAngular()`) with the framework docs (§19.4 step 5).
- **Fixed 2026-11-19 (found with a React 19 page, `scratch/` (not kept)):** React's `onPointerEnter` on a group never fired when the pointer came from empty space. React builds enter / leave only from `pointerout` and ignores a `pointerover` whose `relatedTarget` is an element it rendered (the layer); Kilopixel sent no `pointerout` on the layer, because the browser sends none while the pointer stays on one canvas. Now `hover()` treats the layer as the element under the pointer over empty space: `pointerout` / `mouseout` on the layer when the pointer moves onto a shape, `pointerover` / `mouseover` on it when the pointer moves off. Scripted checks had missed it because they reached the group from another shape. New test: a delegated listener with React's rule; T-E2 and the leave-the-stage test expect the layer events.
- **Next:** §19.4 step 4, properties (W3).

## 24. W3 Properties (Decided and Built 2026-11-19)

Step 4 of §19.4. Built as proposed in §6, with the decisions and additions below (agreed before building, after a review of edge cases and of the cost of framework updates in every frame).

### 24.1 Decisions

| # | Decision | Why |
|---|---|---|
| P1 | **One path for attributes and properties:** `PxlNode.setValue(name, value)`, then `valueChanged(name)`. A string or `null` goes through `pxl.compileAttribute()`, any other value is stored as it is (`pxl.storeValue()`); the same parsed value again is skipped | Numbers, arrays and objects need no parsing; frameworks and hydration set unchanged values again |
| P2 | **Accessors defined lazily per class** (`pxl.defineAccessors()`, the first instance of a class), for every observed attribute except hyphenated names and names the prototype already has | Custom shapes get them without calling anything; `id`, `hidden` and a class's own getters keep theirs |
| P3 | **D8 for every attribute:** any non-string value is stored as given (arrays by reference, gradient descriptors), no per-attribute list | The parsed form of an attribute string is the same kind of value |
| P4 | **`text` as a property is literal** (decision 1 of the review): a string set as `el.text` is never compiled | Frameworks bind data to it; compiling data runs it as code (`alert(1)`) or fails (`Q1 - 2024`) |
| P5 | **A function value warns once per element** and leaves the value (decision 2) | `x={() => …}` would otherwise throw inside the framework's render; functions as values stay "later" (§6.1) |
| P6 | **`ref.<id>.set()`** passes non-strings through the property; strings still compile; an unknown name warns once (T-N1, §10) (decision 3) | Handlers pass numbers without compiling, `set('linedash', [20, 10])` keeps the array |
| P7 | **Values set before the upgrade** are taken in the constructor (`Object.keys(this)` before any field exists) and set again at the start of `connectedCallback()`, after the attributes | The framework's value wins over server HTML (§6.2 placed it in the constructor or `connectedCallback`) |
| P8 | **Stage:** `ratio` and `alwaysrender` properties write the attribute | Two values, set rarely; the attribute path parses them |
| A | **CSS colors stay text:** `hsl()` / `hsla()` with `%`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()` are not compiled, like `rgb()` | Measured: a new `hsl()` string compiled in about 90 µs and took a cache slot; a color animated through framework state on 100 shapes cost about 9 ms per frame and churned the cache |
| B | **Points:** an array (flat or pairs) is read in place; with the same number of coordinates the keys and the buffer stay | Measured: 200 points by attribute about 150 µs and new objects per set |

### 24.2 Built

- **Engine** (`js/engine.js`: `pxl.storeValue()`, `pxl.defineAccessors()`, `pxl.takeOwnProperties()`, `pxl.setPendingProperties()`, `pxl.setFromRef()`, `pxl.warnFunctionValue()`; `js/elements/node.js`: `setValue()`, `valueChanged()`, the pending properties; `js/elements/shapes/polyline.js`: `points` accessor, `setValue()`, `setPoints()`, `resizePoints()` (replaces `clearPoints()`); `js/elements/shapes/text.js`: the literal `text` accessor; `js/elements/variable.js`: `valueChanged()` asks for a frame; `js/elements/stage.js`: `ratio`, `alwaysrender`, `reflectAttribute()`, pending properties, `set()`; `js/compiler.js`: `pxl.CSS_HSL_REGEX`, `pxl.CSS_COLOR_FUNCTION_REGEX`).
- **Size:** 66.25 → 69.45 KB minified, gzipped 19.55 → about 20.5 KB (the docs say ~69KB and ~21KB); more than the estimate of about +2 KB: the warnings' messages and unmangled property names.
- **Cost** (`design/prototypes/2026-10-30_framework_compatibility/w3_property_costs.html`, headless with `gc()`, per set, one reader of the shape):

| Update | Before | Now |
|---|---|---|
| `x` as a number | 3.8–5.2 µs (`setAttribute()`) | 0.5 µs, 24 bytes (the boxed decimal number, as in any animation) |
| `fill` with a new `hsl(…, 50%, 50%)` | about 90 µs, one cache entry | 0.7–1.3 µs, no cache entry |
| `text` with a new string | compiled when it looked like code | 0.2–0.4 µs, nothing allocated |
| 200 points | 110–176 µs (`setAttribute()`) | 20 µs as a number array, nothing allocated (a first version that copied the array: 51 µs and 2.2 KB per set) |

- **Per frame:** nothing; the engine never calls the accessors while drawing. Per element: one `Object.keys()` on the fresh element and one field. Per class: about 40 `defineProperty()` once.
- **Tests:** the seven W3 tests and T-N1 of `tests/frameworks.html` are ordinary tests (57, none known). New there: a property before the upgrade wins over the markup's attribute; the last change wins between property and attribute, the attribute is not written; properties on a detached tree, with a ref expression that follows its target and a `<pxl-var>` `value` property; arrays and gradient objects stored as given, 360 `hsl()` colors without cache growth; the same value again leaves the layer clean; `ref.<id>.set()` with numbers, arrays and strings. `tests/unit.html` (82): every attribute of every element is a property (number, `undefined`, `null`, no attribute written), generated like Rule A; `points` as a string, flat array, pairs and expression strings; the stage properties; literal `text`; the function warning; the CSS color fast path (and `hsl(120, 50, 40)` still compiled). `tests/scaling.html`: setting a property on n shapes with readers is linear.
- **Docs:** `.agents/KILOPIXEL.md` (new section "Properties (JavaScript and Frameworks)", parser rules, `linedash`, `set()`, `points`, `<pxl-var>`, stage, text, `PxlNode` methods); the API reference (`docs/js/api-tabs.js`): a "Properties" item in the JavaScript and frameworks part of the events tab.
- **Found, not part of W3:** a change of a layer's `alpha`, `blend` or `filter` (property or attribute) redraws all its shapes; only animated compositing values use the CSS-only fast path. A framework that fades a layer in every frame pays a full redraw (TODO §30).
- **Next:** §19.4 step 5, distribution and docs (W8); smoke pages first (§25).

## 25. Framework Smoke Pages (Built 2026-11-19)

The conformance tests (§11, `tests/frameworks.html`) imitate what frameworks do with plain DOM calls; they can't know a framework's own rules. A React page found such a rule on its first real-mouse run (React's `onPointerEnter`, §23.8). So §12's smoke pages are built now, in the folder of this plan, loading Kilopixel as a script tag and the frameworks from CDNs (no build step):

| Page | Framework | Checks | Real mouse |
|---|---|---|---|
| `tests/smoke/react.html` | React 19.1.0 + htm from esm.sh | 21/21 (`checks.js`) | ✅ |
| `tests/smoke/vue.html` | Vue 3.5.13 with the template compiler, jsDelivr | 21/21 (`checks.js`) | ✅ |
| `tests/smoke/tailwind.html` | Tailwind CSS 4.1.7 browser build, plain HTML | 11/11 (own checks) | ✅ |

- **Shared checks** (`tests/smoke/checks.js`, on `tests/runner.js`): every framework page renders the same scene in its own syntax and registers each instance (`window.smoke.instances`); `window.runSceneChecks()` tests properties (numbers, arrays, literal text, expression strings, colors from state, points), events (clicks on shapes and groups, `stopPropagation()`, enter / leave from empty space and from another shape, the cursor), and mount / unmount. Results in the page and the tab title.
- **Real mouse:** each page was also driven with real mouse input in the browser pane (it must be visible: a hidden pane leaves stages unsized).
- **Where they live (moved 2026-11-19):** first in this plan's prototype folder, then moved to `tests/smoke/` (`tests/smoke/README.md`): they are tests to run again after engine changes, not the record of a decision. They report through `tests/runner.js` like the other test pages.
- **Not in the normal run:** they need the network (CDNs), so `node tools/run_tests.js` and CI leave them out; `node tools/run_tests.js --smoke` runs them headless on demand.
- **Findings:** `design/prototypes/2026-10-30_framework_compatibility/FINDINGS.md` (second part, 2026-11-19).
- **Next:**
  - **Angular** needs a build. Agreed approach (2026-11-19): an npm app in `tests/smoke/angular/` (first planned as a top-level `frameworks/angular/`; moved with the pages) with its own `package.json` and committed `package-lock.json`; `node_modules` and build output ignored by git; each laptop runs `npm ci` there. Needs a CLAUDE.md exception to "never create `node_modules`" (only inside `tests/smoke/<app>/`) and a step in "Working on Another Machine". Not built yet; asked before creating it.
  - More CDN pages if wanted: Preact, Lit (also a stage in a shadow root), Solid, Alpine, htmx; Svelte 5 needs its compiler in the page.
  - `docs/frameworks.html` (§12, step 5), written from what the pages show (built 2026-11-19, §26.4).

## 26. State 2026-11-19: Assessment and Next Steps

At runtime, in the browser, Kilopixel now behaves like a well-made custom element: frameworks use it with their own syntax (properties, events, insert / move / remove, style, hydration), and for React, Vue and Tailwind that is tested, also with the real mouse (§25). What is missing is mostly around the runtime: installing it, TypeScript, server rendering, documentation, and a few things users expect from HTML elements. The DOM contract row by row: §3 (updated today).

### 26.1 By Kind of Project

| Project | State |
|---|---|
| Plain HTML, htmx, Alpine | ✅ the original use case; htmx and Alpine not smoke-tested yet |
| React, Preact, Vue in the browser, Kilopixel as a script tag | ✅ React and Vue verified (21/21, real mouse, `tests/smoke/`); Preact follows React's rules |
| Tailwind | ✅ verified (11/11); `hover:` variants never match a shape (known limit) |
| Svelte, Solid, Lit | very likely ✅: they use the DOM operations `tests/frameworks.html` checks; not verified |
| TypeScript projects (most React and Angular apps) | ⚠️ runs, but TypeScript rejects `<pxl-circle r={50}>` without typings: the biggest practical obstacle (2026-11-19: typings built, §27: ✅ for React 19, Preact 11, Solid 2, Vue 3, Svelte 5 and Angular, checked against their real types) |
| Next.js, Nuxt (server rendering) | ⚠️ the import is safe (guard, §20) and hydration should match (T-H1); untested |
| Angular | ❓ untested; with zone.js every frame of an animated stage triggers change detection (a docs note, `runOutsideAngular()`) |

### 26.2 What Framework Users Will Still Notice

- No CSS `:hover` on shapes (use `isHovered`); `getBoundingClientRect()` of a shape is empty, so a tooltip at a shape needs a workaround.
- No keyboard focus or accessibility for clickable shapes.
- Ids are global: components generate unique ones (D2 open).
- `offsetX` on shape events equals `clientX`; capture listeners above the stage see the browser's click first (E9).
- String properties other than `text` are code, like attribute values: untrusted data must not go into them.
- (Done 2026-11-19, §26.4: `docs/frameworks.html`.) No `docs/frameworks.html` yet: all of this is only in `.agents/KILOPIXEL.md` and this plan.

### 26.3 Next Steps, by Benefit for Users

1. **`docs/frameworks.html`** (§12): short, and it makes everything above usable: the script tag in each framework, the one setting some need (Vue `isCustomElement`, Angular `CUSTOM_ELEMENTS_SCHEMA`), events, properties, the known limits.
2. **Typings** (built 2026-11-19, §27): generated from `observedAttributes` and `static defaults` (§12, §19.2). Removes the TypeScript obstacle; they can be shipped without npm, as a downloadable `kilopixel.d.ts` next to `pxl.min.js`.
3. **The Angular app** in `tests/smoke/angular/` (§25): verifies the largest untested framework and measures the zone.js cost. Needs `npm ci` and a CLAUDE.md exception; asked before creating it.
4. **Smoke pages for Svelte and Lit** (cheap with the shared checks, §25).
5. **Larger topics, each with its own plan:** scoped names (D2, with the evaluation model, §19.3), a way to get a shape's position on the page (§23.6), accessibility (keyboard, focus, roles).

**Not now:** the npm package (decided 2026-11-19: later, together with publishing; nothing is published yet, CLAUDE.md "Pre-release").

### 26.4 Step 1 Built 2026-11-19: `docs/frameworks.html`

- **Page:** "Frameworks", in the sidebar under "Getting Started" after "Installation" (`docs/js/layout.js`). Sections: 1. Setup (script tag; the one setting for Vue and Angular; React 19 or later; a TypeScript declaration until typings ship), 2. Values (properties, strings as expressions, literal `text`, `undefined`, last change wins; callouts on per-frame values and "Strings Are Code"), 3. Events (React, Vue, Angular, Svelte; the event list; groups as buttons; propagation; `pxl-on-*` next to framework listeners), 4. Cursor and Pointer, 5. Components (unique ids with `useId()`, `isHovered` instead of `:hover`), 6. Tailwind and CSS, 7. Server Rendering, 8. Known Limits, 9. Live Events Playground.
- **Playground:** plain `addEventListener()` on a circle, a button group and the stage logs every `pointerenter`, `pointerleave` and `click` with `target` and `relatedTarget`; controls set the circle's radius as a property, switch `stopPropagation()` and the group's cursor. Checked with the real mouse in the browser pane: enter, click and bubbling on the circle, a click on the button's label counted by the group, `stopPropagation()` keeps the click from the stage. A first version had a center dot and a label on top of the circle: the dot took the circle's events (the decoration case the page describes), so they were removed.
- **Prism:** the JSX component (`components/prism-jsx.min.js`, 1.29.0) on this page only, for the React snippets.
- **Not yet in the page:** typings (§26.3 step 2); the Angular app's results (step 3).

## 27. Typings (Decided 2026-11-19)

Step 2 of §26.3. TypeScript projects reject `<pxl-circle r={50}>` without type definitions; `docs/frameworks.html` offers a stopgap declaration that allows every prop. This step ships real typings, also without an npm package (as downloads next to `pxl.min.js`).

### 27.1 Decisions

| # | Decision | Why |
|---|---|---|
| T1 | **One core file plus one file per framework:** `kilopixel.d.ts` (element interfaces with typed properties, `HTMLElementTagNameMap`, the global `pxl`), `kilopixel-react.d.ts`, `kilopixel-preact.d.ts`, `kilopixel-solid.d.ts`, `kilopixel-vue.d.ts`, `kilopixel-svelte.d.ts`, each referencing the core file. Angular needs only the core file (`CUSTOM_ELEMENTS_SCHEMA`) | Each framework declares its tags in its own module (`declare module 'react'` → `JSX.IntrinsicElements`, `'preact'` and `'solid-js'` the same, `'vue'` → `GlobalComponents`, `'svelte/elements'` → `SvelteHTMLElements`); a file that augments `'react'` fails to compile in a project without React |
| T2 | **Generated, never written by hand:** `tools/build_types.js`, run by `node build.js`, runs the built bundle in a Node `vm` with a stubbed DOM and reads every element's `observedAttributes` and `static defaults` (prototype 2026-11-19: all 11 elements load). Output `dist/types/`, copies in `docs/download/types/`; `tools/check_build.js` fails when they are out of date | A new attribute is typed without anyone remembering it; the build still needs only Node (no browser) |
| T3 | **Types per attribute:** from the default's type (`0` → number, `false` → boolean, `'butt'` → string), plus a table in the script for what a default can't tell: keywords (`linecap`, `linejoin`, `arrowstyle`, `anchor` from `pxl.anchorX`, `mode`, `align`, `baseline`, `weight`, `fontstyle`, `direction`), `arrowstart` / `arrowend` (number or `'auto'`), colors and gradient descriptors (`fill`, `stroke`, `shadowcolor`), arrays (`linedash`, `filter`, `points`), `text` (string or number), `<pxl-var>` `value` (any value). An attribute the table doesn't cover and whose default is `null` fails the build | Every value also accepts an expression string, typed `string & {}` next to the keywords, so editors still suggest the keywords |
| T4 | **Setting and reading differ:** `set r(value: number \| string \| null \| undefined)`, `get r(): number` (TypeScript 4.3+). JSX and template props use the setting types | The getter returns the evaluated value (§24) |
| T5 | **Framework props:** each framework's own HTML attributes for its element (events, `style`, `class`, `ref`, `key`) plus Kilopixel's, without the names both have (`hidden`, `id` stay the framework's). `pxl-on-*` handlers are strings. No event types of Kilopixel's own: its events are standard DOM events | `onClick`, `@click`, `onclick` are typed by the framework already |
| T6 | **Tested against the real framework types** in `tests/types/`: an npm project (`package.json` and `package-lock.json` in git, `node_modules` ignored, `npm ci` on each laptop) with TypeScript, `@types/react`, `preact`, `solid-js`, `vue` with `vue-tsc`, `svelte` with `svelte-check`. A fixture per framework with correct uses (must compile) and wrong ones marked `// @ts-expect-error` (must fail). `node tools/run_tests.js --types` runs them; not part of the normal run or CI | Option A of the discussion 2026-11-19: `npx` can run TypeScript but can't provide the frameworks' types. CLAUDE.md gets an exception: `node_modules` only in `tests/types/` and `tests/smoke/<app>/`, from the committed lock file |
| T7 | **Docs:** `docs/frameworks.html` section 1 (download the core file and the one for the framework, where to put it; replaces the stopgap declaration), a download link on `docs/installation.html`, `.agents/KILOPIXEL.md` "Build System" | |

**Size:** the typings are separate files; `pxl.min.js` doesn't change.

### 27.2 Built 2026-11-19

- **Generator** `tools/build_types.js` (about 230 lines), run by `build.js` after the bundle is written: the files go to `dist/types/` and `docs/download/types/`; `tools/check_build.js` regenerates them from `dist/pxl.js` and fails when a file differs ("run node build.js"). The core file has about 970 lines (every element with its props interface and its element interface); a framework file about 25.
- **Found while testing:**
  - TypeScript resolves `react`, `vue`, … from the folder of the declaration file. In `dist/types/` there are no packages, so the framework augmentations silently did nothing (`skipLibCheck` hid the error `Cannot find module 'react'`). `tests/types/check.js` copies the files into the test project first, as a user places them in a project; the docs say so ("Inside the Project").
  - **Preact 11** exports `HTMLAttributes` from `preact` (Preact 10: `JSX.HTMLAttributes`); **Solid 2** keeps its JSX types in `@solidjs/web` (augmented as `@solidjs/web/jsx-runtime`; Solid 1 had them in `solid-js`). The files target the current majors and say so in their headers.
  - `r` is nullable only on `<pxl-rect>` (default `null`), not on `<pxl-circle>` (default 0): numbers that may be "not set" are nullable per element.
  - After `circle.r = null`, TypeScript narrows `circle.r` to `null` until the next read of a fresh reference: normal TypeScript behavior with different get and set types, not a typings bug (the fixture reads first).
  - A `.svelte` file without `<script lang="ts">` isn't type-checked by `svelte-check`.
- **Tests** (`tests/types/`, npm: TypeScript 6.0.3, `@types/react` 19.3.0, Preact 11.2.0, Solid 2.0.3 with `@solidjs/web` 2.0.3, Vue 3.5.45 with `vue-tsc` 3.3.14, Svelte 5.58.0 with `svelte-check` 4.7.8; about 70 MB): six checks, all pass in about 8 s (`node tools/run_tests.js --types`). Each fixture has correct uses and wrong ones that must fail (wrong prop type, unknown prop, points as a single number, reading a number as a string). Checked that the checks can fail: React's props typed `any` by hand made the React check fail (an implicit `any` event and two unused `@ts-expect-error`).
- **Docs:** `docs/frameworks.html` section 1 (downloads per framework, a property example, "Inside the Project"; replaces the stopgap declaration), `docs/installation.html` (a pointer to the downloads), `.agents/KILOPIXEL.md` "Build System", `tests/types/README.md`; CLAUDE.md: the npm exception for `tests/types/` and `tests/smoke/<app>/`, `npm ci` in "Working on Another Machine", the `--types` flag.
- **Size:** `pxl.min.js` unchanged; the definitions are separate downloads.
- **Not covered:** custom shapes (user classes extending `pxl.Shape` with their own tags) get no types; Solid 1 and Preact 10 (older majors).
- **Next:** §26.3 step 3, the Angular app in `tests/smoke/angular/`.
