pxl.Group = class Group extends pxl.PxlNode {
  // The pxl-on-* handlers are attributes without a value, so they aren't in defaults
  static get observedAttributes() {
    return [...super.observedAttributes, ...Object.keys(pxl.HANDLER_EVENTS)];
  }

  static defaults = {
    x: 0, y: 0, dx: 0, dy: 0, rotate: 0, zoom: 1, scalex: 1, scaley: 1, skewx: 0, skewy: 0, hidden: false
  };

  constructor() {
    super();
    // Runtime state written by the interaction engine: true while a shape inside the group is hovered or pressed,
    // like :hover on a parent. Values (ref.<id>.isHovered), but not attributes
    this.attributeValues.isHovered = false;
    this.attributeValues.isPressed = false;

    this.childList = []; // groups and shapes
    this._isOrderDirty = false; // children need sorting by DOM position
    this.stage = null; // set in connectedCallback
    // pxl-on-* listeners by DOM event type (PxlNode.setHandler()): events from the shapes inside bubble up to them
    this.handlers = pxl.createHandlers();
  }

  connectedCallback() {
    this.stage = this.closest('pxl-stage');
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stage?.interaction.releaseElement(this);
  }

  // Called once per connect (PxlNode.connectedCallback); no includes() check, which made inserting n children quadratic
  registerChild(child) {
    this.childList.push(child);
    this._isOrderDirty = true;
    this.parentLayer?.invalidate();
  }

  unregisterChild(child) {
    pxl.removeFromArray(this.childList, child);
    this.parentLayer?.invalidate();
  }

  // Update phase. A failing expression skips the group with its children for this frame (also in the draw phase).
  // A hidden group doesn't evaluate its children: their values that follow t stay as they are until it is shown.
  update(t) {
    if (this._isOrderDirty) {
      this.childList.sort(pxl.sortByDOMPosition);
      this._isOrderDirty = false;
    }

    try {
      this.evaluateAnimations(t);
    } catch (error) {
      this._failedFrame = pxl._frame;
      this.reportError(error);
      return;
    }

    if (this.attributeValues.hidden) return;
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].update(t);
    }
  }

  // Draw phase, into the parent layer's canvas
  render(ctx, u) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;

    const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = this.attributeValues;
    const hasStateChanges = x || y || dx || dy || rotate ||
                            zoom !== 1 || scalex !== 1 || scaley !== 1 ||
                            skewx || skewy;

    if (hasStateChanges) {
      ctx.save();
      pxl.applyTransformState(ctx, u, this.attributeValues);
    }
    for (let i = 0; i < this.childList.length; i++) {
      this.childList[i].render(ctx, u);
    }
    if (hasStateChanges) ctx.restore();
  }
};
customElements.define('pxl-group', pxl.Group);
