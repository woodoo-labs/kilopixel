// =========================================================================
// Gradients
// =========================================================================
// linear(), radial() and conic() in expressions return descriptors (plain objects with isGradient). A shape turns a
// descriptor into a CanvasGradient in its bounding box when it draws: Shape.createGradient(), through one
// pxl.GradientSlot for the fill and one for the stroke.

// Color stops for all gradient types: ['red', 'blue'] (evenly spaced) or [0, 'red', 1, 'blue']
pxl.parseStops = function(colorsArray) {
  const stops = [];
  if (!Array.isArray(colorsArray) || colorsArray.length === 0) return stops;
  if (typeof colorsArray[0] === 'string') {
    const step = 1 / (colorsArray.length - 1 || 1);
    for (let i = 0; i < colorsArray.length; i++) {
      stops.push({ offset: i * step, color: colorsArray[i] });
    }
  } else {
    for (let i = 0; i < colorsArray.length; i += 2) {
      stops.push({ offset: colorsArray[i], color: colorsArray[i + 1] });
    }
  }
  return stops;
};

pxl.scope.linear = (direction, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  if (typeof direction === 'number') {
    return { isGradient: true, type: 'linear', angle: direction, stops };
  }
  if (direction) {
    return { isGradient: true, type: 'linear', x1: direction[0], y1: direction[1], x2: direction[2], y2: direction[3], stops };
  }
  return { isGradient: true, type: 'linear', angle: 0, stops };
};

pxl.scope.radial = (config, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  let x0 = 0.5, y0 = 0.5, r0 = 0;
  let x1 = 0.5, y1 = 0.5, r1 = 0.5;

  if (typeof config === 'number') {
    r1 = config;
  } else if (config) {
    const len = config.length;
    if (len === 1) {
      r1 = config[0];
    } else if (len === 3) {
      x0 = config[0]; y0 = config[1]; r1 = config[2];
      x1 = x0; y1 = y0;
    } else if (len >= 6) {
      x0 = config[0]; y0 = config[1]; r0 = config[2];
      x1 = config[3]; y1 = config[4]; r1 = config[5];
    }
  }

  return { isGradient: true, type: 'radial', x0, y0, r0, x1, y1, r1, stops };
};

pxl.scope.conic = (angleOrConfig, colorsArray) => {
  const stops = pxl.parseStops(colorsArray);
  let startAngle = 0, cx = 0.5, cy = 0.5;
  if (typeof angleOrConfig === 'number') {
    startAngle = angleOrConfig;
  } else if (angleOrConfig) {
    startAngle = angleOrConfig[0] || 0;
    cx = angleOrConfig[1] ?? 0.5;
    cy = angleOrConfig[2] ?? 0.5;
  }
  return { isGradient: true, type: 'conic', startAngle, cx, cy, stops };
};

// Radial gradient radius: a number is a logical length; a string is the distance from the center (x, y)
// to a side, a perimeter point or a CSS keyword of the bounding box (w × h)
pxl.resolveRadius = function(r, x, y, w, h) {
  if (typeof r === 'number') return Math.abs(r);

  // Sides: perpendicular distance
  if (r === 'top')    return Math.abs(y * h);
  if (r === 'bottom') return Math.abs((1 - y) * h);
  if (r === 'left')   return Math.abs(x * w);
  if (r === 'right')  return Math.abs((1 - x) * w);

  // Perimeter points (corners, edge midpoints): straight distance
  const ax = pxl.anchorX[r];
  if (ax !== undefined) {
    const dx = (x - ax) * w, dy = (y - pxl.anchorY[r]) * h;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // CSS keywords
  const lx = x * w, rx = (1 - x) * w;
  const ty = y * h, by = (1 - y) * h;
  switch (r) {
    case 'closest-side':   return Math.max(0.001, Math.min(lx, rx, ty, by));
    case 'farthest-side':  return Math.max(lx, rx, ty, by);
    case 'closest-corner':
      return Math.max(0.001, Math.min(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by)));
    case 'farthest-corner':
      return Math.max(Math.hypot(lx, ty), Math.hypot(rx, ty), Math.hypot(lx, by), Math.hypot(rx, by));
    default: return 0;
  }
};

// =========================================================================
// pxl.GradientSlot: the CanvasGradient of a Shape's Fill or Stroke
// =========================================================================
pxl.GradientSlot = class GradientSlot {
  // isStroke: the stroke's slot, whose gradient spans at least the stroke width (build())
  constructor(isStroke) {
    this._isStroke = isStroke;
    // The descriptor, box and stroke width of the last build, its gradient, or its error
    this._config = null;
    this._left = 0;
    this._top = 0;
    this._right = 0;
    this._bottom = 0;
    this._sw = 0;
    this._grad = null;
    this._error = null;
  }

  // The CanvasGradient for a descriptor in box, reused while the descriptor, the box and the stroke width are
  // unchanged. A gradient that fails with these values (a typo in a stop color) fails again: the error is kept, so later
  // frames throw the same object instead of building a new one (Shape.render() catches it, reportError() stays quiet).
  resolve(ctx, descriptor, box, sw) {
    if (this._config === descriptor &&
        this._left === box.left && this._top === box.top &&
        this._right === box.right && this._bottom === box.bottom && this._sw === sw) {
      if (this._error) throw this._error;
      return this._grad;
    }

    this._config = descriptor;
    this._left = box.left;
    this._top = box.top;
    this._right = box.right;
    this._bottom = box.bottom;
    this._sw = sw;
    this._grad = null;
    this._error = null;
    try {
      this._grad = this.build(ctx, descriptor, box, sw);
    } catch (error) {
      this._error = error;
      throw error;
    }
    return this._grad;
  }

  // The CanvasGradient for a descriptor in box; resolve() keeps it
  build(ctx, styleValue, box, sw) {
    // A stroke is at least strokewidth thick: a line's box has a zero side, and a gradient across it would
    // have zero length and paint nothing. For the stroke, each side spans at least strokewidth around the center.
    // (design/done/2026-10-11_stroke_gradient_zero_dimension_hardening_plan.md)
    const width = this._isStroke ? Math.max(box.right - box.left, sw) : box.right - box.left;
    const height = this._isStroke ? Math.max(box.bottom - box.top, sw) : box.bottom - box.top;
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const left = cx - width / 2;
    const top = cy - height / 2;

    let grad;

    if (styleValue.type === 'linear') {
      let gx1, gy1, gx2, gy2;

      if (styleValue.angle !== undefined) {
        const rad = styleValue.angle * Math.PI / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const distance = Math.abs((width / 2) * cosRad) + Math.abs((height / 2) * sinRad);
        gx1 = cx - distance * cosRad;
        gy1 = cy - distance * sinRad;
        gx2 = cx + distance * cosRad;
        gy2 = cy + distance * sinRad;
      } else {
        gx1 = left + width * styleValue.x1;
        gy1 = top + height * styleValue.y1;
        gx2 = left + width * styleValue.x2;
        gy2 = top + height * styleValue.y2;
      }

      grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);

    } else if (styleValue.type === 'radial') {
      const px0 = left + width * styleValue.x0;
      const py0 = top + height * styleValue.y0;
      const px1 = left + width * styleValue.x1;
      const py1 = top + height * styleValue.y1;

      const pr0 = pxl.resolveRadius(styleValue.r0, styleValue.x0, styleValue.y0, width, height);
      const pr1 = pxl.resolveRadius(styleValue.r1, styleValue.x1, styleValue.y1, width, height);

      grad = ctx.createRadialGradient(px0, py0, pr0, px1, py1, pr1);

    } else {
      // conic (descriptors only come from linear(), radial() and conic())
      const gcx = left + width * styleValue.cx;
      const gcy = top + height * styleValue.cy;
      grad = ctx.createConicGradient(styleValue.startAngle * Math.PI / 180, gcx, gcy);
    }

    // Offsets outside 0–1 throw in addColorStop; an animated stop may overshoot, so it parks at the end.
    // NaN (a ref that isn't connected yet) fails both comparisons and becomes 0.
    const stops = styleValue.stops;
    for (let i = 0; i < stops.length; i++) {
      const offset = stops[i].offset;
      grad.addColorStop(offset > 0 ? (offset < 1 ? offset : 1) : 0, stops[i].color);
    }
    return grad;
  }
};
