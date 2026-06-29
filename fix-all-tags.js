const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  let originalHtml = html;

  // Regex to find <pxl-... /> and replace with <pxl-...></pxl-...>
  // It handles any element starting with pxl-
  html = html.replace(/<pxl-([a-z0-9\-]+)([^>]*?)\/>/gi, '<pxl-$1$2></pxl-$1>');

  if (html !== originalHtml) {
    fs.writeFileSync(file, html);
    console.log(`Fixed self-closing tags in ${file}`);
  }
}
