'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Text } from '~/design-system/text';

import type { Debate } from './api';
import { DebateRequestDialog } from './debate-request-dialog';
import { debatePath } from './debate-routes';
import { useAbortDebate, useClearDebateActivity } from './hooks';
import { SpaceChip } from './matchmaking/matchmaking-claim-card';

/**
 * GEO-2514. Accepting a request creates the debate outright — there is no match prompt in between
 * any more — so the person who *sent* the request finds out through their activity, wherever they
 * happen to be. This is how they get told, and it moves nobody's page until they say so.
 *
 * The tab that clicked Accept never sees this. It is walking into the room already, and the
 * coordinator counts that walk as being there — see `debate-entry-intent.ts`, which exists because
 * the walk outlasts the activity refetch and this dialog used to reappear in the middle of it.
 */
export function DebateReadyPrompt({ debate, currentUserId }: { debate: Debate; currentUserId: string }) {
  const router = useRouter();
  const abortDebate = useAbortDebate(debate.id);
  const clearDebateActivity = useClearDebateActivity();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();
  const [declineError, setDeclineError] = React.useState<string | null>(null);

  // The debate room is a server segment with no `loading` boundary, so the router holds this page
  // on screen until its payload arrives — seconds, on a cold route. Without a pending state the
  // dialog just sits there looking dead, and every extra click stacks another history entry.
  const join = () => {
    if (joining) return;
    setJoining(true);
    startJoining(() => router.push(debatePath(debate)));
  };

  /**
   * Turning this down has to reach the other side. The opponent is sitting in the ready screen
   * waiting for someone who has decided not to come, and only the server can tell them: aborting
   * cancels the debate, which clears `active_debate_id` for both of them and bounces the opponent
   * out of the room. Dismissing this locally instead left them waiting until the room timed out,
   * with every Debate control greyed out on both sides in the meantime.
   *
   * Safe to send whatever state the debate is in: the server refuses to cancel one that already
   * finished, but still clears the activity that put this dialog on screen.
   */
  const decline = async () => {
    if (abortDebate.isPending) return;
    setDeclineError(null);
    try {
      await abortDebate.mutateAsync();
      clearDebateActivity(debate.id);
    } catch (error) {
      // Staying open is the point — the debate is still live, so the viewer can retry or join.
      setDeclineError(error instanceof Error ? error.message : 'Could not decline the debate. Try again.');
    }
  };

  // Both sides are what the dialog is for; a debate that cannot name them is not worth interrupting
  // anyone over, and the room itself still recovers the flow.
  if ((debate.participants?.length ?? 0) < 2) return null;

  return (
    <DebateRequestDialog
      claim={debate.claim.claim}
      participants={debate.participants}
      currentUserId={currentUserId}
      formatId={debate.turn_format_id}
      busy={abortDebate.isPending}
      error={declineError}
      actionsLayout="split"
      acceptLabel={joining ? 'Joining…' : 'Join debate'}
      rejectLabel={abortDebate.isPending ? 'Declining…' : 'Decline'}
      eyebrow={
        <span className="flex min-w-0 items-center justify-center gap-1.5 text-metadata text-grey-04">
          <SpaceChip spaceId={debate.claim.space_id} />
          <span aria-hidden>·</span>
          <span className="shrink-0">
            {debate.status === 'ready' ? 'Your debate is ready' : 'Your debate is under way'}
          </span>
        </span>
      }
      onAccept={join}
      onReject={() => void decline()}
    />
  );
}

/**
 * The way into a debate this dialog cannot describe. Nothing else in the app links to a debate that
 * has not finished — the browse feed only lists `complete` ones — while an active one greys out
 * every Debate control, so an activity payload reported without its participants would otherwise
 * leave the viewer with no way in and no way out.
 */
export function DebateRejoinBar({ debate }: { debate: Debate }) {
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-1100 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 justify-center">
      <button
        type="button"
        disabled={joining}
        onClick={() => {
          setJoining(true);
          startJoining(() => router.push(debatePath(debate)));
        }}
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-text py-2 pr-2 pl-4 text-white shadow-card transition-opacity hover:opacity-90 disabled:opacity-70"
      >
        <Text as="span" variant="metadata" color="white" className="truncate">
          {debate.status === 'ready' ? 'Your debate is ready' : 'Your debate is under way'}
        </Text>
        <span className="shrink-0 rounded-full bg-white px-3 py-0.5 text-metadata text-text">
          {joining ? 'Joining…' : 'Join'}
        </span>
      </button>
    </div>
  );
}
