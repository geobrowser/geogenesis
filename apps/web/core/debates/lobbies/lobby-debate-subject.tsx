'use client';

import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';

import type { DebateLobbyMember } from '../api';
import { inDebateLabel } from './lobby-format';

/**
 * A roster member's "In a debate" line. The claim opens in the entity side panel: navigating
 * away would unmount the lobby page, which leaves the lobby and its voice.
 */
export function LobbyDebateSubject({ subject }: { subject: DebateLobbyMember['in_debate_subject'] }) {
  const { openSidePanel } = useEntitySidePanel();
  const claimName = subject?.phase === 'on_claim' ? subject.claim_name.trim() : '';

  if (subject?.phase !== 'on_claim' || !claimName) return <>{inDebateLabel(subject)}</>;

  return (
    <>
      In a debate on “
      <button
        type="button"
        className="hover:underline"
        onClick={() => openSidePanel(subject.claim_entity_id, subject.space_id, false)}
      >
        {claimName}
      </button>
      ”
    </>
  );
}
