import { readAnalyticsContext } from './analytics-context';
import { equals } from './id/normalize';

/** Shared, text-free attribution contract. IDs refer to graph entities, never labels. */
export const ACTION_COMPONENTS = [
  'navbar',
  'sign_in_prompt',
  'sign_in_deep_link',
  'invite_link',
  'explore_email_capture',
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
  'search',
  'ai_assistant',
  'create_space',
  'explore_feed_card',
  'debate_player',
  'debate_claim_ticker',
  'debate_end_card',
  'debate_claims_panel',
] as const;
export type ActionComponent = (typeof ACTION_COMPONENTS)[number];
export type ActionKind =
  | 'vote'
  | 'ranking'
  | 'comment'
  | 'edit_comment'
  | 'publish'
  | 'edit'
  | 'share'
  | 'join_space'
  | 'bounty_interest'
  | 'start_debate'
  | 'join_debate'
  | 'search'
  | 'search_result'
  | 'assistant_message'
  | 'assistant_option'
  | 'create_space';
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
  'auth_attempt_id',
  'action_session_id',
  'action_anonymous_id',
] as const satisfies readonly (keyof ActionContext)[];

export type ActionScope = Partial<Omit<ActionContext, 'page_path' | 'page_view_id'>>;

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
  };
  // A runtime allowlist as well as a type: structural typing must not admit text or emails.
  return Object.fromEntries(
    ACTION_CONTEXT_FIELDS.flatMap(key => {
      const value = context[key];
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
