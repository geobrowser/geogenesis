import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authAttemptForAction,
  beginAuthAttempt,
  completeAuthAction,
  currentAuthAttempt,
  finishAuthAttempt,
  marketingAuthProperties,
  openAuthAttempt,
  readAuthAttempt,
  recoverAuthAttempt,
  resetAuthAttempt,
  trackAuthOnboarding,
} from './auth-attempt';
import { saveVotesSignInProperties } from './save-votes-analytics';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./analytics', () => ({ capture }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
  capture.mockClear();
  window.history.replaceState(null, '', '/explore');
});
const entry = {
  component: 'debate_claim_ticker',
  auth_control: 'disagree',
  auth_trigger: 'control',
  auth_intent: 'vote',
  auth_continuation: 'queued',
  target_type: 'claim',
  target_id: 'claim-1',
  debate_id: 'debate-1',
  origin_entity_ids: ['debate-1'],
  playback_instance_id: 'playback-1',
  playback_position_ms: 30000,
  item_position: 4,
};
// Copilot on #2785 (round 4): the property was set by the save prompts and stripped here.
it('keeps how many device votes a save sign-in was started for, through to its events', () => {
  const attempt = beginAuthAttempt(saveVotesSignInProperties('navbar', 3));

  expect(attempt.properties).toMatchObject({ auth_intent: 'save_votes', auth_control: 'navbar', local_vote_count: 3 });
  expect(capture).toHaveBeenCalledWith(
    'auth_attempt_started',
    expect.objectContaining({ auth_intent: 'save_votes', local_vote_count: 3 })
  );
});

describe('durable sign-in attempts', () => {
  it('retains an immutable entry through navigation and a new tab', () => {
    const properties = { ...entry, origin_entity_ids: ['debate-1'], email: 'not-stored@example.com' };
    const attempt = beginAuthAttempt(properties);
    properties.origin_entity_ids.push('later');
    resetAuthAttempt();
    window.history.replaceState(null, '', '/other');
    expect(currentAuthAttempt(true)).toMatchObject({ id: attempt.id, properties: { ...entry, page_path: '/explore' } });
    expect(JSON.stringify(currentAuthAttempt())).not.toContain('not-stored');
  });
  it('keeps each abandoned attempt and records one prompt impression and terminal outcome', () => {
    const first = beginAuthAttempt(entry);
    openAuthAttempt();
    openAuthAttempt();
    finishAuthAttempt('closed');
    finishAuthAttempt('closed');
    const second = beginAuthAttempt({ ...entry, auth_control: 'agree' });
    expect(second.id).not.toBe(first.id);
    expect(capture.mock.calls.filter(([event]) => event === 'auth_prompt_viewed')).toHaveLength(1);
    expect(capture).toHaveBeenCalledWith(
      'auth_attempt_completed',
      expect.objectContaining({ auth_attempt_id: first.id, outcome: 'closed', auth_duration_ms: expect.any(Number) })
    );
  });
  it.each(['closed', 'superseded'] as const)(
    'records %s auth without inventing queued-action cancellation',
    outcome => {
      const attempt = beginAuthAttempt(entry);
      finishAuthAttempt(outcome);
      expect(capture).toHaveBeenCalledWith(
        'auth_attempt_completed',
        expect.objectContaining({ auth_attempt_id: attempt.id, outcome })
      );
      expect(capture.mock.calls.filter(([event]) => event === 'auth_action_completed')).toHaveLength(0);
    }
  );
  it('does not guess between concurrent attempts when completing in a new tab', () => {
    const first = beginAuthAttempt(entry);
    localStorage.setItem('geo:auth-attempt:v1:other-tab', JSON.stringify({ ...first, id: 'other-tab' }));
    resetAuthAttempt();
    expect(currentAuthAttempt(true)).toBeUndefined();
  });
  it('expires stale attempts', () => {
    const attempt = beginAuthAttempt(entry);
    vi.spyOn(Date, 'now').mockReturnValue(attempt.startedAt + 25 * 60 * 60 * 1000);
    resetAuthAttempt();
    expect(currentAuthAttempt(true)).toBeUndefined();
    vi.restoreAllMocks();
  });
  it('links only the intended target and stops attributing actions after success', () => {
    const attempt = beginAuthAttempt(entry);
    finishAuthAttempt('signed_up');
    expect(authAttemptForAction('comment', 'claim-1')).toBeUndefined();
    expect(authAttemptForAction('vote', 'claim-2')).toBeUndefined();
    expect(authAttemptForAction('vote', 'claim-1', attempt.id)?.id).toBe(attempt.id);
    trackAuthOnboarding('interested-in', 'dismissed');
    expect(capture).toHaveBeenCalledWith(
      'auth_onboarding_progress',
      expect.objectContaining({ auth_attempt_id: attempt.id, outcome: 'dismissed' })
    );
    completeAuthAction(attempt, 'succeeded', 'operation');
    expect(authAttemptForAction('vote', 'claim-1', attempt.id)).toBeUndefined();
  });
  it('accepts marketing identifiers without importing URLs, tokens or CTA text', () => {
    expect(
      marketingAuthProperties(
        '?via=marketing&marketing_page=home&marketing_cta=hero_signup&marketing_handoff_id=abc-123'
      )
    ).toEqual({ marketing_page: 'home', marketing_cta: 'hero_signup', marketing_handoff_id: 'abc-123' });
    expect(
      marketingAuthProperties(
        '?via=marketing&marketing_page=https://site.test?email=x&marketing_cta=person@example.com&token=secret'
      )
    ).toEqual({});
  });
  it.each([undefined, '', 'invite', 'email', 'Marketing'])(
    'rejects marketing fields for a non-marketing source (%s)',
    via => {
      expect(
        marketingAuthProperties(
          `?${via === undefined ? '' : `via=${via}&`}marketing_page=home&marketing_cta=hero&marketing_handoff_id=abc`
        )
      ).toEqual({});
    }
  );
  it.each(['link_source', 'marketing_page', 'marketing_cta', 'marketing_handoff_id'])(
    'rejects arbitrary text in %s before storage and emission',
    field => {
      for (const invalid of [
        'person@example.com',
        'https://site.test/path',
        'free form text',
        'x'.repeat(81),
        ['email'],
        { email: 'person@example.com' },
      ]) {
        const attempt = beginAuthAttempt({ ...entry, [field]: invalid });
        expect(attempt.properties).not.toHaveProperty(field);
        expect(JSON.parse(localStorage.getItem(`geo:auth-attempt:v1:${attempt.id}`)!).properties).not.toHaveProperty(
          field
        );
        expect(capture.mock.calls.at(-1)?.[1]).not.toHaveProperty(field);
        const recovered = recoverAuthAttempt({ [field]: invalid });
        expect(recovered.properties).not.toHaveProperty(field);
      }
    }
  );
  it('keeps valid stable source identifiers', () => {
    for (const source of ['marketing', 'email', 'invite', 'explore_email_capture', 'campaign-2026']) {
      expect(beginAuthAttempt({ link_source: source }).properties.link_source).toBe(source);
    }
  });
  it('scrubs unsafe source identifiers from older stored attempts without rebasing their page', () => {
    const attempt = beginAuthAttempt({ ...entry, link_source: 'email' });
    const key = `geo:auth-attempt:v1:${attempt.id}`;
    const record = JSON.parse(localStorage.getItem(key)!);
    const invalid = 'person@example.com';
    localStorage.setItem(
      key,
      JSON.stringify({
        ...record,
        properties: {
          ...record.properties,
          link_source: invalid,
          marketing_page: invalid,
          marketing_cta: invalid,
          marketing_handoff_id: invalid,
        },
      })
    );
    resetAuthAttempt();
    window.history.replaceState(null, '', '/other');
    const recovered = currentAuthAttempt(true);
    expect(recovered?.properties).toMatchObject({ page_path: '/explore', auth_attribution_version: 'v1' });
    for (const field of ['link_source', 'marketing_page', 'marketing_cta', 'marketing_handoff_id']) {
      expect(recovered?.properties).not.toHaveProperty(field);
    }
    capture.mockClear();
    finishAuthAttempt('signed_in', recovered);
    expect(JSON.stringify(capture.mock.calls)).not.toContain(invalid);
    expect(localStorage.getItem(key)).not.toContain(invalid);
  });
  it('keeps the latest attempt and terminal outcome when storage fills after a previous login', () => {
    const old = beginAuthAttempt(entry);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      const latest = beginAuthAttempt(entry);
      expect(currentAuthAttempt()?.id).toBe(latest.id);
      expect(readAuthAttempt(old.id)?.outcome).toBe('superseded');
      finishAuthAttempt('signed_up');
      expect(currentAuthAttempt()?.outcome).toBe('signed_up');
      completeAuthAction(latest, 'succeeded', 'operation');
      expect(authAttemptForAction('vote', 'claim-1', latest.id)).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it('matches resumed entity IDs using the shared case-insensitive UUID normalization', () => {
    const attempt = beginAuthAttempt({ ...entry, auth_continuation: 'resume', target_id: 'ABC-123' });
    finishAuthAttempt('signed_in');
    expect(authAttemptForAction('vote', 'abc123')?.id).toBe(attempt.id);
  });
  it('continues when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const attempt = beginAuthAttempt(entry);
    openAuthAttempt();
    expect(currentAuthAttempt()?.id).toBe(attempt.id);
    spy.mockRestore();
  });
});
