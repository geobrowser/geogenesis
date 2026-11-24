'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { DebateClaimControls } from './debate-claim-controls';
import { useDebateClaimResponse } from './use-debate-claim-response';

/**
 * The lower half of a debate card: where the debate is, what it argues, and the reader's side on it
 * (GEO-3454).
 *
 * The full-screen feed and the explore card both put this directly under the player, inside one
 * frame with it, so the claim and the video read as one thing. The two differ only in their meta
 * row, their title link and the actions they carry, which the hosts pass in.
 *
 * Agree and Disagree publish the viewer's position on the debate's *claim* — the same response the
 * claim page, the claims panel and the end card record, through the same hook, so a side taken here
 * shows on all of them. They replace the up/down vote the debate used to carry. The comments and
 * share in `actions` stay the debate's.
 */
export function DebateClaimFooter({
  claim,
  enabled,
  meta,
  title,
  actions,
  wideActions = false,
  look = 'default',
  className,
}: {
  /** The claim being debated, or null while the host has not resolved its debate. */
  claim: Debate['claim'] | null;
  /**
   * Whether this card should read the claim's responses yet. Latched: once a card has asked, it
   * keeps its numbers while it is mounted, for the reason `useDebateEndCard` gives.
   */
  enabled: boolean;
  meta: React.ReactNode;
  title: React.ReactNode;
  /** The debate's own controls, drawn at the end of the Agree/Disagree row. */
  actions: React.ReactNode;
  /** `actions` carries a third control beside comments and share; see `PositionRow`'s `endSlotWraps`. */
  wideActions?: boolean;
  /**
   * `'app'` is the debates app's card (GEO-3833): the claim at the app's size, then the vote row, then
   * the results once the viewer has voted, the "Not counted yet" note, and the meta row last — the
   * app has no meta row, so Geo's goes where it interrupts least. The host gives the padding.
   *
   * `'app-dark'` is the same on the debate page's dark full screen (the app's `LiveDebate` claim
   * panel): white claim text, the dark vote row and results, and no meta row when `meta` is null.
   */
  look?: 'default' | 'app' | 'app-dark';
  /** On the footer's root. */
  className?: string;
}) {
  if (look === 'app' || look === 'app-dark') {
    const dark = look === 'app-dark';
    return (
      <div className={className}>
        <div className={dark ? APP_DARK_TITLE_CLASS_NAME : APP_TITLE_CLASS_NAME}>{title}</div>
        {claim ? (
          <ClaimPositions
            key={`${claim.space_id}:${claim.claim_entity_id}`}
            claim={claim}
            enabled={enabled}
            actions={actions}
            wideActions={wideActions}
            appLook={look}
          />
        ) : (
          <PositionRow
            positions={[]}
            responseKind={CLAIM_RESPONSE_KIND}
            viewerPosition={null}
            onRespond={IGNORE_RESPONSE}
            disabled
            showParticipants={false}
            endSlot={actions}
            look={look}
          />
        )}
        {meta != null && <div className="mt-3">{meta}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-1.5 px-3 pt-3">
        {meta}
        {title}
      </div>
      {claim ? (
        <ClaimPositions
          key={`${claim.space_id}:${claim.claim_entity_id}`}
          claim={claim}
          enabled={enabled}
          actions={actions}
          wideActions={wideActions}
        />
      ) : (
        // Held at its finished size while the debate resolves, so the card does not grow under the
        // reader when it lands, and drawn in the disabled state the live pills open in until their
        // reads answer — so the row doesn't look pressable, then dim, then come back.
        <div className="p-3">
          <PositionRow
            positions={[]}
            responseKind={CLAIM_RESPONSE_KIND}
            viewerPosition={null}
            onRespond={IGNORE_RESPONSE}
            disabled
            showParticipants={false}
            endSlot={actions}
            endSlotWraps={wideActions ? 'wide' : 'compact'}
          />
        </div>
      )}
    </div>
  );
}

const IGNORE_RESPONSE = () => {};

/**
 * The debates app's claim (`LiveMomentCard.tsx`): 23/27 medium at -0.65px, 24px above and 20px
 * below. Set from here, over whichever heading the host passes, so the explore card's and the full
 * screen's titles — two components with their own links and clamps — take the same metrics. The
 * hosts' classes carry `!`, and these out-rank them by specificity.
 */
const APP_TITLE_CLASS_NAME =
  'mt-6 mb-5 [&_h2]:text-[23px]! [&_h2]:leading-[27px]! [&_h2]:font-medium! [&_h2]:tracking-[-0.65px]! [&_h2]:text-[#151515]!';
/** The app's full-view claim (`LiveDebate.tsx`): white, 16px under the stage, 10px over the votes. */
const APP_DARK_TITLE_CLASS_NAME =
  'mt-4 mb-2.5 [&_h2]:text-[23px]! [&_h2]:leading-[27px]! [&_h2]:font-medium! [&_h2]:tracking-[-0.65px]! [&_h2]:text-white!';

function ClaimPositions({
  claim,
  enabled,
  actions,
  wideActions,
  appLook,
}: {
  claim: Debate['claim'];
  enabled: boolean;
  actions: React.ReactNode;
  wideActions: boolean;
  /** One of the debates app's looks, or none for Geo's own card. */
  appLook?: 'app' | 'app-dark';
}) {
  const [live, setLive] = React.useState(enabled);
  if (enabled && !live) setLive(true);

  // One spelling of the ids for every read, so these land on the end card's cache keys and a side
  // taken in one shows in the other. geo-chat and the graph format ids differently.
  const spaceId = normId(claim.space_id);
  const claimId = normId(claim.claim_entity_id);
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1, enabled: live });
  const response = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: live ? (entities[0] ?? null) : null,
    savePromptSurface: 'feed',
  });

  return (
    <DebateClaimControls
      claimId={claimId}
      spaceId={spaceId}
      response={response}
      // The split band below already shows who voted; faces in the pills would read as the same
      // people a second time.
      showParticipants={false}
      endSlot={actions}
      wideEndSlot={wideActions}
      analyticsSurface="debate-card"
      className={appLook ? undefined : 'p-3'}
      summaryLayout={appLook ? 'results' : 'inline'}
      summaryClassName={appLook ? undefined : 'claim-card-summary-band'}
      look={appLook ?? 'default'}
    />
  );
}
