// A user-made shape, written like js/elements/shapes/rect.js and loaded after pxl.min.js.
class Star extends pxl.Shape {
  static get observedAttributes() { return [...super.observedAttributes, 'points', 'r', 'ir']; }

  static defaults = { ...pxl.Shape.defaults, points: 5, r: 50, ir: 20 };

  draw(ctx, u, t) {
    const { points, r, ir } = this.attributeValues;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = (i % 2 ? ir : r) * u;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    this.applyStyle(ctx, u);
  }

  getBoundingBox() {
    const { r } = this.attributeValues;
    this.boundingBox.left = -r;
    this.boundingBox.right = r;
    this.boundingBox.top = -r;
    this.boundingBox.bottom = r;
    return this.boundingBox;
  }
}
customElements.define('pxl-star', Star);

// A careless user shape: changes canvas state and never resets it.
class GhostStar extends Star {
  draw(ctx, u, t) {
    ctx.globalAlpha = 0.2;
    super.draw(ctx, u, t);
  }
}
customElements.define('pxl-ghost-star', GhostStar);
