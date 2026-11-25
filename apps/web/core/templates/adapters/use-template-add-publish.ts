'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type PageSpaceWriters, pickWriteSpace } from '~/core/access/pick-write-space';
import { readAccountAddress, readRegisteredPersonalSpaceId } from '~/core/hooks/cached-write-identity';
import { publishOnce } from '~/core/hooks/publish-once';
import { useAuthResolving } from '~/core/hooks/use-auth-resolving';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ID } from '~/core/id';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { useStatusBar } from '~/core/state/status-bar-store';
import { usePrivy } from '~/core/wallet/auth-hooks';

import type { TemplateAddResult } from '../models';
import { type TemplateAddAction, type TemplateAddOwner, buildTemplateAddEdits } from './template-add-edits';

/** Editors publish template adds into the page's space; everyone else into their personal space. */
export const TEMPLATE_ADD_WRITERS: PageSpaceWriters = 'editors';

/** Refetches after the indexer has had time to pick the publish up. */
const INDEXER_REFETCH_DELAYS_MS = [3_000, 7_000, 12_000];

const NOUN: Record<TemplateAddAction['kind'], string> = { claim: 'claim', event: 'event', quote: 'quote' };

/** Whether a query's key names this entity, in either id spelling. */
export function queryKeyMentionsEntity(queryKey: readonly unknown[], entityId: string): boolean {
  const key = JSON.stringify(queryKey).toLowerCase();
  return key.includes(entityId.toLowerCase()) || key.includes(ID.uuidToHex(entityId).toLowerCase());
}

function refetchPageLists(queryClient: QueryClient, entityId: string) {
  return queryClient.invalidateQueries({ predicate: query => queryKeyMentionsEntity(query.queryKey, entityId) });
}

export function parseTemplateAddIntent(intent: string | undefined): TemplateAddAction | null {
  if (!intent) return null;
  try {
    const parsed = JSON.parse(intent) as TemplateAddAction;
    if (parsed?.kind === 'quote') return typeof parsed.draft?.text === 'string' ? parsed : null;
    if ((parsed?.kind === 'claim' || parsed?.kind === 'event') && typeof parsed.draft?.title === 'string') {
      return parsed;
    }
  } catch {
    // A malformed intent is dropped below.
  }
  return null;
}

// Publishes a template add straight from its edits, never through the local store, so nothing
// reaches Review edits. A draft submitted signed out (GEO-3861), or while a new account's space is
// created, is queued and published once the account can write.
export function useTemplateAddPublish({ owner, pageSpaceId }: { owner: TemplateAddOwner; pageSpaceId: string }) {
  const { authenticated } = usePrivy();
  const authResolving = useAuthResolving();
  const queryClient = useQueryClient();
  const tx = useSmartAccountTransaction();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const { makeProposal } = usePublish();
  const { dispatch } = useStatusBar();
  const signInAnalytics = React.useMemo(
    () => ({
      component: 'template_add_form',
      target_type: 'entity',
      target_id: owner.entityId,
      auth_control: 'add_claim_or_event',
      auth_intent: 'add_claim_or_event',
      // The draft is held through the sign-in and published after it, not pressed again.
      auth_continuation: 'queued',
    }),
    [owner.entityId]
  );
  const promptSignIn = usePrivySignIn(undefined, { analytics: signInAnalytics });

  const fail = React.useCallback(
    (error: string, { show = true }: { show?: boolean } = {}): TemplateAddResult => {
      if (show) dispatch({ type: 'ERROR', payload: error });
      return { ok: false, error };
    },
    [dispatch]
  );

  const publishNow = React.useCallback(
    async (
      action: TemplateAddAction,
      viewerSpaceId: string,
      isCurrent: () => boolean = () => true
    ): Promise<TemplateAddResult> => {
      const noun = NOUN[action.kind];
      const writeSpace = await pickWriteSpace({
        pageSpaceId,
        personalSpaceId: viewerSpaceId,
        writers: TEMPLATE_ADD_WRITERS,
        tx,
        queryClient,
      });
      if (!isCurrent()) return { ok: false, error: `Your ${noun} was cancelled.` };

      const edits = buildTemplateAddEdits(owner, action, writeSpace.spaceId);
      if (!edits) return fail(`Your ${noun} is empty.`);

      // The page shows the addition through its pending row until the refetched lists have it.
      const ok = await publishOnce(makeProposal, {
        values: edits.values,
        relations: edits.relations,
        spaceId: writeSpace.spaceId,
        name: `Add ${noun}: ${edits.name}`,
      });
      // `usePublish` has already shown why (or the viewer dismissed the signature).
      if (!ok) return fail(`Your ${noun} could not be published.`, { show: false });

      void refetchPageLists(queryClient, owner.entityId);
      for (const delay of INDEXER_REFETCH_DELAYS_MS) {
        window.setTimeout(() => void refetchPageLists(queryClient, owner.entityId), delay);
      }
      return { ok: true, id: edits.entityId, spaceId: writeSpace.spaceId };
    },
    [fail, makeProposal, owner, pageSpaceId, queryClient, tx]
  );

  // The press waiting on a queued draft, settled when the queue replays it.
  const waitingRef = React.useRef<((result: TemplateAddResult) => void) | null>(null);
  // Puts the waiting draft back in the form it came from, for a draft withdrawn before it ran.
  const waitingRestoreRef = React.useRef<(() => void) | null>(null);
  const settleWaiting = React.useCallback((result: TemplateAddResult) => {
    waitingRef.current?.(result);
    waitingRef.current = null;
    waitingRestoreRef.current = null;
  }, []);

  const replayingRef = React.useRef(false);
  const { isQueued, queue, cancel } = useQueuedAction({
    id: `template-add:${ID.uuidToHex(owner.entityId)}:${ID.uuidToHex(pageSpaceId)}`,
    component: 'entity_editor',
    label: 'your addition',
    // A Google sign-in leaves the page and comes back; the draft goes with it.
    survivesRedirect: true,
    // `makeProposal` reads the personal space from its render, so only a control drawn after the
    // space exists can publish: the press's own closure is from before it.
    liveOnly: true,
    run: async (intent, { isCurrent }) => {
      replayingRef.current = true;
      const action = parseTemplateAddIntent(intent);
      if (!action) return settleWaiting({ ok: false, error: 'Nothing to add.' });
      const freshPersonalSpaceId = readRegisteredPersonalSpaceId(queryClient, readAccountAddress(), {
        personalSpaceId,
        isRegistered,
      });
      if (!isCurrent()) return settleWaiting({ ok: false, error: 'Your addition was cancelled.' });
      if (!freshPersonalSpaceId) {
        return settleWaiting(fail(`Finish setting up your account to add a ${NOUN[action.kind]}.`));
      }
      settleWaiting(await publishNow(action, freshPersonalSpaceId, isCurrent));
    },
  });

  // A queued draft dropped without replaying (a dismissed sign-in, or a sign-out clearing the queue)
  // settles as not added, and goes back into its form so the viewer's text is not lost.
  const wasQueuedRef = React.useRef(false);
  React.useEffect(() => {
    if (isQueued) {
      wasQueuedRef.current = true;
      return;
    }
    if (!wasQueuedRef.current) return;
    wasQueuedRef.current = false;
    if (!replayingRef.current) {
      const restore = waitingRestoreRef.current;
      settleWaiting({ ok: false, error: 'Your addition was cancelled.' });
      restore?.();
    }
    replayingRef.current = false;
  }, [isQueued, settleWaiting]);

  // A draft still queued when the page goes away is dropped rather than published later, out of
  // sight, by the next page for this entity.
  const cancelRef = React.useRef(cancel);
  cancelRef.current = cancel;
  React.useEffect(
    () => () => {
      if (!waitingRef.current || replayingRef.current) return;
      cancelRef.current();
      settleWaiting({ ok: false, error: 'Your addition was cancelled.' });
    },
    [settleWaiting]
  );

  // The submitting form's way to get its draft back (see `EntityActionCallbacks.holdAddDraft`),
  // taken by the `add` that follows it.
  const heldRestoreRef = React.useRef<(() => void) | null>(null);
  const holdAddDraft = React.useCallback((restore: () => void) => {
    heldRestoreRef.current = restore;
  }, []);

  const add = React.useCallback(
    async (action: TemplateAddAction): Promise<TemplateAddResult> => {
      const noun = NOUN[action.kind];
      const restore = heldRestoreRef.current;
      heldRestoreRef.current = null;
      if (authenticated && isRegistered && personalSpaceId) return publishNow(action, personalSpaceId);

      const signedOut = !authenticated;
      if (signedOut || isAccountSetupPending || isPersonalSpaceLoading) {
        // One draft waits per page; a second would replace the first unseen.
        if (isQueued || waitingRef.current) {
          return fail(`Your last addition is still waiting for your account. Try again in a moment.`);
        }
        return new Promise<TemplateAddResult>(resolve => {
          waitingRef.current = resolve;
          waitingRestoreRef.current = restore;
          const intent = JSON.stringify(action);
          if (!signedOut) return queue(intent);
          // Signed out (GEO-3861): the form was open to them, and only now, with their draft written,
          // are they asked to sign up. The draft waits in the queue and publishes once they have.
          // Still starting up, the runner asks if it resolves signed out (`PendingActionsRunner`).
          if (authResolving) return queue(intent, { onSignedOut: { prompt: signInAnalytics } });
          queue(intent);
          // A dismissed sign-in withdraws the draft, so walking away never publishes it later.
          promptSignIn(undefined, { onCancel: cancel });
        });
      }
      return fail(`Finish setting up your account to add a ${noun}.`);
    },
    [
      authResolving,
      authenticated,
      cancel,
      fail,
      isAccountSetupPending,
      isPersonalSpaceLoading,
      isQueued,
      isRegistered,
      personalSpaceId,
      promptSignIn,
      publishNow,
      queue,
      signInAnalytics,
    ]
  );

  return { add, holdAddDraft };
}
