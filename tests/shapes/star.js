// A custom shape for the tests, written as the custom shapes plan's template (design/2026-11-20_custom_shapes_plan.md
// §3) and loaded as a second script after pxl.min.js: one path, filled and stroked, in logical units.
pxl.Star = class Star extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };

  draw(ctx) {
    const { points, r, ir } = this.values;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = i % 2 ? ir : r;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    this.applyStyle(ctx); // fill, then stroke
  }

  // It paints at most twice, so it needs the scratch canvas only for fill + stroke
  drawsMoreThanOnce() {
    return this.hasFill() && this.isStroked();
  }

  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, r);
  }
};
pxl.defineShape('pxl-star', pxl.Star);
