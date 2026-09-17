import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The limiters build a Redis client at import; mocked so the suite neither needs Upstash nor waits
// out its retries, and so the unavailable case below can be provoked on demand.
const emailLimitMock = vi.fn<(identifier: string) => Promise<{ success: boolean }>>();
const ipLimitMock = vi.fn<(identifier: string) => Promise<{ success: boolean }>>();
const limitersConfigured = vi.hoisted(() => ({ value: true }));
vi.mock('../rate-limit', () => ({
  get emailLimit() {
    return limitersConfigured.value ? { limit: (id: string) => emailLimitMock(id) } : null;
  },
  get ipLimit() {
    return limitersConfigured.value ? { limit: (id: string) => ipLimitMock(id) } : null;
  },
  get hasUpstashEnv() {
    return limitersConfigured.value;
  },
}));

const { POST } = await import('./route');

const fetchMock = vi.fn();

function subscribe(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('https://geobrowser.io/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const resultOf = async (response: Response) => ((await response.json()) as { result: string }).result;

beforeEach(() => {
  emailLimitMock.mockReset().mockResolvedValue({ success: true });
  ipLimitMock.mockReset().mockResolvedValue({ success: true });
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 201 });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('MAILERLITE_API_KEY', 'test-key');
  limitersConfigured.value = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/newsletter/subscribe', () => {
  it('sends the address to MailerLite with the key in the header and nothing in the URL', async () => {
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('subscribed');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://connect.mailerlite.com/api/subscribers');
    // The credential belongs in the header. In a query string it would be written into access logs
    // and proxy caches on the way.
    expect(String(url)).not.toContain('test-key');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'reader@example.com' });
  });

  it('lowercases and trims before sending, so one address is one subscriber', async () => {
    await subscribe({ email: '  Reader@Example.COM  ' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ email: 'reader@example.com' });
  });

  // 201 is new, 200 is an address MailerLite already had. Telling those apart in the response would
  // turn this into an oracle for whether any given address is on someone's list.
  it('answers the same for an address already on the list as for a new one', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('subscribed');
  });

  it('rejects a malformed address without spending a request on the provider', async () => {
    for (const email of ['', 'not-an-email', 'missing@domain', 'a@b.c'.repeat(200)]) {
      const response = await subscribe({ email });
      expect(await resultOf(response)).toBe('invalid-email');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an object with a string email', async () => {
    expect(await resultOf(await subscribe('not json at all'))).toBe('invalid-email');
    expect(await resultOf(await subscribe({ email: 42 }))).toBe('invalid-email');
    expect(await resultOf(await subscribe({}))).toBe('invalid-email');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buckets the rate limit by the normalized address, not the raw one', async () => {
    await subscribe({ email: '  Reader@Example.COM ' });
    expect(emailLimitMock).toHaveBeenCalledWith('reader@example.com');
  });

  it('buckets the ip limit by the forwarded client address', async () => {
    await subscribe({ email: 'reader@example.com' }, { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' });
    expect(ipLimitMock).toHaveBeenCalledWith('203.0.113.7');
  });

  it('turns either limit away before reaching the provider', async () => {
    emailLimitMock.mockResolvedValue({ success: false });
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('rate-limited');

    emailLimitMock.mockResolvedValue({ success: true });
    ipLimitMock.mockResolvedValue({ success: false });
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('rate-limited');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The case that has no coverage anywhere else: `Redis.fromEnv()` returns a client whether or not
  // Upstash is configured and only rejects once a command runs. Unhandled, this endpoint would run
  // with no limit at all -- an anonymous write into someone else's mailing list.
  it('fails closed when the rate limiter itself is unavailable', async () => {
    ipLimitMock.mockRejectedValue(new Error('upstash unreachable'));

    const response = await subscribe({ email: 'reader@example.com' });

    expect(response.status).toBe(503);
    expect(await resultOf(response)).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Not configured is a different fact from not reachable, and they want opposite answers. A
  // developer who has never held Upstash credentials is not a threat model; refusing there only
  // means the feature cannot be tried locally at all.
  it('still subscribes in development when Upstash was never configured', async () => {
    limitersConfigured.value = false;
    vi.stubEnv('NODE_ENV', 'development');

    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('subscribed');
    expect(fetchMock).toHaveBeenCalled();
  });

  // The other half, and the one that must not regress: a deploy missing its credentials would
  // otherwise become a silently unlimited public relay into someone else's mailing list.
  it('refuses in production when Upstash was never configured, rather than running unlimited', async () => {
    limitersConfigured.value = false;
    vi.stubEnv('NODE_ENV', 'production');

    const response = await subscribe({ email: 'reader@example.com' });

    expect(response.status).toBe(503);
    expect(await resultOf(response)).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a plain failure when the key is not configured, without naming it', async () => {
    vi.stubEnv('MAILERLITE_API_KEY', '');

    const response = await subscribe({ email: 'reader@example.com' });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body).result).toBe('failed');
    // The visitor is told the form did not work, not which of our variables is unset.
    expect(body).not.toContain('MAILERLITE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the provider verdict through for an address it rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('invalid-email');
  });

  // Their ceiling, not this reader's. Reported as `rate-limited` the popup says "too many tries
  // from here", blaming someone who did nothing and inviting them to wait out a limit that will
  // not clear because they stopped. Only the local limiters can truthfully say that.
  it('does not blame the reader for the provider throttling our account', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    const response = await subscribe({ email: 'reader@example.com' });

    expect(await resultOf(response)).toBe('failed');
    expect(response.status).toBe(502);
  });

  // A connection the provider accepts and then stops answering. Unbounded, nothing returns: the
  // invocation is held until the platform kills it and the caller never gets one of these answers.
  it('bounds the provider request rather than hanging on it', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: { signal?: AbortSignal }) => {
      // Captured, not asserted here: an assertion that throws inside the mock is caught by the
      // route's own error handling and answered as a plain failure, so the test would pass with
      // the bound removed. That is precisely the bug it is meant to catch.
      signal = init.signal;
      // What `AbortSignal.timeout` produces once it expires.
      return Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    });

    const response = await subscribe({ email: 'reader@example.com' });

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(await resultOf(response)).toBe('failed');
    expect(response.status).toBe(502);
  });

  it('survives the provider being down or unreachable', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await resultOf(await subscribe({ email: 'reader@example.com' }))).toBe('failed');

    fetchMock.mockRejectedValue(new Error('network down'));
    const response = await subscribe({ email: 'reader@example.com' });
    expect(response.status).toBe(502);
    expect(await resultOf(response)).toBe('failed');
  });
});
