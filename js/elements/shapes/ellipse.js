// The arc, ring, pie, chord and arrowheads come from pxl.ArcShape (arc.js)
pxl.Ellipse = class Ellipse extends pxl.ArcShape {
  // rx, ry, irx and iry first, like the attribute tables; spreading ArcShape's defaults again keeps the keys' first place
  static defaults = { ...pxl.Shape.defaults, rx: 0, ry: 0, irx: 0, iry: 0, ...pxl.ArcShape.defaults };

  draw(ctx) {
    const { rx, ry, irx, iry } = this.values;
    this.drawArc(ctx, rx, ry, irx, iry);
  }

  getBoundingBox() {
    const { rx, ry } = this.values;
    return this.setBoundingBox(-rx, -ry, rx, ry);
  }
};
pxl.defineShape('pxl-ellipse', pxl.Ellipse);
