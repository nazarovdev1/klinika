#!/bin/sh
# Restore a backup into a SCRATCH database and run sanity checks (restore drill).
# Usage: restore.sh /backups/shifo-20300101T020000Z.dump [target_db]
# Env: PGHOST PGUSER PGPASSWORD. Never point target_db at the production database.
set -eu

FILE="${1:?usage: restore.sh <dump-file> [target_db]}"
TARGET="${2:-shifo_restore_check}"

dropdb --if-exists "$TARGET"
createdb "$TARGET"
pg_restore --no-owner --exit-on-error --dbname="$TARGET" "$FILE"

echo "-- sanity checks on $TARGET"
psql --dbname="$TARGET" --no-align --tuples-only -c "SELECT 'clinics=' || count(*) FROM \"Clinic\""
psql --dbname="$TARGET" --no-align --tuples-only -c "SELECT 'patients=' || count(*) FROM \"Patient\""
psql --dbname="$TARGET" --no-align --tuples-only -c "SELECT 'migrations=' || count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL"
echo "restore ok -> $TARGET (drop it when done: dropdb $TARGET)"
