/**
 * How this document was loaded (`navigate`, `reload`, `back_forward`, `prerender`), or `unknown`
 * where the Navigation Timing API is missing.
 */
export function currentNavigationType(): NavigationTimingType | 'unknown' {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return 'unknown';
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type ?? 'unknown';
}
