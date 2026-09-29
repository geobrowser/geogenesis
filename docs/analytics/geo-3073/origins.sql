-- Includes every source, rather than arbitrarily picking the first source of a
-- reused claim. Sources may also be articles: resolve source_id against graph
-- entity types when restricting this report to debates only.
SELECT toDate(event_time) AS day, source_id,
       uniqExact(JSONExtractString(properties_json, 'operation_id')) AS actions
FROM analytics.events_canonical
ARRAY JOIN arrayDistinct(arrayFilter(id -> id != '', arrayConcat(
  JSONExtract(properties_json, 'origin_entity_ids', 'Array(String)'),
  [JSONExtractString(properties_json, 'debate_id')],
  if(JSONExtractString(properties_json, 'target_type') = 'debate',
     [JSONExtractString(properties_json, 'target_id')], [])
))) AS source_id
WHERE app = 'genesis' AND environment = 'production'
  AND event_name = 'action_completed' AND event_time >= now() - INTERVAL 30 DAY
  AND NOT JSONExtractBool(properties_json, 'is_internal')
  AND NOT JSONExtractBool(properties_json, 'is_automated')
  AND coalesce(privy_user_id, user_id, '') NOT IN (
    SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
    WHERE active AND exclude_from_metrics AND coalesce(privy_user_id, user_id, '') != ''
  )
GROUP BY day, source_id ORDER BY day, actions DESC;
