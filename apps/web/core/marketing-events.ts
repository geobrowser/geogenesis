'use client';

/**
 * Conversion events for the marketing tags in Google Tag Manager (GTM-KJQ3T7W9), which forwards them
 * to Meta. Each fires from the same place as the Geo analytics event it mirrors, so the counts the
 * ad platforms see line up with ClickHouse instead of drifting with click and URL triggers.
 *
 * | dataLayer event         | Geo analytics event                                   |
 * | ----------------------- | ----------------------------------------------------- |
 * | geo_sign_up_start       | auth_attempt_started                                  |
 * | geo_account_created     | signed_up                                             |
 * | geo_vote                | vote_cast (outcome_phase = submitted)                 |
 * | geo_vote_anonymous      | action_completed (action = local_vote), cast/switch   |
 * | geo_watch_debate        | debate_playback_interval (WATCH_DEBATE_MS unmuted)    |
 * | geo_join_space          | action_completed (action = join_space)                |
 * | geo_share_open          | (share sheet opened; no Geo event)                    |
 * | geo_share               | debate_share_action                                   |
 *
 * Only the parameters listed in `MarketingEventParams` are pushed: anything else in the dataLayer
 * would be one GTM variable away from reaching Meta.
 */

export type MarketingEventName =
  | 'geo_sign_up_start'
  | 'geo_account_created'
  | 'geo_vote'
  | 'geo_vote_anonymous'
  | 'geo_watch_debate'
  | 'geo_join_space'
  | 'geo_share_open'
  | 'geo_share';

export type MarketingEventParams = {
  /** The Privy user id (`did:privy:…`). Only on `geo_account_created`. */
  user_id?: string;
  debate_id?: string;
  space_id?: string;
  /** The space's display name, when the control knows it. Only on `geo_join_space`. */
  space_name?: string;
  /** The voted entity: a claim or other entity, or the debate for a winner vote. */
  target_id?: string;
  vote_kind?: 'debate_winner' | 'stance' | 'curation';
  share_method?: string;
};

/**
 * Unmuted playback, in view and in the foreground, that counts as watching a debate: 30s, the bar
 * the GTM click listener this replaces used.
 */
export const WATCH_DEBATE_MS = 30_000;

// GTM merges every push into one data model, so a key left out keeps the value an earlier event
// set. Each push names every parameter, unset ones as undefined, so a share never inherits the
// debate id of the last watch.
const EMPTY_PARAMS: { [K in keyof Required<MarketingEventParams>]: undefined } = {
  user_id: undefined,
  debate_id: undefined,
  space_id: undefined,
  space_name: undefined,
  target_id: undefined,
  vote_kind: undefined,
  share_method: undefined,
};

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Pushes one conversion to the dataLayer. `event_id` is unique per push so Meta can deduplicate the
 * browser event against a server-side copy if one is ever sent.
 */
export function pushMarketingEvent(event: MarketingEventName, params: MarketingEventParams = {}) {
  if (typeof window === 'undefined') return;
  try {
    const target = window as DataLayerWindow;
    target.dataLayer = target.dataLayer || [];
    target.dataLayer.push({ ...EMPTY_PARAMS, ...params, event, event_id: crypto.randomUUID() });
  } catch {
    /* Marketing tags never fail the action they describe. */
  }
}
