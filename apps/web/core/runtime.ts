// Set different page configurations based on whether we are in dev or prod.
//
// Next will not cache or prefetch at the fetch level when using functions that
// opt-out of dynamic page caching, such as `cookies()` and `headers()`. We only
// use cookies in pages in dev mode, so in prod we can force cache and prefetch
// at the fetch level.
export const serverRuntime = {
  runtime: 'edge' as const,
  fetchCache: process.env.NODE_ENV === 'development' ? ('auto' as const) : ('force-cache' as const),
};
