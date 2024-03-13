#!/bin/bash

source .env

echo "Running SQL scripts..."
psql $DATABASE_URL < sink/sql/init-indexes.sql
echo "Indexes successfully added."