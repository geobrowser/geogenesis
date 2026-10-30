import { afterEach, expect, it, vi } from 'vitest';

import { trackRecordingPartUpload } from './recording-part-telemetry';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

const context = { debate_id: 'd', recording_started_at_ms: 123, upload_phase: 'live' as const };
afterEach(() => {
  vi.useRealTimers();
  capture.mockReset();
});

it('records the network start and completion time of each part', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  await trackRecordingPartUpload(context, 2, 500, async () => {
    vi.advanceTimersByTime(400);
  });
  expect(capture.mock.calls).toEqual([
    ['debate_recording_part_upload', { ...context, part_number: 2, bytes: 500, started_at_ms: 1000, phase: 'started' }],
    [
      'debate_recording_part_upload',
      {
        ...context,
        part_number: 2,
        bytes: 500,
        started_at_ms: 1000,
        ended_at_ms: 1400,
        elapsed_ms: 400,
        phase: 'completed',
      },
    ],
  ]);
});
it('records failure without leaking error text and preserves the upload error for retry', async () => {
  const error = new Error('secret signed upload URL');
  await expect(
    trackRecordingPartUpload(context, 1, 50, async () => {
      throw error;
    })
  ).rejects.toBe(error);
  expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ phase: 'failed' });
  expect(JSON.stringify(capture.mock.calls)).not.toContain('secret');
});
it('records a part cut short for the call as aborted, not failed', async () => {
  await expect(
    trackRecordingPartUpload(context, 1, 50, async () => {
      throw new DOMException('aborted', 'AbortError');
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ phase: 'aborted' });
});
it('allows upload success even when analytics throws', async () => {
  capture.mockImplementation(() => {
    throw new Error('analytics');
  });
  const put = vi.fn().mockResolvedValue(undefined);
  await trackRecordingPartUpload(context, 1, 50, put);
  expect(put).toHaveBeenCalledOnce();
});

it('measures elapsed time independently of a wall clock adjustment', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  await trackRecordingPartUpload(context, 1, 50, async () => {
    vi.advanceTimersByTime(400);
    vi.setSystemTime(500);
  });
  expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ started_at_ms: 1000, ended_at_ms: 500, elapsed_ms: 400 });
});
