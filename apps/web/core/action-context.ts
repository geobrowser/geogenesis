import { readAnalyticsContext } from './analytics-context';
import { equals } from './id/normalize';

/** Shared, text-free attribution contract. IDs refer to graph entities, never labels. */
export const ACTION_COMPONENTS = [
  'navbar',
  'sign_in_prompt',
  'sign_in_deep_link',
  'invite_link',
  'explore_email_capture',
  'save_votes_prompt',
  'entity_vote_buttons',
  'claim_position_control',
  'winner_vote_button',
  'ranking_composer',
  'comment_composer',
  'review_changes',
  'entity_editor',
  'data_block',
  'share_dialog',
  'join_space_button',
  'bounty_interest',
  'debate_matchmaking',
  'scheduled_debate_notice',
  'debate_room',
  'search',
  'ai_assistant',
  'create_space',
  'explore_feed_card',
  'debate_player',
  'debate_claim_ticker',
  'debate_end_card',
  'debate_claims_panel',
  'topic_follow_button',
  'onboarding_customize_feed',
  'person_follow_button',
  'debate_claim_card',
] as const;
export type ActionComponent = (typeof ACTION_COMPONENTS)[number];
export type ActionKind =
  | 'vote'
  | 'local_vote'
  | 'local_vote_dropped'
  | 'ranking'
  | 'comment'
  | 'edit_comment'
  | 'publish'
  | 'edit'
  | 'share'
  | 'join_space'
  | 'follow_topic'
  | 'unfollow_topic'
  | 'follow_person'
  | 'unfollow_person'
  | 'bounty_interest'
  | 'start_debate'
  | 'join_debate'
  | 'running_late'
  | 'cant_make_it'
  | 'no_time_works'
  | 'nudge'
  | 'search'
  | 'search_result'
  | 'assistant_message'
  | 'assistant_option'
  | 'create_space'
  | 'filter_claims';
export type ActionContext = {
  component: ActionComponent;
  page_path: string;
  page_type: string;
  page_view_id: string;
  auth_attempt_id?: string;
  action_session_id?: string;
  action_anonymous_id?: string;
  page_entity_id?: string;
  page_entity_type?: string;
  target_id: string;
  target_type: string;
  target_type_ids?: string[];
  origin_entity_ids?: string[];
  overlay?: 'entity_side_panel' | 'modal' | 'debates_hub_sheet';
  overlay_entity_id?: string;
  overlay_entity_type?: string;
  list_id?: string;
  item_position?: number;
  presentation_instance_id?: string;
  playback_instance_id?: string;
  playback_position_ms?: number;
  debate_id?: string;
  variant?: string;
  /**
   * GEO-3140 / GEO-3144. The feed version that put this card on the page (e.g. Best's `BEST_FEED_VERSION`,
   * `for-you-1.0+web.1`), and on an interleaved page which arm picked it and in which experiment,
   * so engagement can be credited per version. `feed_exploration` marks a For you exploration slot.
   * `feed_slot: 'fresh'` marks a card Best's fresh slot placed (GEO-3221).
   */
  feed_version?: string;
  feed_arm?: 'a' | 'b';
  feed_experiment_id?: string;
  feed_exploration?: boolean;
  feed_slot?: 'fresh';
  /** GEO-3234. How many cards this visitor had already seen were hidden from this card's page. */
  feed_seen_hidden?: number;
  /** GEO-3311. The live lobby the action was taken in, in geo-chat's dashless spelling. */
  lobby_id?: string;
  /**
   * GEO-3311. The lobby's running room vote, only on an action whose target is that vote's claim, so
   * a vote in answer to the room reads apart from one on any other claim in the lobby.
   */
  room_vote_id?: string;
  /**
   * GEO-3374. Which of our emails the action came from: the `ref_email` slug its link carried. Set on
   * a vote an email's vote link cast, and on that vote again when a device vote is saved later.
   */
  ref_email?: string;
  /**
   * GEO-3495. The graph entity a list was built from, when `list_id` names a kind of list rather than
   * one list: a lobby's curated claim list page.
   */
  list_entity_id?: string;
  /**
   * GEO-3495. The section of the list the item sits in, as an id: on Today's claims the agenda's data
   * block (its section); on a lobby's curated list, the card's section.
   */
  list_section_id?: string;
  /**
   * GEO-3495. The Debate agenda a claim was listed on and its date (YYYY-MM-DD, New York). Set by the
   * Today's claims lists (GEO-3489, GEO-3490, GEO-3491); nothing on master sets them yet.
   */
  agenda_id?: string;
  agenda_date?: string;
  /**
   * GEO-3495. On Today's claims, how many times the claim had been debated since its agenda listing,
   * which orders debated claims below undebated ones. A count only; dropped unless a finite number.
   */
  debated_since_listing?: number;
  /** GEO-3495. Whether the list was narrowed by a search, never what was searched. */
  list_searched?: boolean;
  /** GEO-3495. The in-room picker session the action was taken in (geo-chat's rematch session id). */
  rematch_session_id?: string;
  /** GEO-3495. On a `filter_claims` toggle: whether the space or topic was picked or let go. */
  filter_selected?: boolean;
};
export const ACTION_CONTEXT_FIELDS = [
  'component',
  'page_path',
  'page_type',
  'page_view_id',
  'page_entity_id',
  'page_entity_type',
  'target_id',
  'target_type',
  'target_type_ids',
  'origin_entity_ids',
  'overlay',
  'overlay_entity_id',
  'overlay_entity_type',
  'list_id',
  'item_position',
  'presentation_instance_id',
  'playback_instance_id',
  'playback_position_ms',
  'debate_id',
  'variant',
  'feed_version',
  'feed_arm',
  'feed_experiment_id',
  'feed_exploration',
  'feed_slot',
  'feed_seen_hidden',
  'lobby_id',
  'room_vote_id',
  'ref_email',
  'list_entity_id',
  'list_section_id',
  'agenda_id',
  'agenda_date',
  'debated_since_listing',
  'list_searched',
  'rematch_session_id',
  'filter_selected',
  'auth_attempt_id',
  'action_session_id',
  'action_anonymous_id',
] as const satisfies readonly (keyof ActionContext)[];

export type ActionScope = Partial<Omit<ActionContext, 'page_path' | 'page_view_id'>> & {
  /** Scope only, never sent: the claim entity `room_vote_id` belongs to. Other targets drop the vote. */
  room_vote_claim_id?: string;
};

/** Entity metadata only belongs to the entity that supplied it. */
export function mergeActionScope(parent: ActionScope, value: ActionScope): ActionScope {
  const changedTarget = value.target_id && parent.target_id && !equals(value.target_id, parent.target_id);
  return {
    ...parent,
    ...(changedTarget ? { target_type: undefined, target_type_ids: undefined, origin_entity_ids: undefined } : {}),
    ...value,
  };
}

let page: { key: string; id: string } | undefined;
const pageViewListeners = new Set<() => void>();

/** Surfaces can survive a Next navigation without rendering. The existing page
 * tracker notifies them once it has reported the new view; no UI is remounted. */
export function subscribeToActionPageViews(listener: () => void) {
  pageViewListeners.add(listener);
  return () => {
    pageViewListeners.delete(listener);
  };
}

export function notifyActionPageView() {
  for (const listener of [...pageViewListeners]) listener();
}
let replayContext: ActionContext | undefined;
let eventContext: { context: ActionContext; depth: number } | undefined;

export function pageContext(
  path = typeof window === 'undefined' ? '/' : window.location.pathname,
  search = typeof window === 'undefined' ? '' : window.location.search
) {
  // Match PageViewTracker's pathname + searchParams identity. Query text stays
  // inside this cache key and never becomes an action-description field.
  const key = `${path}?${new URLSearchParams(search).toString()}`;
  if (page?.key !== key) page = { key, id: crypto.randomUUID() };
  const segments = path.split('/').filter(Boolean);
  const isId = (value?: string) => !!value && /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
  let pageType = segments[0] || 'home';
  let entityId: string | undefined;
  let entityType: string | undefined;
  if (segments[0] === 'space') {
    if (isId(segments[2])) {
      pageType = 'entity';
      entityId = segments[2];
      entityType = 'entity';
    } else if (segments[2] === 'debates' && isId(segments[3])) {
      pageType = 'debate';
      entityId = segments[3];
      entityType = 'debate';
    } else {
      pageType = segments[2] ? `space_${segments[2]}` : 'space';
      entityId = segments[1];
      entityType = 'space';
    }
  }
  return {
    page_path: path,
    page_type: pageType,
    page_view_id: page.id,
    page_entity_id: entityId,
    page_entity_type: entityType,
  };
}

/** Capture before any await, navigation or sign-in. A replay override lives only for
 * the synchronous invocation; each async operation retains its own immutable copy. */
export function snapshotActionContext(
  component: ActionComponent,
  targetType: string,
  targetId: string,
  scope: ActionScope = {},
  overrides: ActionScope = {},
  options: { scopeDepth?: number; ignoreEventContext?: boolean } = {}
): ActionContext {
  const identity = readAnalyticsContext();
  const event = options.ignoreEventContext ? undefined : eventContext;
  // A child scope (for example a claim row inside a panel) wins over its parent's
  // capture handler. A deeper clicked surface still reaches hooks built above it.
  const scopes =
    event && event.depth < (options.scopeDepth ?? 0)
      ? [event.context, scope, overrides]
      : [scope, event?.context ?? {}, overrides];
  const liveContext = Object.assign(
    {
      ...pageContext(),
      action_session_id: typeof identity.session_id === 'string' ? identity.session_id : undefined,
      action_anonymous_id: typeof identity.anonymous_id === 'string' ? identity.anonymous_id : undefined,
    },
    ...scopes
  );
  const source = replayContext ?? liveContext;
  // A replay was snapshotted against its own target already; a live scope's vote is only its claim's.
  const roomVoteClaimId: string | undefined = replayContext ? undefined : liveContext.room_vote_claim_id;
  const roomVoteApplies = replayContext !== undefined || (!!roomVoteClaimId && equals(roomVoteClaimId, targetId));
  const metadata = [...(replayContext ? [scope, overrides, replayContext] : scopes)]
    .reverse()
    .filter(candidate => !candidate.target_id || equals(candidate.target_id, targetId));
  const context: ActionContext = {
    ...source,
    component: source.component ?? component,
    target_id: targetId,
    target_type: targetType,
    target_type_ids: metadata.find(candidate => candidate.target_type_ids !== undefined)?.target_type_ids,
    origin_entity_ids: metadata.find(candidate => candidate.origin_entity_ids !== undefined)?.origin_entity_ids,
    room_vote_id: roomVoteApplies ? source.room_vote_id : undefined,
  };
  // A runtime allowlist as well as a type: structural typing must not admit text or emails.
  return Object.fromEntries(
    ACTION_CONTEXT_FIELDS.flatMap(key => {
      const value = context[key];
      if (key === 'debated_since_listing' && !(typeof value === 'number' && Number.isFinite(value))) return [];
      return value === undefined ? [] : [[key, Array.isArray(value) ? [...value] : value]];
    })
  ) as ActionContext;
}

export function withActionContext<T>(context: ActionContext, run: () => T): T {
  const previous = replayContext;
  replayContext = context;
  try {
    return run();
  } finally {
    replayContext = previous;
  }
}

/** The capture phase also supports handlers built above a surface. Async work
 * takes its own snapshot before this event-scoped value is cleared. */
export function enterActionContext(context: ActionContext, depth = 0) {
  const event = { context, depth };
  eventContext = event;
  // Native capture and bubble listeners can have a microtask checkpoint between
  // them. Clear in the next task so React's bubble handler can still snapshot it.
  setTimeout(() => {
    if (eventContext === event) eventContext = undefined;
  }, 0);
}
