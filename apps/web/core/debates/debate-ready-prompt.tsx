'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { Debate } from './api';
import { DebateRequestDialog } from './debate-request-dialog';
import { debatePath } from './debate-routes';
import { SpaceChip } from './matchmaking/matchmaking-claim-card';

/**
 * GEO-2514. Accepting a request creates the debate outright — there is no match prompt in between
 * any more — so the person who *sent* the request finds out through their activity, wherever they
 * happen to be. This is how they get told, and it moves nobody's page until they say so.
 *
 * The tab that clicked Accept never sees this: `useAcceptDebateRequest` walks it straight into the
 * room, and the prompt hides for whichever debate is already on screen.
 */
export function DebateReadyPrompt({
  debate,
  currentUserId,
  onNotNow,
}: {
  debate: Debate;
  currentUserId: string;
  onNotNow: () => void;
}) {
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();

  // The debate room is a server segment with no `loading` boundary, so the router holds this page
  // on screen until its payload arrives — seconds, on a cold route. Without a pending state the
  // dialog just sits there looking dead, and every extra click stacks another history entry.
  const join = () => {
    if (joining) return;
    setJoining(true);
    startJoining(() => router.push(debatePath(debate)));
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
      busy={false}
      error={null}
      actionsLayout="split"
      acceptLabel={joining ? 'Joining…' : 'Join debate'}
      rejectLabel="Not now"
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
      onReject={onNotNow}
    />
  );
}
