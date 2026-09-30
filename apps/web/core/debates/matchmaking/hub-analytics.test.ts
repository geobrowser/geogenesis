import { describe, expect, it } from 'vitest';

import { debateActionAnalyticsAttributes, hubAnalyticsAttributes } from './hub-analytics';

// Dashboards query these labels by their exact text, so a change here is a change to every query.
describe('debate analytics attributes', () => {
  it('prefixes a hub control, keeping an explicit intent', () => {
    expect(hubAnalyticsAttributes('See times', 'open_peer_availability')).toEqual({
      'data-geo-analytics-label': 'Debate hub See times',
      'data-geo-analytics-intent': 'open_peer_availability',
    });
  });

  it.each([
    ['schedule-editor', 'Save', 'Schedule editor Save', 'debate_schedule_action'],
    ['peer-availability', 'Send request', 'Availability Send request', 'peer_availability_action'],
    ['availability-link', 'Sign in', 'Availability link Sign in', 'availability_link_action'],
    ['room-join-prompt', 'Join', 'Scheduled debate prompt Join', 'scheduled_debate_prompt_action'],
  ] as const)('labels the %s surface', (surface, action, label, defaultIntent) => {
    expect(debateActionAnalyticsAttributes(surface, action)).toEqual({
      'data-geo-analytics-label': label,
      'data-geo-analytics-intent': defaultIntent,
    });
  });
});
