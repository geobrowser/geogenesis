'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { arrivedFromEmail } from '~/core/deep-links/ref-email';
import { useAnyModalOpen } from '~/core/hooks/use-any-modal-open';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';
import { captureSaveVotesImpression, saveVotesSignInProperties } from '~/core/save-votes-analytics';
import { saveVotesHeading, saveVotesSubmitLabel, saveVotesSubtext } from '~/core/save-votes-copy';
import { isChatOpenAtom } from '~/core/state/chat-store';
import {
  type LocalVote,
  recordSavePromptDismissed,
  recordSavePromptShown,
  useLocalVotes,
} from '~/core/state/local-votes';
import {
  type SaveVotesPromptReason,
  closeSaveVotesPrompt,
  openSaveVotesPrompt,
  opensSaveVotesCentered,
  useSaveVotesPrompt,
  useSaveVotesPromptLobbyName,
  wasPromptedThisSession,
} from '~/core/state/save-votes-prompt';
import { usePrivy } from '~/core/wallet/auth-hooks';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { CloseSmall } from '~/design-system/icons/close-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';

import { AccountStep } from '~/partials/explore/email-capture-account-step';
import { useIsEmailCaptureShowing } from '~/partials/explore/email-capture-presence';
import {
  CARD_CLASS,
  CENTERED_CARD_CLASS,
  CLOSE_BUTTON_CLASS,
  ERROR_CLASS,
  FORM_STACK_CLASS,
  HEADING_CLASS,
  PRIMARY_BUTTON_CLASS,
  SUBTEXT_CLASS,
  fieldClass,
} from '~/partials/explore/email-capture-styles';

/**
 * Asks that open on their own count toward when the sheet asks again; a press on "Save" does not. The
 * return-visit ask counts too, or closing it and voting once more would ask again straight away.
 */
const AUTOMATIC_REASONS: ReadonlySet<SaveVotesPromptReason> = new Set([
  'threshold',
  'single_claim',
  'repeat',
  'return_visit',
  'email_link',
]);

/**
 * "Save your N votes": asks a signed-out visitor who has voted to keep their votes by making an
 * account (GEO-3214).
 *
 * The Explore email capture's card and code step, given new content: a corner card on desktop, a
 * bottom sheet on phones. Mounted app-wide, because the controls that open it are on the claim page,
 * entity pages, the debates hub and the debate player as well as Explore.
 *
 * Opened from the navbar's "Save N votes", it is the same card as a centred modal dialog instead
 * (GEO-3400): the visitor asked for it, so it comes forward rather than waiting in the corner. An
 * email's vote link opens it centred too (GEO-3374); see `opensSaveVotesCentered`.
 */
export function SaveVotesSheet() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const reason = useSaveVotesPrompt();
  const lobbyName = useSaveVotesPromptLobbyName();
  const { votes } = useLocalVotes();
  const count = votes.length;
  const isChatOpen = useAtomValue(isChatOpenAtom);
  const prepareOnboarding = usePrepareOnboarding();

  const [email, setEmail] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  /**
   * Once the visitor has asked for a code: the address it went to, and the sheet as it was then.
   * The code step keeps that presentation and attribution to the end. Moving between the corner card
   * and the centred dialog is a different tree, which would remount the step, clear what was typed
   * and mail a second code.
   */
  const [codeStep, setCodeStep] = React.useState<{
    email: string;
    centered: boolean;
    reason: SaveVotesPromptReason | null;
  } | null>(null);
  const codeEmail = codeStep?.email ?? null;

  // Landed from one of our emails: everyone they go to has an account, so this visit's asks are to
  // log in (GEO-3374). Read at the first render, so the sign-up wording never paints first; the
  // landing itself is noted by `SaveVotesGate`, which is mounted long before this sheet is.
  const [logIn] = React.useState(() => arrivedFromEmail());

  // The return-visit ask: once per browser session, for a visitor who arrives with votes waiting.
  // A session in which they voted has already been marked, so this is never the visit they voted in.
  React.useEffect(() => {
    if (!ready || authenticated || count === 0 || wasPromptedThisSession()) return;
    openSaveVotesPrompt('return_visit');
    // Arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const open = reason !== null && ready && !authenticated && (count > 0 || codeEmail !== null);

  // Every vote taken back: the ask was about votes that are gone, and must not reopen for the next
  // single vote, which on a feed isn't an ask yet. Not mid-code: that step outlives the votes.
  React.useEffect(() => {
    if (count === 0 && codeEmail === null) closeSaveVotesPrompt();
  }, [count, codeEmail]);

  // Signed in: the sheet's job is done whichever way they got there, and the saver takes over.
  React.useEffect(() => {
    if (!authenticated) return;
    setCodeStep(null);
    closeSaveVotesPrompt();
  }, [authenticated]);

  const centered = codeStep ? codeStep.centered : opensSaveVotesCentered(reason);
  // Centred, the sheet is a modal of its own, which this would find and hide itself behind. Nothing
  // else is modal at the press that opens it, and anything opened later is opened from inside it.
  const isAnyModalOpen = useAnyModalOpen(open && !centered);
  const signInProperties = saveVotesSignInProperties('email', count, codeStep ? codeStep.reason : reason);
  // The email capture card shares this corner, and is mid-signup if it is still up once votes exist.
  const isEmailCaptureShowing = useIsEmailCaptureShowing();
  // Privy's dialog still comes first, centred or not: it is the visitor's sign-in in progress.
  const overlayOpen = centered ? isModalOpen : isModalOpen || isChatOpen || isAnyModalOpen || isEmailCaptureShowing;

  // Privy's dialog over the centred sheet is the code step's fallback (a send it could not make).
  // The sheet's modal would hold focus and pointer events away from it, so it steps aside instead,
  // as "Other ways to sign in" once did: the attempt Privy resumes is still a save, so the votes are
  // saved if it completes, and stay on the device if not.
  React.useEffect(() => {
    if (!centered || !isModalOpen) return;
    setCodeStep(null);
    closeSaveVotesPrompt();
  }, [centered, isModalOpen]);
  // Read when the dialog closes, which is after the render that closed it.
  const isModalOpenRef = React.useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;
  /** What had focus when the centred dialog opened, to hand it back to: it has no Radix trigger. */
  const openerRef = React.useRef<HTMLElement | null>(null);
  const visible = open && !overlayOpen;

  // Counted and measured once per opening, and only once the visitor can see it: an ask that waits
  // behind an overlay and is never shown neither uses up an ask nor reports an impression. Not once
  // a code is out, either: a new reason then changes nothing on screen.
  const recordedFor = React.useRef<SaveVotesPromptReason | null>(null);
  React.useEffect(() => {
    if (!open) recordedFor.current = null;
    if (!visible || !reason || codeStep || recordedFor.current === reason) return;
    recordedFor.current = reason;
    if (AUTOMATIC_REASONS.has(reason)) recordSavePromptShown();
    captureSaveVotesImpression(reason, count);
    // Per opening; `count` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visible, reason]);

  const close = React.useCallback(() => {
    // Ends this sheet's own sign-in as closed, once a code is out, so it no longer counts as a save.
    if (codeEmail !== null) cancelPrivyAuth();
    // Not now, not never: the votes stay on the device and the pills still offer "Save".
    recordSavePromptDismissed();
    setCodeStep(null);
    closeSaveVotesPrompt();
  }, [codeEmail]);

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isLikelyEmail(trimmed)) {
      setInvalid(true);
      return;
    }
    beginPrivyAuth(signInProperties);
    prepareOnboarding();
    setCodeStep({ email: trimmed, centered, reason });
  };

  if (!open) return null;
  // Waits behind anything the visitor opened. Hidden rather than unmounted once a code is out, so
  // closing that overlay does not mail a second code (the email capture learned this first).
  if (overlayOpen && codeEmail === null) return null;

  const returnVisit = reason === 'return_visit';

  const label = lobbyName ? 'Join the discussion' : 'Save your votes';
  const content = (
    <>
      <button
        type="button"
        onClick={close}
        aria-label="Not now"
        data-geo-analytics-label="save_votes_dismiss"
        data-geo-analytics-intent="dismiss"
        className={CLOSE_BUTTON_CLASS}
      >
        <CloseSmall />
      </button>

      {/* The email capture's body, with the artwork's height given back as top padding. */}
      <div className="px-5 pt-[27px] pb-[27px] text-center mobile:pb-[max(34px,env(safe-area-inset-bottom))]">
        {codeEmail !== null ? (
          <div role="status">
            <p className={HEADING_CLASS}>Check your email</p>
            <AccountStep
              email={codeEmail}
              analytics={signInProperties}
              analyticsLabel="Save votes verification"
              onGiveUp={close}
            />
          </div>
        ) : (
          <form
            data-geo-analytics-label="Save votes"
            data-geo-analytics-intent={logIn ? 'login' : 'signup'}
            onSubmit={submitEmail}
            noValidate
          >
            {lobbyName ? (
              <>
                <p className={HEADING_CLASS}>Join the discussion</p>
                <p className={SUBTEXT_CLASS}>
                  Create an account to vote on claims, speak and debate. You’ll stay in{' '}
                  <span className="font-medium text-text">{lobbyName}</span>, and your audio keeps playing.
                </p>
                <p className="mt-[14px] text-[11px] leading-[13px] font-medium text-grey-04">Saved for after sign-up</p>
              </>
            ) : (
              <>
                <p className={HEADING_CLASS}>{saveVotesHeading(count, returnVisit, logIn)}</p>
                <p className={SUBTEXT_CLASS}>{saveVotesSubtext(count, returnVisit, logIn)}</p>
              </>
            )}
            <VoteChips votes={votes} rows={centered ? 2 : 1} className={lobbyName ? 'mt-1.5' : undefined} />

            <div className={FORM_STACK_CLASS}>
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={event => {
                  setEmail(event.currentTarget.value);
                  setInvalid(false);
                }}
                placeholder="Email..."
                aria-label="Email address"
                aria-invalid={invalid}
                className={cx(fieldClass(invalid), 'text-left placeholder:text-grey-03 mobile:text-center')}
              />
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                {saveVotesSubmitLabel(count, logIn)}
              </button>
            </div>

            {invalid ? (
              <p role="alert" className={ERROR_CLASS}>
                That does not look like an email address.
              </p>
            ) : null}
          </form>
        )}
      </div>
    </>
  );

  if (centered) {
    return (
      <Root
        open
        onOpenChange={next => {
          if (!next) close();
        }}
      >
        <Portal>
          {/* The card inside its backdrop, Radix's own pattern for a centred dialog: a press beside
              the card is then outside the dialog's content, which is what dismisses it. */}
          <Overlay
            hidden={overlayOpen}
            className={cx(
              'fixed inset-0 flex animate-fade-in items-center justify-center bg-text/20 p-4 mobile:items-end mobile:p-0',
              Z_LAYER_CLASS.saveVotesDialog
            )}
          >
            <Content
              aria-describedby={undefined}
              onOpenAutoFocus={() => {
                openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              }}
              onCloseAutoFocus={event => {
                // Radix would return focus to a trigger, and there is none. Not while Privy's dialog
                // is taking over, which owns focus then.
                event.preventDefault();
                if (!isModalOpenRef.current) openerRef.current?.focus();
              }}
              className={cx(CENTERED_CARD_CLASS, 'focus:outline-hidden')}
            >
              <Title className="sr-only">{label}</Title>
              {content}
            </Content>
          </Overlay>
        </Portal>
      </Root>
    );
  }

  return (
    <div
      hidden={overlayOpen}
      role="region"
      aria-label={label}
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
      className={CARD_CLASS}
    >
      {content}
    </div>
  );
}

function chipLabel(vote: LocalVote) {
  if (vote.responseKind === 'curation') return vote.direction === 'positive' ? 'Upvote:' : 'Downvote:';
  return vote.direction === 'positive' ? 'Agree:' : 'Disagree:';
}

const CHIP_CLASS =
  'flex items-center rounded-full border border-grey-02 bg-grey-01 px-2 py-[3px] text-[12px] leading-[14px] text-text';

/**
 * The visitor's latest votes, two to a row, then how many more: a reminder of what closing this
 * leaves behind. One row in the corner card; the centred dialog has room for a second.
 */
function VoteChips({ votes, rows, className }: { votes: LocalVote[]; rows: 1 | 2; className?: string }) {
  const shown = [...votes]
    .reverse()
    .filter(vote => vote.title)
    .slice(0, rows * 2);
  const more = votes.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <ul className={cx('mt-[14px] flex flex-wrap justify-center gap-1', className)} aria-label="Your votes">
      {shown.map(vote => (
        <li
          key={`${vote.entityId}:${vote.spaceId}:${vote.responseKind}`}
          // A touch narrower over two rows, so the "+N" closes the second instead of wrapping to a third.
          className={cx(CHIP_CLASS, rows === 2 ? 'max-w-[128px]' : 'max-w-[132px]', 'gap-1')}
        >
          <span aria-hidden className="shrink-0">
            <ResponsePositionIcon responseKind={vote.responseKind} position={vote.direction === 'positive'} selected />
          </span>
          <span className="sr-only">{chipLabel(vote)}</span>
          <span className="truncate">{vote.title}</span>
        </li>
      ))}
      {more > 0 ? <li className={CHIP_CLASS}>+{more}</li> : null}
    </ul>
  );
}
