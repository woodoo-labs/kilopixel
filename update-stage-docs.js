const fs = require('fs');

// Update AGENTS.md
let agents = fs.readFileSync('.agents/AGENTS.md', 'utf8');
agents = agents.replace(
  '- Stage Properties: `<pxl-stage id="main">` ➔ `ref.main.mouseX`',
  '- Stage Properties: `<pxl-stage id="main">` ➔ `ref.main.mouseX`\n    - Built-in properties: `mouseX`, `mouseY`, `isHovered`, `width` (always 1000), `height` (dynamic based on ratio), `fps`, `renderAvg`, `renderMax`.'
);
fs.writeFileSync('.agents/AGENTS.md', agents);

// Update framework.md
let framework = fs.readFileSync('.agents/framework.md', 'utf8');
const stageSection = `### \`<pxl-stage>\` — The Root Container

| Attribute | Default | Description |
|-----------|---------|-------------|
| \`ratio\` | \`16/9\` | Sets CSS \`aspect-ratio\` |

**Built-in \`ref\` Properties:**
When a stage has an \`id\` (e.g. \`id="main"\`), it natively publishes the following properties to \`ref.main\`:
- **Interaction**: \`mouseX\`, \`mouseY\`, \`isHovered\`
- **Dimensions**: \`width\` (always 1000), \`height\` (dynamic)
- **Telemetry**: \`fps\`, \`renderAvg\`, \`renderMax\`

- Creates a \`<canvas>\` in Shadow DOM`;

framework = framework.replace(
  '### `<pxl-stage>` — The Root Container\n\n| Attribute | Default | Description |\n|-----------|---------|-------------|\n| `ratio` | `16/9` | Sets CSS `aspect-ratio` |\n\n- Creates a `<canvas>` in Shadow DOM',
  stageSection
);
fs.writeFileSync('.agents/framework.md', framework);
