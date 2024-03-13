#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/clear-public-tables.sql
echo "SQL scripts executed successfully."

