'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { hasAvailabilityLinkParam, withoutAvailabilityLinkParam } from '~/core/availability/share-link';
import { useDebateProfile, useGeoChatAuth } from '~/core/debates/hooks';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from './peer-availability-booking-modal';

/**
 * Opens a person's bookable week when their profile is reached through an availability link
 * (`?availability=1`, see `core/availability/share-link`).
 *
 * Deliberately not behind the booking flag: the link is the opt-in. Only someone with the flag can
 * copy one, and whoever they send it to has no reason to have heard of the flag.
 *
 * Closing takes the parameter back off the URL, so a reload or a back-and-forth does not open it
 * again, and leaves the recipient on the profile.
 */
export function SharedAvailabilityLauncher(props: { profileSpaceId: string; fallbackName?: string | null }) {
  // `useSearchParams` suspends a server-rendered route up to the nearest boundary, and this has no
  // business holding the profile back.
  return (
    <React.Suspense fallback={null}>
      <Launcher {...props} />
    </React.Suspense>
  );
}

function Launcher({ profileSpaceId, fallbackName }: { profileSpaceId: string; fallbackName?: string | null }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = hasAvailabilityLinkParam(searchParams);
  // The URL update is a navigation and takes a beat; the dialog should not wait on it.
  const [closed, setClosed] = React.useState(false);

  // Arriving on the link again in-app — same profile, component still mounted — opens it again.
  React.useEffect(() => {
    if (!requested) setClosed(false);
  }, [requested]);

  if (!requested) return null;

  return (
    <SharedAvailabilityModal
      open={!closed}
      profileSpaceId={profileSpaceId}
      fallbackName={fallbackName}
      onClose={() => {
        setClosed(true);
        router.replace(withoutAvailabilityLinkParam(pathname, searchParams?.toString() ?? ''), { scroll: false });
      }}
    />
  );
}

/**
 * The booking modal, reached by profile rather than by geo-chat user id.
 *
 * A link carries the profile's space id, and the week is keyed by user id, which only geo-chat's
 * debate profile knows — and only answers to someone signed in. Everything before that answer is
 * drawn inside the same dialog, so the recipient never sees it swap out from under them.
 */
export function SharedAvailabilityModal({
  open,
  profileSpaceId,
  fallbackName,
  onClose,
}: {
  open: boolean;
  profileSpaceId: string;
  fallbackName?: string | null;
  onClose: () => void;
}) {
  const { ready, authenticated } = useGeoChatAuth();
  const signIn = usePrivySignIn();
  const profile = useDebateProfile(profileSpaceId, open);
  const person = profile.data?.user;
  const name = person?.display_name || fallbackName || null;

  const notice = (() => {
    // Before Privy knows, "sign in" would flash at people who already are.
    if (!ready) return <Notice>Loading availability…</Notice>;
    if (!authenticated) {
      return (
        <Notice
          action={
            <button
              type="button"
              onClick={() => signIn()}
              className="rounded-full bg-text px-4 py-1.5 text-metadata text-white transition-opacity hover:opacity-90"
            >
              Sign in
            </button>
          }
        >
          Sign in to see when {name ?? 'they'} {name ? 'is' : 'are'} free and request a time to debate.
        </Notice>
      );
    }
    if (profile.isPending) return <Notice>Loading availability…</Notice>;
    if (profile.isError || !person) return <Notice>Couldn&rsquo;t load their availability.</Notice>;
    if (profile.data?.is_self) {
      return (
        <Notice>
          This is your availability link. Anyone who opens it can see when you&rsquo;re free and request a time to
          debate you.
        </Notice>
      );
    }
    return null;
  })();

  return (
    <PeerAvailabilityBookingModal
      open={open}
      userId={person?.user_id ?? ''}
      peerName={name}
      onClose={onClose}
    >
      {notice}
    </PeerAvailabilityBookingModal>
  );
}

function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
      {action}
    </div>
  );
}
