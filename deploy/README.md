# PiKVM Homelab — Deployment Guide

## Current Architecture

```
Internet → Cloudflare Edge → Cloudflare Tunnel (QUIC) → cloudflared → Traefik → Docker Containers
                                                                                │
                                                                                ├── rutvik2611-web (Next.js)
                                                                                ├── hermes (AI Agent)
                                                                                ├── kvmd (PiKVM)
                                                                                ├── live-sport (Nuvio Plugin)
                                                                                ├── adguard (DNS Sinkhole) — dns.rutvik2611.com
                                                                                ├── threadfin (IPTV) — iptv.rutvik2611.com
                                                                                └── uptime-kuma (Monitoring) — status.rutvik2611.com

VPN Outbound (Gluetun → NordVPN)
         │
         └── Threadfin M3U fetches (via HTTP_PROXY)

DNS (AdGuard → port 53)
         │
         └── LAN devices point DNS to 10.0.0.198
```

## Services

| Service | Domain | Internal Port | Container | RAM Limit |
|---------|--------|---------------|-----------|-----------|
| Website | `rutvik2611.com` | 3000 | Next.js | 256m |
| PiKVM | `kvm.rutvik2611.com` | 443 | kvmd | system |
| Traefik | `traefik.rutvik2611.com` | 8081 | Traefik v3.7.9 | 128m |
| Hermes | `hermes.rutvik2611.com` | 8080 | Hermes | 256m |
| Nuvio Plugin | `sports.rutvik2611.com` | 7000 | Node.js | 512m |
| IPTV | `iptv.rutvik2611.com` | 34400 | Threadfin | 128m |
| DNS Admin | `dns.rutvik2611.com` | 80 → Traefik | AdGuard Home | 128m |
| Monitoring | `status.rutvik2611.com` | 3001 | Uptime Kuma | 128m |

## RAM Budget

| Service | RAM Limit | Typical | Notes |
|---------|-----------|---------|-------|
| Gluetun | 128m | 50-80m | VPN tunnel, always-on |
| AdGuard | 128m | 40-70m | DNS sinkhole, always-on |
| Threadfin | 128m | 30-60m | IPTV playlist manager |
| Uptime Kuma | 128m | 40-60m | Lightweight monitoring |
| live-sport | 512m | 150-250m | Nuvio plugin (variable) |
| Hermes | 256m | 80-150m | AI agent (idle most time) |
| Website | 256m | 60-100m | Next.js SSG static |
| Traefik | 128m | 30-50m | Reverse proxy |
| **New subtotal** | **1,664m** | **480-820m** | |
| System reserve | — | 500-700m | Arch, kvmd, Docker daemon |
| **Total** | — | **~1,450-1,800m** | **Within 2GB** ✓ |

## Deployment Steps

### 1. Copy files to PiKVM

```bash
# From Mac (if on same LAN as PiKVM 10.0.0.198):
scp -r deploy/ root@10.0.0.198:/root/homelab/

# Or via tailscale:
scp -r deploy/ root@100.97.169.26:/root/homelab/
```

### 2. Configure NordVPN credentials

```bash
cd /root/homelab
cp .env.example .env
# Edit .env with your NordVPN credentials
nano .env
```

### 3. Deploy

```bash
cd /root/homelab
docker compose pull
docker compose up -d
```

### 4. Add Cloudflare Tunnel routes

In your Cloudflare Zero Trust dashboard → Access → Tunnels → pikvm-homelab → Public Hostnames:

| Hostname | Service |
|----------|---------|
| `iptv.rutvik2611.com` | `http://threadfin:34400` |
| `dns.rutvik2611.com` | `http://adguard:80` |
| `status.rutvik2611.com` | `http://uptime-kuma:3001` |

### 5. AdGuard Initial Setup

AdGuard runs a first-run wizard on port **3000** (mapped to host). Complete it once:

```bash
# Open in browser
open http://10.0.0.198:3000

# Or via cloudflare tunnel (temporary)
# Point a hostname at http://adguard:3000 in the tunnel dashboard
```

After the wizard:
- Set web admin port to **80** (already matches the Traefik label)
- Set DNS listener to **0.0.0.0:53**
- Remove the `3000:3000` port mapping from compose once configured
- Restart: `docker compose up -d`

> ⚠️ **Port 53**: If systemd-resolved or another service is already on port 53, change to `5353:53/udp` in compose and point LAN devices to `10.0.0.198:5353`.

### 6. Verify

```bash
docker compose ps
docker compose logs gluetun --tail 20
curl -s https://iptv.rutvik2611.com/api/status
curl -s https://status.rutvik2611.com
```

## Backup

### Daily backup (systemd timer)

```bash
# Install
cp deploy/systemd/homelab-backup.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homelab-backup.timer

# Manual run
systemctl start homelab-backup
```

### Restore

```bash
# List backups
ls -la /root/backups/

# Restore a specific backup
tar -xzf /root/backups/20260801_120000/cloudflared.tar.gz -C /
tar -xzf /root/backups/20260801_120000/traefik.tar.gz -C /
tar -xzf /root/backups/20260801_120000/hermes.tar.gz -C /
```

## Adding Services Behind Gluetun

For any new container that needs NordVPN routing:

```yaml
services:
  my-service:
    network_mode: "service:gluetun"
    depends_on:
      gluetun:
        condition: service_healthy
```

For services on `traefik-public` that need VPN for outbound fetches:

```yaml
services:
  my-service:
    networks:
      - traefik-public
    environment:
      HTTP_PROXY: http://gluetun:8888
      HTTPS_PROXY: http://gluetun:8888
      NO_PROXY: localhost,127.0.0.1,10.0.0.0/8
```

## Traefik Middleware Update

For Threadfin + Uptime Kuma to work through Traefik, update `/root/traefik/config/middlewares.yml` to include `rateLimit`.

## Troubleshooting

**Gluetun won't connect:**
```bash
docker compose logs gluetun
docker compose exec gluetun /gluetun-entrypoint healthcheck
```

**Threadfin can't reach IPTV sources:**
```bash
# Check proxy is working
docker compose exec threadfin curl -x http://gluetun:8888 -s https://ipinfo.io/json
```

**Traefik can't find new services:**
```bash
# Check labels are present
docker inspect threadfin | grep traefik
# Restart Traefik to force re-read
docker restart traefik
```