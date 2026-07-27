// Web Component: Docs Header
class DocsHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <header class="header">
        <a href="index.html" class="header-logo">
          <h1>KILOPIXEL</h1>
          <span class="badge">DOCS</span>
        </a>
        <button id="mobile-menu-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <nav>
          <a href="#">Search</a>
          <a href="https://github.com/woodoo-labs/kilopixel" target="_blank">GitHub</a>
        </nav>
      </header>
    `;
    
    // Wire up the mobile menu button
    const btn = this.querySelector('#mobile-menu-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const sidebar = document.querySelector('docs-sidebar').querySelector('.sidebar');
        if (sidebar) sidebar.classList.toggle('mobile-open');
      });
    }
  }
}
customElements.define('docs-header', DocsHeader);

// Web Component: Docs Sidebar
class DocsSidebar extends HTMLElement {
  connectedCallback() {
    // Basic active link detection based on filename
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    this.innerHTML = `
      <aside class="sidebar">
        <pxl-stage ratio="1 / 4" class="sidebar-bg-stage" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; pointer-events: none !important; z-index: 0 !important;">
          <pxl-layer>
            <pxl-circle x="250 + wave(16) * 80" y="300 + wave(22) * 150" r="90" fill="#3b82f633"></pxl-circle>
            <pxl-circle x="750 + wave(19) * 120" y="900 + wave(26) * 200" r="70" fill="#f9731633"></pxl-circle>
            <pxl-circle x="400 + wave(14) * 100" y="1600 + wave(24) * 250" r="110" fill="#60a5fa33"></pxl-circle>
            <pxl-circle x="650 + wave(18) * 90" y="2400 + wave(28) * 300" r="80" fill="#a78bfa33"></pxl-circle>
            <pxl-circle x="300 + wave(21) * 110" y="3200 + wave(30) * 200" r="100" fill="#34d39933"></pxl-circle>
          </pxl-layer>
        </pxl-stage>
        <div class="sidebar-section">
          <div class="sidebar-title">Getting Started</div>
          <ul>
            <li><a href="index.html" class="${currentPath === 'index.html' ? 'active' : ''}">Introduction</a></li>
            <li><a href="installation.html" class="${currentPath === 'installation.html' ? 'active' : ''}">Installation</a></li>
            <li><a href="coordinates.html" class="${currentPath === 'coordinates.html' ? 'active' : ''}">Coordinate System</a></li>
          </ul>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">Containers</div>
          <ul>
            <li><a href="stage.html" class="${currentPath === 'stage.html' ? 'active' : ''}">Stage</a></li>
            <li><a href="layer.html" class="${currentPath === 'layer.html' ? 'active' : ''}">Layer</a></li>
            <li><a href="group.html" class="${currentPath === 'group.html' ? 'active' : ''}">Group</a></li>
          </ul>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">Shapes</div>
          <ul>
            <li><a href="circle.html" class="${currentPath === 'circle.html' ? 'active' : ''}">Circle</a></li>
            <li><a href="rect.html" class="${currentPath === 'rect.html' ? 'active' : ''}">Rectangle</a></li>
            <li><a href="text.html" class="${currentPath === 'text.html' ? 'active' : ''}">Text</a></li>
            <li><a href="line.html" class="${currentPath === 'line.html' ? 'active' : ''}">Line</a></li>
            <li><a href="polyline.html" class="${currentPath === 'polyline.html' ? 'active' : ''}">Polyline</a></li>
            <li><a href="polygon.html" class="${currentPath === 'polygon.html' ? 'active' : ''}">Polygon</a></li>
            <li><a href="grid.html" class="${currentPath === 'grid.html' ? 'active' : ''}">Grid</a></li>
          </ul>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">Engine & Logic</div>
          <ul>
            <li><a href="expressions.html" class="${currentPath === 'expressions.html' ? 'active' : ''}">Expressions</a></li>
            <li><a href="referencing.html" class="${currentPath === 'referencing.html' ? 'active' : ''}">Referencing</a></li>
            <li><a href="events.html" class="${currentPath === 'events.html' ? 'active' : ''}">Events</a></li>
            <li><a href="animation.html" class="${currentPath === 'animation.html' ? 'active' : ''}">Animations</a></li>
          </ul>
        </div>
      </aside>
    `;
  }
}
customElements.define('docs-sidebar', DocsSidebar);

// Global tab switcher for interactive playgrounds
window.switchTab = function(btn, targetId) {
  const container = btn.closest('.demo-controls');
  if (!container) return;
  
  // Deactivate all tabs and contents in this container
  container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  // Activate selected
  btn.classList.add('active');
  const target = container.querySelector('#' + targetId);
  if (target) target.classList.add('active');
};
