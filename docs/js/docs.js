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
    let markIds = [];
    const dataMark = input.getAttribute('data-mark');
    
    if (dataMark) {
      markIds = dataMark.split(',').map(s => s.trim());
    } else {
      const oninputStr = input.getAttribute('oninput');
      if (oninputStr) {
        const match = oninputStr.match(/getElementById\(['"]([^'"]+Code)['"]\)/);
        if (match) markIds = [match[1]];
      }
    }
    
    input._activeMarks = input._activeMarks || [];
    
    if (input._isPressed) {
      // Clear any existing active marks just in case
      input._activeMarks.forEach(el => el.classList.remove('highlight-active'));
      input._activeMarks = [];
      
      markIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('highlight-active');
          input._activeMarks.push(el);
        }
      });
    } else {
      input._activeMarks.forEach(el => el.classList.remove('highlight-active'));
      input._activeMarks = [];
    }
  }

  function handlePressStart(e) {
    const target = e.target.closest('input[type="range"]');
    if (target) {
      target._isPressed = true;
      updateHighlight(target);
    }
  }

  function handleInput(e) {
    const target = e.target.closest('input[type="range"]');
    if (target) {
      // Automatically dismiss any onboarding beacon dot for this slider
      const group = target.closest('.control-group');
      if (group) {
        const dot = group.querySelector('.indicator-dot');
        if (dot) {
          dot.remove();
          // Update the parent tab's badge count!
          pxlDocs.updateTabBadge(target.closest('.tab-content'));
        }
      }
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
  document.body.addEventListener('input', handleInput);
  document.body.addEventListener('pointerdown', handlePressStart);
  document.body.addEventListener('touchstart', handlePressStart, {passive: true});

  // Automatically count dots and spawn numbered badges on Tab Buttons
  pxlDocs.updateTabBadge = function(tabContent) {
    if (!tabContent || !tabContent.id) return;
    const btn = document.querySelector(`button[onclick*="${tabContent.id}"]`);
    if (!btn) return;
    
    const remaining = tabContent.querySelectorAll('.indicator-dot').length;
    let badge = btn.querySelector('.indicator-badge');
    
    if (remaining > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'indicator-badge';
        btn.appendChild(badge);
      }
      badge.innerText = remaining;
    } else {
      if (badge) badge.remove();
    }
  };

  function initBadges() {
    document.querySelectorAll('.tab-content').forEach(tabContent => {
      pxlDocs.updateTabBadge(tabContent);
    });
  }

  // Initialize badges on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBadges);
  } else {
    initBadges();
  }

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
