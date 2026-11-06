import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_RESUME_POSITIONS,
  RESUME_STORAGE_KEY,
  forgetDebatePosition,
  pruneResumePositions,
  readDebateResumeSeconds,
  rememberDebatePosition,
  useRememberDebatePosition,
} from './debate-resume-positions';

const DAY_MS = 86_400_000;
const START = new Date('2026-11-05T12:00:00.000Z');

beforeEach(() => {
  window.localStorage.removeItem(RESUME_STORAGE_KEY);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('debate resume positions', () => {
  it('resumes five seconds before where the viewer stopped', () => {
    rememberDebatePosition('debate-1', 300, 1_200);

    expect(readDebateResumeSeconds('debate-1')).toBe(295);
    expect(readDebateResumeSeconds('debate-2')).toBeNull();
  });

  it('matches a debate id whatever its dashes', () => {
    rememberDebatePosition('6f1c2a90-0000-4000-8000-000000000001', 300, 1_200);

    expect(readDebateResumeSeconds('6f1c2a90000040008000000000000001')).toBe(295);
  });

  it('remembers nothing for the first few seconds, and forgets an earlier position there', () => {
    rememberDebatePosition('debate-1', 14, 1_200);
    expect(readDebateResumeSeconds('debate-1')).toBeNull();

    rememberDebatePosition('debate-1', 300, 1_200);
    rememberDebatePosition('debate-1', 8, 1_200);
    expect(readDebateResumeSeconds('debate-1')).toBeNull();
  });

  it('does not rewind a resume below the point where positions start being remembered', () => {
    rememberDebatePosition('debate-1', 17, 1_200);

    expect(readDebateResumeSeconds('debate-1')).toBe(15);
  });

  it('treats the last ten seconds as finished', () => {
    rememberDebatePosition('debate-1', 300, 1_200);
    rememberDebatePosition('debate-1', 1_191, 1_200);

    expect(readDebateResumeSeconds('debate-1')).toBeNull();
  });

  it('remembers a position for fourteen days from the last watch', () => {
    rememberDebatePosition('debate-1', 300, 1_200);

    vi.setSystemTime(START.getTime() + 10 * DAY_MS);
    rememberDebatePosition('debate-1', 320, 1_200);

    // Fourteen days after the first watch, but only four after the last one.
    vi.setSystemTime(START.getTime() + 14 * DAY_MS + 1_000);
    expect(readDebateResumeSeconds('debate-1')).toBe(315);

    vi.setSystemTime(START.getTime() + 24 * DAY_MS + 1_000);
    expect(readDebateResumeSeconds('debate-1')).toBeNull();
  });

  it('drops expired positions from storage on the next write', () => {
    rememberDebatePosition('debate-1', 300, 1_200);
    vi.setSystemTime(START.getTime() + 15 * DAY_MS);

    rememberDebatePosition('debate-2', 300, 1_200);

    expect(Object.keys(JSON.parse(window.localStorage.getItem(RESUME_STORAGE_KEY)!).e)).toEqual(['debate2']);
  });

  it('keeps the most recently watched when there are too many', () => {
    const now = START.getTime() / 1000;
    const entries = new Map(
      Array.from({ length: MAX_RESUME_POSITIONS + 2 }, (_, i) => [`debate-${i}`, { p: 100, at: now - i }] as const)
    );

    const kept = pruneResumePositions(entries, now);

    expect(kept.size).toBe(MAX_RESUME_POSITIONS);
    expect(kept.has('debate-0')).toBe(true);
    expect(kept.has(`debate-${MAX_RESUME_POSITIONS}`)).toBe(false);
  });

  it('forgets a debate', () => {
    rememberDebatePosition('debate-1', 300, 1_200);
    rememberDebatePosition('debate-2', 300, 1_200);

    forgetDebatePosition('debate-1');

    expect(readDebateResumeSeconds('debate-1')).toBeNull();
    expect(readDebateResumeSeconds('debate-2')).toBe(295);
  });

  it('keeps a position another tab wrote since this one last looked', () => {
    rememberDebatePosition('debate-1', 300, 1_200);
    const stored = JSON.parse(window.localStorage.getItem(RESUME_STORAGE_KEY)!);
    stored.e['debate2'] = { p: 200, at: START.getTime() / 1000 };
    window.localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(stored));

    rememberDebatePosition('debate-1', 310, 1_200);

    expect(readDebateResumeSeconds('debate-2')).toBe(195);
  });

  it('starts at the beginning when storage is corrupt or unavailable', () => {
    window.localStorage.setItem(RESUME_STORAGE_KEY, '{not json');
    expect(readDebateResumeSeconds('debate-1')).toBeNull();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => rememberDebatePosition('debate-1', 300, 1_200)).not.toThrow();
  });
});

describe('useRememberDebatePosition', () => {
  type Props = { debateId: string; playheadSeconds: number; timelineSeconds: number; recording: boolean };
  const renderRemember = (initial: Props) =>
    renderHook((props: Props) => useRememberDebatePosition(props), { initialProps: initial });
  const at = (playheadSeconds: number, extra: Partial<Props> = {}): Props => ({
    debateId: 'debate-1',
    playheadSeconds,
    timelineSeconds: 1_200,
    recording: true,
    ...extra,
  });

  it('writes at most once per five seconds of playback', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const hook = renderRemember(at(100));
    expect(setItem).toHaveBeenCalledTimes(1);

    for (const seconds of [101, 102, 104]) hook.rerender(at(seconds));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readDebateResumeSeconds('debate-1')).toBe(95);

    hook.rerender(at(105));
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(readDebateResumeSeconds('debate-1')).toBe(100);
  });

  it('writes the last position when playback stops', () => {
    const hook = renderRemember(at(100));
    hook.rerender(at(103));

    hook.rerender(at(103, { recording: false }));

    expect(readDebateResumeSeconds('debate-1')).toBe(98);
  });

  it('writes the last position when the page goes away', () => {
    renderRemember(at(100)).rerender(at(103));

    window.dispatchEvent(new Event('pagehide'));

    expect(readDebateResumeSeconds('debate-1')).toBe(98);
  });

  it('writes nothing while not recording', () => {
    const hook = renderRemember(at(100, { recording: false }));
    hook.rerender(at(200, { recording: false }));
    hook.unmount();

    expect(readDebateResumeSeconds('debate-1')).toBeNull();
  });

  it('pairs the last position with the debate it belongs to when the card moves on to another', () => {
    const hook = renderRemember(at(100));
    hook.rerender(at(103));

    hook.rerender(at(103, { debateId: 'debate-2', recording: false }));

    expect(readDebateResumeSeconds('debate-1')).toBe(98);
    expect(readDebateResumeSeconds('debate-2')).toBeNull();
  });
});
