-- UTC, inclusive start_date / exclusive end_date. Retained handoff history is needed:
-- an old link can acquire a visitor this week. No arrival-week / share-week ratios.
WITH
  toDateTime({start_date:Date}, 'UTC') AS report_start,
  toDateTime({end_date:Date}, 'UTC') AS report_end,
excluded_accounts AS (
  SELECT coalesce(nullIf(privy_user_id, ''), user_id, '') AS account
  FROM analytics.privy_account_labels
  WHERE active AND exclude_from_metrics AND account != ''
), raw AS (
  SELECT event_time, event_name, properties_json AS props,
    coalesce(nullIf(privy_user_id, ''), user_id, '') AS account,
    coalesce(anonymous_id, '') AS visitor, coalesce(session_id, '') AS session,
    JSONExtractString(props, 'auth_attempt_id') AS attempt,
    JSONExtractString(props, 'share_id') AS outbound_share,
    JSONExtractBool(props, 'is_internal') OR JSONExtractBool(props, 'is_test')
      OR JSONExtractBool(props, 'is_automated') OR account IN (SELECT account FROM excluded_accounts) AS excluded
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
      tuple(JSONExtractString(props, 'action_anonymous_id'), JSONExtractString(props, 'action_session_id')),
      if(JSONExtractString(props, 'signup_context_source') = 'auth_start',
        tuple(JSONExtractString(props, 'signup_anonymous_id'), JSONExtractString(props, 'signup_session_id')), tuple('', ''))
    ]) AS pair
    FROM raw WHERE excluded OR (attempt != '' AND attempt IN (SELECT attempt FROM excluded_attempts))
  )
  WHERE pair.1 != '' AND pair.2 != ''
), excluded_shares AS (
  SELECT DISTINCT outbound_share FROM raw
  WHERE outbound_share != '' AND (excluded
    OR (visitor, session) IN (SELECT visitor, session FROM excluded_sessions)
    OR (attempt != '' AND attempt IN (SELECT attempt FROM excluded_attempts)))
), events AS (
  SELECT * FROM raw
  WHERE NOT excluded AND (visitor, session) NOT IN (SELECT visitor, session FROM excluded_sessions)
    AND (attempt = '' OR attempt NOT IN (SELECT attempt FROM excluded_attempts))
), auth_evidence AS (
  SELECT *, arrayFilter(pair -> pair.1 != '' AND pair.2 != '', [
    tuple(JSONExtractString(props, 'action_anonymous_id'), JSONExtractString(props, 'action_session_id')),
    if(JSONExtractString(props, 'signup_context_source') = 'auth_start',
      tuple(JSONExtractString(props, 'signup_anonymous_id'), JSONExtractString(props, 'signup_session_id')), tuple('', ''))
  ]) AS initiating_pairs
  FROM events
  WHERE event_name IN ('auth_attempt_started', 'auth_identity_linked', 'signed_up', 'signed_in', 'session_restored')
), auth_links AS (
  SELECT attempt, min(event_time) AS auth_started,
    arrayDistinct(arrayFlatten(groupArray(initiating_pairs))) AS source_pairs,
    source_pairs[1] AS initiating, length(source_pairs) AS pairs,
    groupUniqArrayIf(account, account != '' AND event_name != 'auth_attempt_started') AS identified_accounts
  FROM auth_evidence WHERE attempt != ''
  GROUP BY attempt
), handoffs AS (
  SELECT outbound_share AS share_id, min(event_time) AS handed_off,
    argMin(tuple(JSONExtractString(props, 'method'), JSONExtractString(props, 'share_content_type'),
      JSONExtractString(props, 'share_content_id'), JSONExtractString(props, 'sharer_profile_space_id'),
      JSONExtractString(props, 'sharer_role'), visitor, account, session), event_time) AS metadata
  FROM events
  WHERE event_name = 'share_link_handoff' AND match(outbound_share, '^[a-f0-9]{32}$')
    AND outbound_share NOT IN (SELECT outbound_share FROM excluded_shares)
    AND JSONExtractString(props, 'method') IN ('copy_link', 'x', 'linkedin', 'reddit')
    AND JSONExtractString(props, 'handoff_kind') IN ('copied', 'composer_requested')
    AND JSONExtractString(props, 'share_content_type') IN ('debate', 'lobby', 'availability')
    AND match(JSONExtractString(props, 'share_content_id'), '^[a-f0-9]{32}$')
  GROUP BY share_id
), session_accounts AS (
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
      AND length(arrayDistinct(initiating_pairs)) = 1
  )
  WHERE visitor != '' AND session != '' GROUP BY visitor, session
), session_landings AS (
  SELECT visitor, session, min(event_time) AS landed,
    -- These fields are fixed for the session even after navigation removes the URL tags.
    argMin(tuple(JSONExtractString(props, 'landing_page_url'), JSONExtractString(props, 'utm_source'),
      JSONExtractString(props, 'utm_medium'), JSONExtractString(props, 'utm_campaign'),
      JSONExtractString(props, 'utm_content')), event_time) AS landing
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
), visits AS (
  SELECT l.visitor AS visitor, l.session AS session, l.landed AS landed, l.channel AS channel,
    h.share_id != '' AND h.metadata.1 = l.channel
      AND h.metadata.2 = l.content_type AND h.metadata.3 = l.content_id AS matched,
    -- Preserve the handoff's known account; infer an anonymous sender only from one session account.
    if(h.metadata.7 != '', h.metadata.7, if(length(s.accounts) = 1, s.accounts[1], '')) AS sender_account,
    if(matched AND match(h.metadata.4, '^[a-f0-9]{32}$'), h.metadata.4, '') AS sharer_profile,
    if(matched AND h.metadata.5 IN ('debater', 'other', 'anonymous', 'unknown'), h.metadata.5, 'unknown') AS sharer_role
  FROM parsed_landings l LEFT JOIN handoffs h ON l.share_id = h.share_id
    LEFT JOIN session_accounts s ON h.metadata.6 = s.visitor AND h.metadata.8 = s.session
  WHERE medium = 'share' AND campaign = 'geo_share' AND channel IN ('copy_link', 'x', 'linkedin', 'reddit')
    AND length(content) <= 100 AND length(parts) = 4 AND parts[1] = 'v1'
    AND content_type IN ('debate', 'lobby', 'availability')
    AND match(content_id, '^[a-f0-9]{32}$') AND match(l.share_id, '^[a-f0-9]{32}$')
    AND l.share_id NOT IN (SELECT outbound_share FROM excluded_shares)
    AND NOT (matched AND ((h.metadata.6 != '' AND h.metadata.6 = l.visitor)
      OR (sender_account != '' AND has(l.accounts, sender_account))))
), accounts AS (
  SELECT account, min(event_time) AS created,
    argMin(tuple(attempt, JSONExtractString(props, 'signup_context_source'),
      JSONExtractString(props, 'signup_anonymous_id'), JSONExtractString(props, 'signup_session_id'),
      JSONExtractString(props, 'action_anonymous_id'), JSONExtractString(props, 'action_session_id')), event_time) AS signup
  FROM events WHERE event_name = 'signed_up' AND account != '' GROUP BY account
), account_links AS (
  SELECT a.*, b.auth_started,
    multiIf(b.pairs > 1 OR length(b.identified_accounts) > 1, tuple('', ''),
      b.pairs = 1, b.initiating,
      a.signup.5 != '' AND a.signup.6 != '', tuple(a.signup.5, a.signup.6),
      a.signup.2 = 'auth_start', tuple(a.signup.3, a.signup.4), tuple('', '')) AS initiating
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
SETTINGS join_use_nulls = 0;
