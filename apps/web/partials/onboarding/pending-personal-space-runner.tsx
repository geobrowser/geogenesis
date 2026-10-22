'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { requestSpaceMembership } from '~/core/access/request-space-membership';
import { trackAuthOnboarding } from '~/core/auth-attempt';
import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { type PersonalSpaceIdData, markPersonalProfilePublished } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getSpace } from '~/core/io/queries';
import { store as jotaiStore } from '~/core/state/jotai-store';
import { pendingPersonalSpaceAtom, pendingPersonalSpaceId } from '~/core/state/pending-personal-space';
import {
  removeRequestedMembershipSpace,
  requestedMembershipSpacesAtom,
  upsertRequestedMembershipSpace,
} from '~/core/state/requested-membership';
import { useReportError } from '~/core/state/status-bar-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { readRegisteredSpaceId } from '~/core/utils/contracts/create-personal-space-on-chain';
import { devLog } from '~/core/utils/dev-log';
import { describeError } from '~/core/utils/error-diagnostics';

import { avatarAtom, nameAtom, selectedTopicIdsAtom, spaceIdAtom } from './onboarding-atoms';

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

  // The onboarding interest picks are applied once creation resolves. Read them
  // through a ref so they don't re-trigger the creation effect.
  const selectedTopicIds = useAtomValue(selectedTopicIdsAtom);
  const setSelectedTopicIds = useSetAtom(selectedTopicIdsAtom);
  const onboardingPicksRef = React.useRef({ topicIds: selectedTopicIds });
  onboardingPicksRef.current = { topicIds: selectedTopicIds };

  // Dedupe: never run two creation chains for the same topic at once (the
  // effect re-fires on every `pending`/atom change).
  const runningRef = React.useRef<string | null>(null);
  // The persisted failure this load has already offered a retry for.
  const reportedFailureRef = React.useRef<string | null>(null);

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

    // A failure persisted by an earlier page load. Onboarding stays gated off while a
    // pending record exists, but the retry that went with the failure lived only in the
    // status bar, which is in-memory: after a reload the account had no dialog, no retry
    // and no space, and only signing out cleared it. Offer the retry again, once per
    // load; re-running creation is idempotent.
    if (pending.status === 'failed') {
      if (reportedFailureRef.current === pending.topicId) return;
      reportedFailureRef.current = pending.topicId;
      const { topicId } = pending;
      reportError("Account setup didn't finish.", () => {
        setPending({ topicId, address, status: 'pending' });
      });
      return;
    }

    if (pending.status !== 'pending') return;

    const topicId = pending.topicId;
    // This load has seen this job running, so a failure it reports later is reported
    // there with its error, not again here.
    reportedFailureRef.current = topicId;
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
    // Set once the profile + topic userOp is sent. An error after that point (an indexer
    // read, say) is not a missing profile.
    let profileSent = false;
    // `profilePublished` is false when registration landed but the profile publish did
    // not. The account is still usable (it has a space), so the cache is seeded the same
    // way; the caller offers the retry. The seed deliberately leaves `needsProfile`
    // unset so onboarding doesn't pop over that retry — once the cache goes stale, or on
    // a reload or another browser, the index reports the missing profile and onboarding
    // reopens to finish it.
    const resolve = (spaceId: string, profilePublished = true) => {
      if (resolved) return;
      resolved = true;

      // Flip every signal in one synchronous batch so the user never sees an
      // in-between frame (registered but still "pending"). The pending page
      // redirects itself onto the real space the moment `setPending(null)`
      // clears the pending state, so no navigation is needed here.
      store.remapSpaceId(pendingPersonalSpaceId(topicId), spaceId);
      queryClient.setQueryData<PersonalSpaceIdData>(['personal-space-id', address], {
        isRegistered: true,
        personalSpaceId: spaceId,
        personalEntityId: topicId,
      });
      if (profilePublished) trackAuthOnboarding('personal_space', 'completed');
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
            // Fires once the profile + topic userOp is sent, so the profile is on its way.
            profileSent = true;
            markPersonalProfilePublished(address);
            resolve(registeredSpaceId);
            settleMembership(registeredSpaceId);
          },
        });

        if (!spaceId) throw new Error('Creating space failed');

        devLog('[onboarding] space created: %s — remapped pending edits, seeded personal-space cache', spaceId);

        setSelectedTopicIds([]);
      } catch (error) {
        // The registry is the authority on whether the account has a space, and
        // several failures land *after* registration succeeds (a publish retry
        // exhausting, an indexer read erroring). Reporting those as "account setup
        // failed" leaves the user unregistered in the UI while their space exists
        // on-chain. Ask the chain before believing the error.
        //
        // But registered is not finished when the profile was never sent. Resolving that
        // as success is how accounts got wedged with a space and no profile: no name, no
        // page, the pending job cleared, and onboarding gated off for good because the
        // account counted as registered. Resolve the space so the account works and offer
        // the retry — re-running creation skips registration and publishes only the profile.
        try {
          const registered = await readRegisteredSpaceId(address);
          if (registered && profileSent) {
            console.warn('[PendingPersonalSpace] creation reported an error after the profile was sent', error);
            resolve(registered);
            settleMembership(registered);
            return;
          }
          if (registered) {
            console.warn('[PendingPersonalSpace] space is registered but the profile publish failed', error);
            resolve(registered, false);
            settleMembership(registered);
            // The interest picks were just settled; don't request them again on retry.
            setSelectedTopicIds([]);
            trackAuthOnboarding('personal_space', 'failed');
            reportError(`Profile setup didn't finish: ${describeError(error)}`, () => {
              setPending({ topicId, address, status: 'pending' });
            });
            return;
          }
        } catch {
          // Fall through to the real failure path below.
        }

        // Creation genuinely failed: drop every optimistic pending row we seeded, even if
        // enrich is still in flight or rejected (seededIds, not enrich results).
        void targetsPromise.then(rollbackPending, rollbackPending);
        console.error('[PendingPersonalSpace] creation failed', error);
        trackAuthOnboarding('personal_space', 'failed');
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
    setSelectedTopicIds,
  ]);

  return null;
}
