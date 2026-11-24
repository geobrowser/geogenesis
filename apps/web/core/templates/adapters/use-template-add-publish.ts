'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type PageSpaceWriters, pickWriteSpace } from '~/core/access/pick-write-space';
import { readAccountAddress, readRegisteredPersonalSpaceId } from '~/core/hooks/cached-write-identity';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ID } from '~/core/id';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
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

// Publishes a template add, then stores it as published so nothing reaches Review edits. Drafts
// made while a new account's space is created are queued; failures show in the status bar.
export function useTemplateAddPublish({ owner, pageSpaceId }: { owner: TemplateAddOwner; pageSpaceId: string }) {
  const { authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const tx = useSmartAccountTransaction();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const { makeProposal } = usePublish();
  const { store } = useSyncEngine();
  const { dispatch } = useStatusBar();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'template_add_form',
      target_type: 'entity',
      target_id: owner.entityId,
      auth_control: 'add_claim_or_event',
      auth_intent: 'add_claim_or_event',
      auth_continuation: 'repeat',
    },
  });

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

      // Published from the edits themselves and only then written to the store, already marked
      // published: a list that reads the store would otherwise show the entity, live and actionable,
      // before it exists, and a failed publish would leave rows for Review edits.
      const ok = await publishOnce(makeProposal, {
        values: edits.values,
        relations: edits.relations,
        spaceId: writeSpace.spaceId,
        name: `Add ${noun}: ${edits.name}`,
      });
      // `usePublish` has already shown why (or the viewer dismissed the signature).
      if (!ok) return fail(`Your ${noun} could not be published.`, { show: false });

      store.setValues(edits.values);
      store.setRelations(edits.relations);
      store.setAsPublished(
        edits.values.map(value => value.id),
        edits.relations.map(relation => relation.id)
      );

      void refetchPageLists(queryClient, owner.entityId);
      for (const delay of INDEXER_REFETCH_DELAYS_MS) {
        window.setTimeout(() => void refetchPageLists(queryClient, owner.entityId), delay);
      }
      return { ok: true, id: edits.entityId, spaceId: writeSpace.spaceId };
    },
    [fail, makeProposal, owner, pageSpaceId, queryClient, store, tx]
  );

  // The press waiting on a queued draft, settled when the queue replays it.
  const waitingRef = React.useRef<((result: TemplateAddResult) => void) | null>(null);
  const settleWaiting = React.useCallback((result: TemplateAddResult) => {
    waitingRef.current?.(result);
    waitingRef.current = null;
  }, []);

  const replayingRef = React.useRef(false);
  const { isQueued, queue, cancel } = useQueuedAction({
    id: `template-add:${ID.uuidToHex(owner.entityId)}:${ID.uuidToHex(pageSpaceId)}`,
    component: 'entity_editor',
    label: 'your addition',
    survivesRedirect: false,
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

  // A queued draft dropped without replaying (a sign-out clears the queue) settles as not added.
  const wasQueuedRef = React.useRef(false);
  React.useEffect(() => {
    if (isQueued) {
      wasQueuedRef.current = true;
      return;
    }
    if (!wasQueuedRef.current) return;
    wasQueuedRef.current = false;
    if (!replayingRef.current) settleWaiting({ ok: false, error: 'Your addition was cancelled.' });
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

  const add = React.useCallback(
    async (action: TemplateAddAction): Promise<TemplateAddResult> => {
      const noun = NOUN[action.kind];
      if (!authenticated) {
        promptSignIn();
        return fail(`Sign in to add a ${noun}.`, { show: false });
      }
      if (isRegistered && personalSpaceId) return publishNow(action, personalSpaceId);
      if (isAccountSetupPending || isPersonalSpaceLoading) {
        // One draft waits per page; a second would replace the first unseen.
        if (isQueued || waitingRef.current) {
          return fail(`Your last addition is still waiting for your account. Try again in a moment.`);
        }
        return new Promise<TemplateAddResult>(resolve => {
          waitingRef.current = resolve;
          queue(JSON.stringify(action));
        });
      }
      return fail(`Finish setting up your account to add a ${noun}.`);
    },
    [
      authenticated,
      fail,
      isAccountSetupPending,
      isPersonalSpaceLoading,
      isQueued,
      isRegistered,
      personalSpaceId,
      promptSignIn,
      publishNow,
      queue,
    ]
  );

  const canOpenAddForm = React.useCallback(() => {
    if (authenticated) return true;
    promptSignIn();
    return false;
  }, [authenticated, promptSignIn]);

  return { add, canOpenAddForm };
}
