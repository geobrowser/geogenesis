export type DebateAnalyticsSurface = 'hub' | 'rematch';
export type DebateActionAnalyticsSurface = DebateAnalyticsSurface | 'request-popup';

const ACTION_SURFACE_ANALYTICS = {
  hub: {
    labelPrefix: 'Debate hub',
    actionIntent: 'debates_hub_action',
  },
  rematch: {
    labelPrefix: 'Debate rematch',
    actionIntent: 'debate_rematch_action',
  },
  'request-popup': {
    labelPrefix: 'Debate request popup',
    actionIntent: 'debate_request_popup_action',
  },
} as const satisfies Record<DebateActionAnalyticsSurface, { labelPrefix: string; actionIntent: string }>;

const FILTER_INTENTS = {
  hub: 'filter_debates_hub',
  rematch: 'filter_debate_rematch',
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

/** Analytics metadata for controls shared by the debate hub and the standalone rematch page. */
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
