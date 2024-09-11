#!/bin/bash
## Run if starting sink without docker (docker image does migrations automatically)

set -e
source .env
GEO_DB_URL=postgres://${GEO_DB_USER}:${GEO_DB_PASSWORD}@localhost:${GEO_DB_PORT}/${GEO_DB_NAME}

if ! command -v sqlx &> /dev/null
then
    echo "sqlx is not installed. Please install sqlx before running migrations using:"
    echo "    cargo install sqlx-cli --no-default-features --features native-tls,postgres"
    exit 1
fi

echo "Running SQL migrations..."
sqlx migrate run --source ./packages/substream/migrations -D ${GEO_DB_URL}
echo "SQL migrations executed successfully."
