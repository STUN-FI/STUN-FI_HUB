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