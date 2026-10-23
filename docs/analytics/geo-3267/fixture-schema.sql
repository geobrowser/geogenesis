-- Query-column projection of the warehouse contract at geobrowser/analytics@cca4c13d988e6a410cc9393fdb44c22bfbdfd03f.
-- events_canonical exposes events_raw columns (001_events.sql, 046_canonical_event_store.sql).
-- The omitted columns are not read by weekly.sql; MergeTree replaces the production canonical view for deterministic source-scan checks.
CREATE DATABASE analytics;
CREATE TABLE analytics.events_canonical (
  event_time DateTime64(3, 'UTC'),
  event_name LowCardinality(String),
  anonymous_id Nullable(String),
  session_id Nullable(String),
  privy_user_id Nullable(String),
  properties_json String,
  user_id Nullable(String) DEFAULT NULL,
  app LowCardinality(String) DEFAULT 'genesis',
  environment LowCardinality(String) DEFAULT 'production'
) ENGINE = MergeTree ORDER BY event_time;

-- Full label-table definition from 012_privy_account_labels.sql, including its version semantics.
CREATE TABLE analytics.privy_account_labels (
  source_account_id String,
  label_id String,
  privy_user_id Nullable(String),
  user_id Nullable(String),
  email Nullable(String),
  email_hash Nullable(String),
  account_id_hash Nullable(String),
  wallet_address_hash Nullable(String),
  label LowCardinality(String),
  exclude_from_metrics Bool DEFAULT true,
  active Bool DEFAULT true,
  reason String,
  created_by LowCardinality(String),
  created_at DateTime64(3, 'UTC'),
  updated_at DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (source_account_id, label_id);
SYSTEM STOP MERGES analytics.privy_account_labels;
