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

## Critical Rules & Common Pitfalls
- **Coordinate System**: `x` and `y` define the **Center** of the element. All transforms (rotation, scaling, skewing) occur around this point. When `dx`/`dy` offsets are applied, the shape is visually displaced but `x`/`y` remains the transform origin. All spatial values are multiplied by the responsive unit `u` at draw time. Shapes are drawn relative to `(0, 0)` within the transformed context.
- **Logical Width = 1000**: The stage's logical width is always 1000. Use raw numbers for coordinates (`x="500"` for center) to hit the compiler's Fast Path. Never use `ref.main.width / 2` when `500` does the same with zero cost.
- **Time `t` is in Seconds**: `t * 90` = 90 degrees per second. `wave(2)` = a 2-second cycle. Never treat `t` as milliseconds.
- **Strings in Expressions**: Plain text attributes work without quotes (`text="Hello World"`). Quotes are only needed **inside JavaScript expressions**: `fill="t > 5 ? 'red' : 'blue'"`.
- **Cross-Referencing (`ref.*`)**: Use `ref.*` to reference any element by its `id`. Example: `ref.main.mouseX`, `ref.speed.value`, `ref.btn.isHovered`.
- **Static vs. Animated Filters**: Static filters work as-is without quotes or backticks (`filter="blur(5px)"`). Animated filters MUST use JS template literal backticks: `filter="\`blur(${wave(2)*10}px)\`"`. Do NOT use backticks for static filters.
- **Use `onenter` not `onhover`**: The hover-entry event is `onenter`.

# Kilopixel Documentation Style Guide
When creating or modifying interactive documentation examples, you MUST first read the full style guide located at `docs/EXAMPLE_STANDARDS.md`. You must strictly follow all color semantics, stacking orders, and UI architecture rules defined in that file.
