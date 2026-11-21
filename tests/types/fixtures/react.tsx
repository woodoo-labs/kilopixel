// kilopixel-react.d.ts with React 19's JSX: must compile, and every @ts-expect-error must find an error
import { useState, type DetailedHTMLProps, type HTMLAttributes } from 'react';

// A custom shape for JSX, as docs/custom-shapes.html shows it: the line of a built-in shape in kilopixel-react.d.ts,
// renamed (PxlStarAttributes and PxlStarElement come from fixtures/custom.ts)
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'pxl-star': Omit<DetailedHTMLProps<HTMLAttributes<PxlStarElement>, PxlStarElement>, keyof PxlStarAttributes> & PxlStarAttributes;
    }
  }
}

export function Scene() {
  const [r, setR] = useState(50);
  const [hover, setHover] = useState(false);
  return (
    <pxl-stage ratio={5 / 3} alwaysrender>
      <pxl-layer alpha={0.8} blend="multiply">
        <pxl-circle id="sun" x={300} y={250} r={r} fill="#f97316" linecap="round" linedash={[20, 10]}
          onClick={(event) => setR(event.currentTarget.r + 10)} style={{ cursor: 'pointer' }}></pxl-circle>
        <pxl-group x={700} y={250} pxl-on-click="0" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
          <pxl-rect w={200} h={80} r={12} anchor="top-left" fill={hover ? '#2563eb' : '#3b82f6'}></pxl-rect>
          <pxl-text text={`Value: ${r}`} size={27} align="center" baseline="middle"></pxl-text>
        </pxl-group>
        <pxl-polyline points={[[0, 0], [100, 50]]} stroke="#16a34a" strokewidth={4}></pxl-polyline>
        <pxl-var id="speed" value={[1, 2]}></pxl-var>
        <pxl-circle x="500 + sin(t) * 100" y={300} r={10} hidden={false}></pxl-circle>

        <pxl-star x={500} y={300} points={6} ir="ref.speed.value * 10" fill="#f59e0b"
          onClick={(event) => setR(event.currentTarget.points)}></pxl-star>
        {/* @ts-expect-error points take no object */}
        <pxl-star points={{ count: 5 }}></pxl-star>

        {/* @ts-expect-error a radius takes no object */}
        <pxl-circle r={{ radius: 5 }}></pxl-circle>
        {/* @ts-expect-error no such prop */}
        <pxl-circle radius={5}></pxl-circle>
        {/* @ts-expect-error points take no single number */}
        <pxl-polyline points={5}></pxl-polyline>
      </pxl-layer>
    </pxl-stage>
  );
}
