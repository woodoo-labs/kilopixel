pxl.Variable = class Variable extends pxl.PxlNode {
  static defaults = { value: 0 };

  constructor() {
    super();
    // Set only for a stage-level variable (inside a stage, outside every layer): the stage evaluates it
    this.stage = null;
  }

  // display: none comes from pxl.DEFAULT_STYLES
  connectedCallback() {
    super.connectedCallback();
    if (!this.parentLayer) {
      this.stage = this.closest('pxl-stage');
      this.stage?.registerVariable(this);
    }
  }

  disconnectedCallback() {
    this.stage?.unregisterVariable(this);
    this.stage = null;
    super.disconnectedCallback();
  }

  // From the attribute and the property (el.value = 5)
  valueChanged(name) {
    super.valueChanged(name);
    // No layer to invalidate: the stage starts its loop when the value becomes animated
    this.stage?.requestRender();
  }

  // Update phase. A failing expression keeps the previous value for this frame.
  update(t) {
    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this.reportError(error);
    }
  }

  // Draw phase: a variable draws nothing (it is in its layer's or group's childList like a shape)
  render() {}
};
customElements.define('pxl-var', pxl.Variable);
