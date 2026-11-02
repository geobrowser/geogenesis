-- Read-only. Supply --param_deployed_at='YYYY-MM-DD HH:MM:SS' in UTC.
-- Run only after deployed_at + INTERVAL 1 DAY; retain the output on GEO-3094.
WITH {deployed_at:DateTime('UTC')} AS deployed_at,
counts AS (
    SELECT if(event_time < deployed_at, 'before', 'after') AS window,
           event_name,
           count() AS events,
           uniqExact(nullIf(JSONExtractString(properties_json, 'page_view_id'), '')) AS page_views,
           countIf(arrayExists(field -> JSONExtractString(properties_json, field) = '',
               arrayConcat(
                   ['component', 'page_path', 'page_type', 'page_view_id', 'target_id', 'target_type', 'action_context_version'],
                   if(event_name = 'action_completed', ['operation_id', 'action_kind', 'outcome'], ['presentation_instance_id'])
               ))) AS missing_required
    FROM analytics.events_canonical
    WHERE app = 'genesis' AND environment = 'production'
      AND event_name IN ('action_completed', 'component_impression')
      AND event_time >= deployed_at - INTERVAL 1 DAY
      AND event_time < deployed_at + INTERVAL 1 DAY
      AND NOT JSONExtractBool(properties_json, 'is_internal')
      AND NOT JSONExtractBool(properties_json, 'is_automated')
      AND coalesce(privy_user_id, user_id, '') NOT IN (
          SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
          WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
      )
    GROUP BY window, event_name
)
SELECT windows.window, events.event_name,
       coalesce(counts.events, 0) AS events,
       coalesce(counts.page_views, 0) AS page_views,
       coalesce(counts.missing_required, 0) AS missing_required
FROM (SELECT arrayJoin(['before', 'after']) AS window) AS windows
CROSS JOIN (SELECT arrayJoin(['action_completed', 'component_impression']) AS event_name) AS events
LEFT JOIN counts ON counts.window = windows.window AND counts.event_name = events.event_name
ORDER BY events.event_name, windows.window;
