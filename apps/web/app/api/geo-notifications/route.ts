import { Either, Schema } from 'effect';
import { NextResponse } from 'next/server';

import { addPendingVote, markNotificationSeen, removePendingVote } from '~/core/notifications/pending-votes-store';
import { verifyGeoSignature } from '~/core/notifications/verify-signature';
import {
  RedDotWebhookPayloadSchema,
  type RedDotWebhookPayload,
} from '~/core/notifications/webhook-payload-schema';

/**
 * Webhook receiver for the gaia notification-service.
 *
 * Registration: gaia's `app_webhooks` table holds the URL + shared secret.
 * The service fans out one POST per (editor, event); we update a per-user
 * pending-vote set in Redis that the sidebar reads via /api/pending-votes.
 *
 * Responses:
 *  - 200: accepted (including unhandled event types, which we intentionally
 *    drop so the delivery worker doesn't retry)
 *  - 401: missing or bad signature
 *  - 500: misconfigured secret (never reached in prod if env is set)
 */
export async function POST(request: Request) {
  const secret = process.env.GEO_NOTIFICATIONS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[geo-notifications] GEO_NOTIFICATIONS_WEBHOOK_SECRET not set');
    return new NextResponse('webhook secret not configured', { status: 500 });
  }

  // Read the raw body once — HMAC must verify the exact bytes sent, not a re-serialized JSON.
  const rawBody = await request.text();

  const valid = verifyGeoSignature({
    rawBody,
    signatureHeader: request.headers.get('X-Geo-Signature'),
    secret,
  });
  if (!valid) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Signature was valid but body isn't JSON. 2xx so it doesn't get retried; log and move on.
    console.error('[geo-notifications] signed body was not valid JSON');
    return NextResponse.json({ ok: true });
  }

  const decoded = Schema.decodeUnknownEither(RedDotWebhookPayloadSchema)(parsed);
  if (Either.isLeft(decoded)) {
    // Unhandled event_type (bounty_*, proposal_updated, proposal_settings_updated, etc.) —
    // acknowledge so the service stops retrying.
    return NextResponse.json({ ok: true });
  }

  const payload = decoded.right;
  const firstTime = await markNotificationSeen(payload.idempotency_key);
  if (!firstTime) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await handleEvent(payload);
  } catch (error) {
    // Redis transient failure: return 5xx so the delivery worker retries per its schedule.
    console.error('[geo-notifications] failed to update pending-vote cache', error);
    return new NextResponse('transient cache error', { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(payload: RedDotWebhookPayload) {
  switch (payload.event_type) {
    case 'proposal_created':
      await addPendingVote(payload.user_space_id, payload.proposal_id);
      return;

    case 'proposal_voted':
      // The service fans out proposal_voted to every editor in the space. For the red
      // dot we only care when the recipient *is* the voter — then this user's pending
      // item clears. All other recipients' pending state is unchanged by this vote.
      if (payload.voter_id && payload.voter_id === payload.user_space_id) {
        await removePendingVote(payload.user_space_id, payload.proposal_id);
      }
      return;

    case 'proposal_executed':
    case 'proposal_rejected':
      // Proposal is closed → nobody needs to vote on it anymore.
      await removePendingVote(payload.user_space_id, payload.proposal_id);
      return;
  }
}
