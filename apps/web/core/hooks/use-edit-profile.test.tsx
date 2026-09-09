import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { act, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';
import type { Relation, Value } from '~/core/types';

import { useEditProfile } from './use-edit-profile';

// The real ids from the account this modal was first tested against, whose space
// had a null topicId — see the topicId test below.
const ENTITY_ID = '3eb17193b0ae44fe9083ce931bc9210e';
const SPACE_ID = 'c3cdf799eb8a469abbb609b7c3ecdb83';
const ADDRESS = '0xA452380716c7699581aE129f178cafa8a49e5e80';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  createAndLink: vi.fn(),
  deleteRelations: vi.fn(),
  setRelation: vi.fn(),
  deleteRelation: vi.fn(),
  deleteValue: vi.fn(),
  deleteValues: vi.fn(),
  setValue: vi.fn(),
  clearLocalChangesByIds: vi.fn(),
  setStoredAvatar: vi.fn(),
  setQueryData: vi.fn(),
  dispatch: vi.fn(),
  reviewState: 'idle' as string,
  entityName: 'Preston' as string | null,
  hydratedEntity: {} as object | null,
  coverUrl: 'ipfs://old-banner' as string | undefined,
  avatarUrl: 'ipfs://old-avatar' as string | undefined,
  entityDescription: 'Working on debates.' as string | null,
  // Literals, not the consts above: vi.hoisted runs before their initialisers.
  personalEntityId: '3eb17193b0ae44fe9083ce931bc9210e' as string | null,
  profile: {
    id: '3eb17193b0ae44fe9083ce931bc9210e',
    spaceId: 'c3cdf799eb8a469abbb609b7c3ecdb83',
    name: 'Preston',
    avatarUrl: null,
  } as { id: string; spaceId: string; name: string | null; avatarUrl: string | null } | null,
  storeValues: [] as Value[],
  storeRelations: [] as Relation[],
}));

vi.mock('jotai', () => ({ useSetAtom: () => mocks.setStoredAvatar }));
vi.mock('~/partials/onboarding/dialog', () => ({ avatarAtom: {} }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: ADDRESS } } }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: SPACE_ID,
    personalEntityId: mocks.personalEntityId,
    isRegistered: true,
  }),
}));

vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: mocks.profile }) }));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));

vi.mock('~/core/state/status-bar-store', () => ({
  useStatusBar: () => ({ state: { reviewState: mocks.reviewState }, dispatch: mocks.dispatch }),
}));

vi.mock('~/core/database/entities', () => ({
  useEntity: () => ({
    name: mocks.entityName,
    description: mocks.entityDescription,
    relations: [],
    isLoading: false,
  }),
}));

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityCoverUrl: () => mocks.coverUrl,
  useEntityAvatarUrl: () => mocks.avatarUrl,
  findMediaUrlValue: (values: { value: string }[]) => values.find(v => v.value.startsWith('ipfs://'))?.value,
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      values: { set: mocks.setValue, deleteMany: mocks.deleteValues, delete: mocks.deleteValue },
      relations: { deleteMany: mocks.deleteRelations, set: mocks.setRelation, delete: mocks.deleteRelation },
      images: { createAndLink: mocks.createAndLink },
    },
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  // Non-null means hydration produced an entity; the hook reads this to tell a
  // settled-but-failed fetch from a successful one.
  useQueryEntity: () => ({ entity: mocks.hydratedEntity, isLoading: false }),
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

/** The value id `stage` derives for a property, so fixtures can be found by it. */
const valueId = (propertyId: string) => ID.createValueId({ entityId: ENTITY_ID, propertyId, spaceId: SPACE_ID });

/** A local row the staging pass would have written, so it survives the collection. */
const stagedValue = (propertyId: string) =>
  ({
    id: valueId(propertyId),
    entity: { id: ENTITY_ID },
    property: { id: propertyId },
    spaceId: SPACE_ID,
    isLocal: true,
    hasBeenPublished: false,
  }) as unknown as Value;

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
  mocks.entityName = 'Preston';
  mocks.entityDescription = 'Working on debates.';
  mocks.personalEntityId = ENTITY_ID;
  mocks.hydratedEntity = {};
  mocks.coverUrl = 'ipfs://old-banner';
  mocks.avatarUrl = 'ipfs://old-avatar';
  mocks.profile = { id: ENTITY_ID, spaceId: SPACE_ID, name: 'Preston', avatarUrl: null };
  mocks.storeValues = [];
  mocks.storeRelations = [];
  // Mirror the store: deleting replaces the row with an isLocal tombstone rather
  // than removing it. Without that the snapshot-ordering test cannot observe the
  // very thing it is checking.
  mocks.deleteValues.mockImplementation((values: Value[]) => {
    const ids = new Set(values.map(v => v.id));
    mocks.storeValues = mocks.storeValues.map(v =>
      ids.has(v.id) ? ({ ...v, isLocal: true, isDeleted: true } as Value) : v
    );
  });
  mocks.makeProposal.mockResolvedValue(undefined);
  mocks.createAndLink.mockResolvedValue({ imageId: 'new-image', relationId: 'new-relation' });
});

afterEach(() => vi.clearAllMocks());

describe('resolving the profile entity', () => {
  // Real personal spaces ship with topicId null. Reading it alone left the modal
  // showing a blank profile it also could not have saved, since canEdit was false.
  it('still resolves the entity when the space has no topicId', () => {
    mocks.personalEntityId = null;

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.entityId).toBe(ENTITY_ID);
    expect(result.current.canEdit).toBe(true);
  });

  it('falls back to topicId when the profile lookup degraded to a wallet address', () => {
    // fetchProfile returns defaultProfile(address, address) on every failure path,
    // and an address is not an entity id.
    mocks.profile = { id: ADDRESS, spaceId: SPACE_ID, name: null, avatarUrl: null };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.entityId).toBe(ENTITY_ID);
  });

  // `apiProfileToProfile` falls back to the space id when the record has no
  // entityId, and a space id is a valid 32-hex entity id — so shape alone cannot
  // tell them apart. Staging against it would edit the space's system entity.
  it('rejects the space-id fallback and keeps the topic entity', () => {
    mocks.profile = { id: SPACE_ID, spaceId: SPACE_ID, name: 'Preston', avatarUrl: null };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.entityId).toBe(ENTITY_ID);
  });

  it('reports an unhydrated entity as not ready, even once the fetch has settled', () => {
    // `isLoading` is derived from isFetched, which is true after a failed retry too.
    mocks.hydratedEntity = null;

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.isHydrated).toBe(false);
  });

  it('cannot edit when neither source yields an entity', () => {
    mocks.personalEntityId = null;
    mocks.profile = { id: ADDRESS, spaceId: SPACE_ID, name: null, avatarUrl: null };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.canEdit).toBe(false);
  });

  it('falls back to the profile name while the entity is still hydrating', () => {
    mocks.entityName = null;
    mocks.profile = { id: ENTITY_ID, spaceId: SPACE_ID, name: 'Test account 70', avatarUrl: 'ipfs://profile-avatar' };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.current.name).toBe('Test account 70');
  });
});

describe('useEditProfile', () => {
  it('removes an image by deleting its relation, not by writing an empty value', async () => {
    const cover = relation({ id: 'cover-relation' });
    mocks.storeRelations = [cover];

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
    mocks.storeRelations = [avatar];

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
    mocks.storeRelations = [relation({ id: 'new-relation' })];
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

  // The fields stay live in the error state, so Retry after an edit is a new edit.
  it('re-stages when the draft changed since the failed attempt', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston Mantel' }));
    });

    // The stale rows go back before the corrected ones are written, and the
    // publish carries the name the user actually has on screen.
    expect(mocks.clearLocalChangesByIds).toHaveBeenCalled();
    expect(mocks.setValue).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'Preston Mantel' }));
  });

  it('clears the global publish error while the modal is still showing its own', async () => {
    // usePublish calls onError *before* dispatching the error, so the suppression
    // has to run after both — this is the ordering that made the old one a no-op.
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.reviewState = 'publish-error';
    rerender();

    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  });

  it('leaves the global error alone once the modal has been closed', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result, rerender } = renderHook(({ isOpen }) => useEditProfile({ isOpen }), {
      initialProps: { isOpen: false },
    });

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.reviewState = 'publish-error';
    rerender({ isOpen: false });

    // The status bar is the hand-off; it has to keep the failure it is showing.
    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
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
    // Written into the profile cache, not invalidated: every registered surface
    // reads `profile.avatarUrl`, and refetching would ask the indexer for a write
    // it has not caught up with and put the old photo straight back.
    const [key, updater] = mocks.setQueryData.mock.calls.at(-1)!;
    expect(key).toEqual(['profile', ADDRESS]);
    expect(updater({ name: 'Preston', avatarUrl: 'ipfs://old-avatar' })).toMatchObject({
      avatarUrl: 'ipfs://new-avatar',
    });
  });

  it('falls the navbar avatar back to the generated gradient when the photo is removed', async () => {
    mocks.storeRelations = [
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
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      valueIds: [valueId(SystemIds.NAME_PROPERTY)],
      relationIds: [],
    });
    expect(result.current.status).toBe('idle');
  });

  // Only this modal's rows. An unrelated pending edit on the same entity must not
  // ride along on the publish, nor be rolled back when this one is abandoned.
  // Value ids are derived from entity + property + space, so a normal-editor change
  // to the same field during an in-flight publish replaces the row at our id.
  // Undoing by id alone would delete a draft this modal never made.
  it('leaves a row alone when another edit replaced it since staging', async () => {
    const staged = { ...stagedValue(SystemIds.NAME_PROPERTY), timestamp: 't1' } as Value;
    mocks.storeValues = [staged];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    // The same id, a newer version — someone else's unsaved work.
    mocks.storeValues = [{ ...staged, timestamp: 't2', value: 'Their newer draft' } as Value];

    act(() => result.current.reset());

    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith(expect.objectContaining({ valueIds: [] }));
  });

  // A first upload fails, the user changes their mind and switches to Remove. The
  // rollback takes the staged image back out, so staging finds nothing to delete —
  // but the draft has only returned to how the profile started.
  it('treats reverting a failed first upload to Remove as no change, not a failed removal', async () => {
    mocks.coverUrl = undefined;
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());
    const file = new File([''], 'banner.png', { type: 'image/png' });
    mocks.storeRelations = [relation({ id: 'new-relation' })];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'replaced', file } }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.storeRelations = [];
    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });

    expect(result.current.status).toBe('published');
    expect(result.current.errorMessage).toBeNull();
  });

  // An id the version check declined to clear belongs to a newer edit. Putting our
  // snapshot back there would overwrite the very draft we just protected.
  it('does not restore a snapshot over a row it declined to clear', async () => {
    const theirDraft = { ...stagedValue(SystemIds.NAME_PROPERTY), timestamp: 't1', value: 'Their draft' } as Value;
    mocks.storeValues = [theirDraft];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    // Replaced again by yet another edit while the publish was in flight.
    mocks.storeValues = [{ ...theirDraft, timestamp: 't3', value: 'Newer still' } as Value];
    mocks.setValue.mockClear();

    act(() => result.current.reset());

    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith(expect.objectContaining({ valueIds: [] }));
    expect(mocks.setValue).not.toHaveBeenCalled();
  });

  it('leaves a pending edit made elsewhere on the entity out of the publish', async () => {
    const ours = stagedValue(SystemIds.NAME_PROPERTY);
    const theirs = {
      id: 'someone-elses-row',
      entity: { id: ENTITY_ID },
      property: { id: 'unrelated-property' },
      spaceId: SPACE_ID,
      isLocal: true,
      hasBeenPublished: false,
    } as unknown as Value;
    mocks.storeValues = [ours, theirs];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });

    expect(mocks.makeProposal).toHaveBeenCalledWith(expect.objectContaining({ values: [ours] }));
  });

  it('rolls back the rows already written when an upload fails midway', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.createAndLink.mockRejectedValueOnce(new Error('IPFS is down'));

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));
    const file = new File([''], 'banner.png', { type: 'image/png' });

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M', banner: { kind: 'replaced', file } }));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // The name value landed before the upload threw. Left behind it becomes a
    // pending edit on the personal space for a save that never happened.
    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith(
      expect.objectContaining({ valueIds: [valueId(SystemIds.NAME_PROPERTY)] })
    );
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  // `current.*Url` falls back to the profile endpoint, which answers across
  // spaces, while the edges staging can delete are scoped to the personal space.
  // Reporting success there closes the modal over an image still on screen.
  it('fails a removal it cannot carry out rather than reporting it saved', async () => {
    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });

    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toContain('Couldn’t find your banner to remove');
  });

  it('fails the whole edit when a removal cannot be carried out, even if other fields staged', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M', avatar: { kind: 'removed' } }));
    });

    // Publishing the name alone would leave the photo up and call it saved.
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(mocks.clearLocalChangesByIds).toHaveBeenCalled();
  });

  it('settles a draft that matches the entity instead of publishing an empty proposal', async () => {
    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft());
    });

    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.status).toBe('published');
  });

  // A removal can publish nothing but a tombstone left by another pending edit.
  // Keying the write-back on a *live* edge skipped the navbar update there.
  it('tells the navbar the photo is gone even when only a tombstone was published', async () => {
    mocks.storeRelations = [
      relation({
        id: 'old-avatar-edge',
        type: { id: ContentIds.AVATAR_PROPERTY, name: 'Avatar' },
        isDeleted: true,
      }),
    ];
    mocks.makeProposal.mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ avatar: { kind: 'removed' } }));
    });

    await waitFor(() => expect(result.current.status).toBe('published'));
    expect(mocks.setStoredAvatar).toHaveBeenCalledWith('');
  });

  it('clears its status after a success so the modal can be opened again', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('published'));

    act(() => result.current.reset());

    // A status stuck on 'published' makes the dialog's auto-close effect fire on
    // the next open, shutting it instantly for the rest of the session.
    expect(result.current.status).toBe('idle');
    // Nothing staged is left to undo.
    expect(mocks.clearLocalChangesByIds).not.toHaveBeenCalled();
  });

  // The global review state carries no operation identity, so it cannot be used to
  // settle this publish: another publish reaching 'publish-complete' would drop the
  // staged rows and update the avatar while the profile write was still running,
  // leaving nothing to roll back when it then failed.
  it('does not settle on another publish completing while this one runs', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    act(() => {
      void result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('publishing'));

    mocks.reviewState = 'publish-complete';
    rerender();

    expect(result.current.status).toBe('publishing');
    expect(mocks.setStoredAvatar).not.toHaveBeenCalled();
  });

  // A failure that lands while closed reopens the modal. Consuming the flag before
  // that leaves the global error standing next to the one the modal is about to
  // show — two dialogs, two retries that can race.
  it('holds the global error until the modal is back on screen to own it', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result, rerender } = renderHook(({ isOpen }) => useEditProfile({ isOpen }), {
      initialProps: { isOpen: false },
    });

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.reviewState = 'publish-error';
    rerender({ isOpen: false });
    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });

    rerender({ isOpen: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  });

  // `setAsPublished` leaves published rows in the store as isLocal, and every
  // restore path forces hasBeenPublished back to false — so snapshotting an
  // earlier successful edit and putting it back turns finished work into pending
  // work again.
  it('does not resurrect an already-published edit when a later one is abandoned', async () => {
    const alreadyPublished = {
      ...stagedValue(SystemIds.NAME_PROPERTY),
      hasBeenPublished: true,
      value: 'Published earlier this session',
    } as Value;
    // Plus one genuinely pending row, so the edit has something to publish and
    // reaches the failure rather than short-circuiting as a no-op.
    mocks.storeValues = [alreadyPublished, stagedValue(SystemIds.DESCRIPTION_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M', description: 'Changed too' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.setValue.mockClear();
    act(() => result.current.reset());

    // The pending description row is restored, as it should be. The published name
    // row is not: clearing it is the whole undo.
    const restored = mocks.setValue.mock.calls.map(call => (call[0] as Value).value);
    expect(restored).not.toContain('Published earlier this session');
  });

  // A declined wallet prompt calls onError but sends the review state to idle, not
  // publish-error. Leaving the flag armed there means the next unrelated failure is
  // mistaken for ours and cleared.
  it('releases error ownership when a rejected prompt settles back to idle', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    // The publish is in flight, so the review state is mid-write when it fails.
    mocks.reviewState = 'publishing-contract';
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    // The rejection path: idle rather than publish-error.
    mocks.reviewState = 'idle';
    rerender();

    // Someone else's publish fails later, with this modal still open.
    mocks.dispatch.mockClear();
    mocks.reviewState = 'publish-error';
    rerender();

    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  });

  // Staging uploads to IPFS before `makeProposal` touches the status bar. Closing
  // during that upload is meant to hand off to the toast, so the toast has to be
  // saying something already.
  it('puts the upload on the status bar before the publish starts', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY)];
    const file = new File([''], 'banner.png', { type: 'image/png' });
    let dispatchedBeforePublish: unknown[] = [];
    mocks.makeProposal.mockImplementationOnce(async () => {
      dispatchedBeforePublish = mocks.dispatch.mock.calls.map(([action]) => action);
    });

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M', banner: { kind: 'replaced', file } }));
    });

    expect(dispatchedBeforePublish).toContainEqual({ type: 'SET_REVIEW_STATE', payload: 'publishing-ipfs' });
  });

  it('takes the upload back off the status bar when staging fails', async () => {
    mocks.createAndLink.mockRejectedValueOnce(new Error('IPFS is down'));
    const file = new File([''], 'banner.png', { type: 'image/png' });

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'replaced', file } }));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // `makeProposal` never ran, so nothing else would clear the pill.
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  });

  it('leaves an unrelated publish failure showing in the status bar', async () => {
    // Only the error this modal actually caused gets cleared. Suppressing on
    // status alone would swallow someone else's failure that landed while the
    // profile error sat open.
    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    mocks.reviewState = 'publish-error';
    rerender();

    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('restores a pending edit from the normal editor that it had to overwrite', async () => {
    // Value ids are derived from entity + property + space, so a draft on the same
    // field shares this modal's id and is replaced by it.
    const theirDraft = { ...stagedValue(SystemIds.NAME_PROPERTY), value: 'Their unsaved name' } as Value;
    mocks.storeValues = [theirDraft];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    // Rolling back cleared the shared id; without putting the snapshot back, their
    // unpublished work is gone.
    expect(mocks.setValue).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'Their unsaved name' }));
  });

  // `deleteMany` replaces the row with an isLocal tombstone, so snapshotting after
  // it captures the tombstone instead of the draft it buried — and rollback then
  // re-saves that as a fresh unpublished value rather than letting the synced
  // baseline back.
  it('does not resurrect a cleared description as a pending edit on rollback', async () => {
    const synced = {
      id: valueId(SystemIds.DESCRIPTION_PROPERTY),
      entity: { id: ENTITY_ID },
      property: { id: SystemIds.DESCRIPTION_PROPERTY },
      spaceId: SPACE_ID,
      value: 'Working on debates.',
    } as unknown as Value;
    mocks.storeValues = [synced];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ description: '' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    // Nothing to restore: the row was synced, so clearing the id is the whole undo.
    expect(mocks.setValue).not.toHaveBeenCalled();
  });

  // A pending replacement from the normal editor leaves the old remote edge as a
  // deleted-but-unpublished row that `useEntity` hides. Publishing only the edge we
  // can see would add a second remote edge and leave that deletion behind.
  it('publishes the tombstone of an edge another pending edit already removed', async () => {
    const tombstone = relation({ id: 'old-remote-edge', isDeleted: true });
    const pendingEdge = relation({ id: 'their-pending-edge' });
    mocks.storeRelations = [tombstone, pendingEdge];

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });

    const [{ relations }] = mocks.makeProposal.mock.calls.at(-1)!;
    expect(relations.map((r: Relation) => r.id).sort()).toEqual(['old-remote-edge', 'their-pending-edge']);
  });

  it('restores a locally-created image edge it had to tombstone', async () => {
    const pendingEdge = relation({ id: 'their-pending-edge', isLocal: true });
    mocks.storeRelations = [pendingEdge];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    // A locally-created edge has no synced baseline, so clearing it would erase it
    // outright rather than restore anything.
    expect(mocks.setRelation).toHaveBeenCalledWith(pendingEdge);
  });

  // `store.setValue`/`setRelation` force `isDeleted = false`, so putting a snapshot
  // back with `set` would resurrect a pending *deletion* this edit wrote over.
  it('restores an overwritten tombstone as a deletion, not as a live value', async () => {
    const theirPendingDeletion = {
      ...stagedValue(SystemIds.NAME_PROPERTY),
      isDeleted: true,
      value: 'Name they were deleting',
    } as Value;
    mocks.storeValues = [theirPendingDeletion];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'Preston M' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(mocks.deleteValue).toHaveBeenCalledWith(theirPendingDeletion);
    expect(mocks.setValue).not.toHaveBeenCalledWith(theirPendingDeletion);
  });

  // A replacement made in the normal editor is two local rows: a tombstone for the
  // old remote edge and a live replacement. Restoring only the live one leaves the
  // old edge back alongside it, with the deletion lost.
  it('restores both halves of a pending image replacement it wrote over', async () => {
    const theirTombstone = relation({ id: 'old-remote-edge', isLocal: true, isDeleted: true });
    const theirReplacement = relation({ id: 'their-replacement', isLocal: true });
    mocks.storeRelations = [theirTombstone, theirReplacement];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(mocks.setRelation).toHaveBeenCalledWith(theirReplacement);
    expect(mocks.deleteRelation).toHaveBeenCalledWith(theirTombstone);
  });

  // `current` reads back through the local store, so a failed attempt's own rows
  // are in it. Re-staging against that treats the fields it already wrote as
  // unchanged and silently drops them from the retry.
  it('re-stages an edited draft against the original baseline, not the failed edit', async () => {
    mocks.storeValues = [stagedValue(SystemIds.NAME_PROPERTY), stagedValue(SystemIds.DESCRIPTION_PROPERTY)];
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());

    const { result, rerender } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ name: 'B', description: 'Y' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    // The store now reports the failed edit, exactly as `useEntity` would.
    mocks.entityName = 'B';
    mocks.entityDescription = 'Y';
    rerender();

    mocks.setValue.mockClear();
    await act(async () => {
      await result.current.publish(draft({ name: 'C', description: 'Y' }));
    });

    // Y still has to be written: it was rolled back with the rest of the attempt,
    // and remotely the description is still the original.
    const written = mocks.setValue.mock.calls.map(call => (call[0] as Value).value);
    expect(written).toContain('C');
    expect(written).toContain('Y');
  });

  it('rolls back an image entity minted before a later upload failed', async () => {
    mocks.storeValues = [
      { id: 'banner-image-value', entity: { id: 'new-image' }, spaceId: SPACE_ID, isLocal: true } as unknown as Value,
    ];
    mocks.storeRelations = [relation({ id: 'new-relation', fromEntity: { id: 'new-image', name: null } })];
    mocks.createAndLink
      .mockResolvedValueOnce({ imageId: 'new-image', relationId: 'new-relation' })
      .mockRejectedValueOnce(new Error('IPFS is down'));

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));
    const file = new File([''], 'image.png', { type: 'image/png' });

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'replaced', file }, avatar: { kind: 'replaced', file } }));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // The banner's image entity landed before the avatar upload threw. Tracking
    // only the link relation would strand its values in the store.
    expect(mocks.clearLocalChangesByIds).toHaveBeenCalledWith(
      expect.objectContaining({ valueIds: ['banner-image-value'], relationIds: ['new-relation'] })
    );
  });
});
