-- The day is the impression's day, even if an action completes after midnight.
WITH events AS (
  SELECT event_time, event_name,
         JSONExtractString(properties_json, 'component') AS component,
         JSONExtractString(properties_json, 'presentation_instance_id') AS display_id
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_time >= now() - INTERVAL 30 DAY
    AND event_name IN ('component_impression', 'action_completed')
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
    )
), displays AS (
  SELECT display_id, component, minIf(event_time, event_name = 'component_impression') AS first_seen,
         countIf(event_name = 'component_impression') > 0 AS seen,
         countIf(event_name = 'action_completed') > 0 AS used
  FROM events WHERE display_id != '' GROUP BY display_id, component
)
SELECT toDate(first_seen) AS day, component, count() AS impressions,
       countIf(used) AS displays_with_action,
       round(countIf(used) / count(), 4) AS action_rate
FROM displays WHERE seen GROUP BY day, component ORDER BY day, component;
