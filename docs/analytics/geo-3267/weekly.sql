-- ClickHouse 26.3+ (materialized CTEs). Cache shared inputs once per query;
-- retain only the report fields instead of the full properties JSON.
-- UTC, inclusive start_date / exclusive end_date. Retained handoff history is needed:
-- an old link can acquire a visitor this week. No arrival-week / share-week ratios.
WITH
  toDateTime({start_date:Date}, 'UTC') AS report_start,
  toDateTime({end_date:Date}, 'UTC') AS report_end,
excluded_accounts AS (
  SELECT coalesce(nullIf(privy_user_id, ''), user_id, '') AS account
  FROM analytics.privy_account_labels FINAL
  WHERE active AND exclude_from_metrics AND account != ''
), raw AS MATERIALIZED (
  SELECT event_time, event_name,
    coalesce(nullIf(privy_user_id, ''), user_id, '') AS account,
    coalesce(anonymous_id, '') AS visitor, coalesce(session_id, '') AS session,
    JSONExtractString(properties_json, 'auth_attempt_id') AS attempt,
    JSONExtractString(properties_json, 'share_id') AS outbound_share,
    JSONExtractString(properties_json, 'action_anonymous_id') AS action_anonymous_id,
    JSONExtractString(properties_json, 'action_session_id') AS action_session_id,
    JSONExtractString(properties_json, 'handoff_kind') AS handoff_kind,
    JSONExtractString(properties_json, 'landing_page_url') AS landing_page_url,
    JSONExtractString(properties_json, 'method') AS method,
    JSONExtractString(properties_json, 'share_content_id') AS share_content_id,
    JSONExtractString(properties_json, 'share_content_type') AS share_content_type,
    JSONExtractString(properties_json, 'sharer_profile_space_id') AS sharer_profile_space_id,
    JSONExtractString(properties_json, 'sharer_role') AS sharer_role,
    JSONExtractString(properties_json, 'signup_anonymous_id') AS signup_anonymous_id,
    JSONExtractString(properties_json, 'signup_context_source') AS signup_context_source,
    JSONExtractString(properties_json, 'signup_session_id') AS signup_session_id,
    JSONExtractString(properties_json, 'utm_campaign') AS utm_campaign,
    JSONExtractString(properties_json, 'utm_content') AS utm_content,
    JSONExtractString(properties_json, 'utm_medium') AS utm_medium,
    JSONExtractString(properties_json, 'utm_source') AS utm_source,
    JSONExtractBool(properties_json, 'is_internal') OR JSONExtractBool(properties_json, 'is_test')
      OR JSONExtractBool(properties_json, 'is_automated') OR account IN (SELECT account FROM excluded_accounts) AS excluded
  FROM analytics.events_canonical
  -- Identity evidence may arrive after the reporting week. Window the metrics below,
  -- rather than hiding later sign-in/restore evidence from historical exclusions.
  WHERE app = 'genesis' AND environment = 'production'
    AND event_name IN ('page_viewed', 'share_link_handoff', 'auth_attempt_started', 'auth_identity_linked', 'signed_up', 'signed_in', 'session_restored')
), excluded_attempts AS (
  SELECT DISTINCT attempt FROM raw WHERE excluded AND attempt != ''
), excluded_sessions AS (
  -- A team identity can arrive after the landing or in a different completion tab.
  -- Apply it to both the observed session and the stored initiating auth session.
  SELECT DISTINCT pair.1 AS visitor, pair.2 AS session
  FROM (
    SELECT arrayJoin([
      tuple(visitor, session),
      tuple(action_anonymous_id, action_session_id),
      if(signup_context_source = 'auth_start',
        tuple(signup_anonymous_id, signup_session_id), tuple('', ''))
    ]) AS pair
    FROM raw WHERE excluded OR (attempt != '' AND attempt IN (SELECT attempt FROM excluded_attempts))
  )
  WHERE pair.1 != '' AND pair.2 != ''
), excluded_shares AS (
  SELECT DISTINCT outbound_share FROM raw
  WHERE outbound_share != '' AND (excluded
    OR (visitor, session) IN (SELECT visitor, session FROM excluded_sessions)
    OR (attempt != '' AND attempt IN (SELECT attempt FROM excluded_attempts)))
), events AS MATERIALIZED (
  SELECT * FROM raw
  WHERE NOT excluded AND (visitor, session) NOT IN (SELECT visitor, session FROM excluded_sessions)
    AND (attempt = '' OR attempt NOT IN (SELECT attempt FROM excluded_attempts))
), auth_evidence AS MATERIALIZED (
  SELECT *, arrayDistinct(arrayFilter(pair -> pair.1 != '' AND pair.2 != '', [
    tuple(action_anonymous_id, action_session_id),
    if(signup_context_source = 'auth_start',
      tuple(signup_anonymous_id, signup_session_id), tuple('', ''))
  ])) AS initiating_pairs
  FROM events
  WHERE event_name IN ('auth_attempt_started', 'auth_identity_linked', 'signed_up', 'signed_in', 'session_restored')
), auth_links AS MATERIALIZED (
  SELECT attempt, min(event_time) AS auth_started,
    arrayDistinct(arrayFlatten(groupArray(initiating_pairs))) AS source_pairs,
    source_pairs[1] AS initiating, length(source_pairs) AS pairs,
    groupUniqArrayIf(account, account != '' AND event_name != 'auth_attempt_started') AS identified_accounts
  FROM auth_evidence WHERE attempt != ''
  GROUP BY attempt
), handoffs AS MATERIALIZED (
  SELECT outbound_share AS share_id, min(event_time) AS handed_off,
    argMin(tuple(method, share_content_type,
      share_content_id, sharer_profile_space_id,
      sharer_role, visitor, account, session), event_time) AS metadata
  FROM events
  WHERE event_name = 'share_link_handoff' AND match(outbound_share, '^[a-f0-9]{32}$')
    AND outbound_share NOT IN (SELECT outbound_share FROM excluded_shares)
    AND method IN ('copy_link', 'x', 'linkedin', 'reddit', 'native_share')
    AND handoff_kind IN ('copied', 'composer_requested')
    AND share_content_type IN ('debate', 'lobby', 'availability')
    AND match(share_content_id, '^[a-f0-9]{32}$')
  GROUP BY share_id
), session_accounts AS MATERIALIZED (
  SELECT visitor, session, groupUniqArray(account) AS accounts
  FROM (
    SELECT visitor, session, account FROM events WHERE account != ''
    UNION ALL
    -- Recover only one explicit source pair and one authenticated account per attempt.
    SELECT initiating.1 AS visitor, initiating.2 AS session, identified_accounts[1] AS account
    FROM auth_links WHERE pairs = 1 AND length(identified_accounts) = 1
    UNION ALL
    -- Signup/restoration snapshots can survive without a delivered attempt event.
    SELECT initiating_pairs[1].1 AS visitor, initiating_pairs[1].2 AS session, account
    FROM auth_evidence WHERE attempt = '' AND account != '' AND event_name != 'auth_attempt_started'
      AND length(initiating_pairs) = 1
  )
  WHERE visitor != '' AND session != '' GROUP BY visitor, session
), session_landings AS (
  SELECT visitor, session, min(event_time) AS landed,
    -- These fields are fixed for the session even after navigation removes the URL tags.
    argMin(tuple(landing_page_url, utm_source,
      utm_medium, utm_campaign,
      utm_content), event_time) AS landing
  FROM events WHERE visitor != '' AND session != ''
  GROUP BY visitor, session
), parsed_landings AS (
  SELECT l.*, a.accounts,
    if(landing.1 != '', extractURLParameter(landing.1, 'utm_source'), landing.2) AS channel,
    if(landing.1 != '', extractURLParameter(landing.1, 'utm_medium'), landing.3) AS medium,
    if(landing.1 != '', extractURLParameter(landing.1, 'utm_campaign'), landing.4) AS campaign,
    decodeURLComponent(if(landing.1 != '', extractURLParameter(landing.1, 'utm_content'), landing.5)) AS content,
    splitByChar(':', content) AS parts,
    parts[2] AS content_type, parts[3] AS content_id, parts[4] AS share_id
  FROM session_landings l LEFT JOIN session_accounts a ON l.visitor = a.visitor AND l.session = a.session
), visits AS MATERIALIZED (
  SELECT l.visitor AS visitor, l.session AS session, l.landed AS landed, l.channel AS channel,
    h.share_id != '' AND h.metadata.1 = l.channel
      AND h.metadata.2 = l.content_type AND h.metadata.3 = l.content_id AS matched,
    -- Preserve the handoff's known account; infer an anonymous sender only from one session account.
    if(h.metadata.7 != '', h.metadata.7, if(length(s.accounts) = 1, s.accounts[1], '')) AS sender_account,
    if(matched AND match(h.metadata.4, '^[a-f0-9]{32}$'), h.metadata.4, '') AS sharer_profile,
    if(matched AND h.metadata.5 IN ('debater', 'other', 'anonymous', 'unknown'), h.metadata.5, 'unknown') AS sharer_role
  FROM parsed_landings l LEFT JOIN handoffs h ON l.share_id = h.share_id
    LEFT JOIN session_accounts s ON h.metadata.6 = s.visitor AND h.metadata.8 = s.session
  WHERE medium = 'share' AND campaign = 'geo_share' AND channel IN ('copy_link', 'x', 'linkedin', 'reddit', 'native_share')
    AND length(content) <= 100 AND length(parts) = 4 AND parts[1] = 'v1'
    AND content_type IN ('debate', 'lobby', 'availability')
    AND match(content_id, '^[a-f0-9]{32}$') AND match(l.share_id, '^[a-f0-9]{32}$')
    AND l.share_id NOT IN (SELECT outbound_share FROM excluded_shares)
    AND NOT (matched AND ((h.metadata.6 != '' AND h.metadata.6 = l.visitor)
      OR (sender_account != '' AND has(l.accounts, sender_account))))
), accounts AS (
  SELECT account, min(event_time) AS created,
    argMin(tuple(attempt, initiating_pairs), event_time) AS signup
  FROM auth_evidence WHERE event_name = 'signed_up' AND account != '' GROUP BY account
), account_links AS (
  SELECT a.*, b.auth_started,
    multiIf(b.pairs > 1 OR length(b.identified_accounts) > 1, tuple('', ''),
      b.pairs = 1, b.initiating,
      length(a.signup.2) = 1, a.signup.2[1], tuple('', '')) AS initiating
  FROM accounts a LEFT JOIN auth_links b ON a.signup.1 = b.attempt
), acquired_accounts AS (
  SELECT a.account, a.created, v.channel, v.sharer_profile, v.sharer_role
  FROM account_links a INNER JOIN visits v ON a.initiating.1 = v.visitor AND a.initiating.2 = v.session
  WHERE a.created >= report_start AND a.created < report_end AND v.landed <= a.created
    AND (a.auth_started = toDateTime(0) OR (a.auth_started >= v.landed AND a.created <= a.auth_started + INTERVAL 24 HOUR))
), metrics AS (
  SELECT toDate(toStartOfWeek(landed, 1, 'UTC')) AS week, channel, sharer_role, sharer_profile,
    'visit' AS metric, visitor, toUInt8(matched) AS matched
  FROM visits WHERE landed >= report_start AND landed < report_end
  UNION ALL
  SELECT toDate(toStartOfWeek(created, 1, 'UTC')), channel, sharer_role, sharer_profile, 'account', '', toUInt8(0)
  FROM acquired_accounts
  UNION ALL
  SELECT toDate(toStartOfWeek(handed_off, 1, 'UTC')), metadata.1,
    if(metadata.5 IN ('debater', 'other', 'anonymous', 'unknown'), metadata.5, 'unknown'),
    if(match(metadata.4, '^[a-f0-9]{32}$'), metadata.4, ''), 'handoff', '', toUInt8(0)
  FROM handoffs WHERE handed_off >= report_start AND handed_off < report_end
)
SELECT week, channel, if(grouping(sharer_role) = 1, 'channel', 'sharer') AS breakdown,
  sharer_role, sharer_profile AS sharer_profile_space_id,
  countIf(metric = 'visit') AS visits,
  uniqExactIf(visitor, metric = 'visit') AS visitors,
  countIf(metric = 'account') AS new_accounts,
  countIf(metric = 'handoff') AS link_handoffs,
  countIf(metric = 'visit' AND matched = 1) AS matched_visits,
  countIf(metric = 'visit' AND matched = 0) AS unmatched_visits
FROM metrics
GROUP BY GROUPING SETS ((week, channel), (week, channel, sharer_role, sharer_profile))
ORDER BY week, channel, breakdown, sharer_role, sharer_profile_space_id
SETTINGS join_use_nulls = 0, enable_materialized_cte = 1;
