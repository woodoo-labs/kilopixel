(async () => {
  const res = await runPages();
  const sum = { pages: 0, errors: [], stages: 0, layers: 0, unstable: 0, differ: 0, maxDiff: 0, over1: 0, hitPoints: 0, hitDiff: 0, warnPages: [] };
  const perPage = [];
  for (const [p, r] of Object.entries(res)) {
    sum.pages++;
    if (typeof r === 'string') { sum.errors.push(p + ': ' + r); continue; }
    for (const k of ['stages', 'layers', 'unstable', 'differ', 'over1', 'hitPoints', 'hitDiff']) sum[k] += r[k];
    sum.maxDiff = Math.max(sum.maxDiff, r.max);
    if (r.warnsOld !== 0 || r.warnsNew !== 0) sum.warnPages.push(p + ' ' + r.warnsOld + '/' + r.warnsNew);
    if (r.hitDiff || r.over1 > 200) perPage.push(p.replace(/^\/(docs|examples)\//, '') + ' differ ' + r.differ + '/' + r.layers + ' px ' + r.over1 + ' hit ' + r.hitDiff + '/' + r.hitPoints);
  }
  return { sum, perPage };
})()
