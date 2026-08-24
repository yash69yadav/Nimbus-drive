#!/bin/bash
# scripts/restore-db.sh - Restore MongoDB from backup

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo "Example: $0 ./backups/nimbus_20240824_120000.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"
BACKUP_DIR=$(dirname "$BACKUP_FILE")
BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring MongoDB from backup..."
echo "  File: $BACKUP_FILE"
echo "  Backup: $BACKUP_NAME"

# Extract backup
tar -xzf "$BACKUP_FILE" -C "$BACKUP_DIR"

# Restore using mongorestore
docker compose exec -T mongo mongorestore \
  -u nimbus \
  -p nimbus-dev-password \
  --authenticationDatabase admin \
  --drop \
  "$BACKUP_DIR/$BACKUP_NAME"

# Cleanup
rm -rf "$BACKUP_DIR/$BACKUP_NAME"

echo "✓ Restore complete"
