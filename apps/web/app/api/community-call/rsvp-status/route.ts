import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { resolveMemberSpaceFromWallet } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';

/**
 * Proxies the Rendezvous RSVP read API (curator-app calendar-invite service).
 * The person is derived server-side from the wallet cookie — the open
 * Rendezvous service lets anyone read anyone's RSVP history by id, so we
 * never accept a client-supplied personId.
 */

// Rendezvous stores personId in dashed UUID form (IdUtils.normalizeUuid);
// Geo space ids circulate as dashless 32-char hex.
function toDashedUuid(id: string): string | null {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type RendezvousSubscription = {
  callId: string;
  rsvpStatus: string | null;
  occurrenceRsvps?: { recurrenceId: string; rsvpStatus: string | null }[];
};

function hasAcceptedRsvp(subscriptions: RendezvousSubscription[]): boolean {
  return subscriptions.some(
    sub => sub.rsvpStatus === 'accepted' || sub.occurrenceRsvps?.some(o => o.rsvpStatus === 'accepted')
  );
}

export async function GET() {
  const rendezvousUrl = process.env.RENDEZVOUS_URL;
  if (!rendezvousUrl) {
    // Not configured in this environment (prod URL still TBD) — the
    // onboarding step reads as incomplete rather than failing the checklist.
    return NextResponse.json({ hasAccepted: false, configured: false });
  }

  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  if (!cookieWallet) {
    return NextResponse.json({ hasAccepted: false, configured: true });
  }

  try {
    const memberSpaceId = await resolveMemberSpaceFromWallet(cookieWallet);
    const personId = memberSpaceId ? toDashedUuid(memberSpaceId) : null;
    if (!personId) {
      return NextResponse.json({ hasAccepted: false, configured: true });
    }

    const res = await fetch(`${rendezvousUrl}/invites/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
    });
    if (!res.ok) {
      return new NextResponse('rsvp lookup failed', { status: 502 });
    }

    const { subscriptions }: { subscriptions: RendezvousSubscription[] } = await res.json();
    return NextResponse.json({ hasAccepted: hasAcceptedRsvp(subscriptions ?? []), configured: true });
  } catch {
    return new NextResponse('rsvp lookup failed', { status: 502 });
  }
}
