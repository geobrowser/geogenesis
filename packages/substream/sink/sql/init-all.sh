#!/bin/bash

set -e

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/init-public.sql
./sink/sql/init-migrations.sh
psql $DATABASE_URL < sink/sql/init-indexes.sql
psql $DATABASE_URL < sink/sql/init-cache.sql
psql $DATABASE_URL < sink/sql/init-functions.sql
echo "SQL scripts executed successfully."
