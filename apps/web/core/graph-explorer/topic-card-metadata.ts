import type { Metadata } from 'next';

import { topicCardHref } from './href';

/** A Topic page's link preview: the topic card as og:image and the large X card. */
export function topicCardMetadata({
  topicId,
  spaceId,
  title,
  description,
}: {
  topicId: string;
  spaceId: string;
  title: string;
  description?: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const card = topicCardHref({ topicId, spaceId });
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
