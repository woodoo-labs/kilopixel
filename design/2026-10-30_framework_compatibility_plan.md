# Framework Compatibility: Kilopixel as a Well-Behaved Custom Element

- **Status**: 🟡 **Proposed** (2026-10-30, no code changes yet)
- **Date**: 2026-10-30
- **Related**: `scratch/frameworks/` (React 19 and Vue 3.5 prototypes, `FINDINGS.md`; local only), `design/2026-10-17_attribute_defaults_and_state_isolation_plan.md` (Rule A: removed attributes fall back to defaults, already written with frameworks in mind), `design/2026-10-15_interactive_state_auto_registration_plan.md` (which shapes are hit-tested), `design/events_implementation_plan.md` (the current `on*` handlers), `design/2026-10-17_always_save_restore_plan.md`, `design/2026-10-30_space_attribute_plan.md`
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

## 3. Current State (Audit 2026-10-30)

From the React 19 / Vue 3.5 prototypes (`scratch/frameworks/FINDINGS.md`) and the code:

| # | State | Detail |
|---|---|---|
| C1 | ✅ | both prototypes: elements upgrade, stages size and animate (with the browser pane visible) |
| C2 | ⚠️ | attributes after connect work, **except `id`**: `id` isn't an observed attribute, so an `id` set or changed after connect is never registered in `pxl.nodes` (`node.js` `connectedCallback` reads it once) |
| C3 | ❌ | no properties: `el.r = 50` creates a plain JS property and changes nothing. React / Vue only worked because `r` isn't a property of `HTMLElement` and they fell back to attributes. Collisions with `HTMLElement` (checked in the browser over all 82 observed attribute names): `hidden` (harmless, it reflects to the attribute) and `onclick` (see C7) |
| C4 | ✅ | Rule A; verified (`zoom={undefined}` → attribute removed → `1`) |
| C5 | ❌ | Kilopixel dispatches no DOM events; `@click` never fires (the browser's click targets the layer canvas, which isn't inside `<pxl-circle>`) |
| C6 | ❌ | same; React `onClick` never fires |
| C7 | ❌ | `onclick`, `onenter`, `onleave`, `ondown`, `onup`, `onmove` are the declarative handlers. `onclick` is also a **native event handler content attribute**: the browser compiles it as global JavaScript on every HTML element. React 19 drops it (no attribute; `element.onclick` is React's noop). Vue keeps it (string `on*` values on native handler names stay attributes). Svelte 5 / Solid treat `onclick` as a listener prop (not verified here) |
| C8 | ✅ (untested as a whole) | `disconnectedCallback` unregisters, `connectedCallback` re-registers; unmount / remount verified in both prototypes |
| C9 | ⚠️ | each `<pxl-layer>` appends its `<canvas>` as a light-DOM child (`layer.js` `connectedCallback`). Frameworks keep nodes they didn't create in client rendering, but full child replacement (`innerHTML`, htmx swaps of a layer's content) removes it, and hydration sees an unexpected node |
| C10 | ⚠️ | inline styles written by the engine: stage (`display`, `position`, `width`, `aspect-ratio`), layer (`display`, `position`, `inset`), var (`display: none`), stage `cursor`. A framework binding `style` can overwrite them (Vue `:style` and React `style` set individual properties, Angular `[style]` and Lit `style=${…}` can replace the whole attribute) |
| C11 | ⚠️ | server HTML has no canvases; the client adds them inside `<pxl-layer>` (C9) → hydration mismatch warnings in React / Vue |
| C12 | ⚠️ | parents are found with `closest('pxl-layer')`, `parentElement.closest('pxl-group, pxl-layer')`, `closest('pxl-stage')`: they stop at a shadow root. Slotted children are fine (they stay in the light tree of the host) |
| C13 | ⚠️ | `pxl.nodes` is one flat registry per document. Each instance needs unique ids; `useId()` values (React `:r0:`, Vue `v-0`) aren't valid in `ref.<id>` and must be cleaned (`'p' + id.replace(/[^a-zA-Z0-9]/g, '')`) |
| C14 | ⚠️ | identical values are skipped (`oldValue === newValue`); numbers aren't compiled. But every distinct **expression** string is compiled and cached forever (`pxl.animationCache` / `pxl.staticCache`): 71 slider steps of a rebuilt `x="${base} + sin(t / 400) * 20"` grew `animationCache` from 4 to 74 entries |
| C15 | ⚠️ | upgrading after the markup works (attributes are read on upgrade). Properties set before the upgrade would shadow future accessors (only relevant once C3 exists) |

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
- **When**: `process()` runs inside `Stage.render()`, after all layers drew. Dispatching there runs user code synchronously inside the frame. Frameworks schedule their re-render (React / Vue / Svelte batch), but a direct listener may call `setAttribute` synchronously; that only invalidates layers for the next frame, so it is safe. To keep `process()` simple, events are collected during `process()` in a small preallocated queue and dispatched at its end.
- **Native click on the canvas**: the browser's own `click` (on the layer canvas) still bubbles to the stage and up, as today. Kilopixel's synthetic `click` on the shape is an additional, separate event. Listeners on the stage or above therefore see **two** clicks: the native one (`target` = canvas) and the synthetic one (`target` = shape). Options §13 D4: (a) accept and document (listeners check `event.target`), (b) stop the native canvas `click` from propagating beyond the stage when a shape was hit, so only the shape's synthetic `click` reaches the page. (b) is cleaner for page code but changes native behaviour for code that listens on the stage itself; decided with a test page.

### 4.2 Which Shapes Are Hit-Tested

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
| `pxl-click`, `pxl-enter`, `pxl-leave`, `pxl-down`, `pxl-up`, `pxl-move` | "Kilopixel's click" | all three rules ✓; consistent with the `pxl-` element prefix; like Alpine `x-on:click` / htmx `hx-on:click` |
| `do-click`, `do-enter`, … | "do on click" | ✓ |
| `on-click`, … | familiar | ❌ Vue treats `on` + non-lowercase character as a listener (`on-click` → event `-click`) |
| `click`, `enter`, … | short | ❌ `click` is `HTMLElement.click()` |
| `action`, … | only one event | ❌ doesn't scale to six events |

Recommended: `pxl-click` etc. Implementation: `pxl.Shape.HANDLER_EVENTS` keys change; `observedAttributes` change; the `on*` names are removed (pre-release, no compatibility). A compile-time warning for the old names would help migration: if a shape has an `onclick` / `onenter` / … attribute at connect, warn once ("use pxl-click"). Remove the warning later.

Migration count (2026-10-30): **25 handlers on Kilopixel elements** in `examples/test32.html` (20: enter / leave / down / up), `examples/test37.html` (4 clicks) and `tests/index.html` (1). Plus docs text and KILOPIXEL.md (Events section, AI guide), `design/` plans as history (unchanged). The other ~320 `onclick` hits in the repository are ordinary HTML buttons on docs pages.

### 4.4 Cursor

The hand cursor (`isClickable()`) should also show for shapes that a framework listens to. With a direct `click` listener (§4.2 count) Kilopixel knows it. With delegated listeners it can't know whether a click handler exists. Options (§13 D5): `interactive` implies "may be clicked" and shows the hand, or a separate `cursor` attribute. Recommended: `interactive` implies the hand cursor; simple and predictable.

### 4.5 Performance

- Event dispatch happens only on user input over shapes (not per frame unless the pointer moves over shapes). One event object per dispatched event, like the browser's own events; no allocations in frames without input.
- `pointermove` over a shape: one `PointerEvent` per frame while moving. Acceptable (the browser itself allocates one native event per move); could be limited to shapes with a `pointermove` listener or `pxl-move` handler (the listener count from §4.2 per type makes that cheap). Recommended: count per type, dispatch only types that have listeners or `interactive`.
- `addEventListener` override: one string comparison and an integer update per call; listeners are added at mount, not per frame.

## 5. Workstream W2: DOM Ownership (C9, C10, C11)

### 5.1 Canvases in a Shadow Root

Each `<pxl-layer>` attaches a shadow root in its constructor and puts its `<canvas>` there, plus a `<slot>` so its light-DOM children (shapes, groups) stay in the document tree:

```
<pxl-layer>                       light DOM: only what the user / framework rendered
  #shadow-root
    <canvas style="…">            the layer's pixels
    <slot></slot>                 children stay where the framework put them (they render nothing themselves)
  <pxl-circle …>
```

- **Effect**: frameworks never see the canvas (C9); server HTML and client DOM match (C11); `innerHTML` / htmx swaps of a layer's content can't remove it.
- **Styling**: the canvas styles move into the shadow root (constant). Layer compositing (`alpha`, `blend`, `filter`) is written on the canvas as today.
- **Hit testing / events**: the native pointer events target the canvas inside the shadow root; they are retargeted to `<pxl-layer>` at the shadow boundary and still bubble to the stage, where `InteractionEngine` listens. `e.offsetX` / `offsetY` are relative to the **retargeted** target? `offsetX` is computed for the original target (the canvas), which covers the stage like today. To verify in the conformance page (§11 T-E5); fallback: compute from `clientX - stage.getBoundingClientRect().left` (one rect read per pointer event, not per frame).
- **Do children need a slot at all?** Shapes don't render DOM; but without a `<slot>`, light-DOM children are not rendered into the flat tree, which doesn't matter for them. Keeping the slot avoids surprises for users who put normal elements (text, buttons) into a layer for accessibility. Decision §13 D6.
- **Browser support**: Shadow DOM is supported everywhere Kilopixel runs (it already requires Custom Elements).
- **`pxl-stage`** gets no shadow root: it has no own content besides the layers; its styles move to the stylesheet (§5.2).

### 5.2 Default Styles in a Stylesheet, Not Inline

The engine injects one stylesheet once (on the first `pxl-stage` connect, or at script load), with zero-specificity selectors so any user or framework style wins:

```css
:where(pxl-stage) { display: block; position: relative; width: 100%; }
:where(pxl-layer) { display: block; position: absolute; inset: 0; }
:where(pxl-var)   { display: none; }
```

- `aspect-ratio` depends on the `ratio` attribute: set it as a CSS custom property on the element (`this.style.setProperty('--pxl-ratio', …)`) and use `aspect-ratio: var(--pxl-ratio)` in the stylesheet, or keep this one inline property. A custom property survives Vue / React style patches (they set individual properties), but not Angular `[style]` / Lit `style=${}` full replacement. Alternative: an attribute selector can't read a numeric attribute in CSS. Decision §13 D7; recommended: inline `aspect-ratio` stays (it is the stage's core behaviour), documented: "don't replace the whole `style` of a `<pxl-stage>`; set individual properties".
- `cursor` stays inline on the stage (it changes with hover); document the same rule.
- Injection: `document.adoptedStyleSheets` with a constructed `CSSStyleSheet` (no DOM node, works in shadow roots too if added there), or one `<style>` element in `<head>`. Constructed stylesheets are supported in all current browsers. For pages where Kilopixel's tags live inside a framework component's shadow root (C12), the stylesheet must also be adopted by that root: `pxl-stage` can add it to `this.getRootNode()` on connect if that is a `ShadowRoot`.
- Users can override any default with normal CSS (e.g. `pxl-stage { width: 600px; }`), which today requires `!important` because of the inline styles. This is a usability gain beyond frameworks.

## 6. Workstream W3: Properties (C3, C15)

### 6.1 Generated Accessors

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
- **Name collisions** with `HTMLElement` (audit §3 C3): `hidden` (native property reflects to the attribute; keep native) and the `on*` handlers (renamed by W1). `id` is native. No accessor for these.
- **Effect on frameworks**: React 19, Vue, Preact set properties when `name in element`; with accessors they pass numbers as numbers (C14 fix for the common case: no string, no compilation). Angular `[x]="…"`, Lit `.x=${…}`, Svelte 5 and Solid `prop:x` get a working target.
- **Cost**: accessors live on the prototype (no per-instance cost). `pxl.setAttributeValue` for numbers is cheaper than today's string path (no `Number()` parse, no regex checks).

### 6.2 Properties Set Before the Upgrade (C15)

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

- **`ref.<id>.set(name, …)` with an unknown attribute name** silently sets a DOM attribute that nothing observes. Found today: `examples/test32.html` still calls `set('scale', …)` 20 times after the `zoom` rename (fixed separately). A warning for names that aren't in the element's `observedAttributes` would have caught it. Only in `set()` (Kilopixel's API), not for DOM attributes in general (frameworks add `class`, `style`, `data-*`, `aria-*`).
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
| T-E2 | C6 | listener on `document` (delegation) + `interactive` on the circle: called, `target` is the circle |
| T-E3 | C6 | without `interactive` and without a direct listener: not hit-tested (registration rule) |
| T-E4 | §4.1 | enter / leave sequence: `pointerover`, `pointerenter`, `pointerout`, `pointerleave` in order; `pointerenter` doesn't bubble |
| T-E5 | §5.1 | with the canvas in a shadow root: `mouseX` / `mouseY` correct (offset retargeting) |
| T-E6 | §4.3 | `pxl-click` handler runs; a leftover `onclick` warns once |
| T-E7 | §4.1 | a listener that calls `setAttribute` on another shape during dispatch: no error, change drawn next frame |
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

## 12. Framework Smoke Pages and Docs

**Smoke pages** (`scratch/frameworks/`, local; promote one or two to `examples/` later): the same component (two instances, number binding, expression binding, removal via `undefined`, mount / unmount, a click handler in the framework's own syntax, hover state shown in the framework's UI) in:

| Framework | Load without a build | Event syntax to check |
|---|---|---|
| React 19 | ✅ esm.sh + htm (exists) | `onClick` (delegated) + `interactive` |
| Vue 3.5 | ✅ global build (exists) | `@click` (direct) |
| Preact 10 | ✅ esm.sh + htm | `onClick` (Preact uses direct listeners) |
| Lit 3 | ✅ esm.sh | `@click` (direct); also a shadow-root component for C12 |
| Solid | ✅ `solid-js/html` | `onClick` (delegated) and `on:click` (direct) |
| Alpine 3 | ✅ CDN | `@click` / `x-on:click`, `:r` bindings |
| htmx 2 | ✅ CDN | swap a layer's content (C9 / T-M3) |
| Svelte 5 | needs the compiler (esm.sh `svelte/compiler` in the page, or `npx`) | `onclick` (delegated) |
| Angular | needs a build (`npx @angular/cli`, not in the repo) | `(click)`, `[attr.x]`, `[x]`; optional |

**Docs page** `docs/frameworks.html` ("Using Kilopixel with Frameworks"), after W1–W3:

- The DOM contract in one paragraph: "Kilopixel elements are standard custom elements; your framework sets attributes or properties and listens to events."
- Per framework: the one setting needed (Vue `isCustomElement`, Angular `CUSTOM_ELEMENTS_SCHEMA`, Svelte none, React none), the event syntax, and whether `interactive` is needed (delegating frameworks).
- Rules: unique ids per instance (or the scoped-name option once decided), numbers or `<pxl-var>` instead of rebuilt expression strings, Kilopixel tree in light DOM, don't replace the whole `style` of a stage.
- TypeScript / JSX typings: a `kilopixel.d.ts` with the elements and attributes for `JSX.IntrinsicElements` (React, Preact, Solid) and `HTMLElementTagNameMap` (Angular, Lit, Vue volar). Generated from `observedAttributes` + `static defaults` by a small script in `tools/`. Optional, but frameworks with TypeScript reject unknown tags without it. Belongs to the docs workstream or a follow-up.

Sidebar: a new entry under "Engine & Reactivity" or a new section "Integration".

## 13. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Names of the declarative handlers | `pxl-click` / `do-click` / other (§4.3) | `pxl-click`, `pxl-enter`, `pxl-leave`, `pxl-down`, `pxl-up`, `pxl-move` |
| D2 | Scoped names | A global ids / B stage-scoped ids / C `name` attribute (§8.2) | decide later; A for now, C if components need it |
| D3 | Logical coordinates on events | extra fields / none (§4.1) | none; `ref.<stage>.mouseX` |
| D4 | Native canvas `click` next to the synthetic shape `click` | accept / stop propagation when a shape was hit (§4.1) | decide with T-E tests on a real page |
| D5 | Hand cursor for framework listeners | `interactive` implies pointer / separate `cursor` attribute (§4.4) | `interactive` implies pointer |
| D6 | `<slot>` in the layer's shadow root | yes / no (§5.1) | yes |
| D7 | Stage `aspect-ratio` | inline / CSS custom property (§5.2) | inline, documented |
| D8 | Properties for array-valued attributes | direct arrays / strings only (§6.1) | direct where the parsed form is an array |
| D9 | Scope of the first implementation | all workstreams / W1 + W2 + W5.1 + tests first | W1, W2, W5.1, W4, tests (§14 phase 1); W3 next; W5.2 / W6 only on demand |

## 14. Phases and Steps

**Phase 1: the contract that breaks today** (one plan approval, several commits)

1. `tests/frameworks.html` with the tests that pass today (T-C1…, T-C4, T-M1, T-M2) as a baseline; the others added with their features.
2. W5.1 observe `id` (+ T-C2, T-C2b). `fix(engine): register ids set or changed after connect`.
3. W1 events: dispatch DOM events, `addEventListener` override, `interactive`, rename `on*` → D1 names, warning for the old names; migrate the 25 handlers (`test32`, `test37`, `tests/index.html`), KILOPIXEL.md Events + AI guide, docs pages that mention `onclick` on shapes (+ T-E1…T-E7). `feat(engine)!: DOM events on shapes; pxl-click replaces onclick`.
4. W2 canvas in a shadow root + stylesheet defaults (+ T-M3, T-S1, T-S2, T-H1, T-E5). `refactor(engine): layer canvas in a shadow root, default styles in a stylesheet`.
5. W4 cache bound (+ T-K1). `perf(compiler): bound the expression caches`.
6. Smoke pages in `scratch/frameworks/` for the frameworks in §12 that load without a build; record results in `FINDINGS.md`.

**Phase 2: properties**

7. W3 accessors + pre-upgrade properties (+ T-C3…, T-U1, T-K2). `feat(engine): attribute properties on all elements`.
8. Re-run the smoke pages; React / Vue now pass numbers as properties.

**Phase 3: docs and typings**

9. `docs/frameworks.html`, sidebar entry, KILOPIXEL.md section "Framework Integration".
10. Optional: `kilopixel.d.ts` generator in `tools/`.

**Later / on demand:** W5.2 scoped names (own plan), W6 shadow boundary crossing (own plan).

Every engine step: `node build.js`, update the `pxl.min.js` size, `tests/index.html` and `tests/frameworks.html` all green, console clean.

## 15. Interplay with Other Plans

- **Always save / restore** (`2026-10-17_always_save_restore_plan.md`, decided): independent; both touch `Shape.render()` only lightly (W1 doesn't change rendering).
- **`space` attribute** (`2026-10-30_space_attribute_plan.md`): hit testing of space elements is unchanged; DOM events work the same for them. W3 accessors would include `space` (its value is a ref object, set as a property it could be the element itself: `el.space = otherEl` is a natural framework API; note for that plan).
- **Two-phase frame** (TODO §29): event dispatch at the end of `process()` fits both the current single pass and a later update / draw split.
- **Interactive state auto-registration** (`2026-10-15_…_plan.md`): extended by §4.2 (listener counts, `interactive`); `releaseIfUnused()` must also check listener counts and `interactive`.

## 16. Risks

- **API change of the handlers (W1)**: pre-release, 25 uses; the old-name warning makes leftovers visible.
- **Shadow root on layers (W2)**: pointer coordinate behaviour across the shadow boundary (T-E5) and any code that looks for `layer.querySelector('canvas')` (search the repo before changing; tests and examples may read the canvas for pixel checks, e.g. `scratch/custom_shape/test.html`).
- **Accessors (W3)**: a framework that sets a property Kilopixel doesn't expect (e.g. `style`, `className`) is unaffected (no accessor); a user who set expando properties with attribute names on elements (`el.x = …` as a private field) would now change the drawing. Unlikely; documented.
- **Event duplication (D4)**: page code listening for `click` on the stage may see the synthetic event too. Covered by a test and the docs.

## 17. Effort Estimate (2026-10-30)

Rough estimates from the code read for this plan; "session" = one working session like the ones that implemented the toLocal / `zoom` plan.

| Phase | Engine | Other work | Estimate |
|---|---|---|---|
| **1**: `id` fix, DOM events + `interactive`, handler rename, canvas in a shadow root, stylesheet defaults, cache bound | ~250–350 lines in 7 files (`interaction.js`, `shape.js`, `node.js`, `layer.js`, `stage.js`, `variable.js`, `compiler.js`) | `tests/frameworks.html` (~20 tests, ~400 lines); migrate 25 handlers (`test32`, `test37`, `tests/index.html`); KILOPIXEL.md Events section and AI guide; smoke pages for 5–7 frameworks | 2–3 sessions |
| **2**: property accessors, properties set before the upgrade | ~100–150 lines (generated accessors, `pxl.setAttributeValue`) | ~6 tests; re-run the smoke pages | 1 session |
| **3**: `docs/frameworks.html`, sidebar, KILOPIXEL.md section | none | docs page per `docs/DOCS_STANDARDS.md`; optional typings generator in `tools/` | 1 session (+1 for typings) |

**What takes the time:**

1. **Decisions before code**: D1 (handler names) and D4 (native vs. synthetic `click` on the stage) change behaviour users see; best decided with a test page.
2. **Shadow root on layers**: pointer coordinates across the shadow boundary must be verified (T-E5); if `offsetX` / `offsetY` don't fit, a fallback from `clientX` and the stage rect is needed.
3. **Testing in the dev environment**: a hidden browser pane stops layout, `ResizeObserver` and `requestAnimationFrame` (seen in the prototypes and the `test32` check on 2026-10-30). The conformance tests force rendering (`stage.resize()`, `stage.render()`) and fall back to calling compiled handlers where pointer input needs layout.

Phase 1 alone delivers most of the value (framework events, no `on*` collisions, no hydration / reconcile conflicts, bounded memory). Phase 2 is an improvement, not a requirement.

## 18. Performance Summary

No per-frame cost for pages that don't use the new features; some paths get cheaper.

| Change | Per frame | Other cost | Gain |
|---|---|---|---|
| DOM events (W1) | none without input; on pointer actions over shapes only, and only for event types with a listener (per-type counts, §4.5) | one event object per dispatched event, like the browser's own events | — |
| `addEventListener` override (W1) | none | one comparison per `addEventListener` call (at mount) | — |
| `interactive` (W1) | only for shapes the user marks: hit-tested on pointer moves, like shapes with handlers today | — | — |
| Canvas in a shadow root (W2) | none: drawing and compositing unchanged | possibly one `getBoundingClientRect()` per pointer event (fallback in §5.1) | — |
| Stylesheet defaults (W2) | none | one stylesheet per page, once | users override styles without `!important` |
| Property accessors (W3) | none | defined once on the prototype; the pre-upgrade check runs once per element at creation (~80 `hasOwnProperty` checks) | numbers set as properties skip parsing and compiling |
| Cache bound (W4) | none | one size check per compile | bounded memory |
| `id` observed (W5.1) | none | only when an `id` changes | — |

- **File size**: about +2–3 KB minified (`pxl.min.js` ~53 KB → ~55–56 KB); the main measurable cost.
- **Worst case avoided by design**: `pointermove` dispatched every frame while the pointer moves over many shapes. Only the shape under the pointer gets events, and only for types with listeners.
- **Check**: run `scratch/perf/run.html` before and after phase 1 (same pages, interleaved rounds). In this environment it resolves differences above ~20 % only (`scratch/perf/RESULTS.md`); smaller effects need a quiet machine or more rounds.
