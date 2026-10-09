'use client';

import pluralize from 'pluralize';

import { Text } from '~/design-system/text';

import { useGeoChatAuth } from '../hooks';
import { useLobbyGuestSignIn } from './lobby-guest-sign-in';
import { LOBBY_QUEUED_REQUEST_COPY, useLobbyQueuedRequest } from './lobby-queued-request';

export const LOBBY_GUEST_COPY = {
  listening: 'You’re listening.',
  /** When this visitor is not listening (starting, refused, elsewhere, turned off). */
  notListening: 'Create an account to speak, vote and debate.',
  stay: 'You’ll stay in this lobby.',
  invite: 'Create an account to speak, vote and debate. You’ll stay in this lobby.',
  logIn: 'Log in',
  createAccount: 'Create account',
  listenOnly: 'Listening only. Your mic is off until you have an account.',
  voteNeedsAccount: 'Voting asks you to create an account.',
  settingUp: 'Setting up your account…',
  settingUpDetail: 'You’ll stay in this lobby and can speak once it’s ready.',
} as const;

/** Visitors without an account, as the lobby header counts them. */
export function guestCountLabel(count: number) {
  return `${pluralize('guest', count)} without an account`;
}

/**
 * How many people listen without an account (GEO-3131), in the lobby header. The same for every
 * viewer: "here" counts members only, so a guest's own "You" beside it would read as a mismatch.
 */
export function LobbyGuestCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="lobby-guest-count">
      <span
        aria-hidden
        className="inline-flex size-5 items-center justify-center rounded-full bg-grey-02 text-[11px] leading-none font-medium text-grey-04"
      >
        +{count}
      </span>
      <Text as="span" variant="footnote" color="grey-04">
        <span className="sr-only">{count} </span>
        {guestCountLabel(count)}
      </Text>
    </span>
  );
}

/**
 * The way in for a visitor without an account: "You're listening" while their room plays. Names a debate request
 * waiting on sign-up, so what they tapped stays on screen while they sign up.
 */
export function LobbyGuestBanner({
  lobbyId,
  listening = false,
  message,
}: {
  lobbyId: string;
  /** This visitor's room is playing; otherwise the banner only invites, so it never contradicts a notice. */
  listening?: boolean;
  /** In place of the default lines, e.g. after a host removed the guests. */
  message?: { title: string; detail: string };
}) {
  const signIn = useLobbyGuestSignIn(lobbyId);
  const { pending } = useLobbyQueuedRequest();
  // Signed in, waiting for the member view (a new account takes a minute or two): no more asking.
  const { authenticated } = useGeoChatAuth();
  if (authenticated) {
    return (
      <div role="status" className="rounded-xl bg-grey-01 px-4 py-3" data-testid="lobby-guest-banner">
        <Text as="p" variant="metadataMedium">
          {LOBBY_GUEST_COPY.settingUp}
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          {LOBBY_GUEST_COPY.settingUpDetail}
        </Text>
      </div>
    );
  }
  const fallback = listening
    ? { title: LOBBY_GUEST_COPY.listening, detail: LOBBY_GUEST_COPY.invite }
    : { title: LOBBY_GUEST_COPY.notListening, detail: LOBBY_GUEST_COPY.stay };
  const title = message?.title ?? (pending ? LOBBY_QUEUED_REQUEST_COPY.prompt(pending.name) : fallback.title);

  return (
    <div
      role="region"
      aria-label="Create an account"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-text px-4 py-3 text-white"
      data-testid="lobby-guest-banner"
    >
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        <Text as="p" variant="metadataMedium" color="white">
          {title}
        </Text>
        <Text as="p" variant="footnote" color="grey-02">
          {message?.detail ?? (pending ? LOBBY_GUEST_COPY.invite : fallback.detail)}
        </Text>
      </div>
      <button
        type="button"
        data-geo-analytics-label="Lobby guest log in"
        data-geo-analytics-intent="signup"
        onClick={() => signIn()}
        className="text-metadataMedium text-white underline-offset-2 hover:underline"
      >
        {LOBBY_GUEST_COPY.logIn}
      </button>
      <button
        type="button"
        data-geo-analytics-label="Lobby guest create account"
        data-geo-analytics-intent="signup"
        onClick={() => signIn()}
        className="inline-flex h-7 items-center rounded-full border border-white bg-white px-3 text-metadata text-text"
      >
        {LOBBY_GUEST_COPY.createAccount}
      </button>
    </div>
  );
}
