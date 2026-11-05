pxl.Rect = class Rect extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'w', 'h', 'r', 'r1', 'r2', 'r3', 'r4', 'anchor']; }

  static defaults = { ...pxl.Shape.defaults, w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };

  constructor() {
    super();
    this._radii = [0, 0, 0, 0]; // reused by roundRect() every frame
  }

  draw(ctx, u, t) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.attributeValues;

    const startX = -w * pxl.anchorX[anchor] * u;
    const startY = -h * pxl.anchorY[anchor] * u;

    // r is the radius of every corner that has no r1 … r4 of its own
    const baseR = r ?? 0;
    const rad1 = r1 ?? baseR;
    const rad2 = r2 ?? baseR;
    const rad3 = r3 ?? baseR;
    const rad4 = r4 ?? baseR;

    ctx.beginPath();
    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      // roundRect throws on a negative radius (an animated radius can dip below 0); like circle and ellipse, it becomes 0
      this._radii[0] = Math.max(0, rad1) * u;
      this._radii[1] = Math.max(0, rad2) * u;
      this._radii[2] = Math.max(0, rad3) * u;
      this._radii[3] = Math.max(0, rad4) * u;
      ctx.roundRect(startX, startY, w * u, h * u, this._radii);
    } else {
      ctx.rect(startX, startY, w * u, h * u);
    }
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { w, h, anchor } = this.attributeValues;
    const ax = pxl.anchorX[anchor];
    const ay = pxl.anchorY[anchor];

    this.boundingBox.left = -w * ax;
    this.boundingBox.right = w * (1 - ax);
    this.boundingBox.top = -h * ay;
    this.boundingBox.bottom = h * (1 - ay);
    return this.boundingBox;
  }
};
customElements.define('pxl-rect', pxl.Rect);
