'use client';

import { Position } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { requestSpaceMembership } from '~/core/access/request-space-membership';
import { GEO_ROLES_PROPERTY } from '~/core/constants';
import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ID } from '~/core/id';
import { getSpace } from '~/core/io/queries';
import { store as jotaiStore } from '~/core/state/jotai-store';
import { pendingPersonalSpaceAtom, pendingPersonalSpaceId } from '~/core/state/pending-personal-space';
import {
  removeRequestedMembershipSpace,
  requestedMembershipSpacesAtom,
  upsertRequestedMembershipSpace,
} from '~/core/state/requested-membership';
import { useReportError } from '~/core/state/status-bar-store';
import { storage } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { readRegisteredSpaceId } from '~/core/utils/contracts/create-personal-space-on-chain';
import { devLog } from '~/core/utils/dev-log';
import { describeError } from '~/core/utils/error-diagnostics';

import { avatarAtom, nameAtom, selectedRoleIdsAtom, selectedTopicIdsAtom, spaceIdAtom } from './dialog';

/** Links the new personal space entity to each Geo role the user picked during onboarding. */
function createGeoRoleRelation(spaceId: string, fromEntityId: string, roleEntityId: string) {
  storage.relations.set({
    id: ID.createEntityId(),
    entityId: spaceId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: Position.generate(),

    type: {
      id: GEO_ROLES_PROPERTY,
      name: 'Geo roles',
    },

    fromEntity: {
      id: fromEntityId,
      name: null,
    },

    toEntity: {
      id: roleEntityId,
      name: null,
      value: roleEntityId,
    },
  });
}

/**
 * Runs the background `createPersonalSpace` chain for an optimistically
 * onboarded user. Mounted globally so it survives client navigation, and keyed
 * off the persisted `pendingPersonalSpaceAtom` so a reload resumes the job
 * (the SDK call is idempotent — it returns the existing spaceId if registration
 * already landed) rather than restarting onboarding.
 *
 * On resolve it remaps the user's local `pending:` edits to the real spaceId,
 * seeds the `usePersonalSpaceId` cache (so `isRegistered` flips true with no
 * indexer-refetch race), and clears pending so the optimistic page can redirect.
 */
export function PendingPersonalSpaceRunner() {
  const [pending, setPending] = useAtom(pendingPersonalSpaceAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const setResolvedSpaceId = useSetAtom(spaceIdAtom);

  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { createPersonalSpace } = useCreatePersonalSpace();
  const { store } = useSyncEngine();
  const queryClient = useQueryClient();
  const reportError = useReportError();

  const tx = useSmartAccountTransaction();

  // The onboarding role/interest picks are applied once creation resolves. Read
  // them through a ref so they don't re-trigger the creation effect.
  const selectedRoleIds = useAtomValue(selectedRoleIdsAtom);
  const selectedTopicIds = useAtomValue(selectedTopicIdsAtom);
  const setSelectedRoleIds = useSetAtom(selectedRoleIdsAtom);
  const setSelectedTopicIds = useSetAtom(selectedTopicIdsAtom);
  const onboardingPicksRef = React.useRef({ roleIds: selectedRoleIds, topicIds: selectedTopicIds });
  onboardingPicksRef.current = { roleIds: selectedRoleIds, topicIds: selectedTopicIds };

  // Dedupe: never run two creation chains for the same topic at once (the
  // effect re-fires on every `pending`/atom change).
  const runningRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!address) return;
    if (!pending) return;

    // Wallet switched without a logout cleanup: a record stamped with a different
    // account would otherwise create/remap against the wrong address (or block this
    // account's onboarding). Drop it and let this account onboard fresh.
    if (pending.address && pending.address !== address) {
      setPending(null);
      return;
    }

    if (pending.status !== 'pending') return;

    const topicId = pending.topicId;
    if (runningRef.current === topicId) return;
    runningRef.current = topicId;

    // Deliberately NO `cancelled` flag. This component is mounted globally and the
    // creation chain is un-abortable, so a cleanup (StrictMode's dev double-mount, or
    // any dep change mid-flight) does not mean the work stopped — only that this effect
    // run was superseded. Bailing on that signal stranded the account: the space was
    // created on-chain, but the cache was never seeded, pending was never cleared, and
    // runningRef was never released, so nothing could re-enter and the user stayed
    // unregistered until a reload. runningRef alone is the dedupe, released in a
    // finally. Re-entry is safe because creation is idempotent — it returns the
    // existing id when registration already landed.
    let resolved = false;
    const resolve = (spaceId: string) => {
      if (resolved) return;
      resolved = true;

      // Flip every signal in one synchronous batch so the user never sees an
      // in-between frame (registered but still "pending"). The pending page
      // redirects itself onto the real space the moment `setPending(null)`
      // clears the pending state, so no navigation is needed here.
      store.remapSpaceId(pendingPersonalSpaceId(topicId), spaceId);
      queryClient.setQueryData(['personal-space-id', address], {
        isRegistered: true,
        personalSpaceId: spaceId,
        personalEntityId: topicId,
      });
      setResolvedSpaceId(spaceId);
      setPending(null);

      // Refresh the profile chip in the background — resolution shouldn't block on it.
      void queryClient.invalidateQueries({ queryKey: ['profile', address] });
    };

    type MembershipTarget = { id: string; name?: string; image?: string | null };

    let flipped = false;
    let seededIds: string[] = [];
    const flipPendingOptimistically = async (): Promise<MembershipTarget[]> => {
      if (flipped) return [];
      flipped = true;

      const { topicIds } = onboardingPicksRef.current;
      if (topicIds.length === 0) return [];

      seededIds = [...topicIds];
      const requestedAt = Date.now();
      jotaiStore.set(requestedMembershipSpacesAtom, prev =>
        topicIds.reduce(
          (next, id) =>
            upsertRequestedMembershipSpace(next, {
              id,
              ownerId: address,
              requestedAt,
            }),
          prev
        )
      );
      void queryClient.invalidateQueries({ queryKey: ['browse-sidebar-data'] });

      const targets = (
        await Promise.all(
          topicIds.map(async targetSpaceId => {
            try {
              const targetSpace = await Effect.runPromise(getSpace(targetSpaceId));
              if (!targetSpace?.address) {
                jotaiStore.set(requestedMembershipSpacesAtom, prev =>
                  removeRequestedMembershipSpace(prev, targetSpaceId, address)
                );
                return null;
              }
              const target: MembershipTarget = {
                id: targetSpaceId,
                name: targetSpace.entity.name ?? undefined,
                image: targetSpace.entity.image,
              };
              jotaiStore.set(requestedMembershipSpacesAtom, prev =>
                upsertRequestedMembershipSpace(prev, {
                  id: target.id,
                  ownerId: address,
                  requestedAt,
                  name: target.name,
                  image: target.image,
                })
              );
              return target;
            } catch (error) {
              console.error('[PendingPersonalSpace] failed to load target space', targetSpaceId, error);
              jotaiStore.set(requestedMembershipSpacesAtom, prev =>
                removeRequestedMembershipSpace(prev, targetSpaceId, address)
              );
              return null;
            }
          })
        )
      ).filter((t): t is NonNullable<typeof t> => t !== null);

      return targets;
    };

    // Fire the actual membership request txs once the personal space is on-chain. The
    // pending rows already show (address-scoped, above); drop that row whether the
    // request succeeds (personalSpaceId-scoped bridge takes over) or fails.
    let requestsFired = false;
    const fireMembershipRequests = async (spaceId: string, targets: MembershipTarget[]) => {
      if (requestsFired) return;
      requestsFired = true;

      await Promise.all(
        targets.map(async target => {
          try {
            await requestSpaceMembership({
              spaceId: target.id,
              personalSpaceId: spaceId,
              tx,
              queryClient,
              space: { name: target.name, image: target.image },
            });
          } catch (error) {
            console.error('[PendingPersonalSpace] membership proposal failed for', target.id, error);
          } finally {
            jotaiStore.set(requestedMembershipSpacesAtom, prev =>
              removeRequestedMembershipSpace(prev, target.id, address)
            );
          }
        })
      );
    };

    // Drop every row we seeded — creation failed.
    const rollbackPending = () => {
      if (seededIds.length === 0) return;
      jotaiStore.set(requestedMembershipSpacesAtom, prev =>
        seededIds.reduce((next, id) => removeRequestedMembershipSpace(next, id, address), prev)
      );
    };

    const targetsPromise = flipPendingOptimistically();

    // Once the space is on-chain, turn the seeded pending rows into real requests — or
    // roll them back if enrich failed.
    const settleMembership = (spaceId: string) =>
      void targetsPromise.then(
        targets => fireMembershipRequests(spaceId, targets),
        error => {
          console.error('[PendingPersonalSpace] interest-space enrich failed', error);
          rollbackPending();
        }
      );

    void (async () => {
      try {
        devLog('[onboarding] background space creation started, topicId=%s', topicId);
        const spaceId = await createPersonalSpace({
          spaceName: name,
          spaceImage: avatar || undefined,
          topicId,
          onRegistered: registeredSpaceId => {
            resolve(registeredSpaceId);
            settleMembership(registeredSpaceId);
          },
        });

        if (!spaceId) throw new Error('Creating space failed');

        devLog('[onboarding] space created: %s — remapped pending edits, seeded personal-space cache', spaceId);

        // Role relations need the new personal space indexed (getSpace reads it), so unlike
        // the membership picks they run here, after creation resolves.
        const { roleIds } = onboardingPicksRef.current;
        if (roleIds.length > 0) {
          try {
            const space = await Effect.runPromise(getSpace(spaceId));
            if (space) {
              for (const roleId of roleIds) {
                createGeoRoleRelation(spaceId, space.entity.id, roleId);
              }
            }
          } catch (error) {
            console.error('[PendingPersonalSpace] applying role relations failed', error);
          }
        }

        setSelectedRoleIds([]);
        setSelectedTopicIds([]);
      } catch (error) {
        // The registry is the authority on whether the account has a space, and
        // several failures land *after* registration succeeds (a publish retry
        // exhausting, an indexer read erroring). Reporting those as "account setup
        // failed" leaves the user unregistered in the UI while their space exists
        // on-chain. Ask the chain before believing the error.
        try {
          const registered = await readRegisteredSpaceId(address);
          if (registered) {
            console.warn('[PendingPersonalSpace] creation reported an error but the space is registered', error);
            resolve(registered);
            settleMembership(registered);
            return;
          }
        } catch {
          // Fall through to the real failure path below.
        }

        // Creation genuinely failed: drop every optimistic pending row we seeded, even if
        // enrich is still in flight or rejected (seededIds, not enrich results).
        void targetsPromise.then(rollbackPending, rollbackPending);
        console.error('[PendingPersonalSpace] creation failed', error);
        setPending({ topicId, address, status: 'failed' });
        reportError(`Account setup failed: ${describeError(error)}`, () => {
          setPending({ topicId, address, status: 'pending' });
        });
      } finally {
        // Always release, so a failed job's retry can re-enter the effect.
        runningRef.current = null;
      }
    })();
  }, [
    address,
    pending,
    name,
    avatar,
    createPersonalSpace,
    store,
    queryClient,
    reportError,
    setPending,
    setResolvedSpaceId,
    tx,
    setSelectedRoleIds,
    setSelectedTopicIds,
  ]);

  return null;
}
