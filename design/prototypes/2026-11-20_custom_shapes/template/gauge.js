// A custom shape with its own drawing: any canvas calls, in logical units, with the engine's helpers.
// The canvas state is restored afterwards, errors are caught.
pxl.Gauge = class Gauge extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, value: 0, r: 100, label: '', ticks: false };

  draw(ctx) {
    const { value, r, label, ticks, strokewidth } = this.values;
    const end = Math.PI * (1 + Math.min(1, Math.max(0, value)));

    // Track: a light arc under the value
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 2 * Math.PI);
    ctx.lineWidth = strokewidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Value: the shape's own stroke (color or gradient, width, caps, dashes)
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, end);
    this.applyStrokeState(ctx);
    ctx.stroke();

    // Tick marks, with the bare attribute <pxl-gauge ticks>
    if (ticks) {
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (1 + i / 10), c = Math.cos(a), s = Math.sin(a);
        const inner = r - strokewidth, outer = r - strokewidth * (i % 5 ? 1.4 : 1.8);
        ctx.moveTo(c * inner, s * inner);
        ctx.lineTo(c * outer, s * outer);
      }
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();
    }

    // Label in the shape's fill
    ctx.fillStyle = this.paint(ctx, 'fill');
    ctx.font = `600 ${r * 0.26}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -r * 0.12);
  }

  getBoundingBox() {
    const { r, strokewidth } = this.values;
    const s = strokewidth / 2;
    return this.setBoundingBox(-r - s, -r - s, r + s, 0);
  }

  // The hit area: the whole half disc, not only the painted arcs
  hitTest(ctx) {
    const b = this.getBoundingBox();
    ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.fill();
  }
};
pxl.defineShape('pxl-gauge', pxl.Gauge);
