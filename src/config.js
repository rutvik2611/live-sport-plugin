/**
 * config.js — Shared runtime configuration
 *
 * Centralizes the server's base URL so every module can build
 * correct absolute URLs (e.g. for the /watch proxy page).
 *
 * Priority order for base URL:
 *  1. RENDER_EXTERNAL_URL — automatically set by Render.com
 *  2. ADDON_URL           — manually set in .env (for other hosts)
 *  3. http://localhost:PORT — fallback for local development
 */

const PORT = parseInt(process.env.PORT, 10) || 7000;

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||     // Render sets this automatically
  process.env.ADDON_URL ||               // Manual override for other hosts
  `http://localhost:${PORT}`             // Local dev fallback
).replace(/\/$/, '');                   // Strip trailing slash if any

module.exports = { PORT, BASE_URL };
