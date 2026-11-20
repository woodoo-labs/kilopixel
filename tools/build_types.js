// Generates Kilopixel's TypeScript definitions from the built engine (design/done/2026-10-30_framework_compatibility_plan.md
// §27): a core file with the element types and one file per framework that declares the tags for its templates or JSX.
// Called by build.js (written to dist/types/ and docs/download/types/) and by tools/check_build.js (up to date).
// The engine runs in a Node vm with a stubbed DOM, so the build needs no browser: every element's observedAttributes
// and static defaults are read from the bundle itself, and a new attribute is typed without anyone remembering it.
const vm = require('vm');

// =========================================================================
// Reading the elements from the bundle
// =========================================================================

// A callable, constructible object whose every property is itself: stands in for document, contexts and observers
const anything = new Proxy(function() {}, {
  get: (target, key) => (key === Symbol.toPrimitive ? () => '' : key in target ? target[key] : anything),
  apply: () => anything,
  construct: () => anything
});

// [{ tag, attributes, defaults }] in definition order, and the pxl namespace (for keyword lists such as anchors)
function readElements(bundleSource) {
  const registry = new Map();
  const context = {
    console, HTMLElement: class {}, ShadowRoot: class {}, PointerEvent: class {}, MouseEvent: class {},
    customElements: { define: (tag, cls) => registry.set(tag, cls), get: (tag) => registry.get(tag) },
    document: anything, getComputedStyle: () => anything, requestAnimationFrame: () => 0,
    performance: { now: () => 0 }, setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {},
    ResizeObserver: anything, IntersectionObserver: anything, MutationObserver: anything, MessageChannel: anything,
    CSS: anything, navigator: anything, location: anything
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(bundleSource, context, { filename: 'dist/pxl.js' });
  const elements = [...registry].map(([tag, cls]) => ({ tag, attributes: cls.observedAttributes, defaults: cls.defaults || {} }));
  return { elements, pxl: context.pxl };
}

// =========================================================================
// Types per attribute
// =========================================================================
// set: what a property, a JSX prop or a template binding accepts (null / undefined: the default, as a removed
// attribute); get: what reading the property returns (the evaluated value). Every value may also be an expression
// string, typed PxlExpression (string & {}): next to string keywords it keeps the keywords as editor suggestions.

const keywords = (words) => ({
  set: `${words.map((w) => `'${w}'`).join(' | ')} | PxlExpression`,
  get: words.map((w) => `'${w}'`).join(' | ')
});

const KINDS = {
  number: { set: 'PxlNumber', get: 'number' },
  nullableNumber: { set: 'PxlNumber', get: 'number | null' }, // null means "not set" (rect r1–r4 fall back to r, …)
  boolean: { set: 'PxlBoolean', get: 'boolean' },
  string: { set: 'string', get: 'string' }
};

// What a default can't tell. An attribute whose default is null and that isn't listed here fails the build.
function specialTypes(pxl) {
  return {
    fill: { set: 'PxlColor', get: 'string | PxlGradient | null' },
    stroke: { set: 'PxlColor', get: 'string | PxlGradient | null' },
    shadowcolor: { set: 'PxlColor', get: 'string | PxlGradient | null' },
    linecap: keywords(['butt', 'round', 'square']),
    linejoin: keywords(['miter', 'round', 'bevel']),
    linedash: { set: 'number | readonly number[] | PxlExpression', get: 'number | number[] | string | null' },
    blend: { set: 'GlobalCompositeOperation | PxlExpression', get: 'GlobalCompositeOperation' },
    mask: { set: "'none' | GlobalCompositeOperation | PxlExpression", get: "'none' | GlobalCompositeOperation" },
    filter: { set: 'string | readonly string[]', get: 'string | string[]' },
    arrowstart: { set: "number | 'auto' | PxlExpression", get: "number | 'auto'" },
    arrowend: { set: "number | 'auto' | PxlExpression", get: "number | 'auto'" },
    arrowstyle: keywords(['filled', 'line']),
    anchor: keywords(Object.keys(pxl.anchorX)),
    mode: keywords(['absolute', 'relative']),
    points: {
      set: 'string | readonly (number | string)[] | readonly (readonly [number | string, number | string])[]',
      get: 'number[]'
    },
    text: { set: 'string | number', get: 'string | number' }, // a string property is shown as written (§24, P4)
    align: keywords(['start', 'end', 'left', 'right', 'center']),
    baseline: keywords(['alphabetic', 'top', 'middle', 'bottom', 'hanging', 'ideographic']),
    weight: { set: "'normal' | 'bold' | 'lighter' | 'bolder' | number | PxlExpression", get: 'string | number' },
    fontstyle: keywords(['normal', 'italic', 'oblique']),
    direction: { set: "'ltr' | 'rtl' | 'inherit' | PxlExpression", get: "'ltr' | 'rtl' | 'inherit' | null" },
    value: { set: 'unknown', get: 'unknown' }, // <pxl-var>: any value, also arrays and objects
    ratio: { set: 'number | string | false', get: 'number' }, // <pxl-stage>: writes the attribute
    alwaysrender: { set: 'boolean | string', get: 'boolean' },
    // Numbers whose default null means "not set"
    r: KINDS.nullableNumber, r1: KINDS.nullableNumber, r2: KINDS.nullableNumber, r3: KINDS.nullableNumber,
    r4: KINDS.nullableNumber, end: KINDS.nullableNumber, sweep: KINDS.nullableNumber, reveal: KINDS.nullableNumber
  };
}

// Attributes that get no property and no prop of Kilopixel's own: native (id, hidden) or handled by the framework
const NATIVE = new Set(['id', 'hidden']);

function typeOf(name, defaults, special, tag) {
  // A number that some elements leave unset (rect r: null) is nullable only where the default is null (circle r: 0)
  if (special[name] === KINDS.nullableNumber && defaults[name] !== null) return KINDS.number;
  if (special[name]) return special[name];
  const value = defaults[name];
  if (typeof value === 'number') return KINDS.number;
  if (typeof value === 'boolean') return KINDS.boolean;
  if (typeof value === 'string') return KINDS.string;
  throw new Error(`<${tag}> ${name}: no type (default ${JSON.stringify(value)}); add it to specialTypes() in tools/build_types.js`);
}

// 'pxl-circle' → 'PxlCircle'
const typeName = (tag) => tag.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');

// =========================================================================
// The files
// =========================================================================

const HEADER = (version, what) => `// Kilopixel ${version}: TypeScript definitions${what}.
// Generated by tools/build_types.js from the engine; don't edit (https://github.com/woodoo-labs/kilopixel).
`;

function coreFile(elements, special, version) {
  const out = [HEADER(version, ''), `// Use with any framework, also without one. For templates and JSX, add the file for the framework too
// (kilopixel-react.d.ts, kilopixel-preact.d.ts, kilopixel-solid.d.ts, kilopixel-vue.d.ts, kilopixel-svelte.d.ts).
// Angular: this file, and CUSTOM_ELEMENTS_SCHEMA in the components that use the elements.
export {};

declare global {
  /** An expression string, compiled by Kilopixel: 'sin(t) * 100', 'ref.slider.value * 2', '#3b82f6' */
  type PxlExpression = string & {};
  type PxlNumber = number | PxlExpression;
  type PxlBoolean = boolean | PxlExpression;
  /** A gradient made by linear(), radial() or conic() in an expression */
  interface PxlGradient { readonly isGradient: true; readonly type: 'linear' | 'radial' | 'conic' }
  /** A CSS color, an expression, or a gradient */
  type PxlColor = string | PxlGradient;

  /** Values an element publishes as ref.<id>.<name>; for a stage also mouseX, mouseY, width, height, fps */
  interface PxlElement extends HTMLElement {
    readonly attributeValues: { readonly [name: string]: unknown };
  }
`];
  for (const { tag, attributes, defaults } of elements) {
    const name = typeName(tag);
    const own = attributes.filter((a) => !NATIVE.has(a));
    out.push(`  /** Props of <${tag}> in JSX and templates (null or undefined: the default) */`);
    out.push(`  interface ${name}Attributes {`);
    for (const attribute of own) {
      const key = attribute.includes('-') ? `'${attribute}'` : attribute;
      const type = attribute.startsWith('pxl-on-') ? 'string' : `${typeOf(attribute, defaults, special, tag).set} | null`;
      out.push(`    ${key}?: ${type};`);
    }
    out.push('  }');
    out.push(`  /** <${tag}>: every attribute is also a property; reading returns the evaluated value */`);
    out.push(`  interface ${name}Element extends PxlElement {`);
    for (const attribute of own.filter((a) => !a.includes('-'))) {
      const type = typeOf(attribute, defaults, special, tag);
      out.push(`    get ${attribute}(): ${type.get};`);
      out.push(`    set ${attribute}(value: ${type.set} | null | undefined);`);
    }
    out.push('  }');
  }
  out.push('');
  out.push('  interface HTMLElementTagNameMap {');
  for (const { tag } of elements) out.push(`    '${tag}': ${typeName(tag)}Element;`);
  out.push('  }');
  out.push('');
  out.push('  /** The engine\'s namespace: pxl.nodes[id] holds the values of the element with that id (ref.<id> in expressions) */');
  out.push('  const pxl: { readonly nodes: { readonly [id: string]: { readonly [name: string]: unknown } | undefined }; readonly [key: string]: unknown };');
  out.push('}');
  return out.join('\n') + '\n';
}

// One file per framework: where it declares tags, and the type of its own HTML props for an element E
const FRAMEWORKS = {
  react: {
    title: ' for React 19 JSX',
    imports: "import type { DetailedHTMLProps, HTMLAttributes } from 'react';",
    open: "declare module 'react' {\n  namespace JSX {\n    interface IntrinsicElements {",
    close: '    }\n  }\n}',
    entry: (tag, name) => `      '${tag}': Omit<DetailedHTMLProps<HTMLAttributes<${name}Element>, ${name}Element>, keyof ${name}Attributes> & ${name}Attributes;`
  },
  preact: {
    // Preact 11 exports HTMLAttributes from 'preact' (Preact 10: JSX.HTMLAttributes)
    title: ' for Preact 11 JSX',
    imports: "import type { HTMLAttributes } from 'preact';",
    open: "declare module 'preact' {\n  namespace JSX {\n    interface IntrinsicElements {",
    close: '    }\n  }\n}',
    entry: (tag, name) => `      '${tag}': Omit<HTMLAttributes<${name}Element>, keyof ${name}Attributes> & ${name}Attributes;`
  },
  solid: {
    // Solid 2 keeps its JSX types in @solidjs/web (Solid 1: in solid-js)
    title: ' for Solid 2 JSX (@solidjs/web)',
    imports: "import type { JSX } from '@solidjs/web';",
    open: "declare module '@solidjs/web/jsx-runtime' {\n  namespace JSX {\n    interface IntrinsicElements {",
    close: '    }\n  }\n}',
    entry: (tag, name) => `      '${tag}': Omit<JSX.HTMLAttributes<${name}Element>, keyof ${name}Attributes> & ${name}Attributes;`
  },
  vue: {
    title: ' for Vue 3 templates (Volar, vue-tsc)',
    imports: "import type { DefineComponent } from 'vue';",
    open: "declare module 'vue' {\n  interface GlobalComponents {",
    close: '  }\n}',
    entry: (tag, name) => `    '${tag}': DefineComponent<${name}Attributes>;`
  },
  svelte: {
    title: ' for Svelte 5 (svelte-check)',
    imports: "import type { HTMLAttributes } from 'svelte/elements';",
    open: "declare module 'svelte/elements' {\n  interface SvelteHTMLElements {",
    close: '  }\n}',
    entry: (tag, name) => `    '${tag}': Omit<HTMLAttributes<${name}Element>, keyof ${name}Attributes> & ${name}Attributes;`
  }
};

function frameworkFile(framework, elements, version) {
  const f = FRAMEWORKS[framework];
  return [
    HEADER(version, f.title).trimEnd(),
    '// Needs kilopixel.d.ts next to it.',
    '/// <reference path="./kilopixel.d.ts" />',
    f.imports,
    '',
    f.open,
    ...elements.map(({ tag }) => f.entry(tag, typeName(tag))),
    f.close,
    ''
  ].join('\n');
}

// { 'kilopixel.d.ts': text, 'kilopixel-react.d.ts': text, … }
function buildTypes(bundleSource, version) {
  const { elements, pxl } = readElements(bundleSource);
  const special = specialTypes(pxl);
  const files = { 'kilopixel.d.ts': coreFile(elements, special, version) };
  for (const framework of Object.keys(FRAMEWORKS)) files[`kilopixel-${framework}.d.ts`] = frameworkFile(framework, elements, version);
  return files;
}

module.exports = { buildTypes };
