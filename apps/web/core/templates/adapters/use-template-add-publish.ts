'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type PageSpaceWriters, pickWriteSpace } from '~/core/access/pick-write-space';
import { useActionContext } from '~/core/action-context-provider';
import { type OperationFailureCode, runObservedAction } from '~/core/analytics-operations';
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

/** A queued add, with the "+" it came from for analytics (`add_surface`), carried across sign-up. */
export type QueuedTemplateAdd = TemplateAddAction & { surface?: string };

/** An analytics surface id: the snake_case name of a "+" form, never anything the viewer typed. */
const SURFACE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function parseTemplateAddIntent(intent: string | undefined): QueuedTemplateAdd | null {
  if (!intent) return null;
  try {
    const parsed = JSON.parse(intent) as QueuedTemplateAdd;
    const valid =
      parsed?.kind === 'quote'
        ? typeof parsed.draft?.text === 'string'
        : (parsed?.kind === 'claim' || parsed?.kind === 'event') && typeof parsed.draft?.title === 'string';
    if (!valid) return null;
    if (parsed.surface !== undefined && !(typeof parsed.surface === 'string' && SURFACE_PATTERN.test(parsed.surface))) {
      delete parsed.surface;
    }
    return parsed;
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

  // The page the add is for. A queued add replays inside the press's own context (`withActionContext`),
  // so its page view and template are the press's, not wherever the viewer is when it publishes.
  const actionContext = useActionContext('template_add_form', 'entity', owner.entityId);

  const publishNow = React.useCallback(
    (
      action: QueuedTemplateAdd,
      viewerSpaceId: string,
      isCurrent: () => boolean = () => true,
      replayed = false
    ): Promise<TemplateAddResult> => {
      // Taken before any await: a replay's context only lasts for the synchronous call.
      const context = {
        ...actionContext(),
        add_kind: action.kind,
        ...(action.surface ? { add_surface: action.surface } : {}),
        replayed,
      };
      let failure: OperationFailureCode | null = null;
      const run = async (): Promise<TemplateAddResult> => {
        const noun = NOUN[action.kind];
        const writeSpace = await pickWriteSpace({
          pageSpaceId,
          personalSpaceId: viewerSpaceId,
          writers: TEMPLATE_ADD_WRITERS,
          tx,
          queryClient,
        });
        if (!isCurrent()) {
          // Withdrawn before it wrote anything (the queue dropped it). `action_failed` takes only the
          // registered failure codes, and this is the one that says it never ran.
          failure = 'unavailable';
          return { ok: false, error: `Your ${noun} was cancelled.` };
        }

        const edits = buildTemplateAddEdits(owner, action, writeSpace.spaceId);
        if (!edits) {
          failure = 'invalid_input';
          return fail(`Your ${noun} is empty.`);
        }

        // The page shows the addition through its pending row until the refetched lists have it.
        const ok = await publishOnce(makeProposal, {
          values: edits.values,
          relations: edits.relations,
          spaceId: writeSpace.spaceId,
          name: `Add ${noun}: ${edits.name}`,
        });
        // `usePublish` has already shown why (or the viewer dismissed the signature).
        if (!ok) {
          failure = 'publish_failed';
          return fail(`Your ${noun} could not be published.`, { show: false });
        }

        void refetchPageLists(queryClient, owner.entityId);
        for (const delay of INDEXER_REFETCH_DELAYS_MS) {
          window.setTimeout(() => void refetchPageLists(queryClient, owner.entityId), delay);
        }
        return { ok: true, id: edits.entityId, spaceId: writeSpace.spaceId };
      };
      return runObservedAction(
        'publish',
        context,
        run,
        () => failure,
        result => (result.ok ? { entity_id: result.id, space_id: result.spaceId } : {})
      );
    },
    [actionContext, fail, makeProposal, owner, pageSpaceId, queryClient, tx]
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
    component: 'template_add_form',
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
      settleWaiting(await publishNow(action, freshPersonalSpaceId, isCurrent, true));
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
  const heldSurfaceRef = React.useRef<string | undefined>(undefined);
  const holdAddDraft = React.useCallback((restore: () => void, surface?: string) => {
    heldRestoreRef.current = restore;
    heldSurfaceRef.current = surface && SURFACE_PATTERN.test(surface) ? surface : undefined;
  }, []);

  const add = React.useCallback(
    async (added: TemplateAddAction): Promise<TemplateAddResult> => {
      const noun = NOUN[added.kind];
      const restore = heldRestoreRef.current;
      heldRestoreRef.current = null;
      const surface = heldSurfaceRef.current;
      heldSurfaceRef.current = undefined;
      const action: QueuedTemplateAdd = surface ? { ...added, surface } : added;
      if (authenticated && isRegistered && personalSpaceId) return publishNow(action, personalSpaceId);

      // A draft turned away here goes back into its form, which cleared itself as it submitted. After
      // the submit handler, so the form's own reset does not win over it.
      const turnAway = (error: string) => {
        if (restore) queueMicrotask(restore);
        return fail(error);
      };

      const signedOut = !authenticated;
      if (signedOut || isAccountSetupPending || isPersonalSpaceLoading) {
        // One draft waits per page; a second would replace the first unseen.
        if (isQueued || waitingRef.current) {
          return turnAway(`Your last addition is still waiting for your account. Try again in a moment.`);
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
      return turnAway(`Finish setting up your account to add a ${noun}.`);
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
