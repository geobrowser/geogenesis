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
import { GeoStore } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import type { Profile, Relation, Value } from '~/core/types';
import { findMediaUrlValue, useEntityAvatarUrl, useEntityCoverUrl } from '~/core/utils/use-entity-media';

import { avatarAtom } from '~/partials/onboarding/dialog';
import type { ProfileImageKind } from '~/partials/profile/profile-edit-rules';

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

/**
 * The local rows this modal wrote, keyed by id and carrying the `timestamp` each
 * had when it was staged, so exactly those versions can be rolled back.
 */
type StagedRows = {
  valueIds: Map<string, string | null | undefined>;
  relationIds: Map<string, string | null | undefined>;
  /**
   * Local rows this edit replaced, put back when it is rolled back. Value ids are
   * derived from entity + property + space, so a pending draft on the same field
   * from the normal editor shares an id with ours and is overwritten by it —
   * rolling back would otherwise delete work this modal never owned.
   */
  overwritten: Value[];
  /** Locally-created relations this edit tombstoned; same reasoning as above. */
  overwrittenRelations: Relation[];
};

/** The local rows one save produced, kept so Retry re-sends them without re-uploading. */
type StagedEdit = {
  values: Value[];
  relations: Relation[];
  /** ipfs:// URL of the newly uploaded avatar, or '' when the avatar was removed. */
  nextAvatarUrl: string | null;
  /** Set when a removal found nothing to delete — the edit cannot do what it says. */
  unresolvedRemoval: ProfileImageKind | null;
  rows: StagedRows;
  /** The draft these rows came from, so Retry can tell a re-send from a new edit. */
  draft: ProfileDraft;
  /**
   * The entity's values as they stood before this edit touched anything. Held
   * because `current` reads back through the local store, so once rows are staged
   * it reports the unpublished edit rather than what is actually published — and
   * re-staging against it would skip the fields that appear already applied.
   */
  baseline: {
    name: string;
    description: string;
    /**
     * Whether the modal was showing each image before this edit touched anything.
     * A removal that finds nothing to delete is only a failure if there was
     * something on screen to remove — otherwise the draft has simply reverted to
     * how the profile started, which is no change at all.
     */
    showedBanner: boolean;
    showedAvatar: boolean;
  };
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
  // Matches the key `useGeoProfile` writes under, so the optimistic update below
  // lands where every profile surface reads.
  const profileQueryKey = React.useMemo(() => ['profile', address], [address]);

  // `space.topicId` is null on plenty of real personal spaces — it was null on
  // the account this was first tested against, which left the modal reading a
  // blank profile it could not have saved either. /profile/address answers with
  // the person entity directly, so prefer it and keep topicId as the fallback.
  //
  // Both of that endpoint's own fallbacks have to be rejected first, and neither
  // is caught by shape alone: it answers with the wallet address when the lookup
  // fails, and with the *space* id when the record carries no entityId — and a
  // space id is a perfectly valid 32-hex entity id. Editing against it would
  // stage all four fields onto the space's system entity.
  const profileEntityId = profile && profile.id !== profile.spaceId && IdUtils.isValid(profile.id) ? profile.id : null;
  const entityId = profileEntityId ?? personalEntityId ?? '';
  const canEdit = Boolean(isRegistered && spaceId && entityId);

  const entity = useEntity({ id: entityId, spaceId: spaceId || undefined });

  // Whether the entity's relations are actually loaded, which `isLoading` cannot
  // answer — `useQueryEntity` derives it from `isFetched`, true after a rejected
  // retry too. Staging an image replacement without the remote relations adds a
  // second edge instead of retargeting the one really there.
  //
  // Store presence cannot answer it either: `GeoStore.getEntity` synthesises an
  // entity from local rows alone, so any pending draft from the normal editor
  // makes a failed fetch look successful. Only the query's own status is the
  // question being asked. Read rather than subscribed: `useEntity` above already
  // subscribes to the same key, so a settling fetch re-renders us anyway.
  const isHydrated = queryClient.getQueryState(GeoStore.queryKey(entityId))?.status === 'success';

  const [status, setStatus] = React.useState<EditProfileStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const stagedRef = React.useRef<StagedEdit | null>(null);

  /** Set when this modal's own publish fails; see the suppression effect below. */
  const ownsPendingError = React.useRef(false);

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
      // Clear only the rows still carrying the version this edit staged. Value ids
      // are derived from entity + property + space, so a normal-editor change to
      // the same field during an in-flight publish replaces the row at our id —
      // undoing by id alone would delete a draft this modal never made.
      const isStagedVersion = (
        row: { id: string; timestamp?: string | null },
        staged: Map<string, string | null | undefined>
      ) => staged.has(row.id) && staged.get(row.id) === row.timestamp;

      const clearedValueIds = getValues({
        includeDeleted: true,
        selector: v => isStagedVersion(v, rows.valueIds),
      }).map(v => v.id);
      const clearedRelationIds = getRelations({
        includeDeleted: true,
        selector: r => isStagedVersion(r, rows.relationIds),
      }).map(r => r.id);

      store.clearLocalChangesByIds({ spaceId, valueIds: clearedValueIds, relationIds: clearedRelationIds });

      // After the clear, not before: `clearLocalChangesByIds` restores the synced
      // baseline for every id it drops, which would win over a snapshot put back
      // first.
      //
      // And only where the clear actually happened. An id left alone above is one
      // another editor has since rewritten — putting our snapshot back there would
      // overwrite that newer draft with the very row we just declined to delete.
      //
      // A snapshot can itself be a tombstone — someone's pending *deletion* that
      // this edit wrote over. `set` forces `isDeleted = false`, so putting one back
      // that way would resurrect the row and destroy the deletion; each snapshot
      // goes back through the API matching the state it was captured in.
      const clearedValues = new Set(clearedValueIds);
      const clearedRelations = new Set(clearedRelationIds);

      rows.overwritten
        .filter(value => clearedValues.has(value.id))
        .forEach(value => (value.isDeleted ? storage.values.delete(value) : storage.values.set(value)));
      rows.overwrittenRelations
        .filter(relation => clearedRelations.has(relation.id))
        .forEach(relation =>
          relation.isDeleted ? storage.relations.delete(relation) : storage.relations.set(relation)
        );
    },
    [spaceId, storage]
  );

  const stage = React.useCallback(
    async (draft: ProfileDraft, baseline: StagedEdit['baseline']): Promise<StagedEdit> => {
      // Row ids this modal wrote, tracked as it goes so a failed upload can undo
      // the writes that already landed. Scoping the collection below to these —
      // rather than to everything unpublished on the person entity — keeps an
      // unrelated pending edit from riding along on the publish, and from being
      // rolled back when this one is abandoned.
      const written = {
        valueIds: new Set<string>(),
        relationIds: new Set<string>(),
        overwritten: [] as Value[],
        overwrittenRelations: [] as Relation[],
      };
      // Freshly minted image entities are ours by definition, so their rows can be
      // swept by entity id without that risk.
      const imageEntityIds = new Set<string>();
      let nextAvatarUrl: string | null = null;
      let unresolvedRemoval: ProfileImageKind | null = null;

      /**
       * Remember unpublished local work before this edit replaces or deletes it.
       *
       * Published rows are deliberately not captured. `setAsPublished` leaves them
       * in the store as `isLocal` with `hasBeenPublished: true`, and every restore
       * path forces that flag back to false — so snapshotting an earlier successful
       * edit and putting it back would resurrect finished work as pending. Clearing
       * such a row is the whole undo; the synced state already carries it.
       */
      const snapshot = (id: string) => {
        const [pendingLocal] = getValues({
          includeDeleted: true,
          selector: v => v.id === id && v.isLocal === true && v.hasBeenPublished !== true,
        });
        if (pendingLocal) written.overwritten.push(pendingLocal);
      };

      const setValue = (propertyId: string, propertyName: string, value: string) => {
        const id = ID.createValueId({ entityId, propertyId, spaceId });
        snapshot(id);
        storage.values.set({
          id,
          entity: { id: entityId, name: draft.name },
          property: { id: propertyId, name: propertyName, dataType: 'TEXT', renderableType: 'TEXT' },
          spaceId,
          value,
        });
        written.valueIds.add(id);
      };

      // The rows this edit produced, wherever it stopped. Also the catch path's
      // rollback set: an image entity minted before a later upload failed leaves
      // values and relations of its own, and tracking only `written` would strand
      // them in the store.
      const collect = () => {
        const isLocalUnpublished = (row: { spaceId: string; isLocal?: boolean; hasBeenPublished?: boolean }) =>
          row.spaceId === spaceId && row.isLocal === true && row.hasBeenPublished !== true;

        return {
          values: getValues({
            includeDeleted: true,
            selector: v => isLocalUnpublished(v) && (written.valueIds.has(v.id) || imageEntityIds.has(v.entity.id)),
          }),
          relations: getRelations({
            includeDeleted: true,
            selector: r =>
              isLocalUnpublished(r) && (written.relationIds.has(r.id) || imageEntityIds.has(r.fromEntity.id)),
          }),
        };
      };

      try {
        if (draft.name !== baseline.name) {
          setValue(SystemIds.NAME_PROPERTY, 'Name', draft.name);
        }

        if (draft.description !== baseline.description) {
          if (draft.description === '') {
            const existing = getValues({
              selector: v =>
                v.entity.id === entityId && v.property.id === SystemIds.DESCRIPTION_PROPERTY && v.spaceId === spaceId,
            });
            // Snapshot first: `deleteMany` replaces the row with an `isLocal`
            // tombstone, and snapshotting after would capture that instead of the
            // draft it buried — rollback would then re-save the tombstone as a
            // fresh unpublished value rather than letting the synced baseline back.
            existing.forEach(v => {
              snapshot(v.id);
              written.valueIds.add(v.id);
            });
            storage.values.deleteMany(existing);
          } else {
            setValue(SystemIds.DESCRIPTION_PROPERTY, 'Description', draft.description);
          }
        }

        for (const kind of ['banner', 'avatar'] as const) {
          const edit = draft[kind];
          if (edit.kind === 'unchanged') continue;

          const property = IMAGE_PROPERTIES[kind];

          // Replace and remove both start by dropping the existing edges. The
          // publish layer cascades the orphaned image entity for cover/avatar
          // relations.
          //
          // Read from the store with tombstones rather than from `useEntity`,
          // which hides them. A pending replacement made through the normal editor
          // leaves the old remote edge as a deleted-but-unpublished row, and
          // publishing only the edge we can see would add a second remote edge
          // while that deletion stayed behind.
          const priorEdges = getRelations({
            includeDeleted: true,
            selector: r => r.type.id === property.id && r.fromEntity.id === entityId && r.spaceId === spaceId,
          });
          const liveEdges = priorEdges.filter(r => !r.isDeleted);
          // What a removal could actually act on. `setAsPublished` keeps rows, so
          // an already-published tombstone means the deletion has happened — it is
          // not something left to remove, and treating it as one lets a second
          // removal stage nothing and still report success.
          const removableEdges = priorEdges.filter(r => !r.isDeleted || r.hasBeenPublished !== true);

          // Every pre-existing local edge, tombstones included. A replacement made
          // through the normal editor is *two* local rows — a tombstone for the old
          // remote edge and a live replacement — and restoring only the live one
          // would leave the old edge back alongside it and the deletion lost.
          priorEdges
            .filter(r => r.isLocal === true && r.hasBeenPublished !== true)
            .forEach(r => written.overwrittenRelations.push(r));

          storage.relations.deleteMany(liveEdges);
          priorEdges.forEach(r => written.relationIds.add(r.id));

          if (edit.kind === 'removed') {
            // Nothing to delete, yet the modal offered the removal — so it was
            // showing an image this space does not own. `current.*Url` falls back
            // to the profile endpoint, which answers across spaces, while these
            // edges are scoped to the personal space. Publishing would report
            // success over an image still on screen, so record it and fail instead.
            if (removableEdges.length === 0) {
              // Only a failure if the modal had an image on screen to remove. If it
              // did not, the draft has reverted to the profile's original state —
              // which happens when a first upload fails and the user changes their
              // mind — and there is simply nothing to publish for this field.
              if (kind === 'banner' ? baseline.showedBanner : baseline.showedAvatar) {
                unresolvedRemoval = kind;
              }
              continue;
            }

            // Keyed on the property having existed at all, not on a live edge: a
            // removal can publish nothing but a tombstone left by another pending
            // edit, and the navbar still needs telling the photo is gone.
            if (kind === 'avatar') nextAvatarUrl = '';
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
        // Everything written so far is already in the store — the name value, the
        // deleted relations, and any image entity minted before the failing
        // upload. Left there they become pending edits on the personal space for
        // a save that never happened.
        const partial = collect();
        rollback({
          valueIds: new Map(partial.values.map(v => [v.id, v.timestamp])),
          relationIds: new Map(partial.relations.map(r => [r.id, r.timestamp])),
          overwritten: written.overwritten,
          overwrittenRelations: written.overwrittenRelations,
        });
        throw error;
      }

      const { values, relations } = collect();

      return {
        values,
        relations,
        nextAvatarUrl,
        unresolvedRemoval,
        rows: {
          valueIds: new Map(values.map(v => [v.id, v.timestamp])),
          relationIds: new Map(relations.map(r => [r.id, r.timestamp])),
          overwritten: written.overwritten,
          overwrittenRelations: written.overwrittenRelations,
        },
        draft,
        baseline,
      };
    },
    [entityId, rollback, spaceId, storage]
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
    ownsPendingError.current = false;
    if (staged) rollback(staged.rows);
  }, [rollback]);

  const settleSuccess = React.useCallback(() => {
    const staged = stagedRef.current;
    if (!staged) return;
    stagedRef.current = null;
    setStatus('published');

    // Write the result into the profile cache rather than invalidating it. Every
    // registered surface reads `profile.avatarUrl` — `navbar-actions.tsx:78` falls
    // back to `avatarAtom` only while a personal space is still being created — and
    // refetching would ask the indexer for a write it has not caught up with yet,
    // putting the old photo straight back. The natural refetch replaces this once
    // the indexer agrees.
    queryClient.setQueryData(profileQueryKey, (previous: Profile | null | undefined) =>
      previous
        ? {
            ...previous,
            name: staged.draft.name || previous.name,
            ...(staged.nextAvatarUrl !== null ? { avatarUrl: staged.nextAvatarUrl || null } : {}),
          }
        : previous
    );

    // Still set for the onboarding path, which reads the atom while the space is pending.
    if (staged.nextAvatarUrl !== null) setStoredAvatar(staged.nextAvatarUrl);
  }, [profileQueryKey, queryClient, setStoredAvatar]);

  // Completion comes from `onSuccess` alone. An earlier version read the global
  // review state to settle three seconds sooner — `makeProposal` holds its success
  // screen for that long before resolving — but that state carries no operation
  // identity, so a *different* publish reaching 'publish-complete' would settle
  // this one: staged rows dropped and the avatar updated while the profile write
  // was still in flight, with nothing left to roll back when it then failed.
  // Three seconds of an honest "publishing" is worth more than that.

  // `usePublish` calls `onError` *before* dispatching the error, so clearing the
  // global copy from inside that callback is overwritten a line later. An effect
  // runs after both. While this modal is open it owns the failure — including
  // Retry — and two stacked error dialogs would offer two independent retries;
  // once it is closed the status bar is the hand-off and keeps its own.
  //
  // The flag is what ties the error being cleared to the one this modal just had.
  // The review state is global, so suppressing on `status === 'error'` alone would
  // also swallow an unrelated publish's failure that happened to land while this
  // modal sat open. It is consumed by the first 'publish-error' after ours.
  React.useEffect(() => {
    if (!ownsPendingError.current) return;

    // A declined wallet prompt never reaches 'publish-error': `usePublish` calls
    // `onError` and then sends the review state straight back to idle. Releasing
    // ownership here too keeps the flag from staying armed for the rest of the
    // session and swallowing someone else's later failure.
    if (statusBarState.reviewState === 'idle') {
      ownsPendingError.current = false;
      return;
    }

    if (statusBarState.reviewState !== 'publish-error') return;
    // Stay pending while closed rather than consuming the flag here. A failure that
    // lands after the user walked away reopens the modal (see the dialog), and
    // consuming it now would leave the global error standing alongside the one the
    // modal is about to show — two dialogs, two retries that can race each other.
    if (!isOpen) return;
    ownsPendingError.current = false;
    dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  }, [dispatch, isOpen, statusBarState.reviewState]);

  const publish = React.useCallback(
    async (draft: ProfileDraft) => {
      if (!canEdit) return;

      // Retry re-sends the staged rows so the uploads inside only run once — but
      // only while it is still the same edit. The fields stay live in the error
      // state, so a draft the user has since changed has to be re-staged, or
      // Retry would publish what they just edited away from and report success.
      //
      // The baseline carries over from the attempt being replaced. `current` reads
      // through the local store, so a failed attempt's own rows are in it; re-staging
      // against that would treat the fields it already wrote as unchanged and quietly
      // drop them from the retry.
      const previouslyStaged = stagedRef.current;
      const baseline = previouslyStaged?.baseline ?? {
        name: current.name,
        description: current.description,
        showedBanner: Boolean(current.bannerUrl),
        showedAvatar: Boolean(current.avatarUrl),
      };

      if (previouslyStaged && !isSameDraft(previouslyStaged.draft, draft)) {
        rollback(previouslyStaged.rows);
        stagedRef.current = null;
      }

      setStatus('publishing');
      setErrorMessage(null);
      ownsPendingError.current = false;

      if (!stagedRef.current) {
        // Staging uploads to IPFS before `makeProposal` touches the status bar, and
        // that upload can be long. Closing during it is meant to hand off to the
        // toast, so the toast has to already be saying something — otherwise the
        // work continues with nothing on screen at all.
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'publishing-ipfs' });

        try {
          stagedRef.current = await stage(draft, baseline);
        } catch (error) {
          console.error('[edit-profile] failed to stage profile edit', error);
          // The modal owns this failure — `makeProposal` never ran, so nothing else
          // will clear the pill we just put up.
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          setStatus('error');
          setErrorMessage('Couldn’t upload your images. Your changes are still here — try again.');
          return;
        }
      }

      const staged = stagedRef.current;

      // A removal the staging pass could not carry out must not be reported as
      // saved: the image is still there, and closing on "published" tells the user
      // it is gone. This one is a real failure even when other fields did stage.
      if (staged.unresolvedRemoval) {
        console.error('[edit-profile] removal found no relation to delete', {
          kind: staged.unresolvedRemoval,
          entityId,
          spaceId,
        });
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        rollback(staged.rows);
        stagedRef.current = null;
        setStatus('error');
        setErrorMessage(
          staged.unresolvedRemoval === 'avatar'
            ? 'Couldn’t find your photo to remove. Nothing was published.'
            : 'Couldn’t find your banner to remove. Nothing was published.'
        );
        return;
      }

      // Some edits resolve to nothing to write — a change that trims away to the
      // value already there. Publishing them earns the SDK's generic "Nothing to
      // publish" error for what is really a no-op, so settle them as done instead.
      if (staged.values.length === 0 && staged.relations.length === 0) {
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
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
          ownsPendingError.current = true;
          setStatus('error');
          setErrorMessage('Couldn’t publish your profile. Your changes are still here — try again.');
        },
      });
    },
    [
      canEdit,
      current.description,
      current.name,
      dispatch,
      entityId,
      makeProposal,
      rollback,
      settleSuccess,
      spaceId,
      stage,
    ]
  );

  return {
    canEdit,
    isHydrated,
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
