// kilopixel.d.ts without a framework (also what Angular uses): must compile, and every @ts-expect-error must find an error

const circle = document.querySelector('pxl-circle')!;
const radius: number = circle.r; // read first: after an assignment TypeScript narrows to the assigned type
circle.r = 50;
circle.r = 'sin(t) * 10 + 50'; // an expression
circle.r = null; // the default
circle.linecap = 'round';
circle.fill = '#f97316';
circle.linedash = [20, 10];
circle.arrowend = 'auto';
circle.addEventListener('click', (event) => console.log(event.clientX));

const polyline = document.createElement('pxl-polyline');
polyline.points = [[0, 0], [100, 50]];
polyline.points = [0, 0, 100, 50];
polyline.points = '0,0; 100,50';
const coordinates: number[] = polyline.points;

const text = document.createElement('pxl-text');
text.text = 'Q1 - 2024';
text.text = 42;
text.align = 'center';

const stage = document.querySelector('pxl-stage')!;
stage.ratio = 2;
stage.alwaysrender = true;
const ratio: number = stage.ratio;
const mouseX: unknown = stage.attributeValues.mouseX;

const variable = document.createElement('pxl-var');
variable.value = [1, 2, 3];

const values = pxl.nodes.circle;
console.log(radius, coordinates, ratio, mouseX, values?.x);

// @ts-expect-error a radius takes no object
circle.r = { radius: 5 };
// @ts-expect-error no such property
circle.radius = 5;
// @ts-expect-error reading r returns a number
const wrongType: string = circle.r;
// @ts-expect-error points take no single number
polyline.points = 5;
// @ts-expect-error a stage has no r
stage.r = 5;
console.log(wrongType);
