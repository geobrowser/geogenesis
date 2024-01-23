#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/clearPublicTables.sql
echo "SQL scripts executed successfully."

