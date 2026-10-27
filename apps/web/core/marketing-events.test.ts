import { afterEach, describe, expect, it } from 'vitest';

import { marketingVoteDirection, pushMarketingEvent } from './marketing-events';

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };

describe('pushMarketingEvent', () => {
  afterEach(() => {
    delete (window as DataLayerWindow).dataLayer;
  });

  it('creates the dataLayer when GTM has not loaded yet', () => {
    pushMarketingEvent('geo_sign_up_start');
    expect((window as DataLayerWindow).dataLayer).toHaveLength(1);
  });

  it('gives every push its own event_id', () => {
    pushMarketingEvent('geo_share_open', { debate_id: 'd1' });
    pushMarketingEvent('geo_share_open', { debate_id: 'd1' });
    const [first, second] = (window as DataLayerWindow).dataLayer ?? [];
    expect(first?.event_id).toEqual(expect.any(String));
    expect(first?.event_id).not.toBe(second?.event_id);
  });

  it('clears parameters an earlier push set, since GTM merges pushes into one model', () => {
    pushMarketingEvent('geo_watch_debate', { debate_id: 'd1' });
    pushMarketingEvent('geo_join_space', { space_id: 's1', space_name: 'Philosophy' });
    pushMarketingEvent('geo_join_space', { space_id: 's1' });
    const join = (window as DataLayerWindow).dataLayer?.[2];
    expect(join).toMatchObject({ event: 'geo_join_space', space_id: 's1' });
    expect(join).toHaveProperty('debate_id', undefined);
    expect(join).toHaveProperty('user_id', undefined);
    expect(join).toHaveProperty('space_name', undefined);
  });

  it('names the side of a vote the way its controls do', () => {
    expect(marketingVoteDirection('stance', 'positive')).toBe('agree');
    expect(marketingVoteDirection('stance', 'negative')).toBe('disagree');
    expect(marketingVoteDirection('curation', 'positive')).toBe('up');
    expect(marketingVoteDirection('curation', 'negative')).toBe('down');
  });

  it('does not carry a vote direction onto a later winner vote', () => {
    pushMarketingEvent('geo_vote', { target_id: 'c1', vote_kind: 'stance', vote_direction: 'disagree' });
    pushMarketingEvent('geo_vote', { debate_id: 'd1', target_id: 'd1', vote_kind: 'debate_winner' });
    expect((window as DataLayerWindow).dataLayer?.[1]).toHaveProperty('vote_direction', undefined);
  });
});
