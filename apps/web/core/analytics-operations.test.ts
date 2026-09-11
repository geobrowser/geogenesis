import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observeOperation } from './analytics-operations';

const { capture, revision } = vi.hoisted(() => ({ capture: vi.fn(), revision: vi.fn(() => 0) }));
vi.mock('./analytics', () => ({ capture, analyticsContextRevision: revision }));
beforeEach(() => {
  capture.mockReset();
  revision.mockReturnValue(0);
});

describe('operation evidence', () => {
  it('keeps submitted and indexed phases on one operation and ignores duplicate callbacks', () => {
    const operation = observeOperation('ranking', 'ranking', 'r', {
      opportunity_id: 'o',
      presentation_instance_id: 'p',
    });
    operation.outcome('ranking_submitted', 'submitted', { ranking_id: 'r', mutation_kind: 'first_submission' });
    operation.outcome('ranking_submitted', 'submitted', { ranking_id: 'r' });
    operation.outcome('ranking_submitted', 'indexed', { ranking_id: 'r' });
    expect(capture).toHaveBeenCalledTimes(3);
    expect(new Set(capture.mock.calls.map(([, p]) => p.operation_id)).size).toBe(1);
    expect(capture.mock.calls.map(([event, p]) => [event, p.outcome_phase])).toEqual([
      ['action_attempted', undefined],
      ['ranking_submitted', 'submitted'],
      ['ranking_submitted', 'indexed'],
    ]);
  });
  it('does not manufacture an opportunity, successful outcome or raw failure message', () => {
    const operation = observeOperation('vote', 'debate', 'd');
    operation.failed('rejected');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toBe('action_failed');
    expect(capture.mock.calls[0][1]).not.toHaveProperty('opportunity_id');
  });
  it('swallows telemetry failures', () => {
    capture.mockImplementation(() => {
      throw new Error('offline');
    });
    expect(() => observeOperation('vote', 'debate', 'd').failed('unknown')).not.toThrow();
  });
  it('does not reassign asynchronous results after identity changes', () => {
    const operation = observeOperation('vote', 'debate', 'd');
    revision.mockReturnValue(1);
    operation.outcome('vote_cast', 'indexed', {});
    expect(capture).not.toHaveBeenCalled();
  });
});
