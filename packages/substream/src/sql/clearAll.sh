#!/bin/bash

source .env

echo "Running SQL scripts to clear all tables..."
psql $DATABASE_URL < src/sql/clearCacheTables.sql
psql $DATABASE_URL < src/sql/clearPublicTables.sql
echo "SQL scripts executed successfully."

