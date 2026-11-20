// Shared checks of the framework smoke pages (tests/smoke/README.md; design/done/2026-10-30_framework_compatibility_plan.md
// §12, §25). Load after tests/runner.js. Every framework page renders the same scene with its own syntax and registers
// each instance in window.smoke.instances; registerSceneChecks() registers the same tests for every framework, and the
// page calls runTests() once both instances are mounted (smokeHelpers.until()).
//
// The scene of one instance (ids start with the instance's prefix `id`):
//   a card element around the stage, whose click handler counts card clicks
//   <pxl-stage id="{id}stage" ratio=2 alwaysrender=true>, one layer with:
//     {id}sun     circle x=300 y=250 r={r} fill=`hsl({hue}, 70%, 55%)`, click: sunClicks + 1, lastTarget = event.target.id
//     {id}moon    circle x="300 + cos(t * 1.5) * 140" y="250 + sin(t * 1.5) * 140" (expression strings), r=16; mounted while showMoon
//     {id}stop    circle x=560 y=250 r=40, click: stopPropagation(), stopClicks + 1
//     {id}button  group x=820 y=250, style cursor: pointer, click: buttonClicks + 1, pointerenter / pointerleave: hovered
//                 with a rect w=200 h=80 r=12 fill = hovered ? '#2563eb' : '#3b82f6' and
//                 {id}label text={label} (data bound as a property)
//     {id}dash    line x1=80 y1=470 x2=920 y2=470 linedash={dash}
//     {id}chart   polyline points={data} (pairs), stroke, fill none
//   an element with data-state="{JSON}" of { sunClicks, lastTarget, stopClicks, buttonClicks, buttonHovered, cardClicks }
// Initial state: r 60, hue 200, label 'alert(1)', dash [20, 10],
// data [[100, 400], [300, 250], [500, 330], [700, 180], [900, 280]], showMoon true.
//
// window.smoke = { framework: 'React 19.1.0', instances: { A: { id, set: { r, hue, label, dash, data, showMoon }, stateElement }, B: … } }
// The set functions change the framework's state (each takes the new value).

window.smokeHelpers = (() => {
  // Waits until the framework has rendered a state change: a few MessageChannel tasks. React schedules its renders
  // the same way, Vue in microtasks; setTimeout would be throttled to about once per second in a hidden tab.
  const channel = new MessageChannel();
  const tick = () => new Promise((resolve) => { channel.port1.onmessage = resolve; channel.port2.postMessage(0); });
  const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

  // Waits until test() is true, for at most `ms` (frameworks and Tailwind's compiler load from a CDN)
  async function until(test, ms = 15000) {
    const start = performance.now();
    while (!test() && performance.now() - start < ms) await new Promise((resolve) => setTimeout(resolve, 20));
    return test();
  }

  // The browser's events go to the layer canvas; frames run by hand, so the checks also work in a hidden tab
  function pointerAt(stage, type, x, y) {
    const rect = stage.getBoundingClientRect();
    const EventClass = type.startsWith('mouse') ? MouseEvent : PointerEvent;
    stage.querySelector('pxl-layer')._canvas.dispatchEvent(new EventClass(type, {
      bubbles: true, composed: true, cancelable: true, isPrimary: true, pointerType: 'mouse',
      clientX: rect.left + x * stage.unit, clientY: rect.top + y * stage.unit
    }));
  }
  function hover(stage, x, y) {
    if (!stage.attributeValues.isHovered) stage.dispatchEvent(new PointerEvent('pointerenter'));
    pointerAt(stage, 'pointermove', x, y);
    stage.render(performance.now() / 1000);
  }
  function clickAt(stage, x, y) {
    hover(stage, x, y);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) pointerAt(stage, type, x, y);
    stage.render(performance.now() / 1000);
  }
  const cacheSize = () => pxl.animationCache.size + pxl.staticCache.size;

  // A failed expectation throws, which tests/runner.js reports with the detail
  const expect = (ok, detail) => { if (!ok) throw new Error(String(detail)); };

  return { settle, until, pointerAt, hover, clickAt, cacheSize, expect };
})();

window.registerSceneChecks = function() {
  const { settle, hover, clickAt, cacheSize, expect } = window.smokeHelpers;
  const el = (id) => document.getElementById(id);
  const a = () => window.smoke.instances.A;
  const stage = () => el(`${a().id}stage`), sun = () => el(`${a().id}sun`), label = () => el(`${a().id}label`);
  const state = () => JSON.parse(a().stateElement().dataset.state);
  const show = () => JSON.stringify(state());

  section(`Properties in ${window.smoke.framework}'s syntax (W3)`);

  test('two instances, unique ids, both registered', async () => {
    stage().resize(); // in a hidden tab the ResizeObserver doesn't report, so the stage is sized here
    await settle();
    const b = window.smoke.instances.B;
    expect(a().id !== b.id && pxl.nodes[`${a().id}sun`] && pxl.nodes[`${b.id}sun`], `${a().id} / ${b.id}`);
  });
  test('r is a number property, no attribute written', () =>
    expect(sun().attributeValues.r === 60 && !sun().hasAttribute('r'), `r ${sun().attributeValues.r}, attribute ${sun().getAttribute('r')}`));
  test('ratio 2 and alwaysrender true on the stage', () =>
    expect(stage().ratio === 2 && stage().alwaysrender === true, `ratio ${stage().ratio}, alwaysrender ${stage().alwaysrender}`));
  test('linedash [20, 10] stays an array', () => {
    const dash = el(`${a().id}dash`).attributeValues.linedash;
    expect(Array.isArray(dash) && dash.join(',') === '20,10', JSON.stringify(dash));
  });
  test('text "alert(1)" is shown as text, not run', () =>
    expect(label().attributeValues.text === 'alert(1)', JSON.stringify(label().attributeValues.text)));
  test('expression strings animate (moon x, y)', () => expect(el(`${a().id}moon`)?.isAnimated === true, 'not animated'));
  test('points as pairs from state', () => {
    const points = el(`${a().id}chart`).points.join(',');
    expect(points === '100,400,300,250,500,330,700,180,900,280', points);
  });
  test('changing state updates the property (r 60 → 90)', async () => {
    a().set.r(90);
    await settle();
    expect(sun().attributeValues.r === 90, `r ${sun().attributeValues.r}`);
  });
  test('120 color changes through state compile nothing', async () => {
    const before = cacheSize();
    for (let h = 0; h < 120; h++) { a().set.hue(h * 3); await settle(); }
    expect(cacheSize() === before, `cache ${before} → ${cacheSize()}, fill ${sun().attributeValues.fill}`);
  });
  test('new points, dash and label from state', async () => {
    a().set.data([[100, 300], [500, 100], [900, 300]]);
    a().set.dash([5, 5]);
    a().set.label('Q1 - 2024');
    await settle();
    const points = el(`${a().id}chart`).points.join(','), dash = el(`${a().id}dash`).attributeValues.linedash;
    expect(points === '100,300,500,100,900,300' && dash.join(',') === '5,5' && label().attributeValues.text === 'Q1 - 2024',
      `points ${points}, dash ${dash}, label ${label().attributeValues.text}`);
  });

  section(`Events in ${window.smoke.framework}'s syntax (W1)`);

  test('a click handler on a shape runs once, target is the shape; the card gets one click', async () => {
    clickAt(stage(), 300, 250);
    await settle();
    const s = state();
    expect(s.sunClicks === 1 && s.lastTarget === `${a().id}sun` && s.cardClicks === 1, show());
  });
  test('stopPropagation() in a shape\'s click handler keeps the click from the card', async () => {
    clickAt(stage(), 560, 250);
    await settle();
    const s = state();
    expect(s.stopClicks === 1 && s.cardClicks === 1, show());
  });
  test('pointer enter on a group when the pointer comes from empty space', async () => {
    hover(stage(), 120, 60);
    await settle();
    hover(stage(), 740, 270); // the rect; the chart line drawn on top crosses (760, 230)
    await settle();
    expect(state().buttonHovered === true, show());
  });
  test('the group stays hovered over its label, and the cursor style on the group shows the hand', async () => {
    hover(stage(), 820, 250);
    await settle();
    const cursor = stage().querySelector('pxl-layer')._canvas.style.cursor;
    expect(state().buttonHovered === true && cursor === 'pointer', `${show()}, canvas cursor "${cursor}"`);
  });
  test('the rect\'s fill follows the hover state (a re-render)', () => {
    const fill = el(`${a().id}button`).querySelector('pxl-rect').attributeValues.fill;
    expect(fill === '#2563eb', fill);
  });
  test('a click handler on a group runs for a click on its rect', async () => {
    clickAt(stage(), 740, 270);
    await settle();
    expect(state().buttonClicks === 1, show());
  });
  test('pointer leave on the group (to empty space)', async () => {
    hover(stage(), 120, 60);
    await settle();
    expect(state().buttonHovered === false, show());
  });
  test('pointer enter and leave on the group when the pointer comes from another shape', async () => {
    hover(stage(), 560, 250);
    hover(stage(), 740, 270);
    await settle();
    const entered = state().buttonHovered;
    hover(stage(), 560, 250);
    await settle();
    expect(entered === true && state().buttonHovered === false, `entered ${entered}, ${show()}`);
  });
  test('a click on empty space reaches the card as the browser sent it', async () => {
    clickAt(stage(), 950, 30);
    await settle();
    expect(state().cardClicks === 3, show());
  });

  section('Mount and unmount');

  test('unmounting a shape removes it from the registry', async () => {
    a().set.showMoon(false);
    await settle();
    expect(!pxl.nodes[`${a().id}moon`] && !el(`${a().id}moon`), 'still registered');
  });
  test('mounting it again registers it, and it animates', async () => {
    a().set.showMoon(true);
    await settle();
    expect(!!pxl.nodes[`${a().id}moon`] && el(`${a().id}moon`).isAnimated === true, 'not registered or not animated');
  });
};

// For a framework page: registers the scene checks and runs them once both instances are mounted.
// A page that doesn't finish loading its framework (no internet) reports one failing test instead of nothing.
window.runSceneChecks = async function() {
  const ready = await window.smokeHelpers.until(() => window.smoke?.instances?.A && window.smoke?.instances?.B);
  if (ready) {
    window.registerSceneChecks();
  } else {
    test('the framework loaded and rendered both instances', () => {
      throw new Error('not rendered within 15 s (the framework comes from a CDN: no internet?)');
    });
  }
  await runTests({ settle: 0 });
};
