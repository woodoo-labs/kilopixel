const fs = require('fs');
let content = fs.readFileSync('.agents/framework.md', 'utf8');

content = content.replace(
  '    J["&lt;pxl-var&gt; / Proxies"] -->|"v.xxx, s.xxx"| H\n    K["Monitor<br/>(monitor.js)"] -->|"s.fps, s.renderAvg"| J\n    L["Element Refs"] -->|"ref.id.xxx"| H',
  '    J["&lt;pxl-var&gt;"] -->|"ref.id.value"| H\n    K["Monitor<br/>(monitor.js)"] -->|"ref.stageId.fps"| H\n    L["Element Refs"] -->|"ref.id.xxx"| H'
);

content = content.replace(
  'pxl.vars.xxx = value  (Proxy set trap)\n  → equality check (bail if same value)\n  → for each subscriber element (backwards iteration for safe removal):\n      → element.variableChangedCallback(fullKey)\n        → pxl.evaluateAttributesForVariable(element, varName)',
  'pxl.broadcast(\'ref.id\')  (Explicit Pub-Sub)\n  → for each subscriber element (backwards iteration for safe removal):\n      → element.variableChangedCallback(fullKey)\n        → pxl.evaluateAttributesForVariable(element, varName)'
);

content = content.replace(
  '- **Proxy Reactivity**: Manages `pxl.vars` (user variables via `<pxl-var>`), `pxl.sys` (system variables like `s.mouseX`), and the zero-GC array-based subscriber lists.',
  '- **Reactivity**: Uses a unified `ref.*` pub-sub broadcasting system and zero-GC array-based subscriber lists. All proxy overhead (`pxl.vars`/`pxl.sys`) has been eliminated.'
);

content = content.replace(
  'Since these are published to `pxl.sys`, any element can reactively display them: `<pxl-text text="s.fps" />`.',
  'These are published directly to the `stage.attributeValues` and broadcast via `stage._refKey`. Any element can reactively display them: `<pxl-text text="ref.main.fps" />`.'
);

content = content.replace(
  '`s.mouseX/Y` math',
  '`ref.stage.mouseX/Y` math'
);

fs.writeFileSync('.agents/framework.md', content);
