export type DebateAnalyticsSurface = 'hub' | 'rematch';

const SURFACE_ANALYTICS = {
  hub: {
    labelPrefix: 'Debate hub',
    actionIntent: 'debates_hub_action',
    filterIntent: 'filter_debates_hub',
  },
  rematch: {
    labelPrefix: 'Debate rematch',
    actionIntent: 'debate_rematch_action',
    filterIntent: 'filter_debate_rematch',
  },
} as const satisfies Record<
  DebateAnalyticsSurface,
  { labelPrefix: string; actionIntent: string; filterIntent: string }
>;

/** Analytics metadata for controls shared by the debate hub and the standalone rematch page. */
export function debateSurfaceAnalyticsAttributes(
  surface: DebateAnalyticsSurface,
  action: string,
  kind: 'action' | 'filter' = 'action'
) {
  const analytics = SURFACE_ANALYTICS[surface];

  return {
    'data-geo-analytics-label': `${analytics.labelPrefix} ${action}`,
    'data-geo-analytics-intent': kind === 'filter' ? analytics.filterIntent : analytics.actionIntent,
  } as const;
}

/**
 * Stable metadata for hub-only controls that cannot use {@link HubPillButton} because their visual
 * treatment is different (inline links, menus, and the schedule callout).
 */
export function hubAnalyticsAttributes(action: string, intent?: string) {
  const attributes = debateSurfaceAnalyticsAttributes('hub', action);

  return intent ? { ...attributes, 'data-geo-analytics-intent': intent } : attributes;
}
