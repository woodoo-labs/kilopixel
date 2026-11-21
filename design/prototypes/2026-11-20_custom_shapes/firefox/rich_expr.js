(async () => {
  await document.fonts.ready; await new Promise(r => setTimeout(r, 600));
  const stage = document.getElementById('main'), u = stage.unit, rect = stage.getBoundingClientRect();
  const name = (s) => s ? (s.id || s.localName) : 'none';
  const probe = { starCenter: [300, 290], starTip: [300, 95], betweenStarPoints: [440, 160], gaugeCenterHalfDisc: [780, 450],
                  belowGauge: [780, 560], secondStar: [820, 150], empty: [960, 580] };
  const hits = Object.fromEntries(Object.entries(probe).map(([k, [x, y]]) => [k, name(stage.interaction.findShapeAt(x, y))]));
  const toClient = ([x, y]) => [rect.left + x * u, rect.top + y * u];
  return { unit: +u.toFixed(3), dpr: devicePixelRatio, hits, clickAt: [toClient([300, 290]), toClient([300, 290]), toClient([300, 290])] };
})()
