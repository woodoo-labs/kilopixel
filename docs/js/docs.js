// Global Interactive Docs Framework (pxlDocs namespace)
window.pxlDocs = window.pxlDocs || {};

// 1. Tab Switcher for Interactive Playgrounds & API Reference Tables
pxlDocs.switchTab = function(btn, targetId) {
  const container = btn.closest('.demo-controls');
  if (!container) return;
  
  // Deactivate all tabs and contents in this container
  container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  // Activate selected button and target tab panel
  btn.classList.add('active');
  const target = container.querySelector('#' + targetId);
  if (target) target.classList.add('active');
};

// 2. Toggle Button UI Helper (Option 1: Transparent DOM + UI helper)
pxlDocs.updateToggle = function(btn, lblId, codeId, displayValue) {
  if (lblId) {
    const lblEl = document.getElementById(lblId);
    if (lblEl) lblEl.innerText = displayValue;
  }
  if (codeId) {
    const codeEl = document.getElementById(codeId);
    if (codeEl) codeEl.innerText = displayValue;
  }
  const group = btn?.closest('.toggle-group');
  if (group) {
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
};

// 2. Automatic Code Mark Highlighting (Pointer Event Delegation System)
pxlDocs.initHighlighting = function() {
  function updateHighlight(input) {
    const oninputStr = input.getAttribute('oninput');
    if (!oninputStr) return;
    
    // Parse inline oninput string for code highlight mark IDs (e.g. 'sec2CircleXCode')
    const match = oninputStr.match(/getElementById\(['"]([^'"]+Code)['"]\)/);
    if (match) {
      const markId = match[1];
      const markElement = document.getElementById(markId);
      if (markElement) {
        if (input._isPressed) {
          markElement.classList.add('highlight-active');
          input._activeMark = markElement;
        } else {
          markElement.classList.remove('highlight-active');
          input._activeMark = null;
        }
      }
    }
  }

  function handlePressStart(e) {
    const target = e.target.closest('input[type="range"]');
    if (target) {
      target._isPressed = true;
      updateHighlight(target);
    }
  }

  function handlePressEnd() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
      if (input._isPressed) {
        input._isPressed = false;
        updateHighlight(input);
      }
    });
  }

  // Universal Interaction Handlers
  document.body.addEventListener('pointerdown', handlePressStart);
  document.body.addEventListener('touchstart', handlePressStart, {passive: true});

  document.addEventListener('pointerup', handlePressEnd);
  document.addEventListener('pointercancel', handlePressEnd);
  document.addEventListener('touchend', handlePressEnd, {passive: true});
  document.addEventListener('touchcancel', handlePressEnd, {passive: true});
};

// Auto-initialize highlighting when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pxlDocs.initHighlighting);
} else {
  pxlDocs.initHighlighting();
}
