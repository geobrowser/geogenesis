import { act, renderHook } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  sidePanelTarget: null as null | { entityId: string },
  spaces: new Map<string, { topicId: string | null; entity: { id: string } }>(),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, sidePanelTarget: mocks.sidePanelTarget }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: (spaceId?: string) => {
    const space = spaceId ? (mocks.spaces.get(spaceId) ?? null) : null;
    return { space, isLoading: space === null };
  },
}));

const { useOpenDebaterProfile } = await import('./use-open-debater-profile');

const PERSONAL_SPACE_ID = '11111111111111111111111111111111';
const TOPIC_ENTITY_ID = '22222222222222222222222222222222';
const PAGE_ENTITY_ID = '33333333333333333333333333333333';
const OTHER_PERSONAL_SPACE_ID = '44444444444444444444444444444444';

function click(result: { current: (event: React.MouseEvent) => void }) {
  const stopPropagation = vi.fn();
  // Both, because the name surfaces are anchors now: the profile opens beside the thread, and the
  // href is what makes middle-click and "copy link address" still work.
  const preventDefault = vi.fn();
  act(() => result.current({ stopPropagation, preventDefault } as unknown as React.MouseEvent));
  return stopPropagation;
}

beforeEach(() => {
  mocks.openSidePanel.mockReset();
  mocks.sidePanelTarget = null;
  mocks.spaces.clear();
});

describe('useOpenDebaterProfile', () => {
  it('opens the topic entity and pins it to the debater personal space', () => {
    // A failed nested-topic decode can leave `entity` pointing at the page/system record. The
    // declared topic id is still authoritative and must win.
    mocks.spaces.set(PERSONAL_SPACE_ID, { topicId: TOPIC_ENTITY_ID, entity: { id: PAGE_ENTITY_ID } });
    const { result } = renderHook(() => useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }));

    expect(click(result)).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).toHaveBeenCalledWith(TOPIC_ENTITY_ID, PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });
  });

  it('uses the profile page entity for an older personal space without a declared topic', () => {
    mocks.spaces.set(PERSONAL_SPACE_ID, { topicId: null, entity: { id: PAGE_ENTITY_ID } });
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

    mocks.spaces.set(PERSONAL_SPACE_ID, { topicId: TOPIC_ENTITY_ID, entity: { id: PAGE_ENTITY_ID } });
    rerender();

    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).toHaveBeenCalledWith(TOPIC_ENTITY_ID, PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });
  });

  it('does not carry a pending click over to a different participant', () => {
    const { result, rerender } = renderHook(
      ({ profileSpaceId }: { profileSpaceId: string }) => useOpenDebaterProfile({ profile_space_id: profileSpaceId }),
      { initialProps: { profileSpaceId: PERSONAL_SPACE_ID } }
    );

    click(result);
    rerender({ profileSpaceId: OTHER_PERSONAL_SPACE_ID });
    mocks.spaces.set(OTHER_PERSONAL_SPACE_ID, { topicId: TOPIC_ENTITY_ID, entity: { id: PAGE_ENTITY_ID } });
    rerender({ profileSpaceId: OTHER_PERSONAL_SPACE_ID });

    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  it('keeps an older unresolved hook instance from replacing a newer profile click', () => {
    const OTHER_TOPIC_ENTITY_ID = '55555555555555555555555555555555';
    const { result, rerender } = renderHook(() => ({
      first: useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }),
      second: useOpenDebaterProfile({ profile_space_id: OTHER_PERSONAL_SPACE_ID }),
    }));

    click({ current: result.current.first });
    click({ current: result.current.second });

    mocks.spaces.set(OTHER_PERSONAL_SPACE_ID, {
      topicId: OTHER_TOPIC_ENTITY_ID,
      entity: { id: OTHER_TOPIC_ENTITY_ID },
    });
    rerender();
    expect(mocks.openSidePanel).toHaveBeenCalledWith(OTHER_TOPIC_ENTITY_ID, OTHER_PERSONAL_SPACE_ID, false, {
      forceRequestedSpace: true,
    });

    mocks.spaces.set(PERSONAL_SPACE_ID, { topicId: TOPIC_ENTITY_ID, entity: { id: TOPIC_ENTITY_ID } });
    rerender();

    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
  });

  it('does not let a pending profile replace another side-panel navigation', () => {
    const { result, rerender } = renderHook(() => useOpenDebaterProfile({ profile_space_id: PERSONAL_SPACE_ID }));

    click(result);
    mocks.sidePanelTarget = { entityId: 'another-entity' };
    rerender();
    mocks.spaces.set(PERSONAL_SPACE_ID, { topicId: TOPIC_ENTITY_ID, entity: { id: TOPIC_ENTITY_ID } });
    rerender();

    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });
});
