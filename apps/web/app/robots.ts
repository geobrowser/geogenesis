import type { MetadataRoute } from 'next';

/**
 * There was no robots.txt at all — the URL returned 404 — so crawlers had no
 * guidance on a site whose `/space/...` space is effectively unbounded.
 *
 * The rules stay permissive for real content: space and entity pages are the
 * public knowledge graph and should be indexed. What is disallowed is the set of
 * paths that cost a full uncached server render while having nothing worth
 * indexing, which is what the crawl budget was being spent on.
 *
 * This is a mitigation, not the fix. The fix is `middleware.ts` returning a real
 * 404 for malformed URLs — robots.txt is advisory and the well-behaved crawlers
 * that honour it were never the whole problem.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Server-rendered API surface: no indexable content, and some of it is
        // expensive (dynamic OG image generation, chat, sweeps).
        '/api/',
        // Per-user and write-oriented views. They render per request, are
        // meaningless without a session, and generate unbounded URL variants.
        '/space/*/import',
        '/space/*/debug-debates',
        '/space/*/ranking-compose',
        '/space/*/power-tools',
      ],
    },
  };
}
