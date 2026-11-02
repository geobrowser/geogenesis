-- Schedule daily in the warehouse's existing scheduler; alert when pct_missing > 1.
-- This checks emitted actions. The source contract test separately guards omitted context.
SELECT toDate(event_time) AS day, count() AS actions,
       countIf(JSONExtractString(properties_json, 'component') = ''
         OR JSONExtractString(properties_json, 'page_type') = ''
         OR coalesce(page_path, '') = ''
         OR JSONExtractString(properties_json, 'target_id') = '') AS missing_context,
       round(100 * missing_context / actions, 2) AS pct_missing,
       pct_missing > 1 AS alert
FROM analytics.events_canonical
WHERE app = 'genesis' AND environment = 'production'
  AND event_name = 'action_completed' AND event_time >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day;
