pxl.Rect = class Rect extends pxl.Shape {
  static defaults = { ...pxl.Shape.defaults, w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };

  constructor() {
    super();
    this._radii = [0, 0, 0, 0]; // reused by roundRect() every frame
  }

  draw(ctx) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.values;

    const startX = -w * pxl.anchorX[anchor];
    const startY = -h * pxl.anchorY[anchor];

    // r is the radius of every corner that has no r1 … r4 of its own
    const baseR = r ?? 0;
    const rad1 = r1 ?? baseR;
    const rad2 = r2 ?? baseR;
    const rad3 = r3 ?? baseR;
    const rad4 = r4 ?? baseR;

    ctx.beginPath();
    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      // roundRect throws on a negative radius (an animated radius can dip below 0); like circle and ellipse, it becomes 0
      this._radii[0] = Math.max(0, rad1);
      this._radii[1] = Math.max(0, rad2);
      this._radii[2] = Math.max(0, rad3);
      this._radii[3] = Math.max(0, rad4);
      ctx.roundRect(startX, startY, w, h, this._radii);
    } else {
      ctx.rect(startX, startY, w, h);
    }
    this.applyStyle(ctx);
  }

  // Fill and stroke, or arrowheads: more than one draw call, isolated when it has compositing state (Shape.render())
  drawsMoreThanOnce() {
    return this.fillsAndStrokesOrHasArrows();
  }

  getBoundingBox() {
    const { w, h, anchor } = this.values;
    const ax = pxl.anchorX[anchor];
    const ay = pxl.anchorY[anchor];
    return this.setBoundingBox(-w * ax, -h * ay, w * (1 - ax), h * (1 - ay));
  }
};
pxl.defineShape('pxl-rect', pxl.Rect);
