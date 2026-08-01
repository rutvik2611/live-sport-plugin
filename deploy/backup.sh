#!/bin/bash
# PiKVM Homelab — Daily Backup
# Location: /root/scripts/backup.sh
# Schedule: Daily via systemd timer or cron
# Backup: Configuration, Docker volumes, Cloudflare tunnel

set -euo pipefail

# ─── Config ─────────────────────────────────────────────────
BACKUP_DIR="/root/backups"
RETENTION_DAYS=14
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${DATE}"
LOG="/var/log/homelab-backup.log"

mkdir -p "${BACKUP_PATH}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

# ─── 1. Cloudflare Tunnel Config ─────────────────────────────
log "Backing up Cloudflare Tunnel config..."
if [ -d /root/cloudflared ]; then
  tar czf "${BACKUP_PATH}/cloudflared.tar.gz" -C /root cloudflared
fi

# ─── 2. Traefik Config ──────────────────────────────────────
log "Backing up Traefik config..."
if [ -d /root/traefik ]; then
  tar czf "${BACKUP_PATH}/traefik.tar.gz" -C /root traefik
fi

# ─── 3. Hermes Config ───────────────────────────────────────
log "Backing up Hermes config..."
if [ -d /root/hermes ]; then
  tar czf "${BACKUP_PATH}/hermes.tar.gz" -C /root hermes
fi

# ─── 4. Docker Compose Files ─────────────────────────────────
log "Backing up Docker Compose files..."
if [ -d /root/homelab ]; then
  tar czf "${BACKUP_PATH}/homelab-compose.tar.gz" -C /root homelab
fi
if [ -d /opt/live-sport ]; then
  tar czf "${BACKUP_PATH}/live-sport.tar.gz" -C /opt live-sport
fi

# ─── 5. Docker Volume Metadata ──────────────────────────────
log "Backing up Docker volume inventory..."
docker volume ls --format '{{.Name}}' > "${BACKUP_PATH}/volumes.txt"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > "${BACKUP_PATH}/containers.txt"
docker network ls --format 'table {{.Name}}\t{{.Driver}}' > "${BACKUP_PATH}/networks.txt"
docker info --format '{{.ServerVersion}}' > "${BACKUP_PATH}/docker-version.txt"

# ─── 6. System Info ─────────────────────────────────────────
log "Saving system info..."
{
  echo "=== DISK ==="
  df -h /
  echo "=== MEMORY ==="
  free -h
  echo "=== UPTIME ==="
  uptime
  echo "=== NETWORK ==="
  ip addr show 2>/dev/null || ifconfig
  echo "=== TAILSCALE ==="
  tailscale status 2>/dev/null || echo "tailscale not available"
} > "${BACKUP_PATH}/system-info.txt"

# ─── 7. Rotate Old Backups ──────────────────────────────────
log "Rotating backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \;
find "${BACKUP_DIR}" -maxdepth 1 -type f -mtime "+${RETENTION_DAYS}" -delete

# ─── Summary ────────────────────────────────────────────────
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
log "✅ Backup complete: ${BACKUP_PATH} (${BACKUP_SIZE})"
echo ""
echo "Backup location: ${BACKUP_PATH}"
echo "Total backups:   $(ls -d ${BACKUP_DIR}/*/ 2>/dev/null | wc -l)"
echo "Oldest:          $(ls -d ${BACKUP_DIR}/*/ 2>/dev/null | head -1 | xargs -I{} basename {})"
echo ""
echo "To restore:"
echo "  tar xzf ${BACKUP_PATH}/cloudflared.tar.gz -C /"
echo "  tar xzf ${BACKUP_PATH}/traefik.tar.gz -C /"
echo "  tar xzf ${BACKUP_PATH}/hermes.tar.gz -C /"