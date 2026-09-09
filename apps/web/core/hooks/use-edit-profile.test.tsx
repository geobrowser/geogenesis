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
  deleteValues: vi.fn(),
  setValue: vi.fn(),
  clearLocalChangesByIds: vi.fn(),
  setStoredAvatar: vi.fn(),
  invalidateQueries: vi.fn(),
  dispatch: vi.fn(),
  reviewState: 'idle' as string,
  entityRelations: [] as Relation[],
  entityName: 'Preston' as string | null,
  // Literals, not the consts above: vi.hoisted runs before their initialisers.
  personalEntityId: '3eb17193b0ae44fe9083ce931bc9210e' as string | null,
  profile: { id: '3eb17193b0ae44fe9083ce931bc9210e', name: 'Preston', avatarUrl: null } as {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null,
  storeValues: [] as Value[],
  storeRelations: [] as Relation[],
}));

vi.mock('jotai', () => ({ useSetAtom: () => mocks.setStoredAvatar }));
vi.mock('~/partials/onboarding/dialog', () => ({ avatarAtom: {} }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
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
  mocks.entityRelations = [];
  mocks.entityName = 'Preston';
  mocks.personalEntityId = ENTITY_ID;
  mocks.profile = { id: ENTITY_ID, name: 'Preston', avatarUrl: null };
  mocks.storeValues = [];
  mocks.storeRelations = [];
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
    mocks.profile = { id: ADDRESS, name: null, avatarUrl: null };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.entityId).toBe(ENTITY_ID);
  });

  it('cannot edit when neither source yields an entity', () => {
    mocks.personalEntityId = null;
    mocks.profile = { id: ADDRESS, name: null, avatarUrl: null };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.canEdit).toBe(false);
  });

  it('falls back to the profile name while the entity is still hydrating', () => {
    mocks.entityName = null;
    mocks.profile = { id: ENTITY_ID, name: 'Test account 70', avatarUrl: 'ipfs://profile-avatar' };

    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    expect(result.current.current.name).toBe('Test account 70');
  });
});

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
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile', ADDRESS] });
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

  it('settles an edit that resolves to nothing instead of publishing an empty proposal', async () => {
    // Removing an image that was never set stages no rows; usePublish would
    // reject that with its generic "Nothing to publish".
    const { result } = renderHook(() => useEditProfile({ isOpen: true }));

    await act(async () => {
      await result.current.publish(draft({ banner: { kind: 'removed' } }));
    });

    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.status).toBe('published');
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
