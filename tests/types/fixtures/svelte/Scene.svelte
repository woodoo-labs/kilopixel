<!-- kilopixel-svelte.d.ts with Svelte 5 (svelte-check): must have no errors -->
<script lang="ts">
  let r = $state(50);
  let hover = $state(false);
  const data: [number, number][] = [[0, 0], [100, 50]];
</script>

<pxl-stage ratio={5 / 3} alwaysrender>
  <pxl-layer alpha={0.8} blend="multiply">
    <pxl-circle id="sun" x={300} y={250} {r} fill="#f97316" linecap="round" linedash={[20, 10]}
      style="cursor: pointer" onclick={(event) => (r = event.currentTarget.r + 10)}></pxl-circle>
    <pxl-group x={700} y={250} pxl-on-click="0" onpointerenter={() => (hover = true)} onpointerleave={() => (hover = false)}>
      <pxl-rect w={200} h={80} r={12} anchor="top-left" fill={hover ? '#2563eb' : '#3b82f6'}></pxl-rect>
      <pxl-text text={`Value: ${r}`} size={27} align="center" baseline="middle"></pxl-text>
    </pxl-group>
    <pxl-polyline points={data} stroke="#16a34a" strokewidth={4}></pxl-polyline>
    <pxl-circle x="500 + sin(t) * 100" y={300} r={10}></pxl-circle>
  </pxl-layer>
</pxl-stage>
