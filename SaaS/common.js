window.CONFIG = window.CONFIG || {};
window.CONFIG.API_BASE_URL = window.CONFIG.API_BASE_URL || (function() {
  const loc = window.location;
  const host = (loc.hostname || '').trim();
  const localHost = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)$/i;

  if (loc.protocol === 'file:') {
    return 'http://localhost:3000';
  }
  if (localHost.test(host)) {
    return loc.port === '3000' ? loc.origin : 'http://localhost:3000';
  }
  return 'https://stun-fi-backend.onrender.com';
})();
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

// Enforce uppercase for school id, student id, and registration inputs across forms
(function enforceUppercaseInputs(){
  const selector = [
    'input[id*="schoolid" i]', 'input[name*="schoolid" i]',
    'input[id*="studentid" i]', 'input[name*="studentid" i]',
    'input[id*="regno" i]', 'input[name*="regno" i]',
    'input[id*="reg-number" i]', 'input[name*="reg-number" i]',
    'input[id*="regnumber" i]', 'input[name*="regnumber" i]',
    'input[id*="registration" i]', 'input[name*="registration" i]',
    'input[id*="reg" i]', 'input[name*="reg" i]'
  ].join(',');

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
        // Allow paste then uppercase in next tick
        setTimeout(() => t.value = (t.value || '').toUpperCase(), 0);
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
