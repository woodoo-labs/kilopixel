// Receives the results that device.html (next to this file) sends from a phone or tablet, and stores them in
// scratch/safari-device/ (one JSON file per page). Used for the Safari check of design/2026-11-20_custom_shapes_plan.md §5.3.
//
//   node design/prototypes/2026-11-20_custom_shapes/safari/receiver.js   (port 8126)
//
// With the dev server running (node tools/serve.js, port 8124), open http://<laptop IP>:8124/design/prototypes/
// 2026-11-20_custom_shapes/safari/device.html on the device (same Wi-Fi). Windows must let Node through its firewall.
const fs = require('fs');
const http = require('http');
const path = require('path');

const DIR = path.join(__dirname, '../../../../scratch/safari-device');
fs.mkdirSync(DIR, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/result') {
    const name = (url.searchParams.get('name') || 'result').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      fs.writeFileSync(path.join(DIR, name + '.json'), body);
      console.log(`${new Date().toLocaleTimeString()} received ${name} (${body.length} bytes)`);
      res.writeHead(204);
      res.end();
    });
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(8126, () => console.log('Receiving on port 8126, storing in ' + DIR));
