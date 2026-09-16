import { NextResponse } from 'next/server';

import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';

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

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  // No identifiable caller is its own bucket rather than a shared one: a single missing header must
  // not let every such request spend one another's budget.
  return `noip:${crypto.randomUUID()}`;
}

function answer(result: NewsletterSubscribeResult, status: number) {
  return NextResponse.json({ result }, { status });
}

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = (await request.json()) as { email?: unknown });
  } catch {
    return answer('invalid-email', 400);
  }

  if (typeof email !== 'string' || !isLikelyEmail(email)) {
    return answer('invalid-email', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [perEmail, perIp] = await Promise.all([emailLimit.limit(normalizedEmail), ipLimit.limit(getClientIp(request))]);
  if (!perEmail.success || !perIp.success) {
    return answer('rate-limited', 429);
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
      body: JSON.stringify({ email: normalizedEmail }),
    });

    // 201 is a new subscriber and 200 is one MailerLite already had. Both are "you are on the list"
    // to the person who typed it, and distinguishing them would only tell a stranger whether an
    // address is already subscribed — which is not ours to disclose.
    if (response.ok) return answer('subscribed', 200);

    if (response.status === 422) return answer('invalid-email', 400);
    if (response.status === 429) return answer('rate-limited', 429);

    console.error(`newsletter subscribe: MailerLite responded ${response.status}`);
    return answer('failed', 502);
  } catch (error) {
    console.error('newsletter subscribe: request to MailerLite failed', error);
    return answer('failed', 502);
  }
}
