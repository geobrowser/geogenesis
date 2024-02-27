#!/bin/bash

source .env

echo "Running SQL scripts to clear all tables..."
psql $DATABASE_URL < sink/sql/clearCacheTables.sql
psql $DATABASE_URL < sink/sql/clearPublicTables.sql
echo "SQL scripts executed successfully."

