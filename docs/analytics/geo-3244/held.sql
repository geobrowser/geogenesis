-- Accepted claim requests and rematches, and whether the debate they started was published.
-- Approximate: a debate held but never published reads as not held (see README).
WITH accepted AS (
  SELECT toDate(event_time) AS day,
         JSONExtractString(properties_json, 'request_surface') AS surface,
         lower(replaceAll(JSONExtractString(properties_json, 'debate_id'), '-', '')) AS debate_id
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_name = 'action_completed' AND event_time >= now() - INTERVAL 30 DAY
    AND JSONExtractString(properties_json, 'action_kind') = 'join_debate'
    AND JSONExtractString(properties_json, 'outcome') = 'succeeded'
    AND JSONExtractString(properties_json, 'debate_id') != ''
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
), published AS (
  SELECT DISTINCT lower(replaceAll(debate_id, '-', '')) AS debate_id
  FROM analytics.debate_timing_debates
  WHERE generation = (
    SELECT generation FROM analytics.debate_timing_generations
    ORDER BY published_at DESC, generation DESC LIMIT 1
  )
)
SELECT day, surface, uniqExact(debate_id) AS accepted,
       uniqExactIf(debate_id, debate_id IN (SELECT debate_id FROM published)) AS held
FROM accepted GROUP BY day, surface ORDER BY day, surface;
