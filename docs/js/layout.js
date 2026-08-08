// Web Component: Docs Header
class DocsHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <header class="header">
        <a href="index.html" class="header-logo">
          <h1>KILOPIXEL</h1>
          <span class="badge">DOCS</span>
        </a>
        <button id="mobile-menu-btn" aria-label="Toggle Menu">
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
        const sidebar = document.querySelector('docs-sidebar')?.querySelector('.sidebar');
        const backdrop = document.querySelector('docs-sidebar')?.querySelector('.sidebar-backdrop');
        if (sidebar) {
          const isOpen = sidebar.classList.toggle('mobile-open');
          if (backdrop) backdrop.classList.toggle('active', isOpen);
        }
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
      <div class="sidebar-backdrop"></div>
      <aside class="sidebar">
        <div class="sidebar-section">
          <div class="sidebar-title">Getting Started</div>
          <ul>
            <li><a href="index.html" class="${currentPath === 'index.html' ? 'active' : ''}">Introduction</a></li>
            <li><a href="installation.html" class="${currentPath === 'installation.html' ? 'active' : ''}">Installation</a></li>
            <li><a href="coordinates.html" class="${currentPath === 'coordinates.html' ? 'active' : ''}">Coordinate System</a></li>
            <li><a href="styling.html" class="${currentPath === 'styling.html' ? 'active' : ''}">Styling &amp; Rules</a></li>
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
          <div class="sidebar-title">Engine &amp; Logic</div>
          <ul>
            <li><a href="expressions.html" class="${currentPath === 'expressions.html' ? 'active' : ''}">Expressions</a></li>
            <li><a href="referencing.html" class="${currentPath === 'referencing.html' ? 'active' : ''}">Referencing</a></li>
            <li><a href="events.html" class="${currentPath === 'events.html' ? 'active' : ''}">Events</a></li>
            <li><a href="animation.html" class="${currentPath === 'animation.html' ? 'active' : ''}">Animations</a></li>
          </ul>
        </div>
      </aside>
    `;

    // Wire up backdrop and dismissal behaviors
    const backdrop = this.querySelector('.sidebar-backdrop');
    const sidebar = this.querySelector('.sidebar');

    const closeSidebar = () => {
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('active');
    };

    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // Close drawer when clicking any sidebar navigation link
    this.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeSidebar);
    });

    // Close drawer when pressing Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });
  }
}
customElements.define('docs-sidebar', DocsSidebar);
