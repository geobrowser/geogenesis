'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { currentAuthAttempt, finishAuthAttempt } from '~/core/auth-attempt';
import { useAnyModalOpen } from '~/core/hooks/use-any-modal-open';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';
import { captureSaveVotesImpression, saveVotesSignInProperties } from '~/core/save-votes-analytics';
import { isChatOpenAtom } from '~/core/state/chat-store';
import {
  type LocalVote,
  clearSaveRequested,
  markSaveRequested,
  recordSavePromptDismissed,
  recordSavePromptShown,
  useLocalVotes,
} from '~/core/state/local-votes';
import {
  type SaveVotesPromptReason,
  closeSaveVotesPrompt,
  openSaveVotesPrompt,
  useSaveVotesPrompt,
  wasPromptedThisSession,
} from '~/core/state/save-votes-prompt';

import { CloseSmall } from '~/design-system/icons/close-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';

import { AccountStep } from '~/partials/explore/email-capture-account-step';
import {
  CONTROL_HEIGHT_CLASS,
  CONTROL_LABEL_CLASS,
  HEADING_CLASS,
  SUBTEXT_CLASS,
} from '~/partials/explore/email-capture-styles';

/** Asks that open on their own count toward when the sheet asks again; a press on "Save" does not. */
const AUTOMATIC_REASONS: ReadonlySet<SaveVotesPromptReason> = new Set(['threshold', 'single_claim', 'repeat']);

export function saveVotesHeading(count: number, reason: SaveVotesPromptReason | null) {
  if (reason === 'return_visit') return count === 1 ? 'You have 1 unsaved vote' : `You have ${count} unsaved votes`;
  return count === 1 ? 'Save your vote' : `Save your ${count} votes`;
}

export function saveVotesSubtext(count: number, reason: SaveVotesPromptReason | null) {
  if (reason === 'return_visit') {
    return count === 1
      ? 'It’s still on this device. Add your email and it counts toward the result.'
      : 'They’re still on this device. Add your email and they count toward the result.';
  }
  return count === 1
    ? 'It’s only on this device for now. Add your email and it counts toward the result.'
    : 'They’re only on this device for now. Add your email and they count toward the result.';
}

/**
 * "Save your N votes": asks a signed-out visitor who has voted to keep their votes by making an
 * account (GEO-3214).
 *
 * The Explore email capture's card and code step, given new content: a corner card on desktop, a
 * bottom sheet on phones. Mounted app-wide, because the pills that open it are on the claim page, the
 * debates hub and the debate player as well as Explore.
 */
export function SaveVotesSheet() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const reason = useSaveVotesPrompt();
  const { votes } = useLocalVotes();
  const count = votes.length;
  const isChatOpen = useAtomValue(isChatOpenAtom);
  const prepareOnboarding = usePrepareOnboarding();
  const signIn = usePrivySignIn();

  const [email, setEmail] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  /** The address the code was sent to, once the visitor has asked for one. */
  const [codeEmail, setCodeEmail] = React.useState<string | null>(null);

  // The return-visit ask: once per browser session, for a visitor who arrives with votes waiting.
  // A session in which they voted has already been marked, so this is never the visit they voted in.
  React.useEffect(() => {
    if (!ready || authenticated || count === 0 || wasPromptedThisSession()) return;
    openSaveVotesPrompt('return_visit');
    // Arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const open = reason !== null && ready && !authenticated && (count > 0 || codeEmail !== null);

  // Counted and measured once per opening, not per render.
  React.useEffect(() => {
    if (!open || !reason) return;
    if (AUTOMATIC_REASONS.has(reason)) recordSavePromptShown();
    captureSaveVotesImpression(reason, count);
    // Per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reason]);

  // Signed in: the sheet's job is done whichever way they got there, and the saver takes over.
  React.useEffect(() => {
    if (!authenticated) return;
    setCodeEmail(null);
    closeSaveVotesPrompt();
  }, [authenticated]);

  const isAnyModalOpen = useAnyModalOpen(open);
  const overlayOpen = isModalOpen || isChatOpen || isAnyModalOpen;

  const close = React.useCallback(() => {
    if (codeEmail !== null) {
      if (currentAuthAttempt()?.properties.component === 'save_votes_prompt') finishAuthAttempt('closed');
      cancelPrivyAuth();
    }
    // Not now, not never: the votes stay on the device and the pills still offer "Save".
    clearSaveRequested();
    recordSavePromptDismissed();
    setCodeEmail(null);
    closeSaveVotesPrompt();
  }, [codeEmail]);

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isLikelyEmail(trimmed)) {
      setInvalid(true);
      return;
    }
    markSaveRequested();
    beginPrivyAuth(saveVotesSignInProperties('email', count));
    prepareOnboarding();
    setCodeEmail(trimmed);
  };

  const otherWays = () => {
    markSaveRequested();
    // Dismissing Privy's dialog withdraws the save request, so a later sign-in some other way still
    // reads as "not a save" and clears the votes rather than publishing them.
    void signIn(saveVotesSignInProperties('other_sign_in', count), { onCancel: clearSaveRequested });
    closeSaveVotesPrompt();
  };

  if (!open) return null;
  // Waits behind anything the visitor opened. Hidden rather than unmounted once a code is out, so
  // closing that overlay does not mail a second code (the email capture learned this first).
  if (overlayOpen && codeEmail === null) return null;

  return (
    <div
      hidden={overlayOpen}
      role="region"
      aria-label="Save your votes"
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
      className={cx(
        'fixed right-4 bottom-4 z-1101 w-[308px] animate-rise-in overflow-clip rounded-xl border border-grey-02 bg-white shadow-lg motion-reduce:animate-fade-in',
        'mobile:inset-x-0 mobile:bottom-0 mobile:w-auto mobile:rounded-none mobile:rounded-t-xl'
      )}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Not now"
        data-geo-analytics-label="save_votes_dismiss"
        data-geo-analytics-intent="dismiss"
        className="absolute top-[7px] right-[7px] z-20 p-1 text-grey-04 transition-colors duration-200 ease-in-out hover:text-text mobile:top-[-5px] mobile:right-[-5px] mobile:p-4 mobile:text-text"
      >
        <CloseSmall />
      </button>

      <div className="px-5 pt-[27px] pb-[27px] text-center mobile:pb-[max(34px,env(safe-area-inset-bottom))]">
        {codeEmail !== null ? (
          <div role="status">
            <p className={HEADING_CLASS}>Check your email</p>
            <AccountStep
              email={codeEmail}
              analytics={saveVotesSignInProperties('email', count)}
              analyticsLabel="Save votes verification"
              onGiveUp={close}
            />
          </div>
        ) : (
          <form
            data-geo-analytics-label="Save votes"
            data-geo-analytics-intent="signup"
            onSubmit={submitEmail}
            noValidate
          >
            <p className={HEADING_CLASS}>{saveVotesHeading(count, reason)}</p>
            <p className={SUBTEXT_CLASS}>{saveVotesSubtext(count, reason)}</p>
            <VoteChips votes={votes} />

            <div className="mt-[19px] flex flex-col gap-[6px] mobile:mx-auto mobile:mt-5 mobile:max-w-[394px]">
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
                className={cx(
                  `${CONTROL_HEIGHT_CLASS} w-full min-w-0 rounded-full border bg-white px-3 text-left text-[17px] leading-[19px] text-text outline-hidden transition-colors placeholder:text-grey-03 mobile:text-center`,
                  invalid ? 'border-red-01' : 'border-grey-02 focus:border-text'
                )}
              />
              <button
                type="submit"
                className={`inline-flex ${CONTROL_HEIGHT_CLASS} ${CONTROL_LABEL_CLASS} w-full items-center justify-center rounded-full bg-[#151515] px-2.5 whitespace-nowrap text-white transition-opacity hover:opacity-90`}
              >
                {count === 1 ? 'Save vote' : 'Save votes'}
              </button>
            </div>

            {invalid ? (
              <p role="alert" className="mt-2 text-[14px] tracking-[-0.35px] text-red-01">
                That does not look like an email address.
              </p>
            ) : null}

            <button
              type="button"
              onClick={otherWays}
              className="mt-[10px] text-[13px] text-grey-04 transition-colors hover:text-text"
            >
              Other ways to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function chipLabel(vote: LocalVote) {
  if (vote.responseKind === 'curation') return vote.direction === 'positive' ? 'Upvote:' : 'Downvote:';
  return vote.direction === 'positive' ? 'Agree:' : 'Disagree:';
}

/** Up to two of the visitor's votes, then how many more: a reminder of what closing this leaves behind. */
function VoteChips({ votes }: { votes: LocalVote[] }) {
  const newest = [...votes].reverse();
  const shown = newest.slice(0, 2).filter(vote => vote.title);
  const more = votes.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <ul className="mt-[14px] flex flex-wrap justify-center gap-1" aria-label="Your votes">
      {shown.map(vote => (
        <li
          key={`${vote.entityId}:${vote.spaceId}:${vote.responseKind}`}
          className="flex max-w-[132px] items-center gap-1 rounded-full border border-grey-02 bg-grey-01 px-2 py-[3px] text-[12px] leading-[14px] text-text"
        >
          <span aria-hidden className="shrink-0">
            <ResponsePositionIcon responseKind={vote.responseKind} position={vote.direction === 'positive'} selected />
          </span>
          <span className="sr-only">{chipLabel(vote)}</span>
          <span className="truncate">{vote.title}</span>
        </li>
      ))}
      {more > 0 ? (
        <li className="flex items-center rounded-full border border-grey-02 bg-grey-01 px-2 py-[3px] text-[12px] leading-[14px] text-text">
          +{more}
        </li>
      ) : null}
    </ul>
  );
}
