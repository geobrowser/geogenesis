import { uuidToHex } from '~/core/id/normalize';
import { isValidId } from '~/core/utils/space-url';

export const SHARE_METHODS = ['copy_link', 'x', 'linkedin', 'reddit', 'native_share'] as const;
export const SHARE_CONTENT_TYPES = ['debate', 'lobby', 'availability'] as const;
export type ShareMethod = (typeof SHARE_METHODS)[number];
export type ShareContentType = (typeof SHARE_CONTENT_TYPES)[number];
export type ShareAttribution = {
  share_id: string;
  share_content_type: ShareContentType;
  share_content_id: string;
  method: ShareMethod;
};
export type ShareLink = { url: string; attribution: ShareAttribution | null };

/**
 * The short code a shared link carries instead of the four campaign tags (GEO-3485), like YouTube's
 * `?si=`: one letter for the method, one for the content type, then the share UUID in base64url.
 * The content ID is the link's last path segment, so it is not repeated here.
 */
export const SHORT_SHARE_PARAM = 'si';
const METHOD_CODES: Record<ShareMethod, string> = {
  copy_link: 'c',
  x: 'x',
  linkedin: 'l',
  reddit: 'r',
  native_share: 'n',
};
const CONTENT_CODES: Record<ShareContentType, string> = { debate: 'd', lobby: 'l', availability: 'a' };
const SHORT_CODE = /^([a-z])([a-z])([A-Za-z0-9_-]{22})$/;
const CAMPAIGN_PARAMS = ['link_id', 'campaign_id', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid'];

export function shareUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !isValidId(value)) return null;
  return uuidToHex(value);
}

function withoutCampaign(destination: string | URL): URL {
  const url = new URL(destination);
  // A new share belongs to this sender, rather than to the campaign they arrived through.
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === SHORT_SHARE_PARAM || CAMPAIGN_PARAMS.includes(key))
      url.searchParams.delete(key);
  }
  return url;
}

function lastPathSegment(url: URL): string | undefined {
  return url.pathname.split('/').filter(Boolean).at(-1);
}

function hexToBase64Url(hex: string): string {
  const binary = String.fromCharCode(...(hex.match(/../g) ?? []).map(byte => parseInt(byte, 16)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToHex(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return [...binary].map(char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

/**
 * The tagged URL the warehouse reads (GEO-3267): the analytics runtime only keeps `utm_*` tags in
 * `landing_page_url`, so a short link is expanded to this form before the page loads.
 */
function taggedUrl(destination: string | URL, attribution: ShareAttribution): string {
  const url = withoutCampaign(destination);
  url.searchParams.set('utm_source', attribution.method);
  url.searchParams.set('utm_medium', 'share');
  url.searchParams.set('utm_campaign', 'geo_share');
  url.searchParams.set(
    'utm_content',
    `v1:${attribution.share_content_type}:${attribution.share_content_id}:${attribution.share_id}`
  );
  return url.toString();
}

/** Invalid target IDs still share their original destination; measurement never blocks sharing. */
export function createShareLink(
  destination: string,
  kind: ShareContentType,
  contentId: string,
  method: ShareMethod,
  shareId = crypto.randomUUID()
): ShareLink {
  const content = shareUuid(contentId);
  const id = shareUuid(shareId);
  if (!content || !id) return { url: destination, attribution: null };
  const attribution = { share_id: id, share_content_type: kind, share_content_id: content, method };
  const url = withoutCampaign(destination);
  // The short form recovers the content ID from the path; a destination that does not end in it
  // keeps the long tags rather than losing its content.
  if (shareUuid(lastPathSegment(url)) !== content) return { url: taggedUrl(destination, attribution), attribution };
  url.searchParams.set(SHORT_SHARE_PARAM, `${METHOD_CODES[method]}${CONTENT_CODES[kind]}${hexToBase64Url(id)}`);
  return { url: url.toString(), attribution };
}

function parseShortCode(url: URL): ShareAttribution | null {
  const match = SHORT_CODE.exec(url.searchParams.get(SHORT_SHARE_PARAM) ?? '');
  if (!match) return null;
  const method = SHARE_METHODS.find(m => METHOD_CODES[m] === match[1]);
  const kind = SHARE_CONTENT_TYPES.find(k => CONTENT_CODES[k] === match[2]);
  const content = shareUuid(lastPathSegment(url));
  let id: string | null = null;
  try {
    id = shareUuid(base64UrlToHex(match[3]));
  } catch {}
  if (!method || !kind || !content || !id) return null;
  return { share_id: id, share_content_type: kind, share_content_id: content, method };
}

function parseTags(params: URLSearchParams): ShareAttribution | null {
  if (params.get('utm_medium') !== 'share' || params.get('utm_campaign') !== 'geo_share') return null;
  const method = params.get('utm_source');
  const content = params.get('utm_content');
  if (!SHARE_METHODS.includes(method as ShareMethod) || !content || content.length > 100) return null;
  const [version, kind, contentId, shareId, extra] = content.split(':');
  if (version !== 'v1' || extra !== undefined || !SHARE_CONTENT_TYPES.includes(kind as ShareContentType)) return null;
  const id = shareUuid(shareId);
  const target = shareUuid(contentId);
  if (!id || !target) return null;
  return {
    share_id: id,
    share_content_type: kind as ShareContentType,
    share_content_id: target,
    method: method as ShareMethod,
  };
}

/** Reads either form of a shared link: the short code, or the long tags older links carry. */
export function parseShareLink(link: string | URL): ShareAttribution | null {
  const url = new URL(link);
  return parseShortCode(url) ?? parseTags(url.searchParams);
}

/**
 * Where a short shared link lands: the same destination with the long tags in place of the code,
 * or null when the link has no valid code (it then opens as it is).
 */
export function expandShareLink(link: string | URL): string | null {
  const url = new URL(link);
  const attribution = parseShortCode(url);
  return attribution ? taggedUrl(url, attribution) : null;
}
