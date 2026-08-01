/**
 * index.js — Nuvio Live Sports Plugin Entry Point
 *
 * Builds a single Express server that serves:
 *   - /manifest.json          → addon manifest (via SDK getRouter)
 *   - /catalog/tv/*.json      → match lists
 *   - /meta/tv/*.json         → match detail
 *   - /stream/tv/*.json       → stream URLs
 *   - /watch                  → HTML proxy page for embed streams
 *
 * CORS headers are explicitly set so Nuvio can reach the manifest
 * from any origin without a networkError_manifestLoadError.
 */

const express = require('express');
const cors    = require('cors');
const { getRouter } = require('stremio-addon-sdk');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');

const { builder } = require('./manifest');
const { handleCatalog, handleMeta } = require('./catalog');
const { handleStream } = require('./streams');
const { PORT, BASE_URL } = require('./config');
const container = require('./container');

// Removed global User-Agent fix because it causes ECONNRESET on Streamed.pk

// ─── Spawn the Streamed.pk Resolver ───────────────────────────────────────────

const RESOLVER_PORT = process.env.RESOLVER_PORT || '3000';
const resolverPath = path.join(__dirname, '..', 'resolver', 'src', 'server.js');
let resolverProcess = null;
let isShuttingDown = false;

function spawnResolver() {
  if (isShuttingDown) return;
  console.log(`Starting Stream Resolver at ${resolverPath} on port ${RESOLVER_PORT}...`);
  resolverProcess = spawn('node', [resolverPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: RESOLVER_PORT, BASE_URL: BASE_URL }
  });
  
  resolverProcess.on('error', (err) => console.error('[FATAL] Resolver spawn error:', err));
  
  resolverProcess.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    console.error(`[FATAL] Resolver process exited with code ${code} and signal ${signal}. Restarting in 2 seconds...`);
    setTimeout(spawnResolver, 2000);
  });
}

spawnResolver();

// Ensure child process is killed when the parent exits
function shutdownResolver() {
  isShuttingDown = true;
  if (resolverProcess && !resolverProcess.killed) {
    console.log('Shutting down Stream Resolver...');
    resolverProcess.kill();
  }
}
process.on('exit', shutdownResolver);
process.on('SIGINT', () => { shutdownResolver(); process.exit(0); });
process.on('SIGTERM', () => { shutdownResolver(); process.exit(0); });

// ─── Register Addon Handlers ──────────────────────────────────────────────────

builder.defineCatalogHandler(({ type, id, extra, config }) => handleCatalog(type, id, extra, config));
builder.defineMetaHandler(({ type, id, config })           => handleMeta(type, id, config));
builder.defineStreamHandler(({ type, id, config })         => handleStream(type, id, config));

// ─── Build Express App ────────────────────────────────────────────────────────

const app = express();

app.use(cors());

// Serve the web debugger UI and Configuration Page
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get(['/configure', '/:config/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'configure.html'));
});

app.get('/api/matches', (req, res) => {
  const matches = container.resolve('cacheService').getMatches();
  res.json(matches);
});


// Mount the HLS Video Proxy (routes to the internal resolver on port RESOLVER_PORT)
app.use('/api', createProxyMiddleware({
  target: `http://127.0.0.1:${RESOLVER_PORT}/api`,
  changeOrigin: true,
  xfwd: true,
  logLevel: 'debug',
  onError: (err, req, res) => {
    console.error('[Proxy Error] Failed to proxy /api request to internal resolver:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway: Internal stream resolver is not responding.');
    }
  }
}));

// ─── Dynamic URL Rewrite Middleware ─────────────────────────────────────────────
// The Stremio addon SDK processes streams and returns JSON. We intercept it here
// so we can dynamically rewrite stream URLs to use the correct absolute host based 
// on the incoming request, instead of hardcoding BASE_URL. This fixes issues where
// the addon is accessed remotely but falls back to localhost URLs.
app.use((req, res, next) => {
  if (!req.path.includes('/stream/')) return next();
  
  const originalWrite = res.write;
  const originalEnd = res.end;
  let chunks = [];

  res.write = function (chunk) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  };

  res.end = function (chunk, encoding, callback) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    if (chunks.length > 0) {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyString = bodyBuffer.toString('utf8');
      
      try {
        const body = JSON.parse(bodyString);
        if (body && Array.isArray(body.streams)) {
          const host = req.get('host');
          const proto = req.headers['x-forwarded-proto'] || req.protocol;
          const dynamicBaseUrl = `${proto}://${host}`;
          
          let modified = false;
          body.streams.forEach(s => {
            if (s.externalUrl && s.externalUrl.startsWith('/watch')) {
              s.externalUrl = `${dynamicBaseUrl}${s.externalUrl}`;
              modified = true;
            } else if (BASE_URL && s.externalUrl && s.externalUrl.startsWith(BASE_URL)) {
              s.externalUrl = s.externalUrl.replace(BASE_URL, dynamicBaseUrl);
              modified = true;
            }
            
            if (s.url && s.url.startsWith('/api/hls')) {
              s.url = `${dynamicBaseUrl}${s.url}`;
              modified = true;
            } else if (BASE_URL && s.url && s.url.startsWith(BASE_URL)) {
              s.url = s.url.replace(BASE_URL, dynamicBaseUrl);
              modified = true;
            }
          });
          
          if (modified) {
            const newBodyString = JSON.stringify(body);
            const newBuffer = Buffer.from(newBodyString, 'utf8');
            res.setHeader('Content-Length', newBuffer.length);
            return originalEnd.call(res, newBuffer, 'utf8', callback);
          }
        }
      } catch (e) {
        console.error('[Proxy Error]', e.message);
      }
    }
    
    const finalBuffer = Buffer.concat(chunks);
    originalEnd.call(res, finalBuffer, encoding, callback);
  };
  
  next();
});

// ─── Dynamic Manifest based on Config ─────────────────────────────────────────
app.get('/:config?/manifest.json', (req, res, next) => {
  const { manifest } = require('./manifest');
  let configStr = req.params.config;
  let parsedConfig = {};
  if (configStr) {
    try {
      if (configStr.startsWith('%7B') || configStr.startsWith('{')) {
        parsedConfig = JSON.parse(decodeURIComponent(configStr));
      } else {
        // Convert base64url back to standard base64
        let base64 = configStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        parsedConfig = JSON.parse(decoded);
      }
    } catch (e) {
      return next();
    }
  }

  // Clone manifest catalogs
  const newManifest = JSON.parse(JSON.stringify(manifest));
  
  if (parsedConfig.sports && parsedConfig.sports !== 'all') {
    const enabledSports = parsedConfig.sports.split(',');
    
    // General catalogs to always keep
    const keepCatalogs = ['nuvio_sports_live', 'nuvio_sports_networks', 'nuvio_sports_upcoming', 'nuvio_sports_teams'];
    
    // Add specific catalogs based on selection
    if (enabledSports.includes('football')) keepCatalogs.push('nuvio_sports_football');
    if (enabledSports.includes('cricket')) keepCatalogs.push('nuvio_sports_cricket');
    if (enabledSports.includes('motorsport')) keepCatalogs.push('nuvio_sports_motorsport');
    if (enabledSports.includes('hockey')) keepCatalogs.push('nuvio_sports_hockey');
    if (enabledSports.includes('baseball')) keepCatalogs.push('nuvio_sports_baseball');
    
    // "Other Sports" contains these genres
    const otherSports = ['basketball', 'american_football', 'rugby', 'other'];
    const hasOther = enabledSports.some(s => otherSports.includes(s));
    if (hasOther) {
      keepCatalogs.push('nuvio_sports_other');
    }
    
    newManifest.catalogs = newManifest.catalogs.filter(c => keepCatalogs.includes(c.id));
  }
  
  // Remove teams catalog if the user hasn't configured any teams
  if (!parsedConfig.teams || parsedConfig.teams.trim() === '') {
    newManifest.catalogs = newManifest.catalogs.filter(c => c.id !== 'nuvio_sports_teams');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  res.send(newManifest);
});

// Mount the Stremio addon router
app.use(getRouter(builder.getInterface()));

// ─── /watch — Embed Proxy Page ────────────────────────────────────────────────

// When the user clicks a stream, Nuvio opens this URL in the browser.
// It serves a clean full-screen HTML page that wraps the embed in an iframe,
// bypassing the referrer/origin restrictions that the raw embed.st URLs have.
//
// Query params:
//   ?url=<encoded embed URL>     the stream embed to display
//   ?title=<encoded match title> shown in the page heading

app.get('/watch', (req, res) => {
  const embedUrl = req.query.url;
  const title    = req.query.title || 'Live Sports';

  if (!embedUrl) {
    return res.status(400).send('Missing ?url parameter');
  }

  // Validate — only allow http/https URLs
  let safeUrl;
  try {
    const parsed = new URL(decodeURIComponent(embedUrl));
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }
    safeUrl = parsed.toString();
  } catch {
    return res.status(400).send('Invalid URL');
  }

  const safeTitle = String(title)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <meta name="referrer" content="no-referrer">
  <title>\uD83D\uDD34 ${safeTitle} | Live Sports</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    #topbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 10;
      background: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent);
      padding: 12px 20px; color: #fff; font-size: 14px; font-weight: 600;
      display: flex; align-items: center; gap: 10px;
      animation: fadeOut 1s ease 4s forwards;
    }
    #topbar .dot {
      width: 10px; height: 10px; background: #f44;
      border-radius: 50%; flex-shrink: 0;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(1.3); }
    }
    @keyframes fadeOut { to { opacity: 0; pointer-events: none; } }

    #player {
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      border: none; display: block; background: #000;
    }

    #video-player {
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      border: none; display: none; background: #000;
    }
    #loader {
      position: fixed; inset: 0; background: #111;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 20px; color: #fff; z-index: 5;
      transition: opacity 0.6s ease;
    }
    #loader.hidden { opacity: 0; pointer-events: none; }
    #loader .spinner {
      width: 48px; height: 48px;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #f44; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loader .match { font-size: 18px; font-weight: 600; text-align: center; padding: 0 24px; }
    #loader .hint  { font-size: 13px; opacity: 0.5; }
    
    #p2p-status {
      position: fixed; bottom: 20px; right: 20px; background: rgba(0,0,0,0.7); color: #0f0;
      padding: 5px 10px; border-radius: 4px; font-size: 12px; font-family: monospace; z-index: 20;
      display: none;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/p2p-media-loader-core.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/p2p-media-loader-hlsjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
  <div id="loader">
    <div class="spinner"></div>
    <p class="match">\uD83D\uDD34 ${safeTitle}</p>
    <p class="hint">Loading stream\u2026</p>
  </div>

  <div id="topbar">
    <span class="dot"></span>
    <span>${safeTitle}</span>
  </div>

  <div id="p2p-status">P2P Active: 0 Peers</div>

  <iframe
    id="player"
    allowfullscreen
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
    scrolling="no"
    loading="eager"
  ></iframe>

  <video id="video-player" controls autoplay playsinline></video>

  <script>
    const loader = document.getElementById('loader');
    const iframe = document.getElementById('player');
    const video = document.getElementById('video-player');
    const p2pStatus = document.getElementById('p2p-status');
    const targetUrl = "${safeUrl}";
    const isM3u8 = targetUrl.includes('.m3u8');
    
    // Auto-proxy m3u8 urls through our local server to completely bypass CORS in the browser!
    let finalUrl = targetUrl;
    if (isM3u8 && !targetUrl.includes('/api/hls')) {
      finalUrl = '/api/hls/playlist.m3u8?url=' + encodeURIComponent(targetUrl) + '&referer=' + encodeURIComponent('https://embed.st/') + '&embedOrigin=' + encodeURIComponent('https://embed.st');
    }

    if (isM3u8) {
      iframe.style.display = 'none';
      video.style.display = 'block';
      p2pStatus.style.display = 'block';

      if (p2pml.hlsjs.Engine.isSupported()) {
        const engine = new p2pml.hlsjs.Engine();
        
        engine.on('peer_connect', () => {
           p2pStatus.innerText = 'P2P Active: ' + engine.getSettings().swarmId + ' peers connected';
        });

        const hls = new Hls({
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5,
          lowLatencyMode: true,
          enableWorker: true,
          loader: engine.createLoaderClass()
        });

        p2pml.hlsjs.initHlsJsPlayer(hls);
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.log('Autoplay blocked'));
          loader.classList.add('hidden');
        });
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5,
          lowLatencyMode: true,
          enableWorker: true
        });
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play();
          loader.classList.add('hidden');
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play();
          loader.classList.add('hidden');
        });
      }
    } else {
      video.style.display = 'none';
      iframe.src = targetUrl;
      iframe.addEventListener('load', () => loader.classList.add('hidden'));
      setTimeout(() => loader.classList.add('hidden'), 6000);
    }
  </script>
</body>
</html>`);
});

// ─── Health Check ─────────────────────────────────────────────────────────────
// Render pings this to confirm the service is alive

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'nuvio-live-sports' }));

// ─── Start Server ─────────────────────────────────────────────────────────────

container.resolve('cronService').start();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          🔴 Nuvio Live Sports Plugin                 ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Port       : ${String(PORT).padEnd(39)}║`);
  console.log(`║  Public URL : ${BASE_URL.padEnd(39)}║`);
  console.log('║                                                      ║');
  console.log('║  📋 Paste into Nuvio → Settings → Addons:           ║');
  console.log(`║  ${(BASE_URL + '/manifest.json').padEnd(52)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
