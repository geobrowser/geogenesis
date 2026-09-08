import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { act, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation, Value } from '~/core/types';

import { useEditProfile } from './use-edit-profile';

const ENTITY_ID = 'person-entity';
const SPACE_ID = 'personal-space';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  createAndLink: vi.fn(),
  deleteRelations: vi.fn(),
  deleteValues: vi.fn(),
  setValue: vi.fn(),
  clearLocalChangesByIds: vi.fn(),
  setStoredAvatar: vi.fn(),
  invalidateQueries: vi.fn(),
  dispatch: vi.fn(),
  reviewState: 'idle' as string,
  entityRelations: [] as Relation[],
  storeValues: [] as Value[],
  storeRelations: [] as Relation[],
}));

vi.mock('jotai', () => ({ useSetAtom: () => mocks.setStoredAvatar }));
vi.mock('~/partials/onboarding/dialog', () => ({ avatarAtom: {} }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' } } }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: SPACE_ID, personalEntityId: ENTITY_ID, isRegistered: true }),
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));

vi.mock('~/core/state/status-bar-store', () => ({
  useStatusBar: () => ({ state: { reviewState: mocks.reviewState }, dispatch: mocks.dispatch }),
}));

vi.mock('~/core/database/entities', () => ({
  useEntity: () => ({
    name: 'Preston',
    description: 'Working on debates.',
    relations: mocks.entityRelations,
    isLoading: false,
  }),
}));

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityCoverUrl: () => 'ipfs://old-banner',
  useEntityAvatarUrl: () => 'ipfs://old-avatar',
  findMediaUrlValue: (values: { value: string }[]) => values.find(v => v.value.startsWith('ipfs://'))?.value,
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      values: { set: mocks.setValue, deleteMany: mocks.deleteValues },
      relations: { deleteMany: mocks.deleteRelations },
      images: { createAndLink: mocks.createAndLink },
    },
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  getValues: ({ selector }: { selector?: (v: Value) => boolean }) =>
    mocks.storeValues.filter(v => (selector ? selector(v) : true)),
  getRelations: ({ selector }: { selector?: (r: Relation) => boolean }) =>
    mocks.storeRelations.filter(r => (selector ? selector(r) : true)),
}));

vi.mock('~/core/sync/use-sync-engine', () => ({
  store: { clearLocalChangesByIds: mocks.clearLocalChangesByIds },
}));

function relation(overrides: Partial<Relation>): Relation {
  return {
    id: 'relation-id',
    entityId: 'relation-entity',
    spaceId: SPACE_ID,
    type: { id: SystemIds.COVER_PROPERTY, name: 'Cover' },
    fromEntity: { id: ENTITY_ID, name: 'Preston' },
    toEntity: { id: 'image-1', name: null, value: 'image-1' },
    renderableType: 'IMAGE',
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  } as Relation;
}

const UNCHANGED = { kind: 'unchanged' } as const;

const draft = (overrides: Partial<Parameters<ReturnType<typeof useEditProfile>['publish']>[0]> = {}) => ({
  name: 'Preston',
  description: 'Working on debates.',
  banner: UNCHANGED,
  avatar: UNCHANGED,
  ...overrides,
});

beforeEach(() => {
  Object.values(mocks).forEach(value => {
    if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
  });
  mocks.reviewState = 'idle';
  mocks.entityRelations = [];
  mocks.storeValues = [];
  mocks.storeRelations = [];
  mocks.makeProposal.mockResolvedValue(undefined);
  mocks.createAndLink.mockResolvedValue({ imageId: 'new-image', relationId: 'new-relation' });
});

afterEach(() => vi.clearAllMocks());

describe('useEditProfile', () => {
  it('removes an image by deleting its relation, not by writing an empty value', async () => {
    const cover = relation({ id: 'cover-relation' });
    mocks.entityRelations = [cover];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });

    expect(mocks.deleteRelations).toHaveBeenCalledWith([cover]);
    // Writing an empty value would leave a dangling relation that still renders.
    expect(mocks.setValue).not.toHaveBeenCalled();
    expect(mocks.createAndLink).not.toHaveBeenCalled();
  });

  it('drops the existing relation before linking a replacement', async () => {
    const avatar = relation({ id: 'avatar-relation', type: { id: ContentIds.AVATAR_PROPERTY, name: 'Avatar' } });
    mocks.entityRelations = [avatar];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));
    const file = new File([''], 'me.png', { type: 'image/png' });

    await act(async () => {
      await result.current.publish(draft({ avatar: { kind: 'replaced', file } }));
    });

    expect(mocks.deleteRelations).toHaveBeenCalledWith([avatar]);
    expect(mocks.createAndLink).toHaveBeenCalledWith(
      expect.objectContaining({ file, relationPropertyId: ContentIds.AVATAR_PROPERTY, fromEntityId: ENTITY_ID })
    );
  });

  it('only touches a field the user actually changed', async () => {
    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });

    expect(mocks.setValue).toHaveBeenCalledTimes(1);
    expect(mocks.setValue).toHaveBeenCalledWith(
      expect.objectContaining({
        property: expect.objectContaining({ id: SystemIds.NAME_PROPERTY }),
        value: 'Preston M',
      })
    );
  });

  it('deletes the description value when the field is cleared', async () => {
    const existing = {
      id: 'desc-value',
      entity: { id: ENTITY_ID },
      property: { id: SystemIds.DESCRIPTION_PROPERTY },
      spaceId: SPACE_ID,
    } as unknown as Value;
    mocks.storeValues = [existing];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ description: '' }));
    });

    expect(mocks.deleteValues).toHaveBeenCalledWith([existing]);
  });

  it('retries the same staged edit without uploading the file a second time', async () => {
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));
    const file = new File([''], 'banner.png', { type: 'image/png' });

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'replaced', file } }));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mocks.createAndLink).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'replaced', file } }));
    });

    expect(mocks.createAndLink).toHaveBeenCalledTimes(1);
    expect(mocks.makeProposal).toHaveBeenCalledTimes(2);
  });

  it('clears the global publish error while the modal is still showing its own', async () => {
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });

    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  });

  it('leaves the global error alone once the modal has been closed', async () => {
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(({ isOpen }) => useEditProfile({ isOpen }), {
      initialProps: { isOpen: false },
    });

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });

    // The status bar is the hand-off; it has to keep the failure it is showing.
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('writes the new avatar back so the navbar does not keep the old photo', async () => {
    mocks.storeValues = [
      {
        id: 'v1',
        entity: { id: 'new-image' },
        property: { id: 'url' },
        spaceId: SPACE_ID,
        value: 'ipfs://new-avatar',
      } as unknown as Value,
    ];
    mocks.makeProposal.mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));
    const file = new File([''], 'me.png', { type: 'image/png' });

    await act(async () => {
      await result.current.publish(draft({ avatar: { kind: 'replaced', file } }));
    });

    await waitFor(() => expect(result.current.status).toBe('published'));
    expect(mocks.setStoredAvatar).toHaveBeenCalledWith('ipfs://new-avatar');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile', '0xabc'] });
  });

  it('falls the navbar avatar back to the generated gradient when the photo is removed', async () => {
    mocks.entityRelations = [
      relation({ id: 'avatar-relation', type: { id: ContentIds.AVATAR_PROPERTY, name: 'Avatar' } }),
    ];
    mocks.makeProposal.mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ avatar: { kind: 'removed' } }));
    });

    await waitFor(() => expect(result.current.status).toBe('published'));
    expect(mocks.setStoredAvatar).toHaveBeenCalledWith('');
  });

  it('leaves the stored avatar untouched when only the name changed', async () => {
    mocks.makeProposal.mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });

    await waitFor(() => expect(result.current.status).toBe('published'));
    expect(mocks.setStoredAvatar).not.toHaveBeenCalled();
  });

  it('rolls the staged rows back out of the local store when the edit is abandoned', async () => {
    mocks.storeValues = [
      {
        id: 'staged-value',
        entity: { id: ENTITY_ID },
        spaceId: SPACE_ID,
        isLocal: true,
        property: { id: SystemIds.NAME_PROPERTY },
      } as unknown as Value,
    ];
    mocks.storeRelations = [relation({ id: 'staged-relation' })];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.discard());

    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      valueIds: ['staged-value'],
      relationIds: ['staged-relation'],
    });
    expect(result.current.status).toBe('idle');
  });

  it('settles on the review state rather than waiting out the success animation', async () => {
    // makeProposal resolves ~3s after the write lands. The modal cannot keep
    // saying "about 10 seconds" through that window.
    mocks.makeProposal.mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    act(() => {
      void result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('publishing'));

    mocks.reviewState = 'publish-complete';
    rerender();

    await waitFor(() => expect(result.current.status).toBe('published'));
  });
});
