import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Next only inlines `NEXT_PUBLIC_*` variables into the browser bundle. Reading any other
 * `process.env` value from a file that runs client-side yields `undefined` at runtime — silently,
 * with no build warning and nothing rendering differently.
 *
 * That is not hypothetical here. `instrumentation-client.ts` set
 * `release: process.env.VERCEL_GIT_COMMIT_SHA`, which is server-only, so every browser event was
 * reported with no release. Sentry then had nothing to match the uploaded source maps against, so
 * every client-side stack stayed minified — measured at 5,809 of 6,251 error events over 7 days
 * carrying `release: null`, while server events (where the variable does exist) resolved fine.
 * The largest client crash groups had been unactionable for months as a direct result.
 *
 * A unit test can't observe Next's build-time inlining, so this asserts the property that
 * actually matters and is checkable: the file reads nothing from `process.env` that the browser
 * won't receive.
 */
const CLIENT_ENTRYPOINT = path.join(__dirname, 'instrumentation-client.ts');

/**
 * `NODE_ENV` is inlined by Next itself regardless of prefix, so it is genuinely available in the
 * browser. Anything else must carry the prefix.
 */
const ALWAYS_INLINED = new Set(['NODE_ENV']);

describe('instrumentation-client env reads', () => {
  const source = fs.readFileSync(CLIENT_ENTRYPOINT, 'utf8');

  // Strip comments first: the explanation above this fix names `VERCEL_GIT_COMMIT_SHA`, and a
  // scan that counted prose would fail on the very comment describing the bug.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('reads only variables the browser bundle actually receives', () => {
    const reads = [...code.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1]);
    const unavailable = reads.filter(name => !name.startsWith('NEXT_PUBLIC_') && !ALWAYS_INLINED.has(name));

    expect(unavailable).toEqual([]);
  });

  it('still sets a release, so source maps have something to match', () => {
    expect(code).toContain('release: process.env.NEXT_PUBLIC_SENTRY_RELEASE');
  });
});
