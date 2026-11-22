// Raised when web fonts arrive. The font string doesn't change then, so each text compares this number instead.
pxl._fontGeneration = 0;

pxl.Text = class Text extends pxl.Shape {
  static defaults = {
    ...pxl.Shape.defaults,
    text: '', size: 16, font: 'sans-serif', align: 'start',
    baseline: 'alphabetic', weight: 'normal', fontstyle: 'normal',
    maxwidth: 0, direction: null, width: 0, lineheight: 1.2,
    letterspacing: 0, reveal: null
  };

  constructor() {
    super();
    this._cachedFontString = '';
    this._lastSize = 0;
    this._lastFont = '';
    this._lastWeight = '';
    this._lastStyle = '';
    this._lastText = '';
    this._lastAlign = '';
    this._lastBaseline = '';
    this._lastWidth = 0;
    this._lastLineheight = 0;
    this._lastLetterspacing = 0;
    this._lastDirection = null;
    this._lastMaxwidth = 0;
    this._lastFontGeneration = 0;
    this._cachedLetterSpacingString = '0px';
    this._lines = [];
    this._totalChars = 0;
    this._startY = 0;
    this._hasInk = false; // true only if the last draw() painted something (used by hitTest)
  }

  // The text property shows a string as it is, never as an expression: frameworks bind data to it (text={label}),
  // and compiling data would run it as code ('alert(1)') or fail on it ('Q1 - 2024'). Expressions stay available
  // through the attribute. Other values (numbers) go the usual way.
  get text() {
    return this.values.text;
  }

  set text(value) {
    if (typeof value !== 'string') {
      this.setValue('text', value === undefined ? null : value);
    } else if (value !== this.expressions.text) {
      pxl.storeValue(this, 'text', value);
      this.valueChanged('text');
    }
  }

  // Three caches, each rebuilt only when its inputs change: font string → line layout → bounding box
  draw(ctx) {
    const {
      text, size, font, align, baseline, weight, fontstyle, maxwidth,
      direction, width, lineheight, letterspacing, reveal
    } = this.values;

    this._hasInk = false;

    // null / undefined: a ref that isn't connected yet
    if (text === null || text === undefined || text === '') return;

    // --- 1. Font string ---
    let tier1Dirty = false;
    if (
      this._lastSize !== size ||
      this._lastFont !== font ||
      this._lastWeight !== weight ||
      this._lastStyle !== fontstyle ||
      this._lastLetterspacing !== letterspacing ||
      this._lastFontGeneration !== pxl._fontGeneration
    ) {
      tier1Dirty = true;
      this._cachedFontString = `${fontstyle} ${weight} ${size}px ${font}`;
      this._cachedLetterSpacingString = letterspacing + 'px';

      this._lastSize = size;
      this._lastFont = font;
      this._lastWeight = weight;
      this._lastStyle = fontstyle;
      this._lastLetterspacing = letterspacing;
      this._lastFontGeneration = pxl._fontGeneration;
    }

    // Context state is set every time: measuring and drawing both depend on it
    ctx.font = this._cachedFontString;
    ctx.letterSpacing = this._cachedLetterSpacingString;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.direction = direction || 'inherit';

    // --- 2. Line layout (word wrap when width > 0) ---
    let tier2Dirty = false;
    if (tier1Dirty || this._lastText !== text || this._lastWidth !== width) {
      tier2Dirty = true;

      const textStr = String(text).replace(/\\n/g, '\n');
      this._lines = [];

      if (width > 0) {
        const paragraphs = textStr.split('\n');
        for (let p = 0; p < paragraphs.length; p++) {
          const words = paragraphs[p].split(' ');
          let currentLine = words[0] || '';

          for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            if (ctx.measureText(testLine).width > width) {
              this._lines.push(currentLine);
              currentLine = words[i];
            } else {
              currentLine = testLine;
            }
          }
          this._lines.push(currentLine);
        }
      } else {
        this._lines = textStr.split('\n');
      }

      // reveal counts characters of the whole text
      this._totalChars = textStr.length;

      this._lastText = text;
      this._lastWidth = width;
    }

    // --- 3. Bounding box and first baseline ---
    if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline ||
        this._lastLineheight !== lineheight || this._lastDirection !== direction ||
        this._lastMaxwidth !== maxwidth) {
      let maxLeft = 0;
      let maxRight = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (let i = 0; i < this._lines.length; i++) {
        const metrics = ctx.measureText(this._lines[i]);
        // measureText() ignores maxWidth: a line wider than maxwidth is squeezed around its anchor, so both sides scale
        const squeeze = maxwidth > 0 ? Math.min(1, maxwidth / metrics.width) : 1;
        const left = metrics.actualBoundingBoxLeft * squeeze;
        const right = metrics.actualBoundingBoxRight * squeeze;
        if (left > maxLeft) maxLeft = left;
        if (right > maxRight) maxRight = right;
        if (i === 0) maxAscent = metrics.actualBoundingBoxAscent;
        if (i === this._lines.length - 1) maxDescent = metrics.actualBoundingBoxDescent;
      }

      this.boundingBox.left = -maxLeft;
      this.boundingBox.right = maxRight;

      const totalBlockHeight = Math.max(0, this._lines.length - 1) * size * lineheight;

      let startY = 0;
      if (baseline === 'middle') {
        startY = -totalBlockHeight / 2;
      } else if (baseline === 'bottom' || baseline === 'alphabetic' || baseline === 'ideographic') {
        startY = -totalBlockHeight;
      }

      this.boundingBox.top = startY - maxAscent;
      this.boundingBox.bottom = startY + totalBlockHeight + maxDescent;
      this._startY = startY;

      this._lastAlign = align;
      this._lastBaseline = baseline;
      this._lastLineheight = lineheight;
      this._lastDirection = direction;
      this._lastMaxwidth = maxwidth;
    }

    // --- Drawing ---

    // Typewriter reveal: 0 = nothing, 1 = everything
    let charsRemaining = Infinity;
    if (reveal !== null && reveal >= 0) {
      charsRemaining = Math.floor(reveal * (this._totalChars + 1));
      if (charsRemaining <= 0) return;
    }

    const hasFill = this.hasFill();
    const hasStroke = this.isStroked();
    if (!hasFill && !hasStroke) return;

    if (hasFill) ctx.fillStyle = this.createGradient(ctx, this.values.fill, 0);
    if (hasStroke) this.applyStrokeState(ctx);

    this._hasInk = true;

    const pxWidth = maxwidth > 0 ? maxwidth : undefined;
    for (let i = 0; i < this._lines.length; i++) {
      if (charsRemaining <= 0) break;

      let lineStr = this._lines[i];
      if (lineStr.length > charsRemaining) {
        lineStr = lineStr.substring(0, charsRemaining);
      }

      const yOffset = this._startY + (i * size * lineheight);

      if (hasFill) {
        if (pxWidth) ctx.fillText(lineStr, 0, yOffset, pxWidth);
        else ctx.fillText(lineStr, 0, yOffset);
      }

      if (hasStroke) {
        if (pxWidth) ctx.strokeText(lineStr, 0, yOffset, pxWidth);
        else ctx.strokeText(lineStr, 0, yOffset);
      }

      charsRemaining -= (this._lines[i].length + 1); // +1 accounts for wrapped space/newline
    }
  }

  // Fill and stroke, or more than one line (one call per line). Decided from the attributes: the line count is only
  // known after the layout in draw(). A wrap width counts even if the text fits on one line.
  drawsMoreThanOnce() {
    const { text, width } = this.values;
    return (this.hasFill() && this.isStroked()) || width > 0 ||
           (typeof text === 'string' && (text.includes('\n') || text.includes('\\n')));
  }

  getBoundingBox() {
    return this.boundingBox;
  }

  // Glyphs can't be turned into a path, so the hit area is the bounding box from the last draw()
  hitTest(ctx) {
    if (!this._hasInk) return; // nothing visible: empty text, reveal hides all, no fill and no stroke

    const b = this.boundingBox;
    const pad = this.isStroked() ? this.values.strokewidth / 2 : 0;
    ctx.rect(b.left - pad, b.top - pad, b.right - b.left + 2 * pad, b.bottom - b.top + 2 * pad);
    ctx.fill(); // intercepted on pxl.dummyCtx (isPointInPath)
  }
};
pxl.defineShape('pxl-text', pxl.Text);

// All layers, because a custom shape can draw text too. Hidden or off-screen stages catch up when they next render.
document.fonts.addEventListener('loadingdone', () => {
  pxl._fontGeneration++;
  for (let i = 0; i < pxl.perf.stages.length; i++) pxl.perf.stages[i].invalidateLayers();
});
