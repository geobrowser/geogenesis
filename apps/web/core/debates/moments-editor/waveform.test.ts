import { describe, expect, it } from 'vitest';

import { RENDERED_TURN_SEGMENTS } from '../open-rounds-media-fixtures';
import type { AudioPeaksReady, AudioPeaksStatus } from './api';
import {
  PEAKS_GIVE_UP_MS,
  cutStretches,
  decodePeaks,
  fineWindow,
  formatFineTime,
  mixLanes,
  peakColumns,
  peaksPollDelay,
  peaksView,
} from './waveform';

const ONE_CLOCK = RENDERED_TURN_SEGMENTS.map(({ source_start_ms: _s, source_end_ms: _e, ...rest }) => rest);

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

const ready = (lane1: number[], lane2: number[], overrides: Partial<AudioPeaksReady> = {}): AudioPeaksReady => ({
  debate_id: 'd',
  status: 'ready',
  clock: 'player',
  bucket_ms: 10,
  scale: 'dbfs_u8',
  floor_db: -60,
  lanes: [
    { participant_slot: 1, offset: 0, samples: lane1.length },
    { participant_slot: 2, offset: lane1.length, samples: lane2.length },
  ],
  version: 'v1',
  data: base64([...lane1, ...lane2]),
  ...overrides,
});

describe('decodePeaks / mixLanes', () => {
  it('reads each lane at its offset and draws the louder of the two per bucket', () => {
    const peaks = decodePeaks(ready([10, 200, 0, 30], [50, 100, 255, 0]));
    expect(peaks).not.toBeNull();
    expect(peaks!.bucketMs).toBe(10);
    expect(peaks!.version).toBe('v1');
    expect([...peaks!.samples]).toEqual([50, 200, 255, 30]);
  });

  it('is as long as the longer lane: the shorter one is silence past its end', () => {
    expect([...decodePeaks(ready([5, 5, 5, 9], [7]))!.samples]).toEqual([7, 5, 5, 9]);
    expect([...mixLanes([new Uint8Array([1]), new Uint8Array([0, 4])])]).toEqual([1, 4]);
    expect([...mixLanes([])]).toEqual([]);
  });

  it('cuts a lane short where it reaches past the bytes', () => {
    const peaks = decodePeaks(
      ready([1, 2], [3, 4], {
        lanes: [
          { participant_slot: 1, offset: 0, samples: 2 },
          { participant_slot: 2, offset: 2, samples: 10 },
        ],
      })
    );
    expect([...peaks!.samples]).toEqual([3, 4]);
  });

  it('reads nothing it can’t: bytes that don’t decode, an unknown scale, no bucket size', () => {
    expect(decodePeaks(ready([1], [1], { data: '%%%not base64' }))).toBeNull();
    expect(decodePeaks(ready([1], [1], { scale: 'linear' as 'dbfs_u8' }))).toBeNull();
    expect(decodePeaks(ready([1], [1], { bucket_ms: 0 }))).toBeNull();
  });
});

describe('peakColumns', () => {
  const peaks = { bucketMs: 10, samples: new Uint8Array([0, 10, 0, 0, 90, 0, 40, 0, 0, 0]) };

  it('takes the loudest bucket in each column, so a short peak is never averaged away', () => {
    // 100 ms in 2 columns of 50 ms: buckets 0-4 and 5-9.
    expect([...peakColumns(peaks, 0, 100, 2)]).toEqual([90, 40]);
  });

  // The peaks are on the player's clock from 0: bucket i is i * 10 ms on, the time the player shows.
  it('puts a bucket at the player time it was cut at', () => {
    const loud = new Uint8Array(400);
    loud[305] = 200; // 3050 ms
    const columns = peakColumns({ bucketMs: 10, samples: loud }, 3_000, 3_100, 10);
    expect([...columns].indexOf(200)).toBe(5);
    expect(columns.filter(value => value > 0)).toHaveLength(1);
  });

  it('gives a column narrower than a bucket the bucket under it', () => {
    expect([...peakColumns(peaks, 40, 50, 4)]).toEqual([90, 90, 90, 90]);
  });

  it('reads silence before the debate and past the peaks’ end', () => {
    expect([...peakColumns(peaks, -20, 0, 2)]).toEqual([0, 0]);
    expect([...peakColumns(peaks, 90, 130, 4)]).toEqual([0, 0, 0, 0]);
  });

  it('draws nothing in no columns or an empty window', () => {
    expect(peakColumns(peaks, 0, 100, 0)).toHaveLength(0);
    expect([...peakColumns(peaks, 50, 50, 3)]).toEqual([0, 0, 0]);
  });
});

describe('cutStretches', () => {
  it('is what the render cut between its real-speed stretches, and after the last', () => {
    expect(cutStretches(RENDERED_TURN_SEGMENTS, 330_000)).toEqual([
      { start_ms: 120_000, end_ms: 128_000 },
      { start_ms: 218_000, end_ms: 229_950 },
      { start_ms: 270_944, end_ms: 274_650 },
      { start_ms: 321_086, end_ms: 330_000 },
    ]);
  });

  it('stops at the debate’s length', () => {
    expect(cutStretches(RENDERED_TURN_SEGMENTS, 125_000)).toEqual([{ start_ms: 120_000, end_ms: 125_000 }]);
  });

  // A fixed-format render shares one clock with the recordings: it cut nothing.
  it('is nothing for a fixed format', () => {
    expect(cutStretches(ONE_CLOCK, 330_000)).toEqual([]);
    expect(cutStretches([], 9_000)).toEqual([]);
  });
});

describe('fineWindow', () => {
  it('shows the clip with the padding either side, kept inside the debate', () => {
    expect(fineWindow({ start_ms: 5_000, end_ms: 8_000 }, 60_000, 2_000)).toEqual({ start_ms: 3_000, end_ms: 10_000 });
    expect(fineWindow({ start_ms: 500, end_ms: 59_500 }, 60_000, 2_000)).toEqual({ start_ms: 0, end_ms: 60_000 });
  });
});

describe('formatFineTime', () => {
  it('shows hundredths', () => {
    expect(formatFineTime(0)).toBe('0:00.00');
    expect(formatFineTime(3_050)).toBe('0:03.05');
    expect(formatFineTime(61_234)).toBe('1:01.23');
    expect(formatFineTime(59_996)).toBe('1:00.00');
  });
});

describe('peaksPollDelay', () => {
  it('reads every 5 s, every 15 s after two minutes, and stops at ten', () => {
    expect(peaksPollDelay(0)).toBe(5_000);
    expect(peaksPollDelay(119_000)).toBe(5_000);
    expect(peaksPollDelay(120_000)).toBe(15_000);
    // The last read lands on the ten minutes.
    expect(peaksPollDelay(PEAKS_GIVE_UP_MS - 4_000)).toBe(4_000);
    expect(peaksPollDelay(PEAKS_GIVE_UP_MS)).toBe(false);
  });
});

describe('peaksView', () => {
  const view = (status: AudioPeaksStatus | null | undefined, extra: Partial<Parameters<typeof peaksView>[0]> = {}) =>
    peaksView({ status, failed: false, pending: false, gaveUp: false, peaks: null, ...extra });

  it('waits on the first read, then on the build, saying how long', () => {
    expect(view(undefined, { pending: true })).toEqual({ kind: 'loading' });
    expect(view({ debate_id: 'd', status: 'queued', requested_at: 'x', waiting_s: 41, queue_position: 1 })).toEqual({
      kind: 'waiting',
      message: 'Preparing the waveform… (waiting 0:41)',
    });
    expect(view({ debate_id: 'd', status: 'running', requested_at: 'x', waiting_s: 125 })).toMatchObject({
      message: 'Preparing the waveform… (waiting 2:05)',
    });
  });

  it('says it is still waiting once it gave up', () => {
    expect(
      view({ debate_id: 'd', status: 'queued', requested_at: 'x', waiting_s: 600 }, { gaveUp: true })
    ).toMatchObject({ kind: 'gave-up', message: expect.stringMatching(/^Still waiting for the media worker/) });
  });

  it('shows no waveform for a missing route, an error, a failure or an unavailable debate', () => {
    const none = { kind: 'none', message: 'No waveform for this debate.' };
    expect(view(null)).toEqual(none);
    expect(view(undefined, { failed: true })).toEqual(none);
    expect(view({ debate_id: 'd', status: 'unavailable', reason: 'recordings_missing' })).toEqual(none);
    expect(view({ debate_id: 'd', status: 'failed', reason: 'error', permanent: true })).toEqual(none);
    // Ready, but bytes the editor can't read.
    expect(view(ready([1], [1]))).toEqual(none);
    expect(
      view({ debate_id: 'd', status: 'failed', reason: 'error', permanent: false, retry_after: '2026-11-16T15:00:00Z' })
    ).toMatchObject({
      kind: 'none',
      message: expect.stringMatching(/^No waveform for this debate\. Reopen the editor after /),
    });
    expect(view({ debate_id: 'd', status: 'unavailable', reason: 'media_job_active' })).toMatchObject({
      kind: 'none',
      message: expect.stringMatching(/still processing/),
    });
  });

  it('draws ready peaks', () => {
    const peaks = decodePeaks(ready([1], [2]))!;
    expect(view(ready([1], [2]), { peaks })).toEqual({ kind: 'ready', peaks });
  });
});
