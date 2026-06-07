// Centralized API base URL for frontend
(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  // Local dev API (use port 5000 when developing locally)
  const localUrl = 'http://localhost:5000';

  // Production API URL (deployed Render URL)
  const prodUrl = 'https://stun-fi-hub-backend.onrender.com';

  window.CONFIG = window.CONFIG || {};
  window.CONFIG.API_BASE_URL = isLocal ? localUrl : prodUrl;
})();
