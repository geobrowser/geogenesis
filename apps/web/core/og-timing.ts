// Lightweight timing for the ranking OG / social-share paths.
//
// Measurement is ALWAYS on (the overhead is a few performance.now() calls), so the
// Server-Timing response header works everywhere — including production-build Vercel
// preview deploys — without needing any env vars. Only the noisy console logging is
// gated: it's emitted in dev or when OG_TIMING=1, and stays silent in production.
//
// Usage:
//   const timer = startOgTimer('preview-route');
//   const data = await timer.span('data', () => getRankingOgCardData(input));
//   ...
//   const { serverTiming } = timer.done();           // returns the Server-Timing value
//   headers.set('Server-Timing', serverTiming);      // visible in devtools / curl -D

// Console logging only — measurement/Server-Timing is unconditional.
const LOG_ENABLED = process.env.OG_TIMING === '1' || process.env.NODE_ENV !== 'production';

export type OgTimer = {
  /** Record a sub-duration starting from the previous mark/span. */
  mark: (label: string) => void;
  /** Time an async step and record it as a labeled span. Returns the wrapped value. */
  span: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  /** Return the Server-Timing header value; also logs one [og-timing] line when enabled. */
  done: (label?: string) => { totalMs: number; serverTiming: string };
};

function sanitize(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function startOgTimer(name: string): OgTimer {
  const start = performance.now();
  let last = start;
  const spans: Array<[string, number]> = [];

  return {
    mark(label) {
      const now = performance.now();
      spans.push([label, now - last]);
      last = now;
    },
    async span(label, fn) {
      const begin = performance.now();
      try {
        return await fn();
      } finally {
        const dur = performance.now() - begin;
        spans.push([label, dur]);
        last = performance.now();
      }
    },
    done(label) {
      const totalMs = performance.now() - start;
      if (LOG_ENABLED) {
        const breakdown = spans.map(([l, d]) => `${l}=${d.toFixed(0)}ms`).join(' ');
        // eslint-disable-next-line no-console
        console.log(`[og-timing] ${label ?? name} total=${totalMs.toFixed(0)}ms ${breakdown}`.trimEnd());
      }
      const serverTiming = [
        ...spans.map(([l, d]) => `${sanitize(l)};dur=${d.toFixed(1)}`),
        `total;dur=${totalMs.toFixed(1)}`,
      ].join(', ');
      return { totalMs, serverTiming };
    },
  };
}
