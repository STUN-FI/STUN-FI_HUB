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
  
  // Count currently open modals to stack z-index properly
  const openModals = document.querySelectorAll('.modal-overlay.active, .modal-overlay.show').length;
  const baseZIndex = 9998;
  overlay.style.zIndex = baseZIndex + (openModals * 10);
  
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

function ensureToastWrap() {
  let wrap = document.getElementById('toastWrap');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.className = 'toast-wrap';
  wrap.id = 'toastWrap';
  wrap.setAttribute('aria-live', 'polite');
  wrap.setAttribute('aria-atomic', 'true');

  const appendWrap = () => {
    if (!document.body.contains(wrap)) {
      document.body.appendChild(wrap);
    }
  };

  if (document.body) {
    appendWrap();
  } else {
    document.addEventListener('DOMContentLoaded', appendWrap, { once: true });
  }

  return wrap;
}

function toast(message, type = 'info', duration = 3200) {
  const wrap = ensureToastWrap();
  if (!wrap) return null;

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.setAttribute('role', 'status');

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = type === 'success' ? '✔' : type === 'error' ? '✖' : 'ℹ';

  const text = document.createElement('div');
  text.className = 'toast-text';
  text.textContent = message;

  toastEl.appendChild(icon);
  toastEl.appendChild(text);
  wrap.appendChild(toastEl);

  setTimeout(() => {
    toastEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(-6px)';
    setTimeout(() => toastEl.remove(), 220);
  }, duration);

  return toastEl;
}

// Expose helpers globally for existing inline scripts to call
window.openModal = openModal;
window.closeModal = closeModal;
window.toast = toast;
window.ensureToastWrap = ensureToastWrap;

// Create the toast container immediately if possible so pages can use it right away.
ensureToastWrap();

// Helper to wrap async functions with loader
window.withLoader = function(asyncFn) {
  return async function(...args) {
    window.showLoader?.();
    try {
      const result = await asyncFn.apply(this, args);
      return result;
    } catch (error) {
      window.hideLoader?.();
      throw error;
    }
  };
};

// Enforce uppercase for all form inputs except email and password
(function enforceUppercaseInputs(){
  // List of password field IDs to exclude from uppercase
  const passwordFieldIds = ['password', 'confirmPassword', 'schoolPassword', 'newPassword'];
  
  // Convert value to uppercase on input and blur; handle paste
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    // Skip email fields and password fields (by type or ID)
    if (t.type === 'email' || t.type === 'password' || passwordFieldIds.includes(t.id)) return;
    try {
      const pos = t.selectionStart;
      t.value = t.value.toUpperCase();
      if (typeof pos === 'number') t.setSelectionRange(pos, pos);
    } catch (err) { /* ignore */ }
  }, true);

  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    // Skip email fields and password fields (by type or ID)
    if (t.type === 'email' || t.type === 'password' || passwordFieldIds.includes(t.id)) return;
    try {
      setTimeout(() => {
        t.value = (t.value || '').toUpperCase();
      }, 0);
    } catch (err) { }
  }, true);

  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    // Skip email fields and password fields (by type or ID)
    if (t.type === 'email' || t.type === 'password' || passwordFieldIds.includes(t.id)) return;
    try {
      t.value = (t.value || '').toUpperCase();
    } catch (err) { }
  }, true);
})();
