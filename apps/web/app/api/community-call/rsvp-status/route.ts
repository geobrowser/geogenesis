import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { resolveMemberSpaceFromWallet } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';

/**
 * Whether the signed-in user has RSVP'd to any community call.
 *
 * Reads through curator-backend rather than hitting Rendezvous directly: the
 * backend is the only writer of `personId` (it stores `profile.spaceId` verbatim
 * when sending the invite), and Rendezvous matches `personId` as an exact string
 * with no normalization. Going through the backend's `/community-call/subscriptions/:personId`
 * means the same id normalization applies on read as on write, so the two can't
 * drift apart.
 *
 * The person is derived server-side from the wallet cookie — the endpoint is open
 * and lets anyone read anyone's RSVP history by id, so we never accept a
 * client-supplied personId.
 */

type Subscription = {
  rsvpStatus: string | null;
  occurrenceRsvps?: { rsvpStatus: string | null }[];
};

// An invite is only recorded once it has been sent, so any subscription the user
// hasn't actively declined counts as an RSVP — including the `pending` state a
// fresh invite starts in. Waiting for `accepted` would mean the step never
// completes for users who don't accept the .ics in their mail client.
const isDeclined = (status: string | null) => status === 'declined';

function hasRsvp(subscriptions: Subscription[]): boolean {
  return subscriptions.some(
    sub => !isDeclined(sub.rsvpStatus) || (sub.occurrenceRsvps ?? []).some(o => !isDeclined(o.rsvpStatus))
  );
}

export async function GET() {
  const base = process.env.CURATOR_BACKEND_URL;
  if (!base) {
    // The onboarding step reads as incomplete rather than failing the checklist.
    return NextResponse.json({ hasRsvp: false, configured: false });
  }

  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  if (!cookieWallet) {
    return NextResponse.json({ hasRsvp: false, configured: true });
  }

  try {
    const personId = await resolveMemberSpaceFromWallet(cookieWallet);
    if (!personId) {
      return NextResponse.json({ hasRsvp: false, configured: true });
    }

    const res = await fetch(`${base.replace(/\/$/, '')}/community-call/subscriptions/${encodeURIComponent(personId)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return new NextResponse('rsvp lookup failed', { status: 502 });
    }

    const { subscriptions }: { subscriptions: Subscription[] } = await res.json();
    return NextResponse.json({ hasRsvp: hasRsvp(subscriptions ?? []), configured: true });
  } catch {
    return new NextResponse('rsvp lookup failed', { status: 502 });
  }
}
