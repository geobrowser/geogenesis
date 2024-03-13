#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/initPublic.sql
psql $DATABASE_URL < sink/sql/initIndexes.sql
psql $DATABASE_URL < sink/sql/initCache.sql
psql $DATABASE_URL < sink/sql/initFunctions.sql
echo "SQL scripts executed successfully."

