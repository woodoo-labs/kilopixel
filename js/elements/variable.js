class Variable extends PxlNode {
  static get observedAttributes() { return ['value']; }

  constructor() {
    super();
    Object.assign(this.attributeExpressions, { value: 0 });
    Object.assign(this.attributeValues, this.attributeExpressions);
  }

  connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
  }

  render(ctx, u, t) {
    this.evaluateAnimations(t);
  }
}
customElements.define('pxl-var', Variable);
