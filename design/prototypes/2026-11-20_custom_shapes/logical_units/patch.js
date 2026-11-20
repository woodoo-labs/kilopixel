// "Draw in logical units" as a patch over today's engine. Every built-in draw() multiplies its lengths by its u
// parameter, so draw(ctx, 1) on a context scaled by u draws in logical units with today's code: gradients, line
// width, dashes, arrowheads, text and grid all in logical units, their caches no longer keyed by the stage size.
// Shadows and filters (which ignore the transform) are still set before draw() with the real u.
function installLogicalPatch(pxl) {
  const S = pxl.Shape.prototype, IE = pxl.InteractionEngine.prototype;
  const old = { render: S.render, renderIsolated: S.renderIsolated, hitsShape: IE.hitsShape };

  S.render = function(ctx, u, t) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;
    if (this.needsIsolation()) { this.renderIsolated(ctx, u, t); return; }
    ctx.save();
    try {
      pxl.applyContextState(ctx, u, this.attributeValues, this);
      ctx.scale(u, u); // in the real engine: once per layer, with the layer and group transforms in logical units
      this.draw(ctx, 1, t);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  };

  S.renderIsolated = function(ctx, u, t) {
    const canvas = ctx.canvas, w = canvas.width, h = canvas.height, d = this.parentLayer.dpr;
    const scratch = pxl.getIsolationContext(w, h);
    scratch.clearRect(0, 0, w, h);
    scratch.save();
    try {
      const m = this.getGlobalMatrix();
      scratch.setTransform(m[0] * u * d, m[1] * u * d, m[2] * u * d, m[3] * u * d, m[4] * u * d, m[5] * u * d);
      this.draw(scratch, 1, t);
    } catch (error) {
      this.reportError(error);
      return;
    } finally {
      scratch.restore();
    }
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      pxl.applyCompositingState(ctx, u, this.attributeValues, this);
      ctx.drawImage(scratch.canvas, 0, 0, w, h, 0, 0, w, h);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  };

  IE.hitsShape = function(shape, x, y) {
    try {
      if (!shape.mayContainPoint(x, y) || shape.cssStyle().pointerEvents === 'none') return false;
    } catch (error) {
      shape.reportError(error);
      return false;
    }
    const ctx = pxl.dummyCtx, u = this.stage.unit;
    pxl._hitResult = false;
    ctx.save();
    try {
      const m = shape.getGlobalMatrix();
      ctx.setTransform(m[0] * u, m[1] * u, m[2] * u, m[3] * u, m[4] * u, m[5] * u);
      ctx.beginPath();
      if (shape.hitTest) shape.hitTest(ctx, 1);
      else shape.draw(ctx, 1, 0);
    } catch (error) {
      shape.reportError(error);
      return false;
    } finally {
      ctx.restore();
    }
    return pxl._hitResult;
  };

  return () => { S.render = old.render; S.renderIsolated = old.renderIsolated; IE.hitsShape = old.hitsShape; };
}

function premultipliedDiff(A, B) {
  let mx = 0, n = 0;
  for (let j = 0; j < A.length; j += 4) {
    const aa = A[j + 3], ba = B[j + 3];
    let d = Math.abs(aa - ba);
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[j + c] * aa - B[j + c] * ba) / 255);
    if (d > mx) mx = d;
    if (d > 1) n++;
  }
  return { max: mx, over1: n };
}

// Pixels of every layer (old, patched, old again) and hit testing on a grid of points (old, patched)
function compareLogical(w) {
  const pxl = w.pxl, T = 2.345;
  const stages = [...w.document.querySelectorAll('pxl-stage')].filter(s => s.clientWidth > 0);
  const warns = [];
  const origWarn = w.console.warn;
  w.console.warn = (...a) => warns.push(String(a[0]).slice(0, 120));
  for (const s of stages) s.resize();
  pxl._frame++;
  for (const s of stages) for (const L of s.layers) L.update(T);
  const draw = () => stages.flatMap(s => s.layers.map(L => {
    L._wasDirty = true; L._updateFrame = pxl._frame; L.render(s.unit, T);
    return L._ctx.getImageData(0, 0, L._canvas.width, L._canvas.height).data;
  }));
  const hits = () => stages.flatMap(s => {
    const out = [], hgt = s.attributeValues.height;
    for (let x = 5; x < 1000; x += 15) for (let y = 5; y < hgt; y += 15) out.push(s.interaction.findShapeAt(x, y));
    return out;
  });
  draw(); draw(); draw(); // Chrome moves canvases to CPU drawing after a few readbacks: settle that first
  const a = draw(), hitA = hits(), warnsA = warns.length;
  const uninstall = installLogicalPatch(pxl);
  let b, hitB;
  try { b = draw(); hitB = hits(); } finally { uninstall(); }
  const a2 = draw();
  w.console.warn = origWarn;
  let layers = 0, unstable = 0, differ = 0, maxAll = 0, over1 = 0;
  for (let i = 0; i < a.length; i++) {
    layers++;
    if (premultipliedDiff(a[i], a2[i]).max > 1) { unstable++; continue; }
    const r = premultipliedDiff(a[i], b[i]);
    if (r.max > 1) { differ++; over1 += r.over1; maxAll = Math.max(maxAll, r.max); }
  }
  let hitDiff = 0;
  for (let i = 0; i < hitA.length; i++) if (hitA[i] !== hitB[i]) hitDiff++;
  return { stages: stages.length, layers, unstable, differ, max: maxAll, over1, hitPoints: hitA.length, hitDiff,
           warnsOld: warnsA, warnsNew: warns.length - warnsA };
}
