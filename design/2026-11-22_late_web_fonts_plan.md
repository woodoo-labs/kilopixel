# Late Web Fonts in Safari

- **Status**: 🟡 **Proposed** (2026-11-22, fix A measured on an iPhone and in Chrome, also for canvas-only fonts; D1–D4 open)
- **Date**: 2026-11-22
- **Related**: `design/done/2026-11-06_text_box_accuracy_plan.md` (built today's `loadingdone` listener and `pxl._fontGeneration`), `design/done/2026-11-20_custom_shapes_plan.md` §5.3 (the Safari check that found it)
- **Target Implementation**: `js/elements/shapes/text.js` (the listener at the end of the file), `tests/index.html` (section "Text box"), `.agents/ENGINE.md` ("Late web fonts")
- **Prototypes** (`design/prototypes/2026-11-22_late_web_fonts/`): `fonts.html` (what a browser reports when a web font arrives), `fonts2.html` (fixes A and B), `fonts3.html` (a font used only by the canvas); all send their table to `design/prototypes/2026-11-20_custom_shapes/safari/receiver.js`

---

## 1. The Problem

Text drawn before its web font has loaded is measured with the fallback font: line breaks, the box, centering and hit area. When the font arrives, the engine must measure again and redraw. Today it listens for `loadingdone` on `document.fonts` (added once when `pxl.min.js` loads), raises `pxl._fontGeneration` and calls `invalidateLayers()` on every stage.

In Safari that never happens: on a page whose fonts arrive late, text keeps the fallback font's widths, and a static layer isn't redrawn at all, so it may even keep showing the fallback font. The docs pages load Inter from Google Fonts and are affected.

## 2. Measurements (2026-11-22)

`fonts.html` on an iPhone (Safari 27.0.1, iOS 18.7) and in Chrome 156. Each case loads a web font the browser hasn't seen before (Google Fonts with a random subset, so nothing comes from the cache), with plenty of short-lived objects allocated before, so the browser has a reason to collect unused wrappers.

| Case | iPhone | Chrome |
|---|---|---|
| 1. The engine as it is: generation, width of a `<pxl-text>` in the late font | 0 → 0, 302.2 → 302.2 (missed) | 0 → 1, 301.0 → 323.7 |
| 2. A listener on `document.fonts` without a kept reference (like the engine's) | `loading` 0, `loadingdone` 0 | 1, 1 |
| 3. A listener on a kept reference (`window.keptFonts = document.fonts`) | `loading` 1, `loadingdone` **0** | 1, 1 |
| 4. `document.fonts.ready` afterwards | resolved | resolved |

Two findings: without a kept reference, Safari delivers no font events at all (its JavaScript wrapper of `document.fonts` is collected and recreated, and the listeners go with it); and even with one, Safari sends `loading` but never `loadingdone`. A synthetic `loadingdone` dispatched by `tests/index.html` didn't reach the engine's listener either (the two late-font tests failed on the iPhone).

`fonts2.html`, the two fixes, on the same devices:

| Fix | iPhone | Chrome |
|---|---|---|
| **A.** kept reference; on `loading`, wait for `ready`, then raise the generation and invalidate | `loading` 1, `ready` 1, the new font loaded when `ready` resolved; width 241.8 → 262.8 | 1, 1, loaded; 241.0 → 259.0 |
| **B.** the text calls `document.fonts.check(font, text)`, and `document.fonts.load(font, text)` when it says not ready | `check()` false, `load()` loaded it; width 241.8 → 394.0 | the same; 241.0 → 391.5 |

Both work in both browsers. (Fix B's larger width change is the other font, Bungee, not a difference between the fixes.)

`fonts2.html` made the font's download start through page text (a hidden element in that font). On a Kilopixel page a font may be used only on the canvas, and if a browser didn't start a download for canvas text alone, no `loading` event would come and fix A would never fire. `fonts3.html` checks that case: the stylesheet in `<head>` before the engine, the font used only by a `<pxl-text>`, nobody calling `load()`:

| | iPhone | Chrome | Firefox 160 (headless) |
|---|---|---|---|
| The face loaded without being asked | yes, within 0.5 s | yes, within 0.5 s | yes, within 0.5 s |
| Kept reference: `loading` / `loadingdone` / `ready` | 1 / 0 / 1 | 1 / 1 / 1 | 1 / 1 / 1 |
| The engine as it is (generation) | 0 → 0 (missed) | 0 → 1 | 0 → 1 |

So canvas text starts the download in all three browsers, and fix A sees it.

## 2a. How Others Handle It

- **Konva and Fabric.js** don't handle it: their docs tell authors to load fonts with the CSS Font Loading API first and redraw once they are ready; Fabric notes that text measured before keeps the wrong metrics ([Konva](https://konvajs.org/docs/sandbox/Custom_Font.html), [Fabric](https://fabricjs.com/demos/loading-custom-fonts)).
- **Excalidraw** met the Safari case: WebKit fires no `loadingdone` on `document.fonts`; its fix loads the font faces it needs explicitly with `document.fonts.load()` (fix B here) ([PR](https://github.com/redaphid/excalidraw/pull/196)).
- **The general advice** (MDN) is `document.fonts.load()` or `ready`, then draw.

Kilopixel handles it without the author's help (`docs/DOCS_STANDARDS.md`: "Web fonts need no preloader"), so it needs a signal for fonts it didn't ask for: fix A. Fix B is the explicit variant the others use; it doesn't depend on any browser starting a download by itself (D4).

## 3. Proposal: Fix A

```javascript
// js/elements/shapes/text.js, replacing the loadingdone listener
// Safari sends no loadingdone, and drops listeners on document.fonts unless something keeps the object
// (design/2026-11-22_late_web_fonts_plan.md). "loading" on a kept reference, then ready, works in every browser.
pxl._fonts = document.fonts;

pxl.fontsArrived = function() {
  pxl._fontGeneration++;
  for (let i = 0; i < pxl.perf.stages.length; i++) pxl.perf.stages[i].invalidateLayers();
};

pxl._fonts.addEventListener('loading', () => pxl._fonts.ready.then(pxl.fontsArrived));
pxl._fonts.ready.then(pxl.fontsArrived); // fonts already loading when the engine starts (D3)
```

- **One path for every browser**, not a Safari special case: Chrome and Firefox send `loading` too, and `ready` resolves there as well (§2).
- **Custom shapes** that draw text in `draw()` are covered, as today: the generation and the invalidation are global.
- **Cost:** as today, one invalidation of every layer per batch of fonts; a batch that sends several `loading` events invalidates a few times more (harmless).

Fix B would need changes in Text's font cache, a promise per font string, and wouldn't help custom shapes that draw text. It stays the fallback if a browser is found that doesn't start a download for canvas text alone (D4; `fonts3.html` checks that).

## 4. Edge Cases

- **Fonts that started loading before `pxl.min.js` ran** (a font used by page text in `<head>`): their `loading` event came before the listener. The one `ready.then()` at start covers them (D3).
- **A font that fails to load:** `ready` resolves anyway; the text is measured again with the fallback, which changes nothing visible.
- **A page with no web fonts:** `ready` is already resolved at start: one invalidation in the first frames, before anything is cached that matters.
- **Shadow DOM and iframes:** `document.fonts` is per document, as today; a stage inside an iframe loads its own engine.

## 5. Tests

- `tests/index.html`, "late font: … raises the generation …": dispatch `loading` instead of `loadingdone` and await `document.fonts.ready` before checking (the generation is raised in a promise callback now).
- "late font: wrapping and box follow …": the same change.
- New: the listener sits on a kept reference (`pxl._fonts === document.fonts`), and `loadingdone` alone no longer raises the generation (the engine doesn't depend on it).
- **On the device:** `tests/index.html` on the iPhone (`design/prototypes/2026-11-20_custom_shapes/safari/device.html` or opened directly): the two late-font tests failed there and must pass. Then `fonts.html` case 1 must show the engine noticing the font.

## 6. Steps

1. Fix A in `text.js` (§3), the tests (§5), `node build.js`, `node tools/run_tests.js`.
2. The device run on the iPhone; results here (a "Built" section).
3. `.agents/ENGINE.md` "Late web fonts", TODO §48 removed, this plan to `design/done/`.

## 7. Open Decisions

| | Question | Recommended |
|---|---|---|
| D1 | Fix A (events on a kept reference, then `ready`) or B (per-text `check()` / `load()`) | A: smaller, one path, covers custom shapes |
| D2 | Keep the `loadingdone` listener as well | no: `loading` and `ready` cover every browser measured (Safari, Chrome, Firefox) |
| D3 | Call `ready.then()` once at start, for fonts that began loading before the engine | yes |
| D4 | Add fix B as a second layer (each text requests its font with `load()`) | no: canvas-only fonts load by themselves in Safari, Chrome and Firefox (§2); add it only if a browser is found where they don't |

## Log

Newest first, one line per change (CLAUDE.md "Plans and TODO").

- 2026-11-22: canvas-only fonts measured (`fonts3.html`): they load by themselves in Safari, Chrome and Firefox, and fix A sees them; §2a on how others handle it (Konva, Fabric, Excalidraw); D4 (fix B as a second layer) added, recommended no.
- 2026-11-22: written from the measurements on an iPhone and in Chrome (§2): Safari drops listeners on an unreferenced `document.fonts` and never sends `loadingdone`; fix A proposed.
