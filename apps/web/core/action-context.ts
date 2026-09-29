/** Shared, text-free attribution contract. IDs refer to graph entities, never labels. */
export const ACTION_COMPONENTS = [
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
  'action_session_id',
  'action_anonymous_id',
] as const satisfies readonly (keyof ActionContext)[];

export type ActionScope = Partial<Omit<ActionContext, 'page_path' | 'page_view_id'>>;

let page: { path: string; id: string } | undefined;
let replayContext: ActionContext | undefined;
let eventContext: ActionContext | undefined;

export function pageContext(path = typeof window === 'undefined' ? '/' : window.location.pathname) {
  if (page?.path !== path) page = { path, id: crypto.randomUUID() };
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
  overrides: ActionScope = {}
): ActionContext {
  const runtime = typeof window === 'undefined' ? undefined : (window.lytics ?? window.geoAnalytics);
  let identity: Record<string, unknown> = {};
  try {
    identity = runtime?.getContext?.() ?? {};
  } catch {
    /* Telemetry cannot block an action. */
  }
  const liveContext = {
    ...pageContext(),
    action_session_id: typeof identity.session_id === 'string' ? identity.session_id : undefined,
    action_anonymous_id: typeof identity.anonymous_id === 'string' ? identity.anonymous_id : undefined,
    ...scope,
    ...eventContext,
    ...overrides,
  };
  const source = replayContext ?? liveContext;
  const context: ActionContext = {
    ...source,
    component: source.component ?? component,
    target_id: targetId,
    target_type: targetType,
    origin_entity_ids:
      source.target_id === targetId
        ? (source.origin_entity_ids ?? overrides.origin_entity_ids ?? scope.origin_entity_ids)
        : (overrides.origin_entity_ids ?? scope.origin_entity_ids),
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
export function enterActionContext(context: ActionContext) {
  eventContext = context;
  queueMicrotask(() => {
    if (eventContext === context) eventContext = undefined;
  });
}
