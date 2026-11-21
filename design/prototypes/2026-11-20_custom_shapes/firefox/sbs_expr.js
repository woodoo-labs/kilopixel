(async () => {
  await document.fonts.ready; await new Promise(r => setTimeout(r, 800));
  await new Promise((r) => { const s = document.createElement('script'); s.src = '/design/prototypes/2026-11-20_custom_shapes/logical_units/patch.js'; s.onload = r; document.head.append(s); });
  const T = 2.345, stage = document.querySelector('pxl-stage');
  for (const s of document.querySelectorAll('pxl-stage')) s.render = () => {};
  const snap = () => {
    pxl.Stage.prototype.resize.call(stage);
    pxl._frame++;
    for (const L of stage.layers) L.update(T);
    for (const L of stage.layers) { L._wasDirty = true; L._updateFrame = pxl._frame; L.render(stage.unit, T); }
    const c = document.createElement('canvas'), first = stage.layers[0]._canvas;
    c.width = first.width; c.height = first.height;
    const g = c.getContext('2d'); g.fillStyle = getComputedStyle(document.body).backgroundColor || '#000'; g.fillRect(0, 0, c.width, c.height);
    for (const L of stage.layers) g.drawImage(L._canvas, 0, 0);
    return c;
  };
  snap(); const a = snap(); const linesA = [...stage.querySelectorAll("pxl-text")].map(t => t._lines ? t._lines.length : 0);
  const un = installLogicalPatch(pxl); snap(); const b = snap(); const linesB = [...stage.querySelectorAll("pxl-text")].map(t => t._lines ? t._lines.length : 0); un();
  const lines = [...stage.querySelectorAll('pxl-text')].filter(t => t._lines && t._lines.length > 1).map(t => t._lines.length);
  const out = document.createElement('canvas'); out.width = a.width; out.height = a.height * 2 + 10;
  const g = out.getContext('2d'); g.fillStyle = '#f00'; g.fillRect(0, 0, out.width, out.height); g.drawImage(a, 0, 0); g.drawImage(b, 0, a.height + 10);
  document.body.innerHTML = ''; document.body.style.margin = '0';
  out.style.width = (out.width / devicePixelRatio) + 'px'; document.body.append(out);
  return { size: [a.width, a.height], sameLineCounts: JSON.stringify(linesA) === JSON.stringify(linesB), linesA: linesA.join(), linesB: linesB.join() };
})()
