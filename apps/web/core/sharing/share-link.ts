import { uuidToHex } from '~/core/id/normalize';
import { isValidId } from '~/core/utils/space-url';

export const SHARE_METHODS = ['copy_link', 'x', 'linkedin', 'reddit'] as const;
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

export function shareUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !isValidId(value)) return null;
  return uuidToHex(value);
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
  const url = new URL(destination);
  // A new share belongs to this sender, rather than to the campaign they arrived through.
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.startsWith('utm_') ||
      ['link_id', 'campaign_id', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid'].includes(key)
    )
      url.searchParams.delete(key);
  }
  url.searchParams.set('utm_source', method);
  url.searchParams.set('utm_medium', 'share');
  url.searchParams.set('utm_campaign', 'geo_share');
  url.searchParams.set('utm_content', `v1:${kind}:${content}:${id}`);
  return {
    url: url.toString(),
    attribution: { share_id: id, share_content_type: kind, share_content_id: content, method },
  };
}

export function parseShareLink(params: Pick<URLSearchParams, 'get'>): ShareAttribution | null {
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
