#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/clearCacheTables.sql
echo "SQL scripts executed successfully."

