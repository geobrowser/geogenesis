import { describe, expect, it } from 'vitest';

import type { DebateHistoryItem } from '../api';
import { historyOutcomeLabel, isSettledHistoryItem } from './request-history';

const label = (kind: DebateHistoryItem['kind'], direction: DebateHistoryItem['direction'], outcome: string) =>
  historyOutcomeLabel({ kind, direction, outcome });

describe('historyOutcomeLabel', () => {
  // GEO-3464's distinction a recipient needs: passing and being beaten to it are not the same.
  it('tells a recipient who passed from one someone else beat to it', () => {
    expect(label('claim_request', 'incoming', 'declined')).toBe('You passed');
    expect(label('claim_request', 'incoming', 'taken_by_other')).toBe('Someone else took it');
    expect(label('claim_request', 'incoming', 'expired')).toBe('Missed');
  });

  it('says nobody took a claim request that ran out or was passed on by everyone', () => {
    expect(label('claim_request', 'outgoing', 'expired')).toBe('Nobody took it');
    expect(label('claim_request', 'outgoing', 'passed_by_everyone')).toBe('Nobody took it');
  });

  // One person was asked, so nobody "took" it.
  it('says a challenge went unanswered rather than untaken', () => {
    expect(label('challenge', 'outgoing', 'expired')).toBe('No answer');
    expect(label('challenge', 'outgoing', 'accepted')).toBe('They accepted');
  });

  it('reads invites from the viewer’s side', () => {
    expect(label('scheduled_invite', 'incoming', 'declined')).toBe('You declined');
    expect(label('scheduled_invite', 'outgoing', 'declined')).toBe('They declined');
    expect(label('scheduled_invite', 'outgoing', 'superseded')).toBe('The time went to another debate');
  });

  it('describes debates and lobbies', () => {
    expect(label('debate', null, 'held')).toBe('Debated');
    expect(label('debate', null, 'never_started')).toBe('Didn’t start');
    expect(label('lobby', null, 'joined')).toBe('You joined');
  });

  // Requests that ended before outcomes were recorded: say nothing rather than guess.
  it('says nothing for an unknown outcome', () => {
    expect(label('claim_request', 'outgoing', 'unknown')).toBeNull();
    expect(label('claim_request', 'incoming', 'unknown')).toBeNull();
  });
});

describe('isSettledHistoryItem', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const item = (outcome: string, occurredAt: string) => ({ outcome, occurred_at: occurredAt }) as DebateHistoryItem;

  it('keeps settled items in the past', () => {
    expect(isSettledHistoryItem(item('expired', '2026-10-22T12:00:00Z'), now)).toBe(true);
  });

  it('drops still-open items and anything not yet happened', () => {
    expect(isSettledHistoryItem(item('pending', '2026-10-22T12:00:00Z'), now)).toBe(false);
    expect(isSettledHistoryItem(item('in_progress', '2026-10-22T12:00:00Z'), now)).toBe(false);
    expect(isSettledHistoryItem(item('accepted', '2026-10-24T12:00:00Z'), now)).toBe(false);
  });
});
