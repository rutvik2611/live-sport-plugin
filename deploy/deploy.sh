#!/bin/bash
# PiKVM Homelab — Full Deployment
# Run this on the PiKVM as root
# Usage:  bash deploy.sh

set -euo pipefail

echo "╔══════════════════════════════════════════════╗"
echo "║   PiKVM Homelab — Service Deployment        ║"
echo "╚══════════════════════════════════════════════╝"

# ─── Prerequisites ───────────────────────────────────────────
echo ""
echo "[1/5] Checking prerequisites..."

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Install it first."
  exit 1
fi

# Check traefik-public network exists
if ! docker network inspect traefik-public &>/dev/null; then
  echo "Creating traefik-public network..."
  docker network create traefik-public
else
  echo "✅ traefik-public network exists"
fi

# ─── Deploy Stack ────────────────────────────────────────────
echo ""
echo "[2/5] Deploying new services (Gluetun + Threadfin + Uptime Kuma)..."

# Copy NordVPN credentials from .env (create if missing)
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Edit .env with your NordVPN credentials before running!"
  echo "   NORDVPN_USER=your_username"
  echo "   NORDVPN_PASS=your_password"
  exit 1
fi

# Source .env to get NordVPN creds
set -a; source .env; set +a

# Deploy
docker compose pull
docker compose up -d

echo ""
echo "[3/5] Checking service health..."
sleep 10
docker compose ps

# ─── Traefik Middleware Check ──────────────────────────────────
echo ""
echo "[4/5] Traefik middleware check..."
if [ -f /root/traefik/config/middlewares.yml ]; then
  echo "✅ /root/traefik/config/middlewares.yml exists"
else
  echo "⚠️  Copy deploy/traefik-middlewares.yml to /root/traefik/config/middlewares.yml"
  echo "   Then add to Traefik static config under providers.file.directory"
fi

# ─── Cloudflare Tunnel ────────────────────────────────────────
echo ""
echo "[5/5] Next steps — add routes in Cloudflare Tunnel:"
echo ""
echo "   Hostname: iptv.rutvik2611.com"
echo "   Service:  http://threadfin:34400"
echo "   -------------------------------------------------"
echo "   Hostname: status.rutvik2611.com"
echo "   Service:  http://uptime-kuma:3001"
echo ""
echo "   Public hostname config file: /root/cloudflared/"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Deployment complete!                   ║"
echo "║   Check: docker compose logs -f              ║"
echo "╚══════════════════════════════════════════════╝"