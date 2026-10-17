class Variable extends PxlNode {
  static get observedAttributes() { return ['value']; }

  static defaults = { value: 0 };

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);
  }
}
customElements.define('pxl-var', Variable);
