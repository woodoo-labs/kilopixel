// Canvas fingerprints of every docs page, drawn at one fixed time (refactoring safety net).
// Run from any page on the dev server (javascript_tool / console):
//   (0, eval)(await (await fetch('/design/prototypes/2026-10-27_engine_cleanup_inventory/pixel_snapshot.js')).text())
//   await __pixRun('base1')         → stores fingerprints in localStorage under 'pix:base1'
//   __pixCompare('base1', 'after')  → canvases whose fingerprint differs
window.__pixPages = [
  'index', 'installation', 'walkthrough', 'gallery', 'circle', 'ellipse', 'rect', 'line', 'polyline',
  'text', 'arrows', 'caps', 'dashes', 'stroke', 'fill', 'linear', 'radial', 'conic', 'shadow', 'blend',
  'mask', 'filter'
];
window.__PIX_T = 3.7; // seconds: the time every stage is drawn at

const fnv = (data) => {
  const words = new Uint32Array(data.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h ^= words[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};
// Timers, not requestAnimationFrame: rAF doesn't fire while the browser pane is hidden
const frame = () => new Promise(r => setTimeout(r, 50));

window.__pixSnapshotPage = async (page) => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position: fixed; left: -3000px; top: 0; width: 1100px; height: 900px; border: 0;';
  iframe.src = `/docs/${page}.html`;
  document.body.appendChild(iframe);
  await new Promise(r => iframe.onload = r);
  const win = iframe.contentWindow, doc = iframe.contentDocument;
  await doc.fonts.ready;
  await new Promise(r => setTimeout(r, 1200));

  const stages = [...doc.querySelectorAll('pxl-stage')];
  stages.forEach(s => { s.isVisible = false; s._isVisible = false; });   // stop the rAF loop
  stages.forEach(s => s.resize());                  // ResizeObserver doesn't fire while the pane is hidden
  await frame(); await frame();

  const out = {};
  stages.forEach((stage, si) => {
    for (let pass = 0; pass < 2; pass++) {          // second pass settles refs across layers
      (stage._layers || stage.layers).forEach(l => { l.isDirty = true; });
      stage.render(__PIX_T);
    }
    (stage._layers || stage.layers).forEach((layer, li) => {
      const c = layer._canvas || layer.canvas;
      if (c.width === 0 || c.height === 0) return;
      out[`${page}#s${si}${stage.id ? '(' + stage.id + ')' : ''}/l${li}`] = fnv(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
    });
  });
  iframe.remove();
  return out;
};

// Runs in the background (a full run takes longer than one tool call); poll __pixStatus
window.__pixRun = (name) => {
  window.__pixStatus = `${name}: running`;
  (async () => {
    const all = {};
    for (const page of __pixPages) {
      window.__pixStatus = `${name}: ${page}`;
      Object.assign(all, await __pixSnapshotPage(page));
    }
    localStorage.setItem('pix:' + name, JSON.stringify(all));
    window.__pixStatus = `${name}: done, ${Object.keys(all).length} canvases`;
  })().catch(e => { window.__pixStatus = `${name}: error ${e.message}`; });
  return window.__pixStatus;
};

window.__pixCompare = (a, b, noise = []) => {
  const A = JSON.parse(localStorage.getItem('pix:' + a)), B = JSON.parse(localStorage.getItem('pix:' + b));
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  const diff = [...keys].filter(k => A[k] !== B[k] && !noise.includes(k));
  return { compared: keys.size, differ: diff.length, keys: diff };
};

'pixel snapshot loaded';
