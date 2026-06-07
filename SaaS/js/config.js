// 1. Find your laptop's local IP address (e.g., 192.168.1.100) from your browser URL bar on your phone
const LAPTOP_IP = '192.168.1.15'; // <-- Replace this with your actual local network IP digits!

const host = window.location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');

const localUrl = `http://${LAPTOP_IP}:5000`;
const prodUrl = 'https://stun-fi-hub-backend.onrender.com';

window.CONFIG = window.CONFIG || {};
window.CONFIG.API_BASE_URL = isLocal ? localUrl : prodUrl;