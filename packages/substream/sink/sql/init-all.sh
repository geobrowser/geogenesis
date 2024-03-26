#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/init-public.sql
psql $DATABASE_URL < sink/sql/init-indexes.sql
psql $DATABASE_URL < sink/sql/init-cache.sql
psql $DATABASE_URL < sink/sql/init-functions.sql
echo "SQL scripts executed successfully."

