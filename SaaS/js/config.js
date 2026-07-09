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

window.continueWithGoogle = window.continueWithGoogle || function() {
  const authUrl = window.API_BASE.replace(/\/$/, '') + '/auth/google';
  window.location.href = authUrl;
};