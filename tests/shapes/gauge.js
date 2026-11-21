// A custom shape for the tests with its own drawing (design/2026-11-20_custom_shapes_plan.md §3): several paint calls,
// the shape's stroke on a second path, a label in the shape's fill through paint(), the presence attribute ticks and
// its own hit area. Loaded as a second script after pxl.min.js.
pxl.Gauge = class Gauge extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, value: 0, r: 100, label: '', ticks: false };

  draw(ctx) {
    const { value, r, label, ticks, strokewidth } = this.values;
    const end = Math.PI * (1 + Math.min(1, Math.max(0, value)));

    // Track: a fixed light arc under the value
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 2 * Math.PI);
    ctx.lineWidth = strokewidth;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Value: the shape's own stroke (color or gradient, width, caps, dashes)
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, end);
    this.applyStrokeState(ctx);
    ctx.stroke();

    // Ticks, with the bare attribute <pxl-gauge ticks>
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
    ctx.font = `600 ${r * 0.26}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -r * 0.12);
  }

  // The half disc, without the stroke (like the built-in shapes)
  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, 0);
  }

  // The hit area: the whole half disc with the stroke, not only the painted arcs
  hitTest(ctx) {
    const b = this.getBoundingBox(), pad = this.values.strokewidth / 2;
    ctx.rect(b.left - pad, b.top - pad, b.right - b.left + 2 * pad, b.bottom - b.top + pad);
    ctx.fill();
  }
};
pxl.defineShape('pxl-gauge', pxl.Gauge);
