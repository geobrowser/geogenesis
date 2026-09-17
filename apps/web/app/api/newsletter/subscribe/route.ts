import { NextResponse } from 'next/server';

import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { groupIdForSource } from '~/core/newsletter/subscribe-source';
import { timeoutSignal } from '~/core/timeout-signal';

import { getClientIp } from '../../client-ip';
import { emailLimit, ipLimit } from '../rate-limit';

/**
 * Adds an address to the MailerLite list (GEO-2925).
 *
 * This route exists so the credential does not. `MAILERLITE_API_KEY` is read here and nowhere else,
 * and it is deliberately *not* a `NEXT_PUBLIC_` variable: anything with that prefix is inlined into
 * the bundle and readable by every visitor. The form this serves runs for anonymous readers on a
 * public page, which is the most exposed thing in the app, so the key never leaves the server and
 * the browser only ever sees the answer.
 *
 * MailerLite's own embed form would avoid holding a key at all, and is worth knowing about as an
 * alternative — but it posts to their domain from the visitor's browser, which means their markup,
 * their styling constraints, and a cross-origin request we cannot see the result of. A proxy keeps
 * the form ours and the failure modes legible.
 */
const MAILERLITE_SUBSCRIBERS_URL = 'https://connect.mailerlite.com/api/subscribers';

/**
 * A connection MailerLite accepts and then stops answering is the failure this guards. Without a
 * bound, nothing here ever returns: the invocation is held until the platform kills it, and the
 * caller is left in `submitting` with no answer at all -- the one outcome this route's controlled
 * JSON failures exist to avoid. Eight seconds is far longer than the API's normal reply and well
 * inside any serverless ceiling, so expiry means genuinely stuck rather than merely slow.
 */
const MAILERLITE_TIMEOUT_MS = 8_000;

/**
 * The rate-limit bucket for an address, as a SHA-256 digest rather than the address itself.
 *
 * The limiter's identifier becomes part of a Redis key, and with `analytics: true` Upstash keeps
 * its own records keyed by it too — so passing the address straight through would copy every
 * subscriber's email into a second system that has no business holding one. Nothing ever needs to
 * read it back: a bucket only has to be the same for the same address and different for different
 * ones, which a digest is.
 *
 * Not claimed to be irreversible. Addresses are guessable, so anyone with the Redis contents could
 * test whether a *particular* address subscribed. What it does stop is the wholesale copy — the
 * list cannot be read off the keys, which is the difference that matters when the store is not
 * the one we chose to put this data in.
 *
 * The IP bucket below is deliberately left as-is. It is equally personal, but unlike the address it
 * is the thing you need to read when working out who is hammering the endpoint, and `app/api/chat`
 * keys on it the same way. Hiding it would cost the abuse visibility the ceiling exists for.
 */
async function emailBucketKey(normalizedEmail: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedEmail));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function answer(result: NewsletterSubscribeResult, status: number) {
  return NextResponse.json({ result }, { status });
}

export async function POST(request: Request) {
  let email: unknown;
  let source: unknown;
  try {
    ({ email, source } = (await request.json()) as { email?: unknown; source?: unknown });
  } catch {
    return answer('invalid-email', 400);
  }

  if (typeof email !== 'string' || !isLikelyEmail(email)) {
    return answer('invalid-email', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  // Resolved against a closed map, so the request cannot name an arbitrary group. An unrecognised
  // source is dropped rather than rejected -- see `subscribe-source.ts`.
  const groupId = groupIdForSource(source);

  try {
    const [perEmail, perIp] = await Promise.all([
      emailLimit.limit(await emailBucketKey(normalizedEmail)),
      ipLimit.limit(getClientIp(request)),
    ]);

    if (!perEmail.success || !perIp.success) {
      return answer('rate-limited', 429);
    }
  } catch (error) {
    // Whether the limiter is usable is answered by calling it, not by guessing from variable names
    // -- which is what the previous version got wrong, refusing every request on a deploy where
    // Upstash was configured under the `KV_REST_API_*` names that `Redis.fromEnv()` also accepts.
    //
    // In production any failure here is refused, whether the credentials are missing or Redis is
    // briefly unreachable. This endpoint writes into someone else's mailing list for anonymous
    // callers, so an unlimited version of it is not a thing to serve while we work out which.
    if (process.env.NODE_ENV === 'production') {
      console.error('newsletter subscribe: rate limiter unavailable; failing closed', error);
      return answer('failed', 503);
    }

    // Locally there is usually no Redis at all, and refusing there only means the feature cannot
    // be tried. A developer without Upstash credentials is not the threat model.
    console.warn('newsletter subscribe: rate limiting unavailable; continuing without it (development only)', error);
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    // Logged rather than thrown, and reported as a plain failure. An unset credential is our
    // problem and the visitor can do nothing about it; telling them the form is broken is honest,
    // and telling them *why* would describe our deployment to anyone who asks.
    console.error('newsletter subscribe: MAILERLITE_API_KEY is not set');
    return answer('failed', 500);
  }

  try {
    const response = await fetch(MAILERLITE_SUBSCRIBERS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      // `groups` is omitted rather than sent empty when the source is unknown: an empty array is a
      // membership list on an upsert, so it would strip the groups an existing subscriber is
      // already in -- someone who signed up through another surface would lose that record.
      body: JSON.stringify(groupId ? { email: normalizedEmail, groups: [groupId] } : { email: normalizedEmail }),
      signal: timeoutSignal(MAILERLITE_TIMEOUT_MS),
    });

    // 201 is a new subscriber and 200 is one MailerLite already had. Both are "you are on the list"
    // to the person who typed it, and distinguishing them would only tell a stranger whether an
    // address is already subscribed — which is not ours to disclose.
    if (response.ok) return answer('subscribed', 200);

    if (response.status === 422) return answer('invalid-email', 400);

    // A 429 from MailerLite is *our* account hitting *their* ceiling, which the person typing had
    // no part in. Passing it through as `rate-limited` would tell them "too many tries from here"
    // and invite them to wait out a limit that is not theirs and will not clear because they
    // stopped. The local limiters above are the only thing that can truthfully say that; from here
    // down it is our outage to report.
    console.error(`newsletter subscribe: MailerLite responded ${response.status}`);
    return answer('failed', 502);
  } catch (error) {
    // The timeout rejects with a TimeoutError, which lands here alongside DNS and
    // connection failures. All of them are the same thing to the reader: it did not work, try later.
    console.error('newsletter subscribe: request to MailerLite failed', error);
    return answer('failed', 502);
  }
}
