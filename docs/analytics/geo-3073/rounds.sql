-- Warehouse integration query. Supply these two external/enrichment tables from
-- published graph claim timing and the debate timeline (no browser-derived rounds):
-- claim_moments(claim_id String, debate_id String, start_ms UInt64)
-- debate_turns(debate_id String, start_ms UInt64, end_ms UInt64,
--              round String, speaker_space_id String)
-- Use the published timecode, transcript match, or source turn start, in that
-- order, when building claim_moments. Include all sources of reused claims.
-- IDs in those tables must be lowercase UUIDs without dashes.
WITH actions AS (
  SELECT toDate(event_time) AS day,
         JSONExtractString(properties_json, 'operation_id') AS operation_id,
         JSONExtractString(properties_json, 'component') AS component,
         JSONExtractString(properties_json, 'target_type') AS target_type,
         lower(replaceAll(JSONExtractString(properties_json, 'target_id'), '-', '')) AS target_id,
         lower(replaceAll(JSONExtractString(properties_json, 'debate_id'), '-', '')) AS debate_id,
         JSONExtractUInt(properties_json, 'playback_position_ms') AS position_ms,
         JSONHas(properties_json, 'playback_position_ms') AS has_position
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_name = 'action_completed' AND event_time >= now() - INTERVAL 30 DAY
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
    )
), locations AS (
  SELECT a.day, a.operation_id, a.component, m.debate_id, m.start_ms AS position_ms
  FROM actions a INNER JOIN claim_moments m ON a.target_id = m.claim_id
  WHERE a.target_type = 'claim' AND a.component != 'debate_end_card'
    AND (a.debate_id = '' OR a.debate_id = m.debate_id)
  UNION ALL
  SELECT day, operation_id, component,
         if(debate_id != '', debate_id, target_id) AS debate_id, position_ms
  FROM actions
  WHERE (target_type != 'claim' AND has_position) OR component = 'debate_end_card'
)
SELECT l.day, l.debate_id,
       if(l.component = 'debate_end_card', 'end_card', t.round) AS round,
       if(l.component = 'debate_end_card', '', t.speaker_space_id) AS speaker_space_id,
       uniqExact(l.operation_id) AS actions
FROM locations l INNER JOIN debate_turns t ON l.debate_id = t.debate_id
WHERE l.component = 'debate_end_card' OR (l.position_ms >= t.start_ms AND l.position_ms < t.end_ms)
GROUP BY l.day, l.debate_id, round, speaker_space_id
ORDER BY l.day, l.debate_id, round, speaker_space_id;
