// A custom shape's declaration as docs/custom-shapes.html shows it, on top of kilopixel.d.ts: must compile, and each
// expected error below must be found
export {};

declare global {
  interface PxlStarAttributes extends PxlShapeAttributes {
    points?: PxlNumber | null;
    r?: PxlNumber | null;
    ir?: PxlNumber | null;
  }
  interface PxlStarElement extends PxlShapeElement {
    get points(): number; set points(value: PxlNumber | null | undefined);
    get r(): number; set r(value: PxlNumber | null | undefined);
    get ir(): number; set ir(value: PxlNumber | null | undefined);
  }
  interface HTMLElementTagNameMap { 'pxl-star': PxlStarElement }
}

const star = document.querySelector('pxl-star')!;
const points: number = star.points; // read first: after an assignment TypeScript narrows to the assigned type
star.points = 6;
star.ir = 'ref.depth.value'; // an expression
star.r = null; // the default
star.fill = "radial([1], ['gold', 'orange'])"; // every shape attribute comes from PxlShapeElement
star.rotate = 't * 30';
star.addEventListener('click', (event) => console.log(event.clientX, star.values.points));

const props: PxlStarAttributes = { points: 5, ir: 20, strokewidth: 4, 'pxl-on-click': 'ref.count.value += 1' };
console.log(points, props);

// @ts-expect-error points take no object
star.points = { count: 5 };
// @ts-expect-error no such property
star.corners = 5;
// @ts-expect-error reading points returns a number
const wrongType: string = star.points;
console.log(wrongType);
