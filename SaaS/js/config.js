// Centralized API base URL for frontend
(function () {
  const host = window.location.hostname;
  
  // Detects localhost, 127.0.0.1, or local network IPs like 192.168.x.x
  const isLocal = host === 'localhost' || 
                  host === '127.0.0.1' || 
                  host === '::1' || 
                  host.startsWith('192.168.') || 
                  host.startsWith('10.');

  // Local dev API: Use your laptop's internal address if on a phone, otherwise use localhost
  const localUrl = (host.startsWith('192.168.') || host.startsWith('10.'))
    ? `http://${host}:5000` 
    : 'http://localhost:5000';

  // Production API URL (Your actual deployed Render URL)
  const prodUrl = 'https://stun-fi-backend.onrender.com';

  window.CONFIG = window.CONFIG || {};
  window.CONFIG.API_BASE_URL = isLocal ? localUrl : prodUrl;
  
  console.log("Current API Endpoint:", window.CONFIG.API_BASE_URL);
})();