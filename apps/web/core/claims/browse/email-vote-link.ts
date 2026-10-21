/**
 * A claim link from one of our emails that carries the side the reader picked in the email
 * (GEO-3374):
 *
 *     /space/<space>/<claim>?side=agree&ref_email=welcome
 *
 * The claim page casts that side once, in the browser, for whoever is signed in there — never the
 * server when the link is fetched. A mail scanner that fetches the URL gets a page that paints only
 * after hydration behind the Privy provider, and one that runs it is not signed in to Geo, so at most
 * it leaves an uncounted device vote in its own throwaway browser.
 *
 * `side` is the trigger and is cleared once acted on, as every deep link's trigger is
 * (`modal-deep-link`). `ref_email` is attribution, which every link in our emails carries, and is
 * left in the URL for whatever else reads the landing.
 */
export const EMAIL_VOTE_SIDE_PARAM = 'side';
export const REF_EMAIL_PARAM = 'ref_email';

export type EmailVoteLink = {
  /** True for `agree`, false for `disagree`. */
  position: boolean;
  /** Which email it came from, when the value is a plain slug; anything else is dropped. */
  refEmail: string | null;
};

type ReadableParams = Pick<URLSearchParams, 'get' | 'toString'> | null | undefined;

/**
 * A slug, never free text. It ends up on analytics events, and the action context's allowlist exists
 * so that text and email addresses can't get there by way of a URL somebody pasted.
 */
const REF_EMAIL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function readRefEmail(params: ReadableParams): string | null {
  const value = params?.get(REF_EMAIL_PARAM)?.trim();
  return value && REF_EMAIL_PATTERN.test(value) ? value : null;
}

/** The side a link asks for, or null when it asks for none (or one the page doesn't know). */
export function readEmailVoteLink(params: ReadableParams): EmailVoteLink | null {
  const side = params?.get(EMAIL_VOTE_SIDE_PARAM)?.trim().toLowerCase();
  if (side !== 'agree' && side !== 'disagree') return null;
  return { position: side === 'agree', refEmail: readRefEmail(params) };
}

/** The same URL without the trigger, every other param and the fragment kept. */
export function urlWithoutEmailVote(pathname: string, params: ReadableParams, hash = ''): string {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(EMAIL_VOTE_SIDE_PARAM);
  const search = next.toString();
  const fragment = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  return `${pathname}${search ? `?${search}` : ''}${fragment}`;
}

/**
 * Claims this browser has already answered a vote link for. Clearing the trigger stops a reload; this
 * stops the same email being opened again from casting a second time — after the reader undid the
 * vote, or before the first one has indexed and the page can see it.
 */
const HANDLED_STORAGE_KEY = 'geo:email-vote-links:v1';
const HANDLED_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const HANDLED_CAP = 200;

const handledKey = (claimId: string, spaceId: string) => `${spaceId}:${claimId}`;

function readHandled(now = Date.now()): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HANDLED_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && now - entry[1] < HANDLED_TTL_MS
      )
    );
  } catch {
    return {};
  }
}

export function wasEmailVoteLinkHandled(claimId: string, spaceId: string): boolean {
  return readHandled()[handledKey(claimId, spaceId)] !== undefined;
}

export function markEmailVoteLinkHandled(claimId: string, spaceId: string, now = Date.now()) {
  const entries = Object.entries({ ...readHandled(now), [handledKey(claimId, spaceId)]: now })
    .sort((a, b) => a[1] - b[1])
    .slice(-HANDLED_CAP);
  try {
    window.localStorage.setItem(HANDLED_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage blocked: the cleared trigger still stops a reload; a second open may cast again.
  }
}
