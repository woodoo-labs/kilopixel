// Writes zero_width_while_parsing.html (2.6 MB) to scratch/: a stage in a centered flex item, followed by 200,000
// empty spans that keep the parser busy, and only then the paragraph that gives the item its width. The page logs
// every width the stage reports with the parser state (window.sizes): the stage is 0 px wide while the page is parsed.
// The page itself isn't committed because of its size; this script writes the same bytes.
// Usage, from the repo root: node design/prototypes/2026-11-04_stage_sizing/make_zero_width_while_parsing.js
// then open http://localhost:8124/scratch/zero_width_while_parsing.html
const fs = require('fs');
const path = require('path');

const SPANS = 200000;

const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zero width while parsing</title>
  <script src="/dist/pxl.js"></script>
  <style> body { margin: 16px; font-family: sans-serif; } .center { display: flex; justify-content: center; } </style>
</head>
<body>
  <div class="center"><div class="wrapper">
    <pxl-stage id="st" ratio="4 / 1"><pxl-layer><pxl-rect x="500" y="125" width="1000" height="250" fill="#fed7aa"></pxl-rect></pxl-layer></pxl-stage>
    <script>
      // Log every size the stage reports, with the parser state
      window.sizes = [];
      new ResizeObserver(e => sizes.push(Math.round(e[0].contentRect.width) + ' (' + document.readyState + ', rects ' + st.getClientRects().length + ')')).observe(st);
    </script>
    ${'<span></span>'.repeat(SPANS)}
    <p>This paragraph comes late in the wrapper and gives it its width: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna.</p>
  </div></div>
</body>
</html>`;

const out = path.join(__dirname, '../../../scratch/zero_width_while_parsing.html');
fs.writeFileSync(out, page);
console.log(`Written: ${out}`);
