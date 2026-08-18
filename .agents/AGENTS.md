# AI Assistant Coding Rules

## Approvals
- **CRITICAL: STRICT APPROVAL REQUIRED**: NEVER use file modification tools (e.g., `multi_replace_file_content`, `replace_file_content`, or `write_to_file`) on source code files without FIRST describing the proposed changes and receiving explicit user approval.
- **OPERATIONAL SEQUENCE**: Before executing ANY code edit on a source file, you MUST stop and ask the user for confirmation. A full code preview is not required, but you must clearly explain what you are going to change.
- **EXPLORATION PHASE**: Assume you only have READ access during the exploration/planning phase. Do not attempt to write code until the user explicitly approves your proposed changes.

## Ignored Files and Directories
- **Ignore `00 Backup`**: Completely ignore the `00 Backup` folder. Do not read, write, search, or index files inside this directory.
- **Ignore files starting with underscore**: Completely ignore all files starting with an underscore (e.g., `_*`). Do not read, write, search, or index these files.

## Temporary and Helper Files
- **Use Scratch Directory**: All temporary helper scripts (e.g., data generators, one-off Node/Python scripts), text dumps, and experimental code MUST be saved inside the `scratch/` directory. NEVER save temporary files in the root directory.
- **Do Not Auto-Delete**: Do NOT automatically delete files in the `scratch/` directory when you are finished. They may be needed for follow-up work later. Leave cleanup of the `scratch/` directory to the user.

## Dependency Management
- **No Local node_modules**: Do NOT install packages or create a `node_modules` directory in the project folder. If a node package is required for debugging or development (e.g. `jsdom`, `terser`), it MUST be installed globally (`npm install -g <package>`) or run dynamically via `npx`.

## Post-Edit Actions
- **Run Build Script**: Always run `node build.js` ONLY after modifying JavaScript files (e.g., inside the `js/` directory). Do not run the build script if only `.html`, `.md`, or non-source files were changed.

## Project Context
- **Framework Overview**: This project is a custom "Declarative Canvas Framework" (`pixel`) that allows building HTML5 Canvas graphics using custom HTML elements like `<pxl-stage>`, `<pxl-layer>`, `<pxl-group>`, and shape elements (`<pxl-circle>`, `<pxl-rect>`, `<pxl-grid>`, etc.).
- **Deep Documentation**: For complete, in-depth technical documentation about the engine's architecture, scope, syntax, and capabilities, you MUST consult `.agents/KILOPIXEL.md`.

## Documentation Structure
- **`.agents/AGENTS.md`** — Operational rules: approvals, build process, ignored files, terminal syntax.
- **`.agents/KILOPIXEL.md`** — Complete framework reference: architecture, API, element attributes, expression compiler, and code generation guide.
- **`.agents/TODO.md`** — Roadmap and open design questions.

# Kilopixel Documentation Style Guide
When creating or modifying interactive documentation examples, you MUST first read the full style guide located at `docs/DOCS_STANDARDS.md`. You must strictly follow all color semantics, stacking orders, and UI architecture rules defined in that file.

# Token Optimization & Artifacts
- **Walkthrough Artifacts (On Explicit Request Only)**: By default, do NOT create or update `walkthrough.md` artifacts after completing work, and do NOT ask the user if they want one. Simply summarize your work concisely in your chat response. Only create a `walkthrough.md` file if the user explicitly requests one in their prompt.

# Terminal Commands
- **Windows PowerShell Syntax**: The host system runs Windows PowerShell, which does not support the Unix `&&` operator by default. When chaining terminal commands, ALWAYS use the semicolon `;` instead of `&&` (e.g., `git status; git log`).
