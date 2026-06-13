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
        .global-loader { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); z-index: 99999; pointer-events: none; }
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
      loader.classList.add('active');
      loader.setAttribute('aria-hidden', 'false');
      // disable focus within page for accessibility
      document.querySelectorAll('a, button, input, textarea, select').forEach(el => el.setAttribute('inert', ''));
    }

    function hide() {
      if (!loader) return;
      loader.classList.remove('active');
      loader.setAttribute('aria-hidden', 'true');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
    }

    window.showLoader = show;
    window.hideLoader = hide;

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
