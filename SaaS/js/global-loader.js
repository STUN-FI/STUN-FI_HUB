(function(){
  function run() {
    // Create overlay element if missing
    if (!document.getElementById('globalLoader')) {
      const div = document.createElement('div');
      div.id = 'globalLoader';
      div.className = 'global-loader';
      div.setAttribute('aria-hidden', 'true');
      div.innerHTML = '<div class="loader-spinner" role="status" aria-label="Loading"></div>';
      document.body.appendChild(div);
    }

    function initStyles(){
      if (document.getElementById('globalLoaderStyles')) return;
      const s = document.createElement('style');
      s.id = 'globalLoaderStyles';
      s.textContent = `
        .global-loader { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); z-index: 99999; pointer-events: auto; }
        .global-loader.active { display: flex; pointer-events: auto; }
        .loader-spinner { width: 60px; height: 60px; border-radius: 50%; border: 6px solid rgba(255,255,255,0.18); border-top-color: #fff; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(s);
    }

    initStyles();

    let activeCount = 0;
    const loader = document.getElementById('globalLoader');

    function show() {
      if (!loader) return;
      activeCount++;
      loader.classList.add('active');
      loader.setAttribute('aria-hidden', 'false');
      // disable focus within page for accessibility
      document.querySelectorAll('a, button, input, textarea, select').forEach(el => el.setAttribute('inert', ''));
    }

    function hide() {
      if (!loader) return;
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount > 0) return; // keep showing if there are still active requests
      loader.classList.remove('active');
      loader.setAttribute('aria-hidden', 'true');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
    }

    window.showLoader = show;
    window.hideLoader = hide;

    // Intercept fetch to auto-show loader for API calls
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      const init = args[1] || {};

      // Helper to check for explicit skip header (case-insensitive)
      function hasSkipHeader(headers) {
        if (!headers) return false;
        // Headers can be Headers instance, array, or plain object
        if (typeof Headers !== 'undefined' && headers instanceof Headers) {
          return headers.has('X-Skip-Loader') || headers.has('x-skip-loader');
        }
        if (Array.isArray(headers)) {
          return headers.some(h => (h[0] && String(h[0]).toLowerCase() === 'x-skip-loader'));
        }
        if (typeof headers === 'object') {
          return Object.keys(headers).some(k => k.toLowerCase() === 'x-skip-loader');
        }
        return false;
      }

      const shouldShow = (typeof url === 'string' && (url.includes('/api') || url.includes('localhost:3000') || url.includes('onrender.com') || url.includes(window.API_BASE || ''))) && !hasSkipHeader(init.headers);
      if (shouldShow) show();

      return originalFetch.apply(this, args).then(response => {
        if (shouldShow) hide();
        return response;
      }).catch(error => {
        if (shouldShow) hide();
        throw error;
      });
    };

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
