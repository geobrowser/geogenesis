#!/bin/bash

set -e
source .env
GEO_DB_URL=postgres://${GEO_DB_USER}:${GEO_DB_PASSWORD}@localhost:5432/${GEO_DB_NAME}

echo "Running SQL scripts..."
psql $GEO_DB_URL < ./packages/substream/sink/sql/init-public.sql
psql $GEO_DB_URL < ./packages/substream/sink/sql/migrations/01-collections.sql
psql $GEO_DB_URL < ./packages/substream/sink/sql/init-indexes.sql
psql $GEO_DB_URL < ./packages/substream/sink/sql/init-cache.sql
psql $GEO_DB_URL < ./packages/substream/sink/sql/init-functions.sql
echo "SQL scripts executed successfully."
