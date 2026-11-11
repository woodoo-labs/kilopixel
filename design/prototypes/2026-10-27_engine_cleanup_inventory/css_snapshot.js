// Paste into a docs page (browser console / javascript_tool):
// 1. before a docs.css change: window.__base = __cssSnap()
// 2. after the change: await __cssReload(); __cssDiff()  → computed-style differences, grouped
window.__cssSnap = () => {
  const els = [...document.querySelectorAll('body *')].filter(e => !e.closest('pxl-stage'));
  return els.map(e => {
    const cs = getComputedStyle(e);
    const o = {};
    for (let i = 0; i < cs.length; i++) o[cs[i]] = cs.getPropertyValue(cs[i]);
    const cls = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '';
    return { label: e.tagName.toLowerCase() + cls, o };
  });
};

// Swaps the docs.css <link> for a fresh copy (cache-busted) without reloading the page
window.__cssReload = () => new Promise(resolve => {
  const old = document.querySelector('link[href*="docs.css"]');
  const fresh = old.cloneNode();
  fresh.href = old.href.split('?')[0] + '?v=' + Date.now();
  fresh.onload = () => { old.remove(); setTimeout(resolve, 600); }; // let transitions settle
  old.after(fresh);
});

window.__cssDiff = () => {
  const now = __cssSnap();
  if (now.length !== __base.length) return { error: `element count ${__base.length} → ${now.length}` };
  const groups = {};
  now.forEach((n, i) => {
    const b = __base[i].o;
    for (const p in n.o) {
      if (b[p] !== n.o[p]) {
        const key = `${p}: ${b[p]} → ${n.o[p]}`;
        (groups[key] ||= { count: 0, sample: new Set() }).count++;
        groups[key].sample.add(n.label);
      }
    }
  });
  return Object.entries(groups).map(([k, v]) => `${v.count}× ${k}  [${[...v.sample].slice(0, 3).join(', ')}]`);
};

window.__base = __cssSnap();
`baseline: ${__base.length} elements`;
