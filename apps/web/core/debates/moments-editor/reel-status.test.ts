import { describe, expect, it } from 'vitest';

import { type MomentBackfillStatus, readMomentBackfills } from './api';
import { clipProblemsFrom, jobInFlight, reelJob, refusalBlocksEditing, refusalMessage } from './reel-status';

const request = (overrides: Partial<MomentBackfillStatus>): MomentBackfillStatus => ({
  debate_id: '01a0448a-61d3-7101-8434-a20fdadf6f97',
  status: 'queued',
  requested_by: 'space',
  reason: 'Moments editor: hand-picked reel',
  requested_at: '2026-11-11T20:00:00Z',
  recut: true,
  preview: false,
  outcome: null,
  report: null,
  last_error: null,
  completed_at: null,
  ...overrides,
});

describe('reelJob', () => {
  // Never "published" while it is only queued: a queued or running request is not done.
  it('reads a queued and a running request as waiting, not live', () => {
    expect(reelJob(request({ status: 'queued' }))).toMatchObject({ kind: 'queued', preview: false });
    expect(reelJob(request({ status: 'running' }))).toMatchObject({ kind: 'rendering' });
    expect(jobInFlight(reelJob(request({ status: 'queued' })))).toBe(true);
    expect(jobInFlight(reelJob(request({ status: 'running' })))).toBe(true);
  });

  it('reads a finished request as done, with its report, and tells a preview and an unlock apart', () => {
    const report = { story_reel: [] };
    expect(reelJob(request({ status: 'done', preview: true, report }))).toEqual({
      kind: 'done',
      preview: true,
      unlock: false,
      report,
    });
    expect(reelJob(request({ status: 'done', unlock: true }))).toMatchObject({ kind: 'done', unlock: true });
    expect(jobInFlight(reelJob(request({ status: 'done' })))).toBe(false);
  });

  it('maps a skipped hand-picked reel’s problems back to its clips, in play order', () => {
    const job = reelJob(
      request({
        status: 'skipped',
        outcome: 'manual_reel_invalid',
        report: { story_failed: 'clip 2: no words are said in it; clip 4: there is no claim 9' },
      })
    );
    expect(job).toMatchObject({
      kind: 'failed',
      summary: refusalMessage('manual_reel_invalid'),
      clips: { 1: ['no words are said in it'], 3: ['there is no claim 9'] },
      other: [],
    });
  });

  it('reads a failed request with the worker’s error', () => {
    const job = reelJob(
      request({ status: 'failed', outcome: 'error', last_error: 'a hand-picked clip did not render; nothing written' })
    );
    expect(job).toMatchObject({
      kind: 'failed',
      summary: 'The media worker failed: a hand-picked clip did not render; nothing written',
    });
  });

  it('is nothing without a request', () => {
    expect(reelJob(null).kind).toBe('none');
  });
});

describe('clipProblemsFrom', () => {
  it('keeps what names no clip whole', () => {
    expect(clipProblemsFrom('rule_broken: clip over 22 s')).toEqual({
      clips: {},
      other: ['rule_broken: clip over 22 s'],
    });
  });

  it('collects several problems for one clip', () => {
    expect(clipProblemsFrom('clip 1: a; clip 1: b').clips).toEqual({ 0: ['a', 'b'] });
  });
});

describe('refusalBlocksEditing', () => {
  it('leaves a debate with a request in the queue editable, and blocks the rest', () => {
    expect(refusalBlocksEditing(null)).toBe(false);
    expect(refusalBlocksEditing('already_queued')).toBe(false);
    expect(refusalBlocksEditing('media_job_active')).toBe(true);
    expect(refusalBlocksEditing('recording_cancelled')).toBe(true);
  });

  it('says why in words, and names an unknown code as it came', () => {
    expect(refusalMessage('media_job_failed')).toMatch(/media job failed/);
    expect(refusalMessage('something_new')).toBe('geo-chat refused it: something_new.');
  });
});

describe('readMomentBackfills', () => {
  const id = '01a0448a-61d3-7101-8434-a20fdadf6f97';

  it('reads the bare list of requests geo-chat answered before the editor', () => {
    const status = request({ debate_id: id.replace(/-/g, '') });
    expect(readMomentBackfills([request({ debate_id: 'other' }), status], id)).toEqual({
      request: status,
      entry: null,
    });
  });

  it('reads the `{applied, debates}` shape, with the entry beside its request', () => {
    const status = request({});
    const entry = {
      debate_id: id,
      refusal: null,
      path: null,
      claims: null,
      timed_claims: null,
      reel_version: 'abc',
      hand_picked: null,
      queued: false,
      request: status,
    };
    expect(readMomentBackfills({ applied: false, debates: [entry] }, id)).toEqual({ request: status, entry });
  });

  it('reads no request for a debate that has none', () => {
    expect(readMomentBackfills([], id)).toEqual({ request: null, entry: null });
  });
});
