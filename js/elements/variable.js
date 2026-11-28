pxl.Variable = class Variable extends pxl.PxlNode {
  static defaults = { value: 0 };

  constructor() {
    super();
    // Inside a stage but outside every layer: the stage evaluates it and runs its frame loop for it. Decided on
    // connect, reset on disconnect, so a value set before the next connect asks no stage for a frame.
    this._isStageLevel = false;
  }

  // display: none comes from pxl.defaultStyles()
  connectedCallback() {
    super.connectedCallback();
    if (!this.parentLayer) {
      this._isStageLevel = true;
      this.stage?.registerVariable(this);
    }
  }

  disconnectedCallback() {
    if (this._isStageLevel) this.stage?.unregisterVariable(this);
    this._isStageLevel = false;
    super.disconnectedCallback();
  }

  // A variable draws nothing: its readers redraw their own layers when their values change
  affectsPixels() {
    return false;
  }

  // From the attribute and the property (el.value = 5)
  valueChanged(name) {
    super.valueChanged(name);
    // A stage-level variable has no layer to invalidate: its stage starts the loop when the value becomes animated
    if (this._isStageLevel) this.stage?.requestRender();
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
