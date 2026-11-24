#!/bin/sh
# Nightly logical backup: pg_dump (custom format) -> compressed file, then prune old ones.
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_DIR (default /backups), KEEP_DAYS (default 14)
# Optional off-site copy: set BACKUP_RSYNC_TARGET (e.g. user@host:/path) -- rsync over ssh.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/${PGDATABASE:-shifo}-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --compress=9 --no-owner --file="$FILE.part"
mv "$FILE.part" "$FILE"
# Refuse to call an unreadable archive a backup.
pg_restore --list "$FILE" >/dev/null
echo "backup ok: $FILE ($(wc -c <"$FILE") bytes)"

find "$BACKUP_DIR" -name '*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete

if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  rsync -a --partial "$FILE" "$BACKUP_RSYNC_TARGET/"
fi
