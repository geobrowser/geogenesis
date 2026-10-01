'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurface } from '~/core/action-context-provider';
import { ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import type { DebateClaim, DebateParticipant } from '~/core/debates/api';
import type { TickerWindow } from '~/core/debates/claim-ticker';
import { speakerLabel } from '~/core/debates/playback-utils';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';
import { CLAIM_RESPONSE_COPY, type ResponseKind, responsePositionLabel } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';

import { type AccountAnalytics, AccountStep } from '~/partials/explore/email-capture-account-step';

import { useDebateClaimResponse } from './use-debate-claim-response';
import type { DebateStage } from './use-debate-stage';

/** The full-screen player's sign-up, counted apart from Explore's capture. */
export const DEBATE_SIGNUP_ANALYTICS: AccountAnalytics = {
  component: 'debate_inline_signup',
  auth_control: 'create_account',
  auth_trigger: 'control',
  target_type: 'application',
  target_id: 'genesis',
  link_source: 'debate_inline_signup',
  form_type: 'account',
  signup_surface: 'debate_inline_signup',
};

/**
 * The debate request popup's buttons (`debate-request-dialog.tsx`), at `h-9` rather than its `h-7`:
 * these are the main thing to press on each screen of the player, often one-handed.
 */
export const STAGE_PRIMARY_BUTTON =
  'flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-text px-4 text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50';
export const STAGE_SECONDARY_BUTTON =
  'flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-grey-02 bg-white px-4 text-metadata text-text transition-colors hover:bg-grey-01 disabled:opacity-50';
/** The popup's dismiss: plain grey text, no underline. */
export const STAGE_TEXT_LINK =
  'px-4 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:opacity-50';

/** The live claim the panel shows, when one is up. */
export type StagePanelClaim = {
  window: TickerWindow;
  speaker: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  /** Of every claim the debate shows, 1-based, for "3 of 7". */
  position: number;
  total: number;
};

/**
 * The claim panel: beside the video on desktop, below it on a phone.
 *
 * One place for everything the viewer is asked during a debate, so the video itself is never
 * covered while it plays. It runs through the debate's opening — the stance question, then the
 * inline sign-up a signed-out vote leads to — and then carries the live claim cards.
 *
 * Laid out against its own width, not the viewport's: the same panel is a 300px column on a desktop
 * and the full width of a phone.
 */
export function DebateStagePanel({
  stage,
  debateId,
  claimText,
  claim,
  caption,
  onVote,
  onJustWatch,
  onAnswered,
  variant,
}: {
  stage: DebateStage;
  debateId: string;
  claimText: string;
  claim: StagePanelClaim | null;
  /** What is being said right now, for the phone's caption zone between claims. */
  caption: { speaker: DebateParticipant | null; text: string } | null;
  onVote: (position: boolean) => void;
  onJustWatch: () => void;
  onAnswered: (claimId: string, position: boolean | null) => void;
  /** `side` is the desktop column; `below` the phone's zone under the video. */
  variant: 'side' | 'below';
}) {
  if (stage.phase !== 'live') {
    return (
      <PanelSurface variant={variant}>
        <StancePrompt
          debateId={debateId}
          claimText={claimText}
          responseKind={stage.main.responseKind}
          disabled={stage.phase === 'deciding'}
          onVote={onVote}
          onJustWatch={onJustWatch}
        />
      </PanelSurface>
    );
  }

  if (stage.signup === 'open' && stage.stance !== null) {
    return (
      <PanelSurface variant={variant}>
        <InlineSignup stance={stage.stance} onNotNow={stage.collapseSignup} />
      </PanelSurface>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {stage.signup === 'collapsed' ? <SignupChip onOpen={stage.reopenSignup} /> : null}
      {stage.signup === 'confirmed' ? <VoteCountsPill /> : null}
      {claim ? (
        <PanelClaimCard key={claim.window.claim.id} claim={claim} onAnswered={onAnswered} />
      ) : variant === 'below' ? (
        <CaptionZone caption={caption} />
      ) : (
        <PanelSurface variant={variant}>
          <p className="text-metadata text-grey-04">Claims appear here as the debaters make them.</p>
        </PanelSurface>
      )}
    </div>
  );
}

function PanelSurface({ variant, children }: { variant: 'side' | 'below'; children: React.ReactNode }) {
  // `claim-card-panel-surface`: the claim card's own white card, with the side panel's shadow on desktop.
  return <div className={cx('claim-card-panel-surface', variant === 'side' && 'p-4 shadow-panel')}>{children}</div>;
}

/** One side of a claim, as the request popup's secondary button with the claim's own thumb. */
function StanceButton({
  responseKind,
  position,
  selected = false,
  disabled = false,
  title,
  onClick,
}: {
  responseKind: ResponseKind;
  position: boolean;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={event => {
        // The panel can sit over the video's tap-to-pause surface on some layouts.
        event.stopPropagation();
        onClick();
      }}
      className={cx(STAGE_SECONDARY_BUTTON, selected && 'border-transparent bg-divider hover:bg-divider')}
    >
      <ResponsePositionIcon responseKind={responseKind} position={position} selected={selected} />
      {responsePositionLabel(position)}
    </button>
  );
}

/**
 * Step 1: where do you stand, before anything plays.
 *
 * The claim is restated here although it is pinned above the video: this is the question being
 * answered, and the buttons read as an answer to the sentence directly above them.
 */
function StancePrompt({
  debateId,
  claimText,
  responseKind,
  disabled,
  onVote,
  onJustWatch,
}: {
  debateId: string;
  claimText: string;
  responseKind: ResponseKind;
  disabled: boolean;
  onVote: (position: boolean) => void;
  onJustWatch: () => void;
}) {
  return (
    <ActionSurface
      className="flex flex-col gap-3"
      trackImpression
      value={{ component: 'debate_stance_panel', target_id: debateId, target_type: 'debate' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-metadata text-grey-04">Vote to start watching</span>
        <h3 className="text-mediumTitle text-text">Where do you stand?</h3>
      </div>
      <p className="text-[1.0625rem] leading-[1.375rem] font-medium tracking-[-0.3px] text-pretty text-text">
        {claimText}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StanceButton responseKind={responseKind} position disabled={disabled} onClick={() => onVote(true)} />
        <StanceButton responseKind={responseKind} position={false} disabled={disabled} onClick={() => onVote(false)} />
      </div>
      <button type="button" onClick={onJustWatch} className={cx(STAGE_TEXT_LINK, 'self-center')}>
        Just watch
      </button>
    </ActionSurface>
  );
}

/**
 * Step 2: sign-up, in the panel, while the debate plays.
 *
 * The email field is ours; from the code on, it is Explore's own account step — the same Privy
 * headless login, mounted only while someone is actually signing up (its hook shares an emitter with
 * the navbar's login, and an always-mounted one broke that button before).
 */
function InlineSignup({ stance, onNotNow }: { stance: boolean; onNotNow: () => void }) {
  const prepareOnboarding = usePrepareOnboarding();
  const openSignIn = usePrivySignIn(undefined, { analytics: DEBATE_SIGNUP_ANALYTICS });
  const [email, setEmail] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  const [submitted, setSubmitted] = React.useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLikelyEmail(email)) {
      setInvalid(true);
      return;
    }
    beginPrivyAuth(DEBATE_SIGNUP_ANALYTICS);
    prepareOnboarding();
    setSubmitted(email.trim());
  };

  const notNow = () => {
    if (submitted) cancelPrivyAuth();
    onNotNow();
  };

  return (
    <ActionSurface
      className="flex flex-col gap-3"
      trackImpression
      value={{ component: 'debate_inline_signup', target_type: 'application', target_id: 'genesis' }}
    >
      <span className="self-start rounded-full bg-divider px-2.5 py-1 text-metadata text-text">
        Your vote: {responsePositionLabel(stance)} · not counted yet
      </span>
      <h3 className="text-smallTitle text-text">Confirm your email so your vote counts</h3>
      {submitted ? (
        <AccountStep email={submitted} onGiveUp={() => setSubmitted(null)} analytics={DEBATE_SIGNUP_ANALYTICS} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={event => {
              setEmail(event.currentTarget.value);
              setInvalid(false);
            }}
            placeholder="Your email"
            aria-label="Email"
            aria-invalid={invalid}
            className={cx(
              'h-9 w-full min-w-0 rounded-full border bg-white px-4 text-metadata text-text outline-hidden transition-colors placeholder:text-grey-03',
              invalid ? 'border-red-01' : 'border-grey-02 focus:border-text'
            )}
          />
          {invalid ? (
            <p role="alert" className="text-metadata text-red-01">
              That doesn’t look like an email address.
            </p>
          ) : null}
          <button type="submit" className={STAGE_PRIMARY_BUTTON}>
            Send me a code
          </button>
        </form>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        <button type="button" onClick={notNow} className={STAGE_TEXT_LINK}>
          Not now
        </button>
        {submitted ? null : (
          <button type="button" onClick={() => openSignIn()} className={STAGE_TEXT_LINK}>
            Already have an account? Sign in
          </button>
        )}
      </div>
    </ActionSurface>
  );
}

/** What "Not now" leaves behind: a way back in that stays for the rest of the debate. */
function SignupChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-full bg-grey-01 px-3 py-1.5 text-metadata"
    >
      <span className="flex items-center gap-1.5 text-grey-04">
        <span aria-hidden className="size-1.5 rounded-full bg-orange" />
        Vote not counted
      </span>
      <span className="text-ctaPrimary">Confirm email</span>
    </button>
  );
}

function VoteCountsPill() {
  return (
    <span role="status" className="self-start rounded-full bg-successTertiary px-2.5 py-1 text-metadata text-text">
      ✓ Your vote counts
    </span>
  );
}

/**
 * A live claim, as the panel draws it: who said it, all of it, and both sides as real buttons.
 *
 * The crowd's split is the reward for answering, so it is shown only once the viewer has — the
 * over-the-video card shows it up front, which is right for a running read of the room and wrong for
 * a question that has just been put to you. Answering never pauses the video.
 */
function PanelClaimCard({
  claim,
  onAnswered,
}: {
  claim: StagePanelClaim;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const { window, speaker, row, entity } = claim;
  const spaceId = window.claim.spaceId ?? '';
  const { responseKind, summary, control } = useDebateClaimResponse({
    claimId: window.claim.id,
    spaceId,
    row,
    entity,
  });
  const position = control.viewerPosition;

  React.useEffect(() => {
    onAnswered(window.claim.id, position);
  }, [onAnswered, position, window.claim.id]);

  const answered = position !== null;
  const copy = CLAIM_RESPONSE_COPY;

  return (
    <ActionSurface
      className="flex flex-col gap-2.5 claim-card-panel-surface"
      trackImpression
      value={{ component: 'debate_claim_ticker', target_id: window.claim.id, target_type: 'claim', variant: 'panel' }}
    >
      <div className="flex items-center justify-between gap-2 text-metadata text-grey-04">
        <span className="flex min-w-0 items-center gap-1.5">
          {speaker ? (
            <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-grey-02">
              <Avatar avatarUrl={speaker.avatar_cid} value={speaker.profile_space_id} size={16} />
            </span>
          ) : null}
          <span className="truncate">
            {answered ? 'Your view is saved' : speaker ? `${speakerLabel(speaker)}’s claim` : 'Claim'}
          </span>
        </span>
        <span className="shrink-0 text-grey-03 tabular-nums">
          {claim.position} of {claim.total}
        </span>
      </div>
      {/* Never clamped: the point of the panel is that the whole claim fits. */}
      <p className="text-[1.0625rem] leading-[1.375rem] tracking-[-0.3px] text-pretty text-text">{window.claim.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <StanceButton
          responseKind={responseKind}
          position
          selected={position === true}
          disabled={!control.canRespond}
          title={control.actionTitle(true) || copy.positiveAction}
          onClick={() => control.respond(true)}
        />
        <StanceButton
          responseKind={responseKind}
          position={false}
          selected={position === false}
          disabled={!control.canRespond}
          title={control.actionTitle(false) || copy.negativeAction}
          onClick={() => control.respond(false)}
        />
      </div>
      {answered && summary.hasCounts && summary.percent !== null ? (
        <div className="flex flex-col gap-1.5">
          <ClaimSplitBar percent={summary.percent} className="h-1.5" />
          <span className="text-metadata text-grey-04 tabular-nums">
            {summary.percent}% {copy.positiveAction.toLowerCase()} · {summary.total.toLocaleString('en-US')}{' '}
            {summary.total === 1 ? 'vote' : 'votes'}
          </span>
        </div>
      ) : null}
    </ActionSurface>
  );
}

/**
 * Between claims on a phone, the zone under the video carries what is being said, large.
 *
 * Most phone viewing starts muted, and the subtitle pill over the video is small; the zone is there
 * anyway, holding its height so a claim card arriving does not move anything.
 */
function CaptionZone({ caption }: { caption: { speaker: DebateParticipant | null; text: string } | null }) {
  return (
    <div className="flex min-h-[8.5rem] flex-col gap-2 rounded-lg bg-grey-01 p-3">
      {caption?.speaker ? (
        <span className="flex items-center gap-1.5 text-metadata text-grey-04">
          <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-grey-02">
            <Avatar avatarUrl={caption.speaker.avatar_cid} value={caption.speaker.profile_space_id} size={16} />
          </span>
          {speakerLabel(caption.speaker)}
        </span>
      ) : null}
      <p aria-live="off" className="text-[1.1875rem] leading-[1.5rem] font-medium tracking-[-0.4px] text-text">
        {caption?.text ?? ''}
      </p>
    </div>
  );
}
