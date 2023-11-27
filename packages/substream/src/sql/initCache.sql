-- DROP SCHEMA IF EXISTS cache CASCADE;
CREATE SCHEMA IF NOT EXISTS cache;

-- 
-- Cache Setup
--
CREATE TABLE IF NOT EXISTS cache.entries (
    id serial PRIMARY KEY,
    block_number integer NOT NULL,
    cursor text NOT NULL,
    timestamp integer NOT NULL,
    data jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_cached_entries ON cache.entries (cursor);

CREATE TABLE IF NOT EXISTS cache.roles (
    id serial PRIMARY KEY,
    role text NOT NULL,
    account text NOT NULL,
    sender text NOT NULL,
    space text NOT NULL,
    type text NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    cursor text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_cached_roles ON cache.roles (
    role,
    account,
    sender,
    space,
    type,
    created_at_block,
    cursor
);