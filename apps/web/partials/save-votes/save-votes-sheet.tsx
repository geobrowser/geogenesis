'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { useAnyModalOpen } from '~/core/hooks/use-any-modal-open';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { useSaveVotesSignIn } from '~/core/hooks/use-save-votes-sign-in';
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
  useSaveVotesPrompt,
  wasPromptedThisSession,
} from '~/core/state/save-votes-prompt';

import { CloseSmall } from '~/design-system/icons/close-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';

import { AccountStep } from '~/partials/explore/email-capture-account-step';
import { useIsEmailCaptureShowing } from '~/partials/explore/email-capture-presence';
import {
  CARD_CLASS,
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
]);

/**
 * "Save your N votes": asks a signed-out visitor who has voted to keep their votes by making an
 * account (GEO-3214).
 *
 * The Explore email capture's card and code step, given new content: a corner card on desktop, a
 * bottom sheet on phones. Mounted app-wide, because the controls that open it are on the claim page,
 * entity pages, the debates hub and the debate player as well as Explore.
 */
export function SaveVotesSheet() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const reason = useSaveVotesPrompt();
  const { votes } = useLocalVotes();
  const count = votes.length;
  const isChatOpen = useAtomValue(isChatOpenAtom);
  const prepareOnboarding = usePrepareOnboarding();
  const saveSignIn = useSaveVotesSignIn();

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

  // Signed in: the sheet's job is done whichever way they got there, and the saver takes over.
  React.useEffect(() => {
    if (!authenticated) return;
    setCodeEmail(null);
    closeSaveVotesPrompt();
  }, [authenticated]);

  const isAnyModalOpen = useAnyModalOpen(open);
  // The email capture card shares this corner, and is mid-signup if it is still up once votes exist.
  const isEmailCaptureShowing = useIsEmailCaptureShowing();
  const overlayOpen = isModalOpen || isChatOpen || isAnyModalOpen || isEmailCaptureShowing;
  const visible = open && !overlayOpen;

  // Counted and measured once per opening, and only once the visitor can see it: an ask that waits
  // behind an overlay and is never shown neither uses up an ask nor reports an impression.
  const recordedFor = React.useRef<SaveVotesPromptReason | null>(null);
  React.useEffect(() => {
    if (!open) recordedFor.current = null;
    if (!visible || !reason || recordedFor.current === reason) return;
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
    beginPrivyAuth(saveVotesSignInProperties('email', count));
    prepareOnboarding();
    setCodeEmail(trimmed);
  };

  const otherWays = () => {
    void saveSignIn('other_sign_in', count);
    closeSaveVotesPrompt();
  };

  if (!open) return null;
  // Waits behind anything the visitor opened. Hidden rather than unmounted once a code is out, so
  // closing that overlay does not mail a second code (the email capture learned this first).
  if (overlayOpen && codeEmail === null) return null;

  const returnVisit = reason === 'return_visit';

  return (
    <div
      hidden={overlayOpen}
      role="region"
      aria-label="Save your votes"
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
      className={CARD_CLASS}
    >
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
            <p className={HEADING_CLASS}>{saveVotesHeading(count, returnVisit)}</p>
            <p className={SUBTEXT_CLASS}>{saveVotesSubtext(count, returnVisit)}</p>
            <VoteChips votes={votes} />

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
                {saveVotesSubmitLabel(count)}
              </button>
            </div>

            {invalid ? (
              <p role="alert" className={ERROR_CLASS}>
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

const CHIP_CLASS =
  'flex items-center rounded-full border border-grey-02 bg-grey-01 px-2 py-[3px] text-[12px] leading-[14px] text-text';

/** Up to two of the visitor's votes, then how many more: a reminder of what closing this leaves behind. */
function VoteChips({ votes }: { votes: LocalVote[] }) {
  const shown = [...votes]
    .reverse()
    .filter(vote => vote.title)
    .slice(0, 2);
  const more = votes.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <ul className="mt-[14px] flex flex-wrap justify-center gap-1" aria-label="Your votes">
      {shown.map(vote => (
        <li
          key={`${vote.entityId}:${vote.spaceId}:${vote.responseKind}`}
          className={cx(CHIP_CLASS, 'max-w-[132px] gap-1')}
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
