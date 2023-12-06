#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < src/sql/initPublic.sql
psql $DATABASE_URL < src/sql/initIndexes.sql
psql $DATABASE_URL < src/sql/initCache.sql
psql $DATABASE_URL < src/sql/initFunctions.sql
echo "SQL scripts executed successfully."

