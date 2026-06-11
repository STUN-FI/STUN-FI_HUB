window.CONFIG = window.CONFIG || {};
// If running on a local static server (eg Live Server on port 5500), ensure
// API calls go to the backend running on port 3000. Otherwise use the same
// origin when the backend serves the frontend (port 3000), or fallback to
// the production Render backend.
if (!window.CONFIG.API_BASE_URL) {
  const host = (window.location && window.location.hostname) || '';
  const port = (window.location && window.location.port) || '';

  if (host === 'localhost' || host === '127.0.0.1') {
    // If the page is served from port 3000, backend and frontend share origin.
    if (port === '3000' || port === '') {
      window.CONFIG.API_BASE_URL = window.location.origin;
    } else {
      // Common static dev servers (Live Server) use port 5500 — point API to backend port 3000.
      window.CONFIG.API_BASE_URL = 'http://localhost:3000';
    }
  } else {
    window.CONFIG.API_BASE_URL = 'https://stun-fi-hub-backend.onrender.com';
  }
}
window.API_BASE = window.API_BASE || window.CONFIG.API_BASE_URL;
window.api = window.api || function(path) {
  if (!path.startsWith('/')) path = '/' + path;
  return window.API_BASE.replace(/\/$/, '') + path;
};

function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  const modal = overlay.querySelector('.modal, .modal-card');
  overlay.classList.add('active');
  // allow CSS to pick up initial state
  requestAnimationFrame(() => overlay.classList.add('show'));
  if (modal) modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  const modal = overlay.querySelector('.modal, .modal-card');
  if (modal) modal.setAttribute('aria-hidden', 'true');
  // remove active to trigger exit transitions
  overlay.classList.remove('active');
  // remove show after transition ends (fallback 300ms)
  setTimeout(() => overlay.classList.remove('show'), 300);
}

document.addEventListener('click', function (event) {
  const overlay = event.target.closest('.modal-overlay');
  if (!overlay) return;
  if (event.target !== overlay) return;

  // use closeModal to ensure consistent timing
  if (overlay.id) closeModal(overlay.id);
});

document.addEventListener('keydown', function (event) {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.active, .modal-overlay.show').forEach((overlay) => {
    if (overlay.id) closeModal(overlay.id);
  });
});

// Expose helpers globally for existing inline scripts to call
window.openModal = openModal;
window.closeModal = closeModal;

// Enforce uppercase for all form inputs except email and password
(function enforceUppercaseInputs(){
  const selector = 'input:not([type="email"]):not([type="password"])';

  // Convert value to uppercase on input and blur; handle paste
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    try {
      if (t.matches && t.matches(selector)) {
        const pos = t.selectionStart;
        t.value = t.value.toUpperCase();
        if (typeof pos === 'number') t.setSelectionRange(pos, pos);
      }
    } catch (err) { /* ignore */ }
  }, true);

  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    try {
      if (t.matches && t.matches(selector)) {
        setTimeout(() => {
          t.value = (t.value || '').toUpperCase();
        }, 0);
      }
    } catch (err) { }
  }, true);

  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    try {
      if (t.matches && t.matches(selector)) {
        t.value = (t.value || '').toUpperCase();
      }
    } catch (err) { }
  }, true);
})();
