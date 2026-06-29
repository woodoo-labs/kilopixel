class Rect extends Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'w', 'h', 'r', 'r1', 'r2', 'r3', 'r4', 'anchor']; }

  constructor() {
    super();
    const defaults = { w: 0, h: 0, r: null, r1: null, r2: null, r3: null, r4: null, anchor: 'center' };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);
    
    // Pre-allocated array for zero-allocation roundRect drawing
    this._radii = [0, 0, 0, 0];
  }

  draw(ctx, u, t) {
    const { w, h, r, r1, r2, r3, r4, anchor } = this.attributeValues;

    const ax = pxl.anchorX[anchor] ?? 0.5;
    const ay = pxl.anchorY[anchor] ?? 0.5;

    const startX = -w * ax * u;
    const startY = -h * ay * u;

    ctx.beginPath();
    
    // Core fallback logic: 'r' acts as the universal base radius
    const baseR = r || 0;
    const rad1 = r1 !== null ? r1 : baseR;
    const rad2 = r2 !== null ? r2 : baseR;
    const rad3 = r3 !== null ? r3 : baseR;
    const rad4 = r4 !== null ? r4 : baseR;

    if (rad1 > 0 || rad2 > 0 || rad3 > 0 || rad4 > 0) {
      this._radii[0] = rad1 * u;
      this._radii[1] = rad2 * u;
      this._radii[2] = rad3 * u;
      this._radii[3] = rad4 * u;
      
      // Some browsers require roundRect to be polyfilled, but modern ones support it natively.
      if (ctx.roundRect) {
        ctx.roundRect(startX, startY, w * u, h * u, this._radii);
      } else {
        ctx.rect(startX, startY, w * u, h * u);
      }
    } else {
      ctx.rect(startX, startY, w * u, h * u);
    }
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { w, h, anchor } = this.attributeValues;
    const ax = pxl.anchorX[anchor] ?? 0.5;
    const ay = pxl.anchorY[anchor] ?? 0.5;

    this.boundingBox.left = -w * ax;
    this.boundingBox.right = w * (1 - ax);
    this.boundingBox.top = -h * ay;
    this.boundingBox.bottom = h * (1 - ay);
    return this.boundingBox;
  }
}
customElements.define('pxl-rect', Rect);
