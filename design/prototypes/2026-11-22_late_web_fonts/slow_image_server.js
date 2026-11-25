// Serves a 1×1 PNG after a delay, so a page's load event comes late: fonts4.html (next to this file) checks whether
// document.fonts.ready waits for it (design/done/2026-11-22_late_web_fonts_plan.md §2b).
//
//   node design/prototypes/2026-11-22_late_web_fonts/slow_image_server.js   (port 8125)
//
// GET /slow.png?ms=4000 answers after 4000 ms. Run it next to the dev server (node tools/serve.js, port 8124) and, for
// a phone or tablet, the receiver (design/prototypes/2026-11-20_custom_shapes/safari/receiver.js, port 8126). Windows
// must let Node through its firewall.
const http = require('http');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/slow.png') {
    res.writeHead(404);
    res.end();
    return;
  }
  const ms = Math.min(Number(url.searchParams.get('ms')) || 4000, 30000);
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(PNG);
  }, ms);
}).listen(8125, () => console.log('Slow image on port 8125: /slow.png?ms=4000'));
