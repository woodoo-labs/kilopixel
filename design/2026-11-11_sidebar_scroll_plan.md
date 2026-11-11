# Docs Sidebar: Keep the Scroll Position Between Pages

- **Status**: ✅ **Implemented** (2026-11-11, `docs/js/layout.js`; checks in §8)
- **Date**: 2026-11-11
- **Related**: `docs/js/layout.js` (`<docs-sidebar>`), `docs/css/docs.css` (`.sidebar`, mobile drawer)
- **Target Implementation**: `docs/js/layout.js` only

---

## 1. Problem

`<docs-sidebar>` builds its links again on every page (`this.innerHTML = …` in `connectedCallback`). Its scroll container, `.sidebar` (`height: 100%`, `overflow-y: auto`), is therefore new on each page and starts at the top. After clicking a link far down the list (e.g. "Coordinate Mapping" under Engine & Reactivity), the next page shows the top of the sidebar and the active link is out of view. The reader loses their place and has to scroll again to go on.

Tailwind's docs keep the sidebar where it was; Bootstrap's docs jump to the active link. The goal is the Tailwind feel.

## 2. Options Considered

| # | Approach | Examples | Feel | Decision |
|---|---|---|---|---|
| 1 | Save the sidebar's `scrollTop` when the page is left, restore it on the next page (`sessionStorage`) | many static docs sites | The list stays where it was | ✅ chosen |
| 2 | Scroll the active link into view on load | Bootstrap docs | The list moves to the active link | ✅ as the fallback for 1 (§3.3) |
| 3 | Never reload the sidebar: links fetch the next page and swap only the content | Tailwind / Next.js, Docusaurus, VitePress, MkDocs Material "instant loading", Turbo, htmx `hx-boost` | Perfect, faster page changes | ❌ every docs page has stages, slider handlers and page scripts (Prism, Tier 3 scripts) that would have to restart after each swap, and all pages reuse ids such as `sec1Stage`. Large risk for a scroll position |
| 4 | Cross-document View Transitions (`@view-transition { navigation: auto; }`) | newer static sites | The sidebar stays visually still while the content changes | ⏸ later, optional (§6). Doesn't keep the scroll position by itself, and Firefox doesn't support it yet |
| 5 | Shorter sidebar: only the current category expanded | MDN, MkDocs Material | Less scrolling at all | ⏸ separate design question (§6) |

## 3. Design

### 3.1 Save

When the page is left, store the sidebar's scroll position for this browser tab:

```js
window.addEventListener('pagehide', () => {
  try { sessionStorage.setItem('kilopixel-docs-sidebar', String(nav.scrollTop)); } catch (e) {}
});
```

- **`sessionStorage`**: one value per browser tab, gone when the tab closes. A second tab starts fresh, which matches how people use tabs.
- **`pagehide`**, not `beforeunload`: it fires for every navigation, also on mobile Safari, and doesn't block the back / forward cache.
- **`try`**: storage can be blocked (private windows, strict settings). Then nothing is saved and the fallback (§3.3) applies.

### 3.2 Restore

Right after `this.innerHTML = …` in `connectedCallback`:

```js
const nav = this.querySelector('.sidebar');
try { nav.scrollTop = Number(sessionStorage.getItem('kilopixel-docs-sidebar')) || 0; } catch (e) {}
```

- **No visible jump**: `layout.js` is loaded in `<head>`, so `<docs-sidebar>` upgrades while the page is parsed, before the sidebar is first drawn. Setting `scrollTop` there forces one layout of the sidebar (once per page load, not per frame).
- **Same list on every page**: all pages build the same links, so the stored position means the same place on the next page. When links are added later, the position is still close enough; the fallback keeps the active link visible.

### 3.3 Fallback: Keep the Active Link Visible

After restoring, make sure the current page's link can be seen. This covers the first visit in a tab, links from outside (search results), storage that is blocked, and navigation that didn't start in the sidebar (links in the page text):

```js
const active = nav.querySelector('a.active');
if (active) {
  const top = active.offsetTop, bottom = top + active.offsetHeight;
  if (top < nav.scrollTop) nav.scrollTop = top - 16;
  else if (bottom > nav.scrollTop + nav.clientHeight) nav.scrollTop = bottom - nav.clientHeight + 16;
}
```

- Only the sidebar scrolls; `scrollIntoView()` is avoided because it can also scroll the page.
- If the active link is already visible (the usual case after a sidebar click), nothing moves.
- Built with `getBoundingClientRect()` relative to the sidebar instead of `offsetTop`, so it doesn't depend on which element is the offset parent (the sidebar is `relative` on desktop and `fixed` on phones).

### 3.4 Mobile Drawer

Below the mobile breakpoint, `.sidebar` is a fixed drawer moved out of view (`transform: translateX(-100%)`) until the menu button opens it. It is still laid out, so restoring works the same way: when the reader opens the drawer on the next page, it shows the same part of the list. The drawer already closes when a link is clicked; that doesn't change.

### 3.5 Back and Forward

Pages restored from the browser's back / forward cache keep their whole state, including the sidebar's scroll position; `connectedCallback` doesn't run again. Nothing to do. `pagehide` still fires when leaving them, so the stored value stays current.

## 4. Size and Cost

- About 15 lines in `docs/js/layout.js`; no CSS change, no new file, no build.
- One `sessionStorage` write per page change, one read and one layout of the sidebar per page load. No cost while the page is open.

## 5. Tests (Manual, in the Browser Pane)

No engine change, so no `tests/index.html` entry. Check on the dev server:

1. Scroll the sidebar halfway, click a link far down: the next page shows the same part of the list; the active link is visible.
2. Open `mapping.html` directly in a new tab: the sidebar scrolls just enough to show "Coordinate Mapping".
3. Click a link in the page text that leads to a page whose link is out of view: the sidebar shows it.
4. Storage blocked (simulate by replacing `sessionStorage.getItem` / `setItem` with functions that throw): no error, fallback works.
5. Mobile width: open the drawer, scroll, click a link, open the drawer on the next page: same position.
6. Back / forward: the position stays as it was.
7. Console clean on every page.
8. No flicker: with the network throttled in the browser (slow 3G) and the cache disabled, click through several pages far down the list. The sidebar must appear directly at its position, without first showing the top. Expected: restore and build run in one synchronous step during parsing, before the first paint (`docs.css` blocks rendering, no `scroll-behavior: smooth` on `.sidebar`). Only the late swap to Inter (`display=swap`) on an uncached first visit may move the links by a few pixels if a label wraps differently; accept that.

## 6. Not in Scope (Possible Later)

- **View Transitions** (option 4): a few CSS lines would let the sidebar stay still while the content fades. Combined with this plan, page changes would feel close to an app. Chromium and Safari support cross-document transitions; Firefox ignores the rule, which is harmless.
- **Collapsible categories** (option 5): with about 40 links in 10 categories, and more pages planned, the sidebar keeps growing. Showing only the current category expanded would help navigation in general. A design decision of its own.

## 7. Steps

1. Agree on this plan.
2. Implement §3.1–§3.3 in `docs/js/layout.js`.
3. Run the checks in §5; commit `feat(docs): sidebar keeps its scroll position between pages`.
4. Plan to ✅, TODO item removed.

## 8. Implementation Notes (2026-11-11)

- **Code**: `restoreScroll()` in `DocsSidebar.connectedCallback()` (restore + keep the active link visible), a `pagehide` listener that saves, about 20 lines.
- **One addition to §3**: in phone emulation, loading `text.html` reset the closed drawer to the top shortly after the restore (before `DOMContentLoaded`; no script set it, no DOM change in the sidebar, layout unchanged; not seen at tablet width, on desktop, or in an iframe). The sidebar now restores once more on `load` if it was restored to a position above 0 and is back at 0. On phones the drawer is out of view at that moment, so nothing visible moves; elsewhere the check does nothing.
- **Checks** (browser pane, dev server):
  1. Desktop: sidebar at 790 / 500, click a link: the next page shows the same position ✓
  2. Direct link to `mapping.html` with nothing stored: the sidebar scrolls to show "Coordinate Mapping", 16 below it ✓
  3. Leaving a page with the sidebar at 0, navigating without the sidebar (`location.href`): the next page shows its active link ✓
  4. Storage throwing on read and write: the sidebar is built, no error ✓
  5. Phone width: the closed drawer keeps its position between pages, also on `text.html` after the fix ✓
  6. Back: the page shows its active link at the stored position (the preview browser reloads instead of using the back / forward cache) ✓
  7. Console clean ✓
  8. No flicker: `scratch/sidebar_paint_check.html` reads the sidebar right after `<docs-sidebar>` while the page is parsed: already at the stored position (600). Restoring happens before anything after the sidebar is drawn. A throttled-network visual check wasn't possible in this environment (no throttling in the browser tools); worth a quick look in a normal browser.

