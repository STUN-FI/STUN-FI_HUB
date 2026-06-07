window.CONFIG = window.CONFIG || {};
window.CONFIG.API_BASE_URL = window.CONFIG.API_BASE_URL || 'https://stun-fi-hub-backend.onrender.com';
window.API_BASE = window.API_BASE || window.CONFIG.API_BASE_URL;
window.api = window.api || function(path) {
  if (!path.startsWith('/')) path = '/' + path;
  return window.API_BASE.replace(/\/$/, '') + path;
};