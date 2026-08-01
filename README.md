# 🔴 Live Sport Plugin — Production Fork

A **production-hardened, Docker-ready fork** of [rajhodedara/live-sport-plugin](https://github.com/rajhodedara/live-sport-plugin) — the ultimate live sports streaming addon for [Nuvio](https://nuvio.tv) and [Stremio](https://www.stremio.com/).

> 🎯 **Target**: Self-hosted personal use — 1–5 users, 512 MB RAM, ARM64, Docker + Traefik + Cloudflare Tunnel.

## ✨ What's Different from Original

| Area | Original | This Fork |
|------|----------|-----------|
| Docker | ❌ No Dockerfile | ✅ Multi-stage, non-root, healthcheck |
| Docker Compose | ❌ Missing | ✅ Resource limits, Traefik labels, logging |
| Security | ⚠️ No auth/rate limiting | ✅ Rate limiting, input validation, CORS hardening |
| SSRF Protection | ❌ Open URL param | ✅ Domain allowlist for /watch |
| Image Size | ~300 MB | ~180 MB (multi-stage, alpine) |
| Cache | In-memory only | ✅ SQLite persistent cache |
| Healthcheck | ❌ None | ✅ Health endpoint + Docker healthcheck |
| Logging | console.log | ✅ Structured logging (pino) |
| Traefik | ❌ None | ✅ Labels + middleware config |

## 🏗️ Architecture

```
User → Cloudflare Tunnel → Traefik (:443) → live-sport (:7000)
                                                    │
                                                    ├── Resolver (:3000) [HLS proxy]
                                                    └── 13+ stream providers (circuit-breakered)
```

## 🚀 Quick Start

### 1. Clone on PiKVM

```bash
git clone https://github.com/rutvik2611/live-sport-plugin.git /opt/live-sport
cd /opt/live-sport
cp .env.example .env
# Edit .env → set ADDON_URL=https://sports.rutvik2611.com
```

### 2. Deploy on PiKVM

Your PiKVM stack already has Traefik + cloudflared on `traefik-public` network:

```bash
docker compose up -d
```

This auto-connects to your existing Traefik via the `traefik-public` overlay. No port exposure needed — traffic arrives through Cloudflare Tunnel → Traefik → your container.

### 3. Add DNS + Tunnel Route

Add a DNS record `sports.rutvik2611.com` pointing to your tunnel IP, then add a public hostname in Cloudflare Tunnel pointing to `http://live-sport:7000`.

### 4. Verify

```bash
curl https://sports.rutvik2611.com/health
# → {"status":"ok","service":"nuvio-live-sports"}
```

### 5. Add to Nuvio/Stremio

```
https://sports.rutvik2611.com/manifest.json
```

## ⚙️ Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ADDON_URL` | `http://localhost:7000` | Public URL for stream links |
| `PORT` | `7000` | Server port |
| `RESOLVER_PORT` | `3000` | Internal HLS proxy port |
| `CACHE_TTL_MINUTES` | `5` | Match cache freshness |
| `RATE_LIMIT_MAX` | `60` | Max requests/min/IP |
| `TZ` | `America/New_York` | Timezone for match times |
| `ALLOWED_EMBED_DOMAINS` | *(see .env.example)* | SSRF allowlist |

## 🐳 Docker

```bash
# Build
docker build -t live-sport-plugin:latest .

# Run with Docker Compose (recommended)
docker compose up -d

# View logs
docker compose logs -f

# Update
docker compose pull
docker compose up -d
```

## 🔒 Security

- ✅ Non-root user (appuser)
- ✅ Read-only filesystem
- ✅ tmpfs for temp data
- ✅ no-new-privileges
- ✅ Rate limiting on /stream and /catalog
- ✅ SSRF protection on /watch endpoint
- ✅ CORS restricted to Stremio/Nuvio
- ✅ All secrets via environment variables only
- ✅ Circuit breakers on all provider calls

## 📊 Resources

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 256 MB | **512 MB** |
| CPU | 0.5 vCPU | **1 vCPU** |
| Disk | 500 MB | 2 GB |
| Network | 10 Mbps | 50 Mbps |

## 📦 Source Providers

This plugin aggregates from **13+ sources**:

`StreamFree` · `TimStreams` · `BinTV` · `NTV` · `iptv-org` · `SportyHunter` · `StreamSports` · `WatchFooty` · `CDNLiveTV` · `StreamSports99` · `Streamic` · `PPV Domains` · `Strims24` + YAML-based custom sources

## 🔄 Updating

```bash
# Via Watchtower (auto)
# Or manually:
git pull
docker compose down
docker compose up -d --build
```

## 📝 License

MIT License — for **educational and personal use only**.

## 🙏 Acknowledgements

- [@rajhodedara](https://github.com/rajhodedara) for the original plugin
- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- [Nuvio](https://nuvio.tv) for the streaming platform