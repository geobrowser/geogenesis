export type DebateAnalyticsSurface = 'hub' | 'rematch' | 'profile-debates';
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
  | 'room-join-prompt';

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
  'room-join-prompt': {
    labelPrefix: 'Scheduled debate prompt',
    actionIntent: 'scheduled_debate_prompt_action',
  },
} as const satisfies Record<DebateActionAnalyticsSurface, { labelPrefix: string; actionIntent: string }>;

const FILTER_INTENTS = {
  hub: 'filter_debates_hub',
  rematch: 'filter_debate_rematch',
  'profile-debates': 'filter_profile_debates',
} as const satisfies Record<DebateAnalyticsSurface, string>;

/** Stable metadata for actions shared across debate surfaces. */
export function debateActionAnalyticsAttributes(
  surface: DebateActionAnalyticsSurface,
  action: string,
  intent?: string
) {
  const analytics = ACTION_SURFACE_ANALYTICS[surface];

  return {
    'data-geo-analytics-label': `${analytics.labelPrefix} ${action}`,
    'data-geo-analytics-intent': intent ?? analytics.actionIntent,
  } as const;
}

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
 * treatment is different (inline links, menus, and the schedule callout).
 */
export function hubAnalyticsAttributes(action: string, intent?: string) {
  return debateActionAnalyticsAttributes('hub', action, intent);
}
