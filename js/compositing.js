// =========================================================================
// Canvas State: Transform, Compositing, Filters, Isolation
// =========================================================================
// What a node sets on the canvas before it draws, and the scratch canvas of isolated shapes.

// Whether a transform attribute is away from its default (pxl.TRANSFORM_DEFAULTS): a layer or group without one skips
// the transform, a group also save() / restore(). The same tests as applyTransformState() makes, step by step.
pxl.hasTransform = function(values) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = values;
  return !!(x || y || dx || dy || rotate || zoom !== 1 || scalex !== 1 || scaley !== 1 || skewx || skewy);
};

// Same order as pxl.Matrix.updateLocal: translate(x, y) → rotate → scale → skew → translate(dx, dy). In logical
// units: the layer has scaled the context by u.
pxl.applyTransformState = function(ctx, values) {
  const { x, y, dx, dy, rotate, zoom, scalex, scaley, skewx, skewy } = values;

  if (x || y) ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate * Math.PI / 180);

  const finalScaleX = zoom * scalex;
  const finalScaleY = zoom * scaley;
  if (finalScaleX !== 1 || finalScaleY !== 1) ctx.scale(finalScaleX, finalScaleY);

  if (skewx || skewy) {
    const sx = Math.tan(skewx * Math.PI / 180);
    const sy = Math.tan(skewy * Math.PI / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  if (dx || dy) ctx.translate(dx, dy);
};

// Scales every px value in the final filter string by the unit u: the helpers' (blur(5) → 'blur(5px)')
// and those written in backticks. JavaScript prints values near 0 in exponent notation (1.2e-15),
// so the number includes an optional exponent; otherwise only '-15px' would be scaled.
pxl.scaleResponsiveFilter = function(filterStr, u) {
  return filterStr.replace(/(-?\d*\.?\d+(?:e[-+]?\d+)?)px/g, (match, val) => (parseFloat(val) * u) + 'px');
};

pxl.applyContextState = function(ctx, u, values, node) {
  pxl.applyTransformState(ctx, values);
  pxl.applyCompositingState(ctx, u, values, node);
};

// Safari's canvas has ctx.filter only behind its "Canvas Filters" feature flag, off by default: a shape's filter is
// then ignored (TODO §49). Checked once per page, at the first shape with a filter; the prototype is asked, because
// assigning ctx.filter where it doesn't exist creates a plain property on that context.
pxl._canvasFilterChecked = false;

pxl.checkCanvasFilter = function(ctx, node) {
  if (pxl._canvasFilterChecked) return;
  pxl._canvasFilterChecked = true;
  if ('filter' in Object.getPrototypeOf(ctx)) return;
  console.warn(`[pxl] ${pxl.describe(node)} has a filter, but this browser's canvas ` +
    'ignores filters on shapes (Safari: only with its "Canvas Filters" feature flag). A filter on a layer works everywhere.');
};

// How a shape's pixels combine with the layer: alpha, mask / blend, filter, shadow. An isolated shape
// (Shape.renderIsolated()) applies it once, when its finished bitmap is drawn onto the layer.
// Canvas shadows and filters ignore the canvas transform, which holds the layer's device pixel ratio: their lengths
// are bitmap pixels, so they are scaled by u and the DPR.
pxl.applyCompositingState = function(ctx, u, values, node) {
  const { alpha, blend, mask, filter, shadowcolor, shadowblur, shadowx, shadowy } = values;
  const k = u * node.parentLayer.dpr;

  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (mask !== 'none') {
    ctx.globalCompositeOperation = mask;
  } else if (blend !== 'source-over') {
    ctx.globalCompositeOperation = blend;
  }

  if (filter !== 'none') {
    pxl.checkCanvasFilter(ctx, node);
    ctx.filter = node.resolveFilter(filter, k);
  }

  if (shadowcolor) {
    if (shadowcolor === 'none' || shadowcolor === 'transparent') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = shadowcolor;
      ctx.shadowBlur = shadowblur * k;
      ctx.shadowOffsetX = shadowx * k;
      ctx.shadowOffsetY = shadowy * k;
    }
  }
};

// The scratch canvas of isolated shapes (design/done/2026-11-01_isolated_shape_compositing_plan.md §3.2): one for the
// page, created on first use. It only grows, to the largest layer canvas it served, so it never resizes back and
// forth between layers of different sizes. Isolation never nests: groups have no compositing state.
pxl._isolationContext = null;

pxl.getIsolationContext = function(width, height) {
  let ctx = pxl._isolationContext;
  if (ctx === null) {
    ctx = pxl._isolationContext = document.createElement('canvas').getContext('2d');
  }
  const canvas = ctx.canvas;
  if (canvas.width < width) canvas.width = width;
  if (canvas.height < height) canvas.height = height;
  return ctx;
};

// =========================================================================
// Filter Helpers in Expressions
// =========================================================================
// They write the units, so filter="blur(4)" is enough; px values are scaled by pxl.scaleResponsiveFilter().
pxl.scope.blur       = (radius) => `blur(${radius}px)`;
pxl.scope.dropShadow = (x, y, blur, color) => `drop-shadow(${x}px ${y}px ${blur}px ${color || '#000'})`;
pxl.scope.brightness = (val) => `brightness(${val}%)`;
pxl.scope.contrast   = (val) => `contrast(${val}%)`;
pxl.scope.hueRotate  = (deg) => `hue-rotate(${deg}deg)`;
pxl.scope.invert     = (val) => `invert(${val}%)`;
pxl.scope.saturate   = (val) => `saturate(${val}%)`;
pxl.scope.grayscale  = (val) => `grayscale(${val}%)`;
pxl.scope.sepia      = (val) => `sepia(${val}%)`;
pxl.scope.opacity    = (val) => `opacity(${val}%)`;
