// <pxl-star>: a Kilopixel custom shape (https://woodoo-labs.github.io/kilopixel/custom-shapes.html).
// Load it after pxl.min.js. One path, filled and stroked; lengths are written as in the HTML.
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
