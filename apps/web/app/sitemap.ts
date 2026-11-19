import type { MetadataRoute } from 'next';

import { CANONICAL_SITE } from '~/core/canonical-site';

/**
 * The fixed public pages, so crawlers have a list instead of only the links they
 * happen to follow. Before this, /sitemap.xml was a 404.
 *
 * Most of these are the marketing site, which `next.config.ts` forwards to its
 * own deployment. They are listed here because crawlers ask this host for
 * /sitemap.xml, and the URLs are the ones people reach (`/www/docs`, not the
 * marketing deployment's own `/docs`).
 *
 * Space and entity pages are left out on purpose. The graph is effectively
 * unbounded, and a hand-kept list of a few would suggest the rest don't matter.
 * Crawlers reach them through /explore.
 *
 * The host is fixed rather than read from `ENV_URL`. The sitemap names canonical
 * URLs, and those must match the marketing site's canonical, which is
 * www.geobrowser.io.
 */
const SITE = CANONICAL_SITE;

const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/explore', priority: 0.8 },
  { path: '/www/downloads', priority: 0.7 },
  { path: '/www/docs', priority: 0.6 },
  { path: '/www/faq', priority: 0.6 },
  { path: '/www/help', priority: 0.4 },
  { path: '/www/privacy', priority: 0.2 },
  { path: '/terms', priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority }) => ({
    url: path === '/' ? SITE : `${SITE}${path}`,
    priority,
  }));
}
