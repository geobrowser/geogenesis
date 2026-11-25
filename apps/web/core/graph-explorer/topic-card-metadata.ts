import type { Metadata } from 'next';

import { topicCardHref } from './href';

/** The request's origin, so a preview deployment unfurls its own card rather than production's. */
export function originOfHost(host: string | null): string | null {
  if (!host) return null;
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}

/**
 * A Topic page's link preview: the topic card as og:image and the large X card. Absolute when the
 * origin is known; otherwise relative, resolved against `metadataBase`.
 */
export function topicCardMetadata({
  topicId,
  spaceId,
  title,
  description,
  origin,
}: {
  topicId: string;
  spaceId: string;
  title: string;
  description?: string;
  origin?: string | null;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const path = topicCardHref({ topicId, spaceId });
  const card = origin ? new URL(path, origin).toString() : path;
  return {
    openGraph: {
      type: 'website',
      siteName: 'Geo',
      title,
      description,
      images: [{ url: card, width: 1200, height: 630, type: 'image/jpeg', alt: `${title} on Geo` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@geobrowser',
      creator: '@geobrowser',
      title,
      description,
      images: [card],
    },
  };
}
