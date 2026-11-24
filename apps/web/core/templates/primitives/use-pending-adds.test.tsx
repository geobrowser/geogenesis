import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import type { TemplateAddResult } from '../models';
import { PUBLISHING_LABEL, type PendingAddState, usePendingAdds } from './use-pending-adds';

type Row = { id: string; title: string; meta?: string; pending?: boolean };

const REAL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const build = (state: PendingAddState): Omit<Row, 'id'> => ({
  title: 'Aid entered',
  pending: state.status === 'pending',
  meta: state.status === 'pending' ? PUBLISHING_LABEL : state.status === 'published' ? state.spaceId : undefined,
});

function deferred() {
  let resolve!: (result: TemplateAddResult) => void;
  const promise = new Promise<TemplateAddResult>(r => (resolve = r));
  return { promise, resolve };
}

describe('usePendingAdds', () => {
  it('shows a pending row, then the real entity once published, then defers to the refetched list', async () => {
    const publish = deferred();
    const { result, rerender } = renderHook(({ listed }) => usePendingAdds<Row>(listed), {
      initialProps: { listed: [] as string[] },
    });

    act(() => result.current.add(build, publish.promise));
    expect(result.current.rows).toEqual([
      expect.objectContaining({ title: 'Aid entered', pending: true, meta: PUBLISHING_LABEL }),
    ]);
    expect(result.current.rows[0]!.id).not.toBe(REAL_ID);

    await act(async () => publish.resolve({ ok: true, id: REAL_ID, spaceId: SPACE }));
    expect(result.current.rows).toEqual([{ id: REAL_ID, title: 'Aid entered', pending: false, meta: SPACE }]);

    // The refetched list has it (in the other id spelling): the list's own row takes over.
    rerender({ listed: [REAL_ID.replace(/-/g, '')] });
    expect(result.current.rows).toEqual([]);
  });

  it('drops the row when the publish fails', async () => {
    const publish = deferred();
    const { result } = renderHook(() => usePendingAdds<Row>([]));

    act(() => result.current.add(build, publish.promise));
    expect(result.current.rows).toHaveLength(1);

    await act(async () => publish.resolve({ ok: false, error: 'Could not publish.' }));
    expect(result.current.rows).toEqual([]);
  });

  it('keeps a published row the list never picks up (a personal-space addition)', async () => {
    const { result } = renderHook(() => usePendingAdds<Row>(['dddddddddddddddddddddddddddddddd']));

    await act(async () => result.current.add(build, Promise.resolve({ ok: true, id: REAL_ID, spaceId: SPACE })));
    expect(result.current.rows.map(row => row.id)).toEqual([REAL_ID]);
  });

  it('with nothing to publish to (a fixture page), adds the row as it is', () => {
    const { result } = renderHook(() => usePendingAdds<Row>([]));

    act(() => result.current.add(build, undefined));
    expect(result.current.rows).toEqual([expect.objectContaining({ pending: false, meta: undefined })]);
  });
});
