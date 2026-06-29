const fs = require('fs');
let html = fs.readFileSync('test30.html', 'utf8');

// DEMO 1 Fixes
html = html.replace(
  '<pxl-circle id="player" hidden="true" x="ref.main.mouseX" y="ref.main.mouseY" ></pxl-circle>',
  '<pxl-var id="player_x" value="ref.main.mouseX"></pxl-var>\n        <pxl-var id="player_y" value="ref.main.mouseY"></pxl-var>'
);
html = html.replace(/ref\.player\.x/g, 'ref.player_x.value');
html = html.replace(/ref\.player\.y/g, 'ref.player_y.value');

// DEMO 2 Fixes
html = html.replace(
  '<pxl-layer hidden="true"><pxl-circle id="mouse" x="ref.main2.mouseX" y="ref.main2.mouseY" ></pxl-circle></pxl-layer>',
  '<pxl-layer>\n        <pxl-var id="mouse_x" value="ref.main2.mouseX"></pxl-var>\n        <pxl-var id="mouse_y" value="ref.main2.mouseY"></pxl-var>\n      </pxl-layer>'
);
html = html.replace(/ref\.mouse\.x/g, 'ref.mouse_x.value');
html = html.replace(/ref\.mouse\.y/g, 'ref.mouse_y.value');

// DEMO 3 Fixes
html = html.replace(
  '<!-- Invisible Logic Tracker (Tracks Mouse) -->\n        <pxl-circle id="sun" x="ref.main3.mouseX" y="ref.main3.mouseY" r="0" ></pxl-circle>',
  ''
);
html = html.replace(
  '<!-- Sky Background (Reacts to Sun) -->',
  '<!-- Logic Sun Position -->\n      <pxl-layer>\n        <pxl-var id="sun_x" value="ref.main3.mouseX"></pxl-var>\n        <pxl-var id="sun_y" value="ref.main3.mouseY"></pxl-var>\n      </pxl-layer>\n\n      <!-- Sky Background (Reacts to Sun) -->'
);
html = html.replace(/ref\.sun\.x/g, 'ref.sun_x.value');
html = html.replace(/ref\.sun\.y/g, 'ref.sun_y.value');

fs.writeFileSync('test30.html', html);
