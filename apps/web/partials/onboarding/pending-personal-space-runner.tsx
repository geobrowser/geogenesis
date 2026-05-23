'use client';

import { Position } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { GEO_ROLES_PROPERTY } from '~/core/constants';
import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { proposeAddMemberDirect } from '~/core/hooks/use-propose-add-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ID } from '~/core/id';
import { getSpace } from '~/core/io/queries';
import { pendingPersonalSpaceAtom, pendingPersonalSpaceId } from '~/core/state/pending-personal-space';
import { useReportError } from '~/core/state/status-bar-store';
import { storage } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { SPACE_REGISTRY_ADDRESS } from '~/core/sdk/geo-network';
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
 * indexer-refetch race), and silently swaps the URL if the user is sitting on
 * the optimistic page.
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

  const tx = useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS });

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
    const resolve = (spaceId: string) => {
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

    void (async () => {
      try {
        devLog('[onboarding] background space creation started, topicId=%s', topicId);
        const spaceId = await createPersonalSpace({
          spaceName: name,
          spaceImage: avatar || undefined,
          topicId,
        });

        if (!spaceId) throw new Error('Creating space failed');

        resolve(spaceId);
        devLog('[onboarding] space created: %s — remapped pending edits, seeded personal-space cache', spaceId);

        // The onboarding role/interest picks need a real spaceId to attach to, so
        // they're applied here rather than in the dialog. Failures are logged and
        // swallowed: the account is already usable, and neither is worth blocking on.
        const { roleIds, topicIds } = onboardingPicksRef.current;

        if (roleIds.length > 0 || topicIds.length > 0) {
          try {
            const space = await Effect.runPromise(getSpace(spaceId));

            if (space && roleIds.length > 0) {
              for (const roleId of roleIds) {
                createGeoRoleRelation(spaceId, space.entity.id, roleId);
              }
            }

            for (const targetSpaceId of topicIds) {
              try {
                const targetSpace = await Effect.runPromise(getSpace(targetSpaceId));
                if (!targetSpace?.address) continue;

                await proposeAddMemberDirect({
                  spaceId: targetSpaceId,
                  targetMemberSpaceId: spaceId,
                  personalSpaceId: spaceId,
                  space: targetSpace,
                  tx,
                });
              } catch (error) {
                console.error('[PendingPersonalSpace] membership proposal failed for', targetSpaceId, error);
              }
            }
          } catch (error) {
            console.error('[PendingPersonalSpace] applying onboarding selections failed', error);
          } finally {
            setSelectedRoleIds([]);
            setSelectedTopicIds([]);
          }
        }
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
            return;
          }
        } catch {
          // Fall through to the real failure path below.
        }

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
