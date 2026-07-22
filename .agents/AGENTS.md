# AI Assistant Coding Rules

## Approvals
- **CRITICAL: STRICT APPROVAL REQUIRED**: NEVER use file modification tools (e.g., `multi_replace_file_content`, `replace_file_content`, or `write_to_file`) on source code files without FIRST describing the proposed changes and receiving explicit user approval.
- **OPERATIONAL SEQUENCE**: Before executing ANY code edit on a source file, you MUST stop and ask the user for confirmation. A full code preview is not required, but you must clearly explain what you are going to change.
- **EXPLORATION PHASE**: Assume you only have READ access during the exploration/planning phase. Do not attempt to write code until the user explicitly approves your proposed changes.

## Ignored Files and Directories
- **Ignore `00 Backup`**: Completely ignore the `00 Backup` folder. Do not read, write, search, or index files inside this directory.
- **Ignore files starting with underscore**: Completely ignore all files starting with an underscore (e.g., `_*`). Do not read, write, search, or index these files.

## Dependency Management
- **No Local node_modules**: Do NOT install packages or create a `node_modules` directory in the project folder. If a node package is required for debugging or development (e.g. `jsdom`, `terser`), it MUST be installed globally (`npm install -g <package>`) or run dynamically via `npx`.

## Post-Edit Actions
- **Run Build Script**: Always run `node build.js` ONLY after modifying JavaScript files (e.g., inside the `js/` directory). Do not run the build script if only `.html`, `.md`, or non-source files were changed.

## Project Context
- **Framework Overview**: This project is a custom "Declarative Canvas Framework" (`pixel`) that allows building HTML5 Canvas graphics using custom HTML elements like `<pxl-stage>`, `<pxl-layer>`, `<pxl-group>`, and shape elements (`<pxl-circle>`, `<pxl-rect>`, `<pxl-grid>`, etc.).
- **Deep Documentation**: For complete, in-depth technical documentation about the engine's architecture, scope, syntax, and capabilities, you MUST consult `.agents/framework.md`.
- **Dynamic Attributes**: Element attributes support inline JavaScript expressions and built-in animation functions (e.g., `wave()`, `glide()`, `t` for time). These are evaluated at runtime to animate properties.
- **Coordinate System (CRITICAL)**: 
  - `x` and `y` define the absolute position and act as the **Pivot Point / Center** of the element. Transformations like `rotate` and `scale` occur around this `x/y` origin.
  - `dx` and `dy` define a local **Offset** applied *after* rotation and scaling. This allows an element to be offset from its pivot point (e.g., to create an orbit effect) without changing the center of rotation.
  - This coordinate pipeline applies universally to layers, groups, and shapes. Shapes are intrinsically drawn relative to `(0, 0)` within this transformed context.
  - **Responsive Unit `u`**: All spatial and sizing values (like x, y, dx, radius, width, stroke width, etc.) are multiplied by a dynamic scaling unit `u` right before being passed to the canvas context. This unit allows the graphics to be fully responsive to the stage dimensions, based on a fixed **logical Stage width of 1000** (i.e., x=500 is always the horizontal center, and `u` scales this 0-1000 coordinate space to fit the actual pixel dimensions of the canvas).
  - **Use Raw Numbers over `s.width`**: Because the logical width is strictly fixed at 1000, ALWAYS use raw numbers for horizontal coordinates (e.g., `x="500"` for center, `x="100"` for left margins) instead of expressions like `s.width / 2`. Using raw numbers instantly hits the framework's "Fast Path" compiler, bypassing expensive math evaluations and proxy subscriptions.

## Advanced Syntax & Engine Rules
- **Expressions & Smart Returns**: Any attribute can evaluate math and logic natively at 60fps.
  - Simple expressions: `t > 1000 ? 'red' : 'blue'` (auto-wrapped in `return`).
  - Full Blocks: If the string contains `return`, you can write full JS blocks: `if (t < 1000) { return 'red'; } else { return 'blue'; }`
  - *Note*: Strings inside JS expressions must be quoted: `text="'Hello'"`.
- **Math Globals**: All standard `Math` constants and methods (e.g., `sqrt`, `sin`, `cos`, `PI`, `abs`) are natively injected into the evaluation scope. You can use them directly without the `Math.` prefix (e.g., `r="sqrt(dx**2 + dy**2)"`).
- **Animation Time (`t`)**:
  - The variable `t` is ALWAYS evaluated in **Seconds**, not milliseconds. For example, `t * 100` means a rate of 100 per second.
  - Built-in time drivers (`wave(freq)`, `glide(freq)`, etc.) already handle this internally, so `wave(2)` correctly means a 2-second cycle.
- **Colors & Gradients**:
  - `hsl`, `hsla`, `rgb`, `rgba`, `linear`, and `radial` are **global JavaScript functions** injected into the evaluation scope. Because they contain parentheses, they automatically bypass the static string "Fast Path" and are safely evaluated dynamically at 60fps. They NEVER need backticks.
  - `linear(angle, ['color1', 'color2'])`
    - Linear angles use true CSS geometry. An angle (e.g., `45`) will push gradient endpoints outside the bounding box if necessary to maintain the physical line angle, which can make colors look "zoomed in" during rotation.
  - `linear([x1, y1, x2, y2], ['color1', 'color2'])`
    - Explicit coordinates are **proportional** to the shape's bounding box. `0` is the top/left edge and `1` is the bottom/right edge. For example, `[0, 0, 1, 1]` is exactly Top-Left to Bottom-Right.
  - `radial(radius, ['color1', 'color2'])`: `radius` is relative to bounds. Use `1` to stretch to the edge, not `0.5`.
  - `radial([cx, cy, r], ['color1', 'color2'])`: Explicit center coordinates and radius overrides.
  - Color arrays can be simple `['red', 'blue']` or offset-mapped `[0, 'red', 1, 'blue']`. Since evaluation happens at 60fps, returning a new array literal on every frame is completely fine.
- **Filters & Template Literals**:
  - The compiler uses a **Fast Path** to intercept static filters (`filter="drop-shadow(...)"`) and returns them as strings instantly. This makes static CSS functions inside filters perfectly safe and bug-free.
  - Because of the Fast Path, you cannot put raw math inside them. To animate a filter, you MUST wrap the entire attribute in JS backticks to force evaluation: `filter="\`drop-shadow(0 0 ${wave(2)*15}px red)\`"`
- **Element Referencing (`ref.`)**:
  - Elements with an `id` attribute are automatically registered in the zero-GC `pxl.nodes` registry.
  - Other elements can declaratively bind to their properties at 60fps using the `ref.` prefix.
  - Example: `<pxl-circle id="leader" x="s.mouseX" y="s.mouseY" />` can be tracked by another shape using `x="ref.leader.x"` and `y="ref.leader.y"`.
  - The reactivity engine tracks these dependencies automatically and only re-evaluates when the referenced element actually updates its state.
- **Coordinate Mapping (`toLocal`)**:
  - Natively map the global position/rotation of any element into the local coordinate space of the current evaluating element using `toLocal(target, property)`.
  - Supported properties: `'x'`, `'y'`, `'rotate'` (or `'r'`), `'scaleX'` (or `'sx'`), `'scaleY'` (or `'sy'`).
  - Example: `<pxl-circle x="toLocal(ref.player, 'x')" y="toLocal(ref.player, 'y')" />` instantly tracks a player's coordinates even if the circle is inside a rotated/scaled parent group.
- **Unified Reactive Variables (`ref.*`)**:
  - The framework uses a 100% explicit, zero-DOM-traversal, flat ID namespace. All "magic" context (`v.*`, `s.*`, `sys.*`) has been eliminated.
  - **The Golden Rule:** If you want to reference something in math, give it an HTML `id`.
  - User Variables: `<pxl-var id="speed" value="100">` ➔ `ref.speed.value`
  - Stage Properties: `<pxl-stage id="main">` ➔ `ref.main.mouseX`
    - Built-in properties: `mouseX`, `mouseY`, `isHovered`, `width` (always 1000), `height` (dynamic based on ratio), `fps`, `renderAvg`, `renderMax`.
  - Shape Properties: `<pxl-circle id="player">` ➔ `ref.player.x`
    - Built-in states: `isHovered`, `isPressed`. Example: `scale="ref.btn.isPressed ? 0.9 : (ref.btn.isHovered ? 1.1 : 1)"`
  - Layer Properties: `<pxl-layer id="bg">` ➔ `ref.bg.x` (Note: Layers expose spatial properties but do not currently expose interaction states like `isHovered`).
- **Polyline Points Syntax**:
  - The `points` attribute for `<pxl-polyline>` uses a strict delimiter syntax: Points are separated by semicolons (`;`), and X/Y coordinates are separated by commas (`,`).
  - Each coordinate can be an independent math expression! Example: `points="0,0; 100,wave(2)*50; 200,0"`

## Dual-Architecture for Interactions
The framework uses a strict dual-architecture for handling mouse/touch input. The engine handles all inputs seamlessly for both Mouse and Touch screens natively via standard pointer events.

1. **Declarative States (Used for Styling)**
   - Continuous boolean properties automatically updated by the framework.
   - Used directly in mathematical expressions (e.g., `fill="ref.btn.isHovered ? 'red' : 'blue'"`).
   - **`isHovered`**: True while the pointer is over the element.
   - **`isPressed`**: True while the pointer is held down on the element.
2. **Imperative Events (Used for Logic/Scripting)**
   - Instantaneous actions evaluated natively as JavaScript blocks.
   - Used to execute logic, mutate variables, or drive algorithms (e.g., `onclick="ref.val1.set('value', 100)"`).
   - Available events: `onenter`, `onleave`, `ondown`, `onup`, `onclick`, `onmove`.
   - *Note:* Do not use `onhover`, it was renamed to `onenter`.
# Kilopixel Documentation Style Guide
When creating or modifying interactive documentation examples, you MUST first read the full style guide located at `docs/EXAMPLE_STANDARDS.md`. You must strictly follow all color semantics, stacking orders, and UI architecture rules defined in that file.
