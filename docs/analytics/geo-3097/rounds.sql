-- Supply UTC DateTime parameters from/to (inclusive/exclusive).
-- Each operation counts once per debate/round/speaker/timing source. A reused
-- claim can contribute to several buckets; bucket totals are not globally additive.
WITH current_generation AS (
  SELECT generation FROM analytics.debate_timing_generations
  ORDER BY published_at DESC, generation DESC LIMIT 1
), moments AS (
  SELECT * FROM analytics.debate_timing_claims WHERE generation IN current_generation
), turns AS (
  SELECT * FROM analytics.debate_timing_turns WHERE generation IN current_generation
), actions AS (
  SELECT toDate(event_time, 'UTC') AS day,
         JSONExtractString(properties_json, 'operation_id') AS operation_id,
         JSONExtractString(properties_json, 'outcome') AS outcome,
         JSONExtractString(properties_json, 'component') AS component,
         JSONExtractString(properties_json, 'target_type') AS target_type,
         lower(replaceAll(JSONExtractString(properties_json, 'target_id'), '-', '')) AS target_id,
         lower(replaceAll(JSONExtractString(properties_json, 'debate_id'), '-', '')) AS debate_id,
         JSONExtractFloat(properties_json, 'playback_position_ms') AS position_ms,
         (JSONType(properties_json, 'playback_position_ms') IN ('Int64', 'UInt64', 'Float64')
          AND isFinite(position_ms) AND position_ms >= 0) AS has_position
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_name = 'action_completed'
    AND event_time >= {from:DateTime('UTC')} AND event_time < {to:DateTime('UTC')}
    AND JSONExtractString(properties_json, 'operation_id') != ''
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
    )
), claim_candidates AS (
  SELECT a.*, m.debate_id AS matched_debate_id, m.round AS matched_round,
         m.speaker_space_id, m.timing_source, m.confidence
  FROM actions a LEFT JOIN moments m ON a.target_id = m.claim_id AND a.debate_id = m.debate_id
  WHERE a.target_type = 'claim' AND a.component != 'debate_end_card' AND a.debate_id != ''
  UNION ALL
  SELECT a.*, m.debate_id AS matched_debate_id, m.round AS matched_round,
         m.speaker_space_id, m.timing_source, m.confidence
  FROM actions a LEFT JOIN moments m ON a.target_id = m.claim_id
  WHERE a.target_type = 'claim' AND a.component != 'debate_end_card' AND a.debate_id = ''
), claim_actions AS (
  SELECT day, operation_id, outcome,
         if(matched_debate_id != '', matched_debate_id, debate_id) AS debate_id,
         if(matched_round != '', matched_round, 'unknown') AS round,
         speaker_space_id,
         if(timing_source != '', timing_source, 'unknown') AS timing_source,
         confidence
  FROM claim_candidates
), playback_locations AS (
  SELECT *, if(debate_id != '', debate_id, if(target_type = 'debate', target_id, '')) AS source_debate_id
  FROM actions
  WHERE target_type != 'claim' AND component != 'debate_end_card'
), playback_actions AS (
  SELECT a.day, a.operation_id, a.outcome, a.source_debate_id AS debate_id,
         if(t.round != '' AND a.has_position AND a.position_ms < t.end_ms, t.round, 'unknown') AS located_round,
         if(located_round != 'unknown', t.speaker_space_id, '') AS speaker_space_id,
         if(located_round != 'unknown', 'playback', 'unknown') AS timing_source,
         toFloat64(0) AS confidence
  FROM playback_locations a ASOF LEFT JOIN turns t
    ON a.source_debate_id = t.debate_id AND a.position_ms >= toFloat64(t.start_ms)
  WHERE a.source_debate_id != ''
), end_cards AS (
  SELECT day, operation_id, outcome,
         if(debate_id != '', debate_id, if(target_type = 'debate', target_id, '')) AS debate_id,
         'end_card' AS round, '' AS speaker_space_id, 'end_card' AS timing_source, toFloat64(0) AS confidence
  FROM actions WHERE component = 'debate_end_card'
), located AS (
  SELECT * FROM claim_actions
  UNION ALL SELECT * FROM playback_actions
  UNION ALL SELECT * FROM end_cards
)
SELECT day, debate_id, round, speaker_space_id, timing_source, outcome,
       uniqExact(operation_id) AS actions,
       min(confidence) AS min_confidence, max(confidence) AS max_confidence
FROM located
-- Add e.g. timing_source = 'exact' or (timing_source = 'matched' AND confidence >= 0.4) here.
GROUP BY day, debate_id, round, speaker_space_id, timing_source, outcome
ORDER BY day, debate_id, round, speaker_space_id, timing_source, outcome
SETTINGS join_use_nulls = 0;
