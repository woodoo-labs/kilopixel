// PROTOTYPE ONLY: phase 1 of design/done/2026-11-20_custom_shapes_plan.md §5, added at runtime over the engine
// (/dist/pxl.js): every shape draws in logical units on a context scaled by u (draw(ctx, 1); the built-in shapes,
// which multiply by their u parameter, multiply by 1), and the helpers' u defaults to 1, so a custom shape writes
// draw(ctx) without u. Plus the parts of the proposed API the template uses: this.values, setBoundingBox(),
// paint(), presence attributes from the defaults and pxl.defineShape().
(function() {
  const S = pxl.Shape.prototype, IE = pxl.InteractionEngine.prototype;

  // --- Drawing in logical units ---

  S.render = function(ctx, u, t) {
    if (this._failedFrame === pxl._frame || this.attributeValues.hidden) return;
    if (this.needsIsolation()) { this.renderIsolated(ctx, u, t); return; }
    ctx.save();
    try {
      pxl.applyContextState(ctx, u, this.attributeValues, this); // shadows and filters: u × DPR, before the scale
      ctx.scale(u, u); // in the engine: once per layer, with layer and group transforms in logical units
      this.draw(ctx, 1, t);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  };

  S.renderIsolated = function(ctx, u, t) {
    const canvas = ctx.canvas, w = canvas.width, h = canvas.height, d = this.parentLayer.dpr;
    const scratch = pxl.getIsolationContext(w, h);
    scratch.clearRect(0, 0, w, h);
    scratch.save();
    try {
      const m = this.getGlobalMatrix();
      scratch.setTransform(m[0] * u * d, m[1] * u * d, m[2] * u * d, m[3] * u * d, m[4] * u * d, m[5] * u * d);
      this.draw(scratch, 1, t);
    } catch (error) {
      this.reportError(error);
      return;
    } finally {
      scratch.restore();
    }
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      pxl.applyCompositingState(ctx, u, this.attributeValues, this);
      ctx.drawImage(scratch.canvas, 0, 0, w, h, 0, 0, w, h);
    } catch (error) {
      this.reportError(error);
    } finally {
      ctx.restore();
    }
  };

  IE.hitsShape = function(shape, x, y) {
    try {
      if (!shape.mayContainPoint(x, y) || shape.cssStyle().pointerEvents === 'none') return false;
    } catch (error) {
      shape.reportError(error);
      return false;
    }
    const ctx = pxl.dummyCtx, u = this.stage.unit;
    pxl._hitResult = false;
    ctx.save();
    try {
      const m = shape.getGlobalMatrix();
      ctx.setTransform(m[0] * u, m[1] * u, m[2] * u, m[3] * u, m[4] * u, m[5] * u);
      ctx.beginPath();
      if (shape.hitTest) shape.hitTest(ctx, 1);
      else shape.draw(ctx, 1, 0);
    } catch (error) {
      shape.reportError(error);
      return false;
    } finally {
      ctx.restore();
    }
    return pxl._hitResult;
  };

  // The helpers' u defaults to 1: in logical units there is nothing to multiply
  for (const name of ['applyStyle', 'applyStrokeState', 'applyLineDash']) {
    const original = S[name];
    S[name] = function(ctx, u = 1) { return original.call(this, ctx, u); };
  }

  // --- The rest of the template's API ---

  // this.values: the current values (today: attributeValues; the plan renames it)
  Object.defineProperty(pxl.PxlNode.prototype, 'values', { get() { return this.attributeValues; } });

  // setBoundingBox(): write the box and return it, no allocation
  S.setBoundingBox = function(left, top, right, bottom) {
    const box = this.boundingBox;
    box.left = left; box.top = top; box.right = right; box.bottom = bottom;
    return box;
  };

  // paint(): the fill or stroke as a canvas style (a color string, or the gradient in the shape's box)
  S.paint = function(ctx, which) {
    return this.createGradient(ctx, 1, this.attributeValues[which], which === 'stroke' ? 1 : 0);
  };

  // Presence attributes from the defaults: bare is true when the class default is a boolean
  const resolveEmptyAttribute = pxl.resolveEmptyAttribute;
  pxl.resolveEmptyAttribute = function(element, name, newValue) {
    if (newValue === '' && typeof element.constructor.defaults[name] === 'boolean') return true;
    return resolveEmptyAttribute(element, name, newValue);
  };

  // pxl.defineShape(tag, Class): observedAttributes from the defaults, content hidden, checks once (plan D3, open)
  pxl.defineShape = function(tag, Class) {
    const keys = Object.keys(Class.defaults).filter(k => k !== 'isHovered' && k !== 'isPressed');
    for (const k of keys) {
      if (k !== k.toLowerCase()) console.warn(`[pxl] ${Class.name}: attribute "${k}" must be lowercase (HTML lowercases attribute names)`);
    }
    Object.defineProperty(Class, 'observedAttributes', { value: [...keys, ...Object.keys(pxl.HANDLER_EVENTS), 'id'] });
    if (!Object.prototype.hasOwnProperty.call(Class.prototype, 'draw')) console.warn(`[pxl] ${Class.name}: needs draw(ctx)`);
    if (Class.prototype.getBoundingBox === S.getBoundingBox) {
      console.warn(`[pxl] ${Class.name}: no getBoundingBox(): gradients collapse and hit testing skips its pre-check`);
    }
    for (const style of document.querySelectorAll('style[data-pxl]')) style.textContent += `\n${tag} { display: none; }`;
    customElements.define(tag, Class);
  };
})();
