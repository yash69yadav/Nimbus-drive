#!/bin/bash
# scripts/backup-db.sh - Backup MongoDB data

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nimbus_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo "Starting MongoDB backup..."

# Create backup using mongodump
docker compose exec -T mongo mongodump \
  -u nimbus \
  -p nimbus-dev-password \
  --authenticationDatabase admin \
  --out "$BACKUP_FILE"

# Compress backup
tar -czf "$BACKUP_FILE.tar.gz" -C "$BACKUP_DIR" "nimbus_$TIMESTAMP"
rm -rf "$BACKUP_FILE"

echo "✓ Backup complete: $BACKUP_FILE.tar.gz"
echo "  Size: $(du -h "$BACKUP_FILE.tar.gz" | cut -f1)"

# Keep only last 7 days
echo "Cleaning old backups (>7 days)..."
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +7 -delete

echo "Done."
