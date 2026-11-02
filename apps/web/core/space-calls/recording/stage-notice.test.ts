import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { stageRecordingNotice, useStageRecordingNotice } from './stage-notice';

afterEach(() => window.localStorage.clear());

describe('stageRecordingNotice', () => {
  it('says nothing off stage, while not recording, or once acknowledged', () => {
    const base = { recording: true, onStage: true, acknowledged: false, onStageWhenStarted: false };
    expect(stageRecordingNotice({ ...base, onStage: false })).toBe('none');
    expect(stageRecordingNotice({ ...base, recording: false })).toBe('none');
    expect(stageRecordingNotice({ ...base, acknowledged: true })).toBe('none');
    expect(stageRecordingNotice(base)).toBe('prompt');
    expect(stageRecordingNotice({ ...base, onStageWhenStarted: true })).toBe('toast');
  });
});

describe('useStageRecordingNotice', () => {
  it('prompts someone who goes on stage while it records', () => {
    const { result, rerender } = renderHook(
      ({ recording, onStage }) => useStageRecordingNotice('call1', recording, onStage),
      {
        initialProps: { recording: true, onStage: false },
      }
    );
    expect(result.current.notice).toBe('none');
    rerender({ recording: true, onStage: true });
    expect(result.current.notice).toBe('prompt');
  });

  it('only tells someone already on stage when recording starts', () => {
    const { result, rerender } = renderHook(
      ({ recording, onStage }) => useStageRecordingNotice('call1', recording, onStage),
      {
        initialProps: { recording: false, onStage: true },
      }
    );
    rerender({ recording: true, onStage: true });
    expect(result.current.notice).toBe('toast');
  });

  it('prompts again after stepping down and back up, unless acknowledged', () => {
    const { result, rerender } = renderHook(
      ({ recording, onStage }) => useStageRecordingNotice('call1', recording, onStage),
      {
        initialProps: { recording: false, onStage: true },
      }
    );
    rerender({ recording: true, onStage: true });
    rerender({ recording: true, onStage: false });
    rerender({ recording: true, onStage: true });
    expect(result.current.notice).toBe('prompt');
    act(() => result.current.acknowledge());
    expect(result.current.notice).toBe('none');
  });

  it('remembers the acknowledgement for the call, under either id spelling', () => {
    const first = renderHook(() => useStageRecordingNotice('aa-bb', true, true));
    act(() => first.result.current.acknowledge());
    const again = renderHook(() => useStageRecordingNotice('aabb', true, true));
    expect(again.result.current.notice).toBe('none');
    const other = renderHook(() => useStageRecordingNotice('ccdd', true, true));
    expect(other.result.current.notice).toBe('prompt');
  });
});
