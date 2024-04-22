#!/bin/bash

source .env

echo "Running migrations..."
psql $DATABASE_URL < sink/sql/migrations/01-collections.sql
echo "Migrations executed successfully."
