import { act, renderHook } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  space: null as null | { topicId: string | null; entity: { id: string } },
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: mocks.space, isLoading: mocks.space === null }),
}));

const { useOpenDebaterProfile } = await import('./use-open-debater-profile');

const PERSONAL_SPACE_ID = '11111111111111111111111111111111';
const TOPIC_ENTITY_ID = '22222222222222222222222222222222';
const PAGE_ENTITY_ID = '33333333333333333333333333333333';

function click(result: { current: (event: React.MouseEvent) => void }) {
  const stopPropagation = vi.fn();
  act(() => result.current({ stopPropagation } as unknown as React.MouseEvent));
  return stopPropagation;
}

beforeEach(() => {
  mocks.openSidePanel.mockReset();
  mocks.space = null;
});

describe('useOpenDebaterProfile', () => {
  it('opens the topic entity and pins it to the debater personal space', () => {
    // A failed nested-topic decode can leave `entity` pointing at the page/system record. The
    // declared topic id is still authoritative and must win.
    mocks.space = { topicId: TOPIC_ENTITY_ID, entity: { id: PAGE_ENTITY_ID } };
    const { result } = renderHook(() => useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }));

    expect(click(result)).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).toHaveBeenCalledWith(TOPIC_ENTITY_ID, PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });
  });

  it('uses the profile page entity for an older personal space without a declared topic', () => {
    mocks.space = { topicId: null, entity: { id: PAGE_ENTITY_ID } };
    const { result } = renderHook(() => useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }));

    click(result);

    expect(mocks.openSidePanel).toHaveBeenCalledWith(PAGE_ENTITY_ID, PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });
  });

  it('waits for the profile topic instead of falling back to the personal-space system entity', () => {
    const { result, rerender } = renderHook(() => useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }));

    expect(click(result)).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();

    mocks.space = { topicId: TOPIC_ENTITY_ID, entity: { id: PAGE_ENTITY_ID } };
    rerender();

    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).toHaveBeenCalledWith(TOPIC_ENTITY_ID, PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });
  });
});
