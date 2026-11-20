// The proposed render path as a patch over the running engine: every shape gets its global matrix with setTransform,
// groups and layers apply no transform of their own. install(pxl) returns uninstall().
function installTransformPatch(pxl) {
  const old = { shape: pxl.Shape.prototype.render, group: pxl.Group.prototype.render };
  pxl.Shape.prototype.render = function(ctx, u, t) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;
    if (this.needsIsolation()) {
      this.renderIsolated(ctx, u, t);
      return;
    }
    ctx.save();
    try {
      const m = this.getGlobalMatrix(), d = this.parentLayer.dpr;
      ctx.setTransform(m[0] * d, m[1] * d, m[2] * d, m[3] * d, m[4] * u * d, m[5] * u * d);
      pxl.applyCompositingState(ctx, u, this.attributeValues, this);
      this.draw(ctx, u, t);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  };
  pxl.Group.prototype.render = function(ctx, u, t) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;
    for (let i = 0; i < this.childList.length; i++) this.childList[i].render(ctx, u, t);
  };
  return () => { pxl.Shape.prototype.render = old.shape; pxl.Group.prototype.render = old.group; };
}

// Largest difference of two RGBA arrays, compared premultiplied
function premultipliedDiff(A, B) {
  let mx = 0;
  for (let j = 0; j < A.length; j += 4) {
    const aa = A[j + 3], ba = B[j + 3];
    let d = Math.abs(aa - ba);
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[j + c] * aa - B[j + c] * ba) / 255);
    if (d > mx) mx = d;
  }
  return mx;
}

// Draws every layer of the page twice with the same values (old path, patched path) and compares the pixels
function comparePaths(w) {
  const pxl = w.pxl, T = 2.345;
  const stages = [...w.document.querySelectorAll('pxl-stage')].filter(s => s.clientWidth > 0);
  const warns = [];
  const origWarn = w.console.warn;
  w.console.warn = (...a) => warns.push(String(a[0]).slice(0, 120));
  for (const s of stages) s.resize();
  pxl._frame++;
  for (const s of stages) for (const L of s.layers) L.update(T);
  const draw = () => {
    const out = [];
    for (const s of stages) for (const L of s.layers) {
      L._wasDirty = true; L._updateFrame = pxl._frame;
      L.render(s.unit, T);
      out.push(L._ctx.getImageData(0, 0, L._canvas.width, L._canvas.height).data);
    }
    return out;
  };
  // Chrome moves a canvas from GPU to CPU drawing after a few getImageData() calls, which changes anti-aliasing:
  // read every layer a few times first, so all compared draws use the same mode
  draw(); draw(); draw();
  const a = draw(), warnsA = warns.length;
  const uninstall = installTransformPatch(pxl);
  let b;
  try { b = draw(); } finally { uninstall(); }
  const a2 = draw(); // old path again: a layer whose two old draws differ (web fonts settling) is unstable, not counted
  w.console.warn = origWarn;
  let maxDiff = 0, pixels = 0, over1 = 0, layersDiff = 0, unstable = 0;
  // Compared premultiplied (color × alpha / 255): what the page shows. Un-premultiplied values of nearly transparent
  // edge pixels jump by up to 255 for a change of one alpha step.
  for (let i = 0; i < a.length; i++) {
    let layerHas = false;
    const A = a[i], B = b[i], C = a2[i];
    if (premultipliedDiff(A, C) > 1) { unstable++; continue; } // the old path drawn twice already differs (1/255 is GPU noise)
    for (let j = 0; j < A.length; j += 4) {
      const aa = A[j + 3], ba = B[j + 3];
      let d = Math.abs(aa - ba);
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[j + c] * aa - B[j + c] * ba) / 255);
      if (d > maxDiff) maxDiff = d;
      if (d > 1) { over1++; layerHas = true; }
    }
    if (layerHas) layersDiff++;
    pixels += A.length / 4;
  }
  return { stages: stages.length, layers: a.length, unstable, layersDiff, maxDiff, valuesOver1: over1, pixels,
           warnsOld: warnsA, warnsNew: warns.length - warnsA };
}
