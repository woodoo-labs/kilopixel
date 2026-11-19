<!-- kilopixel-svelte.d.ts: svelte-check has no expect-error comments in markup, so each element below must give exactly
     one error (tests/types/check.js counts them). lang="ts": without it the markup isn't type-checked -->
<script lang="ts"></script>

<pxl-circle r={{ radius: 5 }}></pxl-circle>
<pxl-polyline points={5}></pxl-polyline>
