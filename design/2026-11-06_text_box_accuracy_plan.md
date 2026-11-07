# Text Box Accuracy: `maxwidth` and Late Web Fonts

- **Status**: ✅ **Implemented** (2026-11-06; tests in §9 pass, no real pixel regressions on the docs pages, §6.2)
- **Date**: 2026-11-06
- **Related**: `design/2026-10-13_text_hit_testing_plan.md` (§3.4 and §4.c, where these limitations were first recorded), `.agents/TODO.md` §9 (images arrive late too, §7 below)
- **Target Implementation**: `js/elements/shapes/text.js`, `js/elements/stage.js`

---

## 1. Problems

The text bounding box is the hit area and the area gradients are placed in. It is wrong in two cases. Measured with the real engine (`scratch/text_box/demo.html`).

### 1.1 `maxwidth` is ignored by the box

`measureText()` doesn't know the `maxWidth` argument of `fillText()`, and a `maxwidth` change doesn't trigger a new measurement.

| `maxwidth` | Drawn text width | Box width today |
|---|---|---|
| 460 | 455 | 814 |
| 200 | 197 | 814 |

### 1.2 A web font that arrives after the first draw

The font string doesn't change when the font arrives, so no cache is dirty. This was more than the box problem first recorded: wrapping is wrong too, and a static layer keeps the wrong font.

| Case | Glyphs | Wrapping | Box |
|---|---|---|---|
| Static layer, nothing else happens (user page today) | **fallback font, stays** | wrong | wrong |
| Layer invalidated on font arrival (`text.html`, `fill.html`) | correct | **wrong** | **wrong, glyphs stick out** |
| Animated layer | correct (from the code, not measured) | wrong | wrong |

`linear.html` loaded Inter through a hidden preloader and used it on `<pxl-text>`, but had no handler. From the code it belonged to the first row; not tested on that page.

---

## 2. Decisions

1. **`maxwidth`: the simple version (§3), chosen 2026-11-06.** Animating `maxwidth` heavily is unlikely, and the cached version (§10) needs twice the new code for that case. It can be added later without an API change.
2. **The batch limitation of `loadingdone` (§6.1) is accepted, 2026-11-06.** A hanging font delays the correction for all fonts of its batch.
3. **The hidden font preloader is removed, 2026-11-06.** With this fix the docs pages no longer need it, and the docs describe fonts as loaded lazily instead (§6.4).

---

## 3. Change 1: `maxwidth` in the Box (`text.js`)

`maxwidth` becomes one more input of the existing Tier 3 block, and each line's box is scaled in its loop.

**Constructor**, new field:

```javascript
this._lastMaxwidth = 0;
```

**`draw()`**, Tier 3. The condition gets one more input:

```javascript
// --- 3. Bounding box and first baseline ---
if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline ||
    this._lastLineheight !== lineheight || this._lastDirection !== direction ||
    this._lastMaxwidth !== maxwidth) {
```

The loop scales both sides of a squeezed line:

```javascript
for (let i = 0; i < this._lines.length; i++) {
  const metrics = ctx.measureText(this._lines[i]);
  // measureText() ignores maxWidth: a line wider than maxwidth is squeezed around its anchor, so both sides scale
  const squeeze = maxwidth > 0 ? Math.min(1, maxwidth * u / metrics.width) : 1;
  const left = metrics.actualBoundingBoxLeft * squeeze;
  const right = metrics.actualBoundingBoxRight * squeeze;
  if (left > maxLeft) maxLeft = left;
  if (right > maxRight) maxRight = right;
  if (i === 0) maxAscent = metrics.actualBoundingBoxAscent;
  if (i === this._lines.length - 1) maxDescent = metrics.actualBoundingBoxDescent;
}
```

With the other stored values at the end of the block:

```javascript
this._lastMaxwidth = maxwidth;
```

An empty line has a width of 0. The division then gives `Infinity`, and `Math.min` turns it into 1, so no guard is needed.

Gradients need no change: `createGradient()` already compares the box (`shape.js:139`) and rebuilds when it changed. Hit testing needs no change: it reads the box.

---

## 4. Change 2: Late Web Fonts (`text.js`, `stage.js`)

**`stage.js`**, new method next to `requestRender()`. `_layers` belongs to the stage, so the loop has to live there:

```javascript
invalidateLayers() {
  for (let i = 0; i < this._layers.length; i++) this._layers[i].invalidate();
}
```

**`text.js`**, above the class:

```javascript
// Raised when web fonts arrive. The font string doesn't change then, so each text compares this number instead.
pxl._fontGeneration = 0;
```

**Constructor:** `this._lastFontGeneration = 0;`

**`draw()`, Tier 1:** one more condition, and the new value is stored with the others:

```javascript
if (
  this._lastSize !== size ||
  // ... unchanged ...
  this._lastLetterspacing !== letterspacing ||
  this._lastFontGeneration !== pxl._fontGeneration
) {
  // ... unchanged ...
  this._lastFontGeneration = pxl._fontGeneration;
}
```

A dirty Tier 1 already makes Tiers 2 and 3 dirty, so wrapping and box both follow.

**`text.js`**, after `customElements.define('pxl-text', pxl.Text)`:

```javascript
// All layers, because a custom shape can draw text too. Hidden or off-screen stages catch up when they next render.
document.fonts.addEventListener('loadingdone', () => {
  pxl._fontGeneration++;
  for (let i = 0; i < pxl.perf.stages.length; i++) pxl.perf.stages[i].invalidateLayers();
});
```

- **`pxl.perf.stages`, not `querySelectorAll('pxl-layer')`:** it is the existing stage registry (`stage.js:83`). No DOM query and no new array, and it keeps working if layers ever live in a shadow root (`design/2026-10-30_framework_compatibility_plan.md` §9).
- **A counter, not a loop over all texts:** a text that isn't drawn right now (hidden, off-screen, `reveal`) compares on its next draw. No registry of texts is needed.

---

## 5. Performance and GC

### 5.1 Method

- Patched engine copies from `dist/pxl.js` (`scratch/text_box/make_variants.js`): `base` (today), `simple` (§3, chosen), `cached` (§10). Both patched copies include §4.
- `scratch/text_box/bench.html`: each copy in its own iframe. Frames rendered directly with `stage.render(t)`: 60 warm-up frames, then 200 measured frames, 5 rounds with rotating order.
- **Time** is the main-thread cost of the engine. Rasterizing runs later and is the same in all copies.
- **Allocation** comes from `performance.memory.usedJSHeapSize` across the 200 frames. A GC during a round makes the value negative, so only rounds without a GC are comparable. Treat these values as rough.
- Chromium in the Claude desktop app, one laptop, device pixel ratio as on that machine. **Noise:** in S1 the patched `simple` copy came out 5% *faster* than `base`, which it can't really be, so differences of about that size mean nothing.

### 5.2 Results

Milliseconds per frame, mean / median. Budget at 60 fps: 16.7 ms.

| Scenario | `base` | `simple` | `cached` |
|---|---|---|---|
| S1: 2000 moving texts, no `maxwidth` | 13.31 / 12.6 | 12.61 / 12.0 | 13.22 / 12.3 |
| S2: 2000 moving texts, static `maxwidth` | 13.51 / 12.9 | 13.25 / 12.6 | 13.27 / 12.5 |
| S3: 200 texts, animated `maxwidth` | 1.09 / 1.0 | **1.51 / 1.4** | 1.06 / 1.0 |
| S4: 200 texts of 5 lines, animated `maxwidth` | 2.27 / 2.1 | **3.34 / 3.2** | 2.45 / 2.2 |
| S5: 200 texts, animated `maxwidth` + gradient, run 1 | 1.34 / 1.2 | 2.05 / 1.9 | 2.08 / 1.6 |
| S5, run 2 | 1.37 / 1.2 | 2.12 / 1.9 | 1.83 / 1.6 |
| S6: 200 texts, new text every frame, static `maxwidth` | 1.20 / 1.1 | 1.20 / 1.1 | 1.28 / 1.2 |

Heap growth per 200 frames, rounds without a GC:

| Scenario | `base` | `simple` | `cached` |
|---|---|---|---|
| S1 | ≈ 0.65 MB | ≈ 0.65 MB | ≈ 0.65 MB |
| S3 | ≈ 1.0 MB | **≈ 3.1 MB** | ≈ 1.0 MB |
| S4 | ≈ 2.9 MB | **≈ 4.0 to 5.3 MB** | ≈ 2.9 MB |
| S6 | ≈ 5.1 MB | ≈ 5.6 MB | ≈ 5.1 MB |

S5's heap values were too inconsistent between runs to compare.

Other measurements:

| What | Result |
|---|---|
| The new Tier 1 comparison alone (`scratch/text_box/checks.html`) | 0.004 ms per frame for 2000 texts |
| Font arrival, 2000 texts, the one frame that measures everything again | median ≈ 15 to 16 ms, max 19.8 ms, compared with ≈ 12.5 ms for a normal frame |
| `loadingdone` per page load | 1 event with 9 faces on `text.html` (9 stages) and on `linear.html` (5 stages). A batch count above 1 is possible: one run of the end-to-end check in §6.2 had 2 events |

### 5.3 Allocation by code path

| Path | When | New allocation |
|---|---|---|
| Tier 1 comparison | every drawn text, every frame | none: two reads and one comparison of small integers |
| Unchanged text with `maxwidth` | every drawn text, every frame | none: no block runs |
| `maxwidth` changes (`simple`, chosen) | per change | one `TextMetrics` per line, about 50 bytes each going by S3 (2 MB over 200 frames and 200 texts) |
| `maxwidth` changes (`cached`, not chosen) | per change | none: arithmetic and writes into existing number arrays. Measured: same heap growth as `base` |
| `maxwidth` changes with a gradient | per change | **one gradient per text**, in every variant. The gradient has to follow the box. Same rule as any shape whose size changes (`shape.js:139`) |
| Font arrival | once per batch | font string, line arrays, `TextMetrics`: one-off, not per frame |
| Listener | once at script load | one closure |

### 5.4 Verdict

- **The normal per-frame path is not affected.** S1 and S2 are within noise, and no allocation is added.
- **Accepted exception: animated `maxwidth` allocates per frame.** `simple` costs about 40% more time there (2 µs per text) and about three times the allocation (S3: about 10 KB per frame more for 200 texts), while `cached` stays at today's level. This goes against the rule of no allocations in per-frame paths, and it is accepted because the case is rare and the cost small for realistic use: one animated label costs about 2 µs and 50 bytes per line per frame. Text whose content changes every frame already calls `measureText()` per frame (S6), so this isn't a new kind of cost.
- **Known cost: animated `maxwidth` with a gradient.** With `simple`, time rises by about 0.7 ms per 200 texts (median), and in this scenario the patched copies had rare long frames: max 25 and 58 ms for `simple`, 203 and 80 ms for `cached`, 12 and 10 ms for `base`. p99 stayed at about 4 to 6 ms for `simple`. These are probably GC pauses from the gradient objects, not proven. Accepted: 200 such texts at once are unrealistic, and today's result in this case is a wrongly placed gradient.
- **Font arrival** costs a few milliseconds in one frame, once per batch.

**Pre-existing, not caused by this plan:** `base` itself allocates per frame (S1: about 1.6 bytes per text, S3: about 25 bytes per text). Not investigated here. 2000 texts also use about 13 ms of the 16.7 ms budget before any of these changes.

---

## 6. Behavior and Edge Cases

### 6.1 Font events (measured, `checkBatches` in `scratch/text_box/checks.html`)

| Case | Result |
|---|---|
| One font arrives, one returns 404 | `loadingdone` lists the good font, `loadingerror` the bad one. The good font is corrected |
| One font arrives, one hangs | **No `loadingdone` while the second hangs**: none within 7 s, `document.fonts.status` stayed `loading` |
| Load started by drawing on canvas alone | Fires without any DOM use or `document.fonts.load()` (`scratch/text_box/fix_test.html`) |

**Accepted limitation (§2):** text using the fast font stays in its fallback until the batch ends, which happens when the browser gives up on the hanging font (how long that takes was not measured). Text stays readable and corrects itself. Today's `document.fonts.ready` handlers wait for the same moment, so this is no regression. Following each `FontFace.loaded` promise would avoid it, but needs more code for a rare case.

### 6.2 Verified with the patched copy

| Check | Result |
|---|---|
| End to end with its own listener (`checkLateFont`, `simple` and `cached`): static layer, gradient | same wrapping, box and pixels as text created after the font arrived |
| End to end: stage off-screen when the font arrives | not redrawn while off-screen, corrected when scrolled into view: same wrapping and box. Pixels differed by at most 1/255 on 123 of about 1.17 million bytes in one comparison and matched in another, which looks like read-back noise |
| Cache consistency (`checkConsistency`): 28 changes in a row on one text (`maxwidth`, `align`, `baseline`, `lineheight`, `text`, `width`, `size`, `font`, `weight`, `letterspacing`, `direction`), compared with a fresh text after each | no differences, `simple` and `cached` |
| Box against drawn pixels (`checkInk`): 24 combinations of alignment, spacing, `maxwidth`, one and two lines | at most 3 units apart in both variants (`base`: up to 811). The larger differences have the box slightly bigger than the ink |
| Built engine, real late font (`scratch/text_box/verify_built.html`) | static layer corrected on its own: same wrapping and box as text created after the font arrived. Box width 199 at `maxwidth` 200 and 697 at 700 |
| Old against built engine, all 23 docs pages, pixels per layer (`scratch/text_box/regress.html`) | 158 of 162 layers identical, no script errors. The other 4 are noise: a live FPS readout (`dashes.html`, `fill.html`), 2046 pixels that differ between two runs of the old engine too (`mapping.html`), and 4 pixels that were 0 when compared again (`radial.html`). No docs layer combines a squeezed line with a gradient, so the sweep doesn't show the corrected gradient |
| Off-screen stages on `linear.html` | not redrawn until scrolled into view, then up to date |

### 6.3 Unchanged or accepted

- **Partial `reveal`:** keeps the full box, as documented. The revealed part may be squeezed less than the full line, because `fillText()` receives the shorter string.
- **A visible swap remains:** text can appear in the fallback font and then change, and may re-wrap, like HTML text with `display=swap`.
- **Pages whose only web fonts are for HTML:** a font batch still redraws all layers once.
- **Custom shapes:** they are redrawn, but a custom shape with its own text cache would have to compare `pxl._fontGeneration` itself. `pxl._*` is internal, so no public promise.
- **Not tested:** other browsers, and right-to-left text against drawn pixels (RTL is only in the cache consistency check).

### 6.4 Removing the font preloader (measured, `scratch/text_box/no_preloader.html`)

`text.html`, `fill.html` and `linear.html` had a hidden `<div>` that rendered all 9 weights of Inter, so the weight sliders never had to wait for a font. The real pages were compared with and without it, changing the weight six times:

| | `text.html` | `linear.html` |
|---|---|---|
| Weights loaded at start, with / without | 9 / 7 | 9 / 6 |
| Box compared with the page with the preloader | same every time | same every time |
| Time until a missing weight was ready | 28 ms | about 33 ms |

After the removal, the real sliders on `fill.html` and `linear.html` were logged frame by frame: with cached fonts, the box was right within one frame at every weight tested.

**One file for all weights:** Google Fonts serves all 9 Inter weights as one 47 KB file for Latin text (63 faces, 7 files in total). Once a page has shown any Inter, a new weight needs no further download. Fonts with one file per weight would wait on each new weight.

**Real download with the cache bypassed** (random value in the font URL, real text on `linear.html`, 5 runs, page visible, on the connection of that day):

| Case | Until the text is correct | Longest frame gap | Longest main-thread gap |
|---|---|---|---|
| First download of the font | 234 to 298 ms | 20 to 46 ms | 20 to 59 ms |
| New weight from the same file | 47 to 91 ms | 18 to 28 ms | 11 to 36 ms |

**Slow networks, simulated** (`scratch/text_box/slow/`): a Service Worker delays the Google Fonts requests of the real `text.html` and delivers the real bytes at a set speed, so the browser uses its normal font loading path. 2 runs per speed and version, page visible in all 20 loads. Times count from the start of the page load.

| Network | CSS arrives | Font arrives | Text correct, without preloader | Text correct, with preloader | Weight 100, first use (both versions) |
|---|---|---|---|---|---|
| No throttle (bytes already held by the script) | 0 ms | 0 ms | 284 to 567 ms | 216 to 323 ms | 10 to 18 ms |
| Fast 4G (9 Mbit/s, 60 ms) | about 87 ms | about 113 ms | 393 to 398 ms | 438 ms | 9 to 18 ms |
| Slow 4G (1.6 Mbit/s, 150 ms) | about 274 ms | about 400 ms | 864 to 898 ms | 860 to 919 ms | 16 to 18 ms |
| 3G (750 kbit/s, 300 ms) | about 583 ms | about 825 ms | 1605 to 1741 ms | 1617 to 1769 ms | 10 to 20 ms |
| Slow 3G (400 kbit/s, 2 s) | about 2.5 s | about 3 s | 5.7 s | 5.8 s | 11 to 19 ms |

- On the throttled networks both versions make the same two requests and finish about the same time. The no-throttle row varies more, but has only 2 runs each and no network wait to compare.
- In all 20 loads the box moved from the fallback font's 393.2 to the expected 355.5, and to 321.9 at weight 100.
- The longest main-thread gap during page load was about 205 ms, similar in both versions and most likely the page loading itself. While changing the weight it was 7 ms or less.

**Limits:** real networks are probably slower, because the simulation skips connection setup (DNS, TLS) and slows only Google Fonts, not the page or the engine. How long the fallback font stays visible is probably close to the "Font arrives" column, but it wasn't measured directly. The speeds resemble common network presets and aren't exact copies of Chrome's. Chromium only.

**Throttled runs:** an earlier try with an uncached family (Bitter) gave 0.35 to about 1 second with frame gaps of about 1 second, but the browser was throttling the page during at least part of those runs (`visibility: hidden`, about 1 timer firing per second). Those times don't count. The final boxes there were still correct.

---

## 7. Relation to `<pxl-image>` (TODO §9)

Images are late too, but no shared system is proposed, and `<pxl-image>` must not use `pxl._fontGeneration`:

| | Late font | Late image |
|---|---|---|
| Who reports it | Only the page (`document.fonts`) | The image element (`load` event) |
| Affected shapes | Unknown, so all layers redraw | Known: the shapes using that image |
| Before arrival | Fallback font is drawn | Nothing can be drawn |
| Failure | Fallback stays, readable | Nothing is drawn |

Both end with `layer.invalidate()`, which exists, and a full redraw: besides the layer canvases the engine has only a 1 × 1 helper canvas for hit testing, so no rendered output is cached.

**Note for §9 (first thoughts, to be decided in its own plan):**
- Before loading: draws nothing and can't be hit (like `_hasInk` in `text.js`).
- After loading: invalidates its own layer. An image already complete in the browser cache must be handled too, because its `load` event may have fired already.
- If the user sets only one dimension, or uses `contain` / `cover`, the box isn't known until the image arrives.
- The same `src` on several shapes: one shared image; each shape invalidates its own layer.
- Natural size through `ref.*`: shapes in other layers then depend on the image, so invalidating one layer isn't enough. This is the one point that needs more thought.
- Failed loads: connect to `design/2026-11-07_safe_shape_render_plan.md` (`reportError()`) if that plan fits.

---

## 8. Implementation Steps

1. `js/elements/stage.js`: `invalidateLayers()` (§4).
2. `js/elements/shapes/text.js`: §3 and §4.
3. `tests/index.html`: tests from §9.
4. `node build.js`; update the sizes in `docs/installation.html` and the `.agents/KILOPIXEL.md` header.
5. `tests/index.html`: all tests pass.
6. `.agents/KILOPIXEL.md`:
   - Text section, line 1262: Tier 1 also tracks `_lastFontGeneration`; a note on `loadingdone`.
   - Line 1269: Tier 3 also runs when `maxwidth` changes.
   - Line 1283 or 1290: the box follows `maxwidth`.
   - Line 1302: replace the limitations with the batch limitation (§6.1).
7. Docs:
   - `docs/text.html` lines 1336 to 1342 and `docs/fill.html` lines 716 to 721: remove the `document.fonts.ready` handler.
   - `docs/text.html`, `docs/fill.html`, `docs/linear.html`: remove the hidden preloader `<div>` and its comment (§6.4).
   - `docs/text.html`, "System Fonts vs. Web Fonts" callout: web fonts load lazily, each font and each weight the first time text is drawn with it; the text uses a fallback font until then and is redrawn automatically.
   - `docs/DOCS_STANDARDS.md` §9: one "Lazy Loading" rule replaces the preloader and handler rules. §8: remove the inline style exception for font preloaders. Tested in Chromium only.
8. Verify in the browser: `text.html` §1 and §5, `fill.html`, `linear.html`, `scratch/text_box/demo.html` adapted to the built engine; console clean.
9. `.agents/TODO.md`: remove the item, add the note from §7 to §9. This plan to ✅. `node tools/check_plans.js`.

---

## 9. Tests (`tests/index.html`)

`measureText` is counted by wrapping `CanvasRenderingContext2D.prototype.measureText` during a test, so the normal per-frame path stays protected.

| # | Case | Expected |
|---|---|---|
| T1 | `maxwidth="200"`, line much wider, `align="center"` | box width ≤ 200 + 2 units, left and right scaled by the same factor |
| T2 | `maxwidth` larger than the line | box equals the box without `maxwidth` |
| T3 | Two lines, only one wider than `maxwidth` | only that line is scaled; the box is the widest of the results |
| T4 | Changing only `maxwidth`, three lines | box follows, exactly 3 `measureText` calls, then none on the next frame |
| T5 | Moving text, 10 frames | **0 `measureText` calls** |
| T6 | The chain from §6.2, compared with a fresh text after each step | equal boxes |
| T7 | `document.fonts.dispatchEvent(new Event('loadingdone'))` | `pxl._fontGeneration` + 1; all layers of the test stages dirty; next draw measures each line again |
| T8 | Text with a gradient, `maxwidth` changes | `_gradCache[0]` holds the new box values |
| T9 | `measureText` replaced with one that reports wider text, standing in for another font | no new layout without the event; more lines after `loadingdone`; back to the first layout after the next one |

T1, T4, T7, T8 and T9 fail on the old engine; T2, T3, T5 and T6 pass there and guard against regressions. A real network font stays a manual check (`scratch/text_box/verify_built.html`).

---

## 10. Alternatives

| Alternative | Verdict |
|---|---|
| **Cached line metrics:** split Tier 3 into line metrics and box. Per-line left, right and width stay in three number arrays, plus first ascent and last descent, so a `maxwidth` change only recalculates the box. Together with §4: net 34 new lines against 16, 6 new `maxwidth` fields against 1, 97 bytes more gzipped (Terser run in `scratch/`, may differ slightly from the build) | Same boxes and no per-frame allocation for animated `maxwidth` (§5), but twice the code for a rare case. Not chosen. Can be added later without an API change if real pages need it |
| `querySelectorAll('pxl-layer')` in the listener | Works today, but stops at shadow roots; the stage registry already exists |
| Handler on each docs page or in user code (today) | Only reaches the second row of §1.2, and every user would have to know about it |
| Calling `document.fonts.check()` per draw | A browser call per text per frame, on the hot path. Rejected without measuring |
| Following each `FontFace.loaded` promise | Avoids §6.1 at the price of more code for a rare case. Revisit if real pages hit it |
| One shared "late asset" mechanism for fonts and images | Rejected (§7) |
