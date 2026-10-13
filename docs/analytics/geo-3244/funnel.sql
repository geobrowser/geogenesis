-- Debate requests by surface and path: shown → pressed → sent → accepted → held.
-- Shown/pressed exist only for the claim page's button (opportunity_id); the other surfaces start at sent.
WITH clean AS (
  SELECT event_time, event_name, properties_json
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_time >= now() - INTERVAL 30 DAY
    AND event_name IN ('action_opportunity', 'action_attempted', 'action_completed')
    AND JSONExtractString(properties_json, 'action_kind') IN ('start_debate', 'join_debate')
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
    )
), opportunities AS (
  SELECT JSONExtractString(properties_json, 'opportunity_id') AS opportunity_id,
         any(JSONExtractString(properties_json, 'request_surface')) AS surface
  FROM clean WHERE event_name = 'action_opportunity'
  GROUP BY opportunity_id
), attempts AS (
  SELECT DISTINCT JSONExtractString(properties_json, 'opportunity_id') AS opportunity_id
  FROM clean WHERE event_name = 'action_attempted'
), sent AS (
  SELECT lower(replaceAll(JSONExtractString(properties_json, 'request_id'), '-', '')) AS request_id,
         any(JSONExtractString(properties_json, 'request_surface')) AS surface,
         any(JSONExtractString(properties_json, 'request_path')) AS path,
         any(JSONExtractString(properties_json, 'origin_surface')) AS origin,
         min(event_time) AS sent_at
  FROM clean
  WHERE event_name = 'action_completed'
    AND JSONExtractString(properties_json, 'action_kind') = 'start_debate'
    AND JSONExtractString(properties_json, 'outcome') = 'succeeded'
    AND JSONExtractString(properties_json, 'request_id') != ''
  GROUP BY request_id
), accepted AS (
  SELECT lower(replaceAll(JSONExtractString(properties_json, 'target_id'), '-', '')) AS request_id,
         min(event_time) AS accepted_at,
         any(lower(replaceAll(JSONExtractString(properties_json, 'debate_id'), '-', ''))) AS debate_id
  FROM clean
  WHERE event_name = 'action_completed'
    AND JSONExtractString(properties_json, 'action_kind') = 'join_debate'
    AND JSONExtractString(properties_json, 'outcome') = 'succeeded'
  GROUP BY request_id
), published AS (
  SELECT DISTINCT lower(replaceAll(debate_id, '-', '')) AS debate_id
  FROM analytics.debate_timing_debates
  WHERE generation = (
    SELECT generation FROM analytics.debate_timing_generations
    ORDER BY published_at DESC, generation DESC LIMIT 1
  )
), offers AS (
  SELECT o.surface AS surface, count() AS shown, countIf(a.opportunity_id != '') AS pressed
  FROM opportunities o LEFT JOIN attempts a ON a.opportunity_id = o.opportunity_id
  GROUP BY o.surface
), requests AS (
  SELECT s.surface AS surface, s.path AS path,
         count() AS sent,
         countIf(a.request_id != '') AS accepted,
         countIf(a.debate_id != '' AND a.debate_id IN (SELECT debate_id FROM published)) AS held,
         quantileIf(0.5)(dateDiff('second', s.sent_at, a.accepted_at), a.request_id != '') AS median_seconds_to_accept
  FROM sent s
  LEFT JOIN accepted a ON a.request_id = s.request_id
  GROUP BY s.surface, s.path
)
-- Offers are per surface, not per path: a press can still go either way in the popup.
SELECT r.surface, r.path, o.shown, o.pressed, r.sent, r.accepted, r.held, r.median_seconds_to_accept
FROM requests r
LEFT JOIN offers o ON o.surface = r.surface
ORDER BY r.sent DESC;
