(async () => {
  await runTextTests();
  const rows = window.textRows;
  const edge = (r) => { const c = r.canvas, W = c.width, H = c.height, d = r.data; let L = W, R = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 64) { if (x < L) L = x; if (x > R) R = x; } return [L, R]; };
  const drifts = rows.map((r) => { const a = edge(r.a), b = edge(r.b); return { right: b[1] - a[1], ink: r.inkPixels, share: r.over64 / Math.max(1, r.inkPixels) }; });
  const hist = {}; for (const d of drifts) hist[d.right] = (hist[d.right] || 0) + 1;
  const noDrift = drifts.filter((d) => Math.abs(d.right) <= 0);
  const pick = rows.findIndex((r) => r.font === 'system-ui' && r.weight === 400 && r.size === 24 && r.u === 0.778 && r.dpr === 2 && !r.stroke);
  showCase(pick, 3);
  return { rightEdgeDriftDevicePx: hist, casesWithoutDrift: noDrift.length,
           over64ShareWithoutDrift: +(100 * noDrift.reduce((s, d) => s + d.share, 0) / Math.max(1, noDrift.length)).toFixed(2) + ' %',
           shown: { ...rows[pick], a: undefined, b: undefined } };
})()
