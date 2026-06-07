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
