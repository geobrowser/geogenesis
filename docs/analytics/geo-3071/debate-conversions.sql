-- Origin Sources may include non-debates. Join these candidate IDs to graph types
-- before calling the origin-only rows debates (same enrichment as GEO-3073).
WITH accounts AS (
  SELECT coalesce(privy_user_id, user_id, '') AS account_id,
    min(event_time) AS created, argMin(properties_json, event_time) AS props
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production' AND event_name = 'signed_up'
    AND event_time >= now() - INTERVAL 30 DAY
    AND JSONExtractString(properties_json, 'auth_attribution_version') = 'v1'
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_test')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics
    )
  GROUP BY account_id
), origins AS (
  SELECT account_id, created, arrayJoin(arrayDistinct(arrayFilter(id -> id != '', arrayConcat(
    JSONExtract(props, 'origin_entity_ids', 'Array(String)'),
    [JSONExtractString(props, 'debate_id')],
    if(JSONExtractString(props, 'target_type') = 'debate', [JSONExtractString(props, 'target_id')], [])
  )))) AS source_id
  FROM accounts
)
SELECT toDate(created) AS day, lower(replaceAll(source_id, '-', '')) AS source_entity_id,
  uniqExact(account_id) AS new_accounts
FROM origins GROUP BY day, source_entity_id ORDER BY day, new_accounts DESC;
