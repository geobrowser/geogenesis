-- Independent from analytics.input_generations: never advances the event pipeline's generation.
CREATE TABLE IF NOT EXISTS analytics.debate_timing_generations (
  generation UUID,
  published_at DateTime64(3, 'UTC'),
  debate_count UInt64,
  turn_count UInt64,
  claim_count UInt64
) ENGINE = MergeTree ORDER BY (published_at, generation);

CREATE TABLE IF NOT EXISTS analytics.debate_timing_debates (
  generation UUID,
  debate_id String,
  status LowCardinality(String),
  turn_count UInt32,
  claim_count UInt32,
  unknown_claim_count UInt32
) ENGINE = MergeTree ORDER BY (generation, debate_id);

CREATE TABLE IF NOT EXISTS analytics.debate_timing_turns (
  generation UUID,
  debate_id String,
  turn_index UInt32,
  start_ms UInt64,
  end_ms UInt64,
  round LowCardinality(String),
  speaker_space_id String
) ENGINE = MergeTree ORDER BY (generation, debate_id, turn_index);

CREATE TABLE IF NOT EXISTS analytics.debate_timing_claims (
  generation UUID,
  debate_id String,
  publication_space_id String,
  claim_id String,
  block_id String,
  relation_entity_id String,
  start_ms Nullable(UInt64),
  end_ms Nullable(UInt64),
  timing_source LowCardinality(String),
  confidence Float64,
  turn_index Nullable(UInt32),
  round LowCardinality(String),
  speaker_space_id String
) ENGINE = MergeTree ORDER BY (generation, debate_id, publication_space_id, claim_id, block_id);

CREATE VIEW IF NOT EXISTS analytics.debate_turns AS
SELECT * EXCEPT generation FROM analytics.debate_timing_turns
WHERE generation = (SELECT generation FROM analytics.debate_timing_generations ORDER BY published_at DESC, generation DESC LIMIT 1);

CREATE VIEW IF NOT EXISTS analytics.claim_moments AS
SELECT * EXCEPT generation FROM analytics.debate_timing_claims
WHERE generation = (SELECT generation FROM analytics.debate_timing_generations ORDER BY published_at DESC, generation DESC LIMIT 1);
