// The arc, ring, pie, chord and arrowheads come from pxl.ArcShape (arc.js); a circle is its case rx = ry
pxl.Circle = class Circle extends pxl.ArcShape {
  // r and ir first, like the attribute tables; spreading ArcShape's defaults again keeps the keys' first place
  static defaults = { ...pxl.Shape.defaults, r: 0, ir: 0, ...pxl.ArcShape.defaults };

  draw(ctx) {
    const { r, ir } = this.values;
    this.drawArc(ctx, r, r, ir, ir);
  }

  getBoundingBox() {
    const { r } = this.values;
    return this.setBoundingBox(-r, -r, r, r);
  }
};
pxl.defineShape('pxl-circle', pxl.Circle);
