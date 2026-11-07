pxl.Variable = class Variable extends pxl.PxlNode {
  static get observedAttributes() { return ['value']; }

  static defaults = { value: 0 };

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  // A failing expression keeps the previous value for this frame
  render(ctx, u, t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this.reportError(error);
    }
  }
};
customElements.define('pxl-var', pxl.Variable);
