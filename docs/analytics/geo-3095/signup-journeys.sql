-- Parameters: signup_day (Date, UTC), source_account_id (String, Genesis Privy source).
-- One row per authoritative new account, including accounts with NO browser events.
-- Run after the 24h attribution window closes. History lookback is explicitly 30 days.
WITH
signups AS (
    SELECT privy_user_id AS account_id, min(event_time) AS signed_up_at
    FROM analytics.privy_signups
    WHERE source_account_id = {source_account_id:String}
      AND toDate(event_time, 'UTC') = {signup_day:Date}
      AND privy_user_id != ''
    GROUP BY account_id
),
links AS (
    SELECT coalesce(nullIf(privy_user_id, ''), user_id, '') AS account_id,
           count() AS app_completions,
           countIf(JSONExtractString(properties_json, 'signup_anonymous_id') != ''
               AND JSONExtractString(properties_json, 'signup_session_id') != '') AS linked_completions,
           -- Keep a visitor/session pair from ONE event; prefer the initiating snapshot.
           argMinIf(tuple(
               JSONExtractString(properties_json, 'signup_anonymous_id'),
               JSONExtractString(properties_json, 'signup_session_id'),
               JSONExtractString(properties_json, 'signup_context_source')
           ), tuple(JSONExtractString(properties_json, 'signup_context_source') != 'auth_start', event_time),
               JSONExtractString(properties_json, 'signup_anonymous_id') != ''
               AND JSONExtractString(properties_json, 'signup_session_id') != '') AS visitor
    FROM analytics.events_canonical
    WHERE app = 'genesis' AND environment = 'production'
      AND (event_name = 'signed_up' OR (event_name = 'session_restored'
           AND JSONExtractString(properties_json, 'signup_context_source') = 'auth_start'))
      AND event_time >= toDateTime({signup_day:Date}, 'UTC') - INTERVAL 5 MINUTE
      AND event_time < toDateTime({signup_day:Date}, 'UTC') + INTERVAL 2 DAY
    GROUP BY account_id
),
accounts AS (
    SELECT s.account_id, s.signed_up_at,
           coalesce(l.app_completions, 0) > 0 AS observed_in_app,
           coalesce(l.linked_completions, 0) > 0 AS linked,
           tupleElement(l.visitor, 1) AS signup_anonymous_id,
           tupleElement(l.visitor, 2) AS signup_session_id,
           tupleElement(l.visitor, 3) AS context_source
    FROM signups s LEFT JOIN links l ON s.account_id = l.account_id
),
history AS (
    SELECT DISTINCT event_id, event_time, event_name, anonymous_id, session_id,
           coalesce(page_path, '') AS page_path,
           JSONExtractString(properties_json, 'debate_id') AS debate_id,
           JSONExtractUInt(properties_json, 'active_ms') AS active_ms
    FROM analytics.events_canonical
    WHERE app = 'genesis' AND environment = 'production'
      AND event_name IN ('page_viewed', 'debate_playback_interval')
      AND coalesce(anonymous_id, '') != ''
      AND coalesce(privy_user_id, '') = '' AND coalesce(user_id, '') = ''
      AND event_time >= toDateTime({signup_day:Date}, 'UTC') - INTERVAL 30 DAY
      AND event_time < toDateTime({signup_day:Date}, 'UTC') + INTERVAL 1 DAY
),
journeys AS (
    SELECT a.account_id, a.signed_up_at, a.observed_in_app, a.linked,
           a.signup_anonymous_id, a.signup_session_id, a.context_source,
           -- Include earlier sessions for the same logged-out visitor, not just the last click.
           arraySort(x -> x.1, groupArrayIf(tuple(h.event_time, h.page_path, coalesce(h.session_id, '')),
               a.linked AND h.event_name = 'page_viewed' AND h.event_time < a.signed_up_at)) AS pages_before_signup,
           arraySort(x -> x.1, groupArrayIf(tuple(h.event_time, h.debate_id, h.active_ms, coalesce(h.session_id, '')),
               a.linked AND h.event_name = 'debate_playback_interval' AND h.active_ms > 0
               AND h.event_time < a.signed_up_at)) AS playback_before_signup
    FROM accounts a LEFT JOIN history h ON a.signup_anonymous_id = h.anonymous_id
    GROUP BY a.account_id, a.signed_up_at, a.observed_in_app, a.linked,
             a.signup_anonymous_id, a.signup_session_id, a.context_source
)
SELECT *,
       multiIf(NOT linked, 'missing_link',
           empty(pages_before_signup) AND empty(playback_before_signup), 'no_observed_history',
           'has_history') AS history_status,
       count() OVER () AS source_accounts,
       countIf(observed_in_app) OVER () AS observed_app_accounts,
       countIf(linked) OVER () AS linked_accounts,
       countIf(NOT linked) OVER () AS accounts_missing_link,
       countIf(linked AND empty(pages_before_signup) AND empty(playback_before_signup)) OVER () AS accounts_without_history,
       round(100.0 * linked_accounts / nullIf(source_accounts, 0), 2) AS pct_source_accounts_linked,
       round(100.0 * linked_accounts / nullIf(observed_app_accounts, 0), 2) AS pct_observed_app_accounts_linked,
       pct_source_accounts_linked < 95 AS coverage_below_target
FROM journeys
ORDER BY signed_up_at, account_id;
