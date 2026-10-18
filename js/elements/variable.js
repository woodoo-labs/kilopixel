pxl.Variable = class Variable extends pxl.PxlNode {
  static get observedAttributes() { return ['value']; }

  static defaults = { value: 0 };

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);
  }
};
customElements.define('pxl-var', pxl.Variable);
