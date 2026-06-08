window.CONFIG = window.CONFIG || {};
// Default to an environment-provided URL, otherwise use local origin for
// development, and fall back to the Render backend for production.
if (!window.CONFIG.API_BASE_URL) {
  const host = (window.location && window.location.hostname) || '';
  if (host === 'localhost' || host === '127.0.0.1') {
    window.CONFIG.API_BASE_URL = window.location.origin;
  } else {
    window.CONFIG.API_BASE_URL = 'https://stun-fi-hub-backend.onrender.com';
  }
}
window.API_BASE = window.API_BASE || window.CONFIG.API_BASE_URL;
window.api = window.api || function(path) {
  if (!path.startsWith('/')) path = '/' + path;
  return window.API_BASE.replace(/\/$/, '') + path;
};