// Minimal static file server for local development (no dependencies).
// Usage: node tools/serve.js  → serves the repo root on http://localhost:8124 (/ redirects to /docs/)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8124;
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.zip': 'application/zip'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  // Redirect (not rewrite) so relative links in the docs resolve against /docs/
  if (urlPath === '/') { res.writeHead(302, { Location: '/docs/' }); res.end(); return; }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Serving ${root} on http://localhost:${PORT}`));
