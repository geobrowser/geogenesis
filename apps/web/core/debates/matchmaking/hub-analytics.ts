/** `calendar` is the full-screen week everyone's free time is drawn on (GEO-3152). */
export type DebateAnalyticsSurface = 'hub' | 'rematch' | 'profile-debates' | 'profile-positions' | 'calendar' | 'lobby';
/**
 * Surfaces with actions but no filters. The last four are availability and scheduling's own
 * dialogs and prompts, which open from the hub and from outside it alike.
 */
export type DebateActionAnalyticsSurface =
  | DebateAnalyticsSurface
  | 'request-popup'
  | 'schedule-editor'
  | 'peer-availability'
  | 'availability-link'
  | 'scheduled-notice'
  | 'room-join-prompt'
  /** The room page's own notices, and the prompts that can open over a room (GEO-3433). */
  | 'room'
  | 'debate-ready-prompt'
  | 'rejoin-bar'
  | 'challenge-accepted-prompt'
  | 'challenge-dialog'
  | 'open-elsewhere';

const ACTION_SURFACE_ANALYTICS = {
  hub: {
    labelPrefix: 'Debate hub',
    actionIntent: 'debates_hub_action',
  },
  rematch: {
    labelPrefix: 'Debate rematch',
    actionIntent: 'debate_rematch_action',
  },
  'profile-debates': {
    labelPrefix: 'Profile debates',
    actionIntent: 'profile_debates_action',
  },
  'profile-positions': {
    labelPrefix: 'Profile positions',
    actionIntent: 'profile_positions_action',
  },
  calendar: {
    labelPrefix: 'Debate calendar',
    actionIntent: 'debate_calendar_action',
  },
  'request-popup': {
    labelPrefix: 'Debate request popup',
    actionIntent: 'debate_request_popup_action',
  },
  'schedule-editor': {
    labelPrefix: 'Schedule editor',
    actionIntent: 'debate_schedule_action',
  },
  'peer-availability': {
    labelPrefix: 'Availability',
    actionIntent: 'peer_availability_action',
  },
  'availability-link': {
    labelPrefix: 'Availability link',
    actionIntent: 'availability_link_action',
  },
  // GEO-3427: Running late and Can't make it, from an email or the reschedule link.
  'scheduled-notice': {
    labelPrefix: 'Scheduled debate notice',
    actionIntent: 'scheduled_debate_notice_action',
  },
  'room-join-prompt': {
    labelPrefix: 'Scheduled debate prompt',
    actionIntent: 'scheduled_debate_prompt_action',
  },
  lobby: {
    labelPrefix: 'Debate lobby',
    actionIntent: 'debate_lobby_action',
  },
  room: {
    labelPrefix: 'Debate room',
    actionIntent: 'debate_room_action',
  },
  'debate-ready-prompt': {
    labelPrefix: 'Debate ready prompt',
    actionIntent: 'debate_ready_prompt_action',
  },
  'rejoin-bar': {
    labelPrefix: 'Debate rejoin bar',
    actionIntent: 'debate_rejoin_bar_action',
  },
  'challenge-accepted-prompt': {
    labelPrefix: 'Challenge accepted prompt',
    actionIntent: 'challenge_accepted_prompt_action',
  },
  'challenge-dialog': {
    labelPrefix: 'Debate challenge dialog',
    actionIntent: 'debate_challenge_dialog_action',
  },
  'open-elsewhere': {
    labelPrefix: 'Debate open elsewhere',
    actionIntent: 'debate_open_elsewhere_action',
  },
} as const satisfies Record<DebateActionAnalyticsSurface, { labelPrefix: string; actionIntent: string }>;

const FILTER_INTENTS = {
  hub: 'filter_debates_hub',
  rematch: 'filter_debate_rematch',
  'profile-debates': 'filter_profile_debates',
  'profile-positions': 'filter_profile_positions',
  calendar: 'filter_debate_calendar',
  lobby: 'filter_debate_lobby',
} as const satisfies Record<DebateAnalyticsSurface, string>;

/**
 * A control's analytics label on a surface, `Debate hub Request debate` on the hub. For a label
 * pinned to keep a series going through a copy change, so every surface pins it the same way.
 */
export function debateAnalyticsLabel(surface: DebateActionAnalyticsSurface, action: string) {
  return `${ACTION_SURFACE_ANALYTICS[surface].labelPrefix} ${action}`;
}

/** Stable metadata for actions shared across debate surfaces. */
export function debateActionAnalyticsAttributes(
  surface: DebateActionAnalyticsSurface,
  action: string,
  intent?: string
) {
  return {
    'data-geo-analytics-label': debateAnalyticsLabel(surface, action),
    'data-geo-analytics-intent': intent ?? ACTION_SURFACE_ANALYTICS[surface].actionIntent,
  } as const;
}

/**
 * A control's label and intent together, for a shared component to spread onto the element it
 * renders. Passing the object rather than a bare label keeps the two from drifting apart.
 */
export type DebateAnalyticsAttributes = ReturnType<typeof debateActionAnalyticsAttributes>;

/** Analytics metadata for controls shared by the debate hub, rematch page, and profile debate list. */
export function debateSurfaceAnalyticsAttributes(
  surface: DebateAnalyticsSurface,
  action: string,
  kind: 'action' | 'filter' = 'action'
) {
  return debateActionAnalyticsAttributes(surface, action, kind === 'filter' ? FILTER_INTENTS[surface] : undefined);
}

/**
 * Stable metadata for hub-only controls that cannot use {@link HubPillButton} because their visual
 * treatment is different (inline links and menus).
 */
export function hubAnalyticsAttributes(action: string, intent?: string) {
  return debateActionAnalyticsAttributes('hub', action, intent);
}
