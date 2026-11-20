// Which shapes differ between today's drawing and drawing in logical units, and how: per shape, by giving only that
// shape the patched render(). Reports the bounding box of the differing pixels in stage units.
function inspectLogical(w, maxShapes = 12) {
  const pxl = w.pxl, T = 2.345, out = [];
  const stages = [...w.document.querySelectorAll('pxl-stage')].filter(s => s.clientWidth > 0);
  for (const s of stages) s.resize();
  pxl._frame++;
  for (const s of stages) for (const L of s.layers) L.update(T);
  const un = installLogicalPatch(pxl); const patched = pxl.Shape.prototype.render; un();
  for (const s of stages) for (const L of s.layers) {
    const snap = () => { L._wasDirty = true; L._updateFrame = pxl._frame; L.render(s.unit, T); return L._ctx.getImageData(0, 0, L._canvas.width, L._canvas.height).data; };
    snap(); snap(); snap();
    const base = snap(), W = L._canvas.width, k = s.unit * L.dpr;
    for (const el of L.querySelectorAll('*')) {
      if (!(el instanceof pxl.Shape) || out.length >= maxShapes) continue;
      el.render = patched; const b = snap(); delete el.render;
      let n = 0, mx = 0, bx = [1e9, 1e9, -1, -1];
      for (let j = 0; j < b.length; j += 4) {
        const aa = base[j + 3], ba = b[j + 3]; let d = Math.abs(aa - ba);
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(base[j + c] * aa - b[j + c] * ba) / 255);
        if (d > 1) { n++; const p = j >> 2, x = p % W, y = (p - x) / W; bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x), Math.max(bx[3], y)]; }
        if (d > mx) mx = d;
      }
      if (n) {
        const v = el.attributeValues;
        out.push(`${el.localName}${el.id ? '#' + el.id : ''} n=${n} max=${mx.toFixed(0)} box=${bx.map(q => Math.round(q / k))}`
          + (v.text !== undefined ? ` text=${JSON.stringify(String(v.text).slice(0, 24))} size=${v.size} width=${v.width}` : '')
          + (typeof v.fill === 'object' && v.fill ? ` fill=${v.fill.type}` : '') + (v.linedash ? ` dash=${v.linedash}` : '')
          + (v.arrowend || v.arrowstart ? ' arrows' : ''));
      }
    }
  }
  return out;
}
window.inspectPage = async function(page, maxShapes) {
  const f = document.getElementById('f');
  await new Promise(r => { f.onload = r; f.src = page; });
  await f.contentWindow.document.fonts.ready;
  await new Promise(r => setTimeout(r, 500));
  return inspectLogical(f.contentWindow, maxShapes);
};
