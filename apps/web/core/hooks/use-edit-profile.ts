'use client';

import { ContentIds, IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { useEntity } from '~/core/database/entities';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import type { Relation, Value } from '~/core/types';
import { findMediaUrlValue, useEntityAvatarUrl, useEntityCoverUrl } from '~/core/utils/use-entity-media';

import { avatarAtom } from '~/partials/onboarding/dialog';

export type ProfileImageEdit =
  /** Untouched — whatever is on the entity today stays there. */
  | { kind: 'unchanged' }
  /** Picked in the modal but not yet uploaded; the upload happens on save. */
  | { kind: 'replaced'; file: File }
  /** Cleared. Deletes the relation — writing an empty value would leave a dangling one. */
  | { kind: 'removed' };

export type ProfileDraft = {
  name: string;
  description: string;
  banner: ProfileImageEdit;
  avatar: ProfileImageEdit;
};

export type EditProfileStatus = 'idle' | 'publishing' | 'error' | 'published';

/** The local rows one save produced, kept so Retry re-sends them without re-uploading. */
type StagedEdit = {
  values: Value[];
  relations: Relation[];
  /** ipfs:// URL of the newly uploaded avatar, or '' when the avatar was removed. */
  nextAvatarUrl: string | null;
};

const IMAGE_PROPERTIES = {
  banner: { id: SystemIds.COVER_PROPERTY, name: 'Cover' },
  avatar: { id: ContentIds.AVATAR_PROPERTY, name: 'Avatar' },
} as const;

/**
 * Backs the Edit profile modal (GEO-2839): reads the four fields off the viewer's
 * own person entity, and publishes changes straight to their personal space with
 * no review step.
 *
 * Uploads are deliberately deferred to save rather than run on file pick. Picking
 * an image would otherwise mint graph rows in the local store, and cancelling the
 * modal would leave them behind as phantom pending edits on the personal space.
 */
export function useEditProfile({ isOpen }: { isOpen: boolean }) {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { personalSpaceId, personalEntityId, isRegistered } = usePersonalSpaceId();
  const { profile } = useGeoProfile(address);
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const { state: statusBarState, dispatch } = useStatusBar();
  const setStoredAvatar = useSetAtom(avatarAtom);
  const queryClient = useQueryClient();

  const spaceId = personalSpaceId ?? '';

  // `space.topicId` is null on plenty of real personal spaces — it was null on
  // the account this was first tested against, which left the modal reading a
  // blank profile it could not have saved either. /profile/address answers with
  // the person entity directly, so prefer it and keep topicId as the fallback.
  // Its own fallback is the wallet address, which is not an entity id, hence the
  // validity check rather than a truthiness one.
  const entityId = profile?.id && IdUtils.isValid(profile.id) ? profile.id : (personalEntityId ?? '');
  const canEdit = Boolean(isRegistered && spaceId && entityId);

  const entity = useEntity({ id: entityId, spaceId: spaceId || undefined });

  const [status, setStatus] = React.useState<EditProfileStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const stagedRef = React.useRef<StagedEdit | null>(null);

  // The dialog owns "open"; the publish continues after it closes, so the error
  // handler reads the live value rather than closing over a stale one.
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;

  // Relations are read imperatively during save, after the awaited uploads, so a
  // ref keeps them current without making `stage` depend on every render.
  const entityRelationsRef = React.useRef<Relation[]>(entity.relations);
  entityRelationsRef.current = entity.relations;

  const bannerUrl = useEntityCoverUrl(entityId || undefined, spaceId);
  const avatarUrl = useEntityAvatarUrl(entityId || undefined, spaceId);

  // The profile query is already warm — the navbar runs it on every page — so it
  // fills the fields immediately while the entity hydrates behind it, and covers
  // a name held outside this space that the space-scoped read won't return.
  const current = React.useMemo(
    () => ({
      name: entity.name ?? profile?.name ?? '',
      description: entity.description ?? '',
      bannerUrl,
      avatarUrl: avatarUrl ?? profile?.avatarUrl ?? undefined,
    }),
    [entity.name, entity.description, bannerUrl, avatarUrl, profile?.name, profile?.avatarUrl]
  );

  const stage = React.useCallback(
    async (draft: ProfileDraft): Promise<StagedEdit> => {
      // Every entity whose rows this edit touches. Used to scope the collection
      // below so we publish this edit rather than everything pending in the space.
      const touchedEntityIds = new Set<string>([entityId]);
      let nextAvatarUrl: string | null = null;

      if (draft.name !== current.name) {
        storage.values.set({
          entity: { id: entityId, name: draft.name },
          property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT', renderableType: 'TEXT' },
          spaceId,
          value: draft.name,
        });
      }

      if (draft.description !== current.description) {
        if (draft.description === '') {
          const existing = getValues({
            selector: v =>
              v.entity.id === entityId && v.property.id === SystemIds.DESCRIPTION_PROPERTY && v.spaceId === spaceId,
          });
          storage.values.deleteMany(existing);
        } else {
          storage.values.set({
            entity: { id: entityId, name: draft.name },
            property: {
              id: SystemIds.DESCRIPTION_PROPERTY,
              name: 'Description',
              dataType: 'TEXT',
              renderableType: 'TEXT',
            },
            spaceId,
            value: draft.description,
          });
        }
      }

      for (const kind of ['banner', 'avatar'] as const) {
        const edit = draft[kind];
        if (edit.kind === 'unchanged') continue;

        const property = IMAGE_PROPERTIES[kind];

        // Replace and remove both start by dropping the existing edge. The publish
        // layer cascades the orphaned image entity for cover/avatar relations.
        const existing = entityRelationsRef.current.filter(
          relation => relation.type.id === property.id && relation.fromEntity.id === entityId
        );
        storage.relations.deleteMany(existing);

        if (edit.kind === 'removed') {
          if (kind === 'avatar') nextAvatarUrl = '';
          continue;
        }

        const { imageId } = await storage.images.createAndLink({
          file: edit.file,
          fromEntityId: entityId,
          fromEntityName: draft.name,
          relationPropertyId: property.id,
          relationPropertyName: property.name,
          spaceId,
        });

        touchedEntityIds.add(imageId);

        if (kind === 'avatar') {
          nextAvatarUrl = findMediaUrlValue(getValues({ selector: v => v.entity.id === imageId })) ?? null;
        }
      }

      const isOurs = (relation: Relation) =>
        touchedEntityIds.has(relation.fromEntity.id) || touchedEntityIds.has(relation.entityId);

      return {
        values: getValues({
          includeDeleted: true,
          selector: v =>
            v.spaceId === spaceId &&
            v.isLocal === true &&
            v.hasBeenPublished !== true &&
            touchedEntityIds.has(v.entity.id),
        }),
        relations: getRelations({
          includeDeleted: true,
          selector: r => r.spaceId === spaceId && r.isLocal === true && r.hasBeenPublished !== true && isOurs(r),
        }),
        nextAvatarUrl,
      };
    },
    [current.description, current.name, entityId, spaceId, storage]
  );

  /**
   * Drop the local rows this modal staged, restoring the entity to its synced
   * state. Called when the user walks away from a failed save so the personal
   * space isn't left carrying an edit they abandoned.
   */
  const discard = React.useCallback(() => {
    const staged = stagedRef.current;
    stagedRef.current = null;
    setStatus('idle');
    setErrorMessage(null);
    if (!staged || !spaceId) return;

    store.clearLocalChangesByIds({
      spaceId,
      valueIds: staged.values.map(v => v.id),
      relationIds: staged.relations.map(r => r.id),
    });
  }, [spaceId]);

  const settleSuccess = React.useCallback(() => {
    const staged = stagedRef.current;
    if (!staged) return;
    stagedRef.current = null;
    setStatus('published');

    // The navbar avatar reads this atom, not the entity. Without the write-back
    // the old photo survives until a hard refresh, which reads as the save
    // having silently failed.
    if (staged.nextAvatarUrl !== null) setStoredAvatar(staged.nextAvatarUrl);
    void queryClient.invalidateQueries({ queryKey: ['profile', address] });
  }, [address, queryClient, setStoredAvatar]);

  // `makeProposal` resolves about three seconds after the write actually lands —
  // it holds its success state on screen first. The modal cannot keep saying
  // "about 10 seconds" through that window, so completion is taken from the
  // review state the publish dispatches, and `onSuccess` below is the backstop.
  React.useEffect(() => {
    if (status !== 'publishing') return;
    if (statusBarState.reviewState !== 'publish-complete') return;
    settleSuccess();
  }, [settleSuccess, status, statusBarState.reviewState]);

  const publish = React.useCallback(
    async (draft: ProfileDraft) => {
      if (!canEdit) return;

      setStatus('publishing');
      setErrorMessage(null);

      if (!stagedRef.current) {
        try {
          // Retry re-sends this same edit, so the uploads inside only ever run once.
          stagedRef.current = await stage(draft);
        } catch (error) {
          console.error('[edit-profile] failed to stage profile edit', error);
          setStatus('error');
          setErrorMessage('Couldn’t upload your images. Your changes are still here — try again.');
          return;
        }
      }

      const staged = stagedRef.current;

      await makeProposal({
        values: staged.values,
        relations: staged.relations,
        spaceId,
        name: 'Edit profile',
        onSuccess: settleSuccess,
        onError: () => {
          setStatus('error');
          setErrorMessage('Couldn’t publish your profile. Your changes are still here — try again.');

          // The global status bar renders publish errors as its own full-screen
          // modal. While this one is open it owns the failure — including Retry —
          // so clear the global copy rather than stacking two error dialogs. Once
          // the modal is closed the status bar is the hand-off and keeps it.
          if (isOpenRef.current) dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        },
      });
    },
    [canEdit, dispatch, makeProposal, settleSuccess, spaceId, stage]
  );

  return {
    canEdit,
    isLoading: entity.isLoading,
    entityId,
    spaceId,
    current,
    status,
    errorMessage,
    publish,
    discard,
  };
}
