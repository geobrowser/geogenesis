/**
 * Test-run setup: refuse network by default.
 *
 * GEO-2645. `vite.config.js` points every endpoint at `https://test.example.com`, so a test that
 * reaches the network doesn't get an error — it gets a *slow* DNS failure. Whatever catch handler
 * sits on that call then logs seconds later, by which time the test has finished. If that log is
 * still in flight when its worker closes its RPC, the whole run dies with
 * `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending` — every assertion
 * passing, exit code 1.
 *
 * It is a coin flip per run, it hit twice in one day, and it blames whichever file happened to be
 * running rather than the file that made the call — so it reliably sends whoever is debugging into
 * the wrong place, and it points at the file with the most tests because that file runs longest.
 *
 * Rejecting immediately is what fixes it. The failure lands inside the test's own lifetime, so any
 * resulting log flushes while the worker is still up. Tests that want network still stub `fetch`
 * themselves and are unaffected.
 *
 * Rejecting immediately turned out not to be enough on its own. The graphql client classifies any
 * status-less failure as a transport error, every transport category is retryable, and so it put
 * this rejection on the exponential schedule and logged `Exhausted retries` about 1.5s later —
 * back outside the test's lifetime, and the same teardown crash returned. The error therefore
 * carries `TEST_UNMOCKED_NETWORK_CODE`, which `classifyTransportFailure` maps to a category that
 * `isRetryableCategory` excludes. It fails once, immediately, and stays inside the test.
 *
 * Deliberately *not* silencing those logs: they are how a genuinely unmocked call gets noticed. The
 * error names the URL so the fix is obvious.
 *
 * Assigned directly rather than through `vi.stubGlobal`, so a test that stubs `fetch` and then
 * calls `vi.unstubAllGlobals()` is restored to this guard rather than to real network access.
 *
 * Note `setupTests.ts` in this directory is currently referenced by nothing — it is not wired into
 * the vitest config and none of it runs. Left alone here on purpose: adopting it would switch on
 * global cleanup, a `next/router` mock and two DOM polyfills all at once, which is a separate
 * change with its own blast radius.
 */
import { TEST_UNMOCKED_NETWORK_CODE } from './core/io/errors/retry-utils';

const refuseNetwork: typeof fetch = async input => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url ?? '<unknown>';

  const error = new Error(
    `Unmocked network request in a test: ${url}\n` +
      'Tests must not reach the network. Stub it for this test, e.g.\n' +
      "  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));"
  );

  // Read by `classifyTransportFailure` so the graphql client does not retry this.
  (error as Error & { code: string }).code = TEST_UNMOCKED_NETWORK_CODE;

  throw error;
};

globalThis.fetch = refuseNetwork;
