const fs = require('fs');
if (!fs.existsSync('scratch')) fs.mkdirSync('scratch');

function catmullRomToBezier(points, tension = 1) {
  const len = points.length / 2;
  let d = `M ${points[0]} ${points[1]}`;
  const loopLen = len - 1;
  for (let i = 0; i < loopLen; i++) {
    const i0 = Math.max(i - 1, 0);
    const i1 = i;
    const i2 = i + 1;
    const i3 = Math.min(i + 2, len - 1);

    const p0x = points[i0*2], p0y = points[i0*2+1];
    const p1x = points[i1*2], p1y = points[i1*2+1];
    const p2x = points[i2*2], p2y = points[i2*2+1];
    const p3x = points[i3*2], p3y = points[i3*2+1];

    const cp1x = p1x + (p2x - p0x) * (tension / 6);
    const cp1y = p1y + (p2y - p0y) * (tension / 6);
    const cp2x = p2x - (p3x - p1x) * (tension / 6);
    const cp2y = p2y - (p3y - p1y) * (tension / 6);

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
  }
  return d;
}

const pts = [520, 420, 640, 180, 760, 420, 880, 180];
const pathD = catmullRomToBezier(pts, 1);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="450 100 500 400" width="500" height="400">
  <rect width="100%" height="100%" fill="#f8fafc" />
  <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="20" stroke-dasharray="35,15,10,15" stroke-linecap="butt" />
</svg>`;

fs.writeFileSync('scratch/curve.svg', svg);
console.log('Done, path:', pathD);
