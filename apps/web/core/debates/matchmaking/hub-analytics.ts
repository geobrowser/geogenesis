/**
 * Stable metadata for debate-hub controls that cannot use {@link HubPillButton} because their
 * visual treatment is different (filters, inline links, menus, and the schedule callout).
 */
export function hubAnalyticsAttributes(action: string, intent = 'debates_hub_action') {
  return {
    'data-geo-analytics-label': `Debate hub ${action}`,
    'data-geo-analytics-intent': intent,
  } as const;
}
