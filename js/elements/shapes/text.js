class Text extends Shape {
  static get observedAttributes() {
    return [...super.observedAttributes, 'text', 'size', 'font', 'align', 'baseline', 'weight', 'fontstyle', 'maxwidth', 'direction', 'width', 'lineheight', 'letterspacing', 'reveal'];
  }

  constructor() {
    super();
    const defaults = {
      text: '', size: 16, font: 'sans-serif', align: 'start', 
      baseline: 'alphabetic', weight: 'normal', fontstyle: 'normal', 
      maxwidth: 0, direction: null, width: 0, lineheight: 1.2,
      letterspacing: 0, reveal: null
    };
    Object.assign(this.attributeExpressions, defaults);
    Object.assign(this.attributeValues, defaults);

    this._cachedFontString = '';
    this._lastSize = 0;
    this._lastU = 0;
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
    this._cachedLetterSpacingString = '0px';
    this._lines = [];
    this._totalChars = 0;
  }

  draw(ctx, u, t) {
    const { text, size, font, align, baseline, fill, stroke, strokewidth, weight, fontstyle, maxwidth, direction, width, lineheight, letterspacing, reveal } = this.attributeValues;

    // Skip drawing if there's no text content to render
    if (text === null || text === undefined || text === '') return;
    
    // ====================================================================
    // TIER 1: Font State Cache (String Building)
    // ====================================================================
    let tier1Dirty = false;
    if (
      this._lastSize !== size ||
      this._lastU !== u ||
      this._lastFont !== font ||
      this._lastWeight !== weight ||
      this._lastStyle !== fontstyle ||
      this._lastLetterspacing !== letterspacing
    ) {
      tier1Dirty = true;
      this._cachedFontString = `${fontstyle} ${weight} ${size * u}px ${font}`;
      this._cachedLetterSpacingString = (letterspacing * u) + 'px';

      this._lastSize = size;
      this._lastU = u;
      this._lastFont = font;
      this._lastWeight = weight;
      this._lastStyle = fontstyle;
      this._lastLetterspacing = letterspacing;
    }

    // Always apply context state for accurate measuring and drawing
    ctx.font = this._cachedFontString;
    ctx.letterSpacing = this._cachedLetterSpacingString;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (direction) ctx.direction = direction;

    // ====================================================================
    // TIER 2: Text Layout Cache (Heavy Auto-Wrap Algorithm)
    // ====================================================================
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
            if (ctx.measureText(testLine).width / u > width) {
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

      // Cache total character count for flawless reveal percentage math
      this._totalChars = textStr.length;

      this._lastText = text;
      this._lastWidth = width;
    }

    // ====================================================================
    // TIER 3: Bounding Box & Alignment Cache
    // ====================================================================
    if (tier2Dirty || this._lastAlign !== align || this._lastBaseline !== baseline || this._lastLineheight !== lineheight || this._lastDirection !== direction) {
      let maxLeft = 0;
      let maxRight = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (let i = 0; i < this._lines.length; i++) {
        const metrics = ctx.measureText(this._lines[i]);
        if (metrics.actualBoundingBoxLeft > maxLeft) maxLeft = metrics.actualBoundingBoxLeft;
        if (metrics.actualBoundingBoxRight > maxRight) maxRight = metrics.actualBoundingBoxRight;
        if (i === 0) maxAscent = metrics.actualBoundingBoxAscent;
        if (i === this._lines.length - 1) maxDescent = metrics.actualBoundingBoxDescent;
      }

      this.boundingBox.left = -maxLeft / u;
      this.boundingBox.right = maxRight / u;

      const totalBlockHeight = Math.max(0, this._lines.length - 1) * (size * lineheight) * u;
      
      let startY = 0;
      if (baseline === 'middle') {
        startY = -totalBlockHeight / 2;
      } else if (baseline === 'bottom' || baseline === 'alphabetic' || baseline === 'ideographic') {
        startY = -totalBlockHeight;
      }

      this.boundingBox.top = (startY - maxAscent) / u;
      this.boundingBox.bottom = (startY + totalBlockHeight + maxDescent) / u;
      this._startY = startY / u;

      this._lastAlign = align;
      this._lastBaseline = baseline;
      this._lastLineheight = lineheight;
      this._lastDirection = direction;
    }

    // ====================================================================
    // RENDER LOOP
    // ====================================================================

    // Typewriter Reveal effect (Always Percentage 0.0 - 1.0)
    let charsRemaining = Infinity;
    if (reveal !== null && reveal >= 0) {
      charsRemaining = Math.floor(reveal * (this._totalChars + 1));
      
      // Fast-path bailout: If text is completely hidden, skip all gradients and loops
      if (charsRemaining <= 0) return;
    }

    const hasFill = fill && fill !== 'none' && fill !== 'transparent';
    const hasStroke = stroke && stroke !== 'none' && stroke !== 'transparent' && strokewidth > 0;

    if (!hasFill && !hasStroke) return;

    if (hasFill) ctx.fillStyle = this.createGradient(ctx, u, fill);
    if (hasStroke) {
      ctx.strokeStyle = this.createGradient(ctx, u, stroke);
      if (strokewidth !== 1) ctx.lineWidth = strokewidth * u;
    }

    // Unified Render Loop
    for (let i = 0; i < this._lines.length; i++) {
      if (charsRemaining <= 0) break;
      
      let lineStr = this._lines[i];
      if (lineStr.length > charsRemaining) {
        lineStr = lineStr.substring(0, charsRemaining);
      }

      const yOffset = this._startY + (i * size * lineheight);
      const pxWidth = maxwidth > 0 ? maxwidth * u : undefined;

      if (hasFill) {
        if (pxWidth) ctx.fillText(lineStr, 0, yOffset * u, pxWidth);
        else ctx.fillText(lineStr, 0, yOffset * u);
      }
      
      if (hasStroke) {
        if (pxWidth) ctx.strokeText(lineStr, 0, yOffset * u, pxWidth);
        else ctx.strokeText(lineStr, 0, yOffset * u);
      }

      charsRemaining -= (this._lines[i].length + 1); // +1 accounts for wrapped space/newline
    }
  }

  getBoundingBox() {
    return this.boundingBox;
  }
}
// Define the custom element tag name
customElements.define('pxl-text', Text);
