import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useSerialRuns } from './best-debate-grading';

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(r => (resolve = r));
  return { promise, resolve };
}

describe('useSerialRuns (GEO-3729: one Best debates publish at a time on the block)', () => {
  it('starts a call only once the one before has finished', async () => {
    const first = deferred();
    const started: string[] = [];
    const { result } = renderHook(() =>
      useSerialRuns(async (name: string) => {
        started.push(name);
        return name === 'placement' ? first.promise : true;
      })
    );
    let grade!: Promise<boolean>;
    await act(async () => {
      void result.current.run('placement');
      grade = result.current.run('grade');
    });
    expect(started).toEqual(['placement']);
    await act(async () => first.resolve(true));
    await expect(grade).resolves.toBe(true);
    expect(started).toEqual(['placement', 'grade']);
  });

  it('settles only once calls made while it waited have finished too', async () => {
    const first = deferred();
    const second = deferred();
    const { result } = renderHook(() => useSerialRuns(async (n: number) => (n === 1 ? first.promise : second.promise)));
    let settled = false;
    await act(async () => {
      void result.current.run(1);
      void result.current.whenSettled().then(() => (settled = true));
      void result.current.run(2);
    });
    await act(async () => first.resolve(true));
    expect(settled).toBe(false);
    await act(async () => second.resolve(true));
    expect(settled).toBe(true);
  });
});
