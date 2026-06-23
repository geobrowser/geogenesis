'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { pendingPersonalSpaceAtom, pendingPersonalSpaceId } from '~/core/state/pending-personal-space';
import { useReportError } from '~/core/state/status-bar-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { devLog } from '~/core/utils/dev-log';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils } from '~/core/utils/utils';

import { avatarAtom, nameAtom, spaceIdAtom } from './dialog';

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
  const router = useRouter();
  const reportError = useReportError();

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

    let cancelled = false;

    void (async () => {
      try {
        devLog('[onboarding] background space creation started, topicId=%s', topicId);
        const spaceId = await createPersonalSpace({
          spaceName: name,
          spaceImage: avatar || undefined,
          topicId,
        });

        if (!spaceId) throw new Error('Creating space failed');
        if (cancelled) return;

        store.remapSpaceId(pendingPersonalSpaceId(topicId), spaceId);
        queryClient.setQueryData(['personal-space-id', address], { isRegistered: true, personalSpaceId: spaceId });
        await queryClient.invalidateQueries({ queryKey: ['profile', address] });
        devLog('[onboarding] space created: %s — remapped pending edits, seeded personal-space cache', spaceId);

        setResolvedSpaceId(spaceId);
        setPending(null);

        if (window.location.pathname.startsWith(`/space/pending/${topicId}`)) {
          devLog('[onboarding] swapping pending URL → real space %s', spaceId);
          router.replace(NavUtils.toSpace(spaceId));
        }
      } catch (error) {
        console.error('[PendingPersonalSpace] creation failed', error);
        if (cancelled) return;
        // Allow a retry to re-enter the effect. The `pending:` edits stay safe
        // in IndexedDB regardless.
        runningRef.current = null;
        setPending({ topicId, address, status: 'failed' });
        reportError(`Account setup failed: ${describeError(error)}`, () => {
          setPending({ topicId, address, status: 'pending' });
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    pending,
    name,
    avatar,
    createPersonalSpace,
    store,
    queryClient,
    router,
    reportError,
    setPending,
    setResolvedSpaceId,
  ]);

  return null;
}
