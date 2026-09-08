import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import type { ModesByColumn } from './filters';
import { useOptimisticFilterModes } from './use-optimistic-filter-modes';

describe('useOptimisticFilterModes', () => {
  it('shows a mode change immediately and keeps it until persistence catches up', () => {
    const { result, rerender } = renderHook(
      ({ persisted }: { persisted: ModesByColumn }) => useOptimisticFilterModes(persisted),
      { initialProps: { persisted: {} } }
    );

    act(() => result.current.setOptimisticModesByColumn({ 'publish-date': 'OR' }));
    expect(result.current.modesByColumn).toEqual({ 'publish-date': 'OR' });

    // A draft property is not serialized yet, so the persisted map can remain
    // unchanged without snapping the control back to AND.
    rerender({ persisted: {} });
    expect(result.current.modesByColumn).toEqual({ 'publish-date': 'OR' });

    // Once storage catches up, release the override and follow later external
    // changes normally.
    rerender({ persisted: { 'publish-date': 'OR' } });
    rerender({ persisted: {} });
    expect(result.current.modesByColumn).toEqual({});
  });
});
