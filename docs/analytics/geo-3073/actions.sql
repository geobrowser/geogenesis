-- One row per day, component, page type and outcome. Legacy submit/index events
-- are diagnostics; only action_completed contributes to the action count.
SELECT toDate(event_time) AS day,
       JSONExtractString(properties_json, 'component') AS component,
       JSONExtractString(properties_json, 'page_type') AS page_type,
       JSONExtractString(properties_json, 'outcome') AS outcome,
       uniqExact(JSONExtractString(properties_json, 'operation_id')) AS actions
FROM analytics.events_canonical
WHERE app = 'genesis' AND environment = 'production'
  AND event_name = 'action_completed' AND event_time >= now() - INTERVAL 30 DAY
  AND NOT JSONExtractBool(properties_json, 'is_internal')
  AND NOT JSONExtractBool(properties_json, 'is_automated')
  AND coalesce(privy_user_id, user_id, '') NOT IN (
    SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
    WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
  )
GROUP BY day, component, page_type, outcome
ORDER BY day, component, page_type, outcome;
