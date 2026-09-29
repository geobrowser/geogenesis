import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyOperationFailure, observeOperation, queueTimeoutMetrics } from './analytics-operations';
import { ReceiptConfirmationTimeoutError } from './errors';

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
  it('passes numeric failure metrics through without letting them override the code', () => {
    observeOperation('vote', 'entity', 'e').failed('unavailable', { queue_wait_ms: 121_000, queue_depth: 4 });
    expect(capture).toHaveBeenCalledWith(
      'action_failed',
      expect.objectContaining({ failure_code: 'unavailable', queue_wait_ms: 121_000, queue_depth: 4 })
    );
  });
  it('does not reassign asynchronous results after identity changes', () => {
    const operation = observeOperation('vote', 'debate', 'd');
    revision.mockReturnValue(1);
    operation.outcome('vote_cast', 'indexed', {});
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('operation failure classification', () => {
  it('keeps a submitted operation unknown when its receipt query was rejected', () => {
    const receipt = new ReceiptConfirmationTimeoutError('Receipt unavailable', { cause: { code: 4001 } });
    expect(classifyOperationFailure(receipt)).toBe('unknown');
    expect(classifyOperationFailure(new Error('User rejected receipt request', { cause: receipt }))).toBe('unknown');
  });
  it('recognizes wrapped wallet rejection', () => {
    expect(classifyOperationFailure(new Error('Transaction failed', { cause: { code: 4001 } }))).toBe('rejected');
    expect(
      classifyOperationFailure(new Error('Transaction failed', { cause: new Error('User rejected the request.') }))
    ).toBe('rejected');
  });
  it('distinguishes an unsent queue timeout from an uncertain submitted transaction', () => {
    const queued = new Error('never submitted');
    queued.name = 'QueuedSendTimeoutError';
    expect(classifyOperationFailure(new Error('Transaction failed', { cause: queued }))).toBe('unavailable');
    expect(classifyOperationFailure(new Error('receipt timeout'))).toBe('unknown');
    expect(classifyOperationFailure(new Error('network unavailable'))).toBe('unknown');
  });
  it('bounds cyclic causes and handles non-errors conservatively', () => {
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(classifyOperationFailure(cycle)).toBe('unknown');
    expect(classifyOperationFailure(null)).toBe('unknown');
  });
});

describe('queue timeout metrics', () => {
  it('reads wait and depth from a wrapped QueuedSendTimeoutError', () => {
    const queued = Object.assign(new Error('never submitted'), { waitedMs: 121_000, queueDepth: 3 });
    queued.name = 'QueuedSendTimeoutError';
    expect(queueTimeoutMetrics(new Error('Transaction failed', { cause: queued }))).toEqual({
      queue_wait_ms: 121_000,
      queue_depth: 3,
    });
  });
  it('returns nothing for other failures', () => {
    expect(queueTimeoutMetrics(new Error('receipt timeout'))).toBeUndefined();
    expect(queueTimeoutMetrics(null)).toBeUndefined();
  });
});
