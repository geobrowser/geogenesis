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
import { ID } from '~/core/id';
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

/** Ids of the local rows this modal wrote, so exactly those can be rolled back. */
type StagedRows = { valueIds: Set<string>; relationIds: Set<string> };

/** The local rows one save produced, kept so Retry re-sends them without re-uploading. */
type StagedEdit = {
  values: Value[];
  relations: Relation[];
  /** ipfs:// URL of the newly uploaded avatar, or '' when the avatar was removed. */
  nextAvatarUrl: string | null;
  rows: StagedRows;
  /** The draft these rows came from, so Retry can tell a re-send from a new edit. */
  draft: ProfileDraft;
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

  const rollback = React.useCallback(
    (rows: StagedRows) => {
      if (!spaceId) return;
      store.clearLocalChangesByIds({
        spaceId,
        valueIds: [...rows.valueIds],
        relationIds: [...rows.relationIds],
      });
    },
    [spaceId]
  );

  const stage = React.useCallback(
    async (draft: ProfileDraft): Promise<StagedEdit> => {
      // Row ids this modal wrote, tracked as it goes so a failed upload can undo
      // the writes that already landed. Scoping the collection below to these —
      // rather than to everything unpublished on the person entity — keeps an
      // unrelated pending edit from riding along on the publish, and from being
      // rolled back when this one is abandoned.
      const written: StagedRows = { valueIds: new Set(), relationIds: new Set() };
      // Freshly minted image entities are ours by definition, so their rows can be
      // swept by entity id without that risk.
      const imageEntityIds = new Set<string>();
      let nextAvatarUrl: string | null = null;

      const setValue = (propertyId: string, propertyName: string, value: string) => {
        const id = ID.createValueId({ entityId, propertyId, spaceId });
        storage.values.set({
          id,
          entity: { id: entityId, name: draft.name },
          property: { id: propertyId, name: propertyName, dataType: 'TEXT', renderableType: 'TEXT' },
          spaceId,
          value,
        });
        written.valueIds.add(id);
      };

      try {
        if (draft.name !== current.name) {
          setValue(SystemIds.NAME_PROPERTY, 'Name', draft.name);
        }

        if (draft.description !== current.description) {
          if (draft.description === '') {
            const existing = getValues({
              selector: v =>
                v.entity.id === entityId && v.property.id === SystemIds.DESCRIPTION_PROPERTY && v.spaceId === spaceId,
            });
            storage.values.deleteMany(existing);
            existing.forEach(v => written.valueIds.add(v.id));
          } else {
            setValue(SystemIds.DESCRIPTION_PROPERTY, 'Description', draft.description);
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
          existing.forEach(r => written.relationIds.add(r.id));

          if (edit.kind === 'removed') {
            // Only report a cleared avatar to the navbar when there was one to clear.
            if (kind === 'avatar' && existing.length > 0) nextAvatarUrl = '';
            continue;
          }

          const { imageId, relationId } = await storage.images.createAndLink({
            file: edit.file,
            fromEntityId: entityId,
            fromEntityName: draft.name,
            relationPropertyId: property.id,
            relationPropertyName: property.name,
            spaceId,
          });

          imageEntityIds.add(imageId);
          written.relationIds.add(relationId);

          if (kind === 'avatar') {
            nextAvatarUrl = findMediaUrlValue(getValues({ selector: v => v.entity.id === imageId })) ?? null;
          }
        }
      } catch (error) {
        // The name value and the deleted relations are already in the store. Left
        // there they become pending edits on the personal space for a save that
        // never happened.
        rollback({ valueIds: written.valueIds, relationIds: written.relationIds });
        throw error;
      }

      const isLocalUnpublished = (row: { spaceId: string; isLocal?: boolean; hasBeenPublished?: boolean }) =>
        row.spaceId === spaceId && row.isLocal === true && row.hasBeenPublished !== true;

      const values = getValues({
        includeDeleted: true,
        selector: v => isLocalUnpublished(v) && (written.valueIds.has(v.id) || imageEntityIds.has(v.entity.id)),
      });
      const relations = getRelations({
        includeDeleted: true,
        selector: r => isLocalUnpublished(r) && (written.relationIds.has(r.id) || imageEntityIds.has(r.fromEntity.id)),
      });

      return {
        values,
        relations,
        nextAvatarUrl,
        rows: { valueIds: new Set(values.map(v => v.id)), relationIds: new Set(relations.map(r => r.id)) },
        draft,
      };
    },
    [current.description, current.name, entityId, rollback, spaceId, storage]
  );

  /**
   * Return to idle, undoing anything still staged. Used both when the user walks
   * away from a failed save — so the personal space isn't left carrying an edit
   * they abandoned — and after a successful one, where there is nothing left to
   * undo but the status still has to clear for the modal to reopen.
   */
  const reset = React.useCallback(() => {
    const staged = stagedRef.current;
    stagedRef.current = null;
    setStatus('idle');
    setErrorMessage(null);
    if (staged) rollback(staged.rows);
  }, [rollback]);

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
  //
  // Only a transition counts. That state lingers for the same three seconds after
  // *any* publish in the app, so a save started inside that window would otherwise
  // be settled as succeeded before it had run.
  const previousReviewState = React.useRef(statusBarState.reviewState);
  React.useEffect(() => {
    const previous = previousReviewState.current;
    previousReviewState.current = statusBarState.reviewState;

    if (status !== 'publishing') return;
    if (statusBarState.reviewState !== 'publish-complete' || previous === 'publish-complete') return;
    settleSuccess();
  }, [settleSuccess, status, statusBarState.reviewState]);

  // `usePublish` calls `onError` *before* dispatching the error, so clearing the
  // global copy from inside that callback is overwritten a line later. An effect
  // runs after both. While this modal is open it owns the failure — including
  // Retry — and two stacked error dialogs would offer two independent retries;
  // once it is closed the status bar is the hand-off and keeps its own.
  React.useEffect(() => {
    if (status !== 'error' || !isOpen) return;
    if (statusBarState.reviewState !== 'publish-error') return;
    dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  }, [dispatch, isOpen, status, statusBarState.reviewState]);

  const publish = React.useCallback(
    async (draft: ProfileDraft) => {
      if (!canEdit) return;

      // Retry re-sends the staged rows so the uploads inside only run once — but
      // only while it is still the same edit. The fields stay live in the error
      // state, so a draft the user has since changed has to be re-staged, or
      // Retry would publish what they just edited away from and report success.
      if (stagedRef.current && !isSameDraft(stagedRef.current.draft, draft)) {
        rollback(stagedRef.current.rows);
        stagedRef.current = null;
      }

      setStatus('publishing');
      setErrorMessage(null);

      if (!stagedRef.current) {
        try {
          stagedRef.current = await stage(draft);
        } catch (error) {
          console.error('[edit-profile] failed to stage profile edit', error);
          setStatus('error');
          setErrorMessage('Couldn’t upload your images. Your changes are still here — try again.');
          return;
        }
      }

      const staged = stagedRef.current;

      // Some edits resolve to nothing to write — removing an image that was never
      // set, or a change that trims away to the value already there. Publishing
      // them earns the SDK's generic "Nothing to publish" error for what is really
      // a no-op, so settle them as done instead.
      if (staged.values.length === 0 && staged.relations.length === 0) {
        settleSuccess();
        return;
      }

      await makeProposal({
        values: staged.values,
        relations: staged.relations,
        spaceId,
        name: 'Edit profile',
        onSuccess: settleSuccess,
        onError: () => {
          setStatus('error');
          setErrorMessage('Couldn’t publish your profile. Your changes are still here — try again.');
        },
      });
    },
    [canEdit, makeProposal, rollback, settleSuccess, spaceId, stage]
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
    reset,
  };
}

function isSameDraft(a: ProfileDraft, b: ProfileDraft) {
  const sameImage = (x: ProfileImageEdit, y: ProfileImageEdit) =>
    x.kind === y.kind && (x.kind !== 'replaced' || x.file === (y as { file: File }).file);

  return (
    a.name === b.name &&
    a.description === b.description &&
    sameImage(a.banner, b.banner) &&
    sameImage(a.avatar, b.avatar)
  );
}
