import { describe, expect, it } from 'vitest';

import { emailLimit, ipLimit } from './rate-limit';

// The bug this file shipped with, and the reason it is pinned rather than trusted: the limiters
// used to be built only when `UPSTASH_REDIS_REST_URL`/`TOKEN` were set, which reads as "not
// configured" on a deploy carrying Vercel's `KV_REST_API_*` pair instead. `Redis.fromEnv()` accepts
// both, so chat's limiters worked on the very deployment where these refused every request.
//
// Nothing here may depend on which pair is present: the client resolves its own configuration, and
// whether a limiter works is answered by calling it.
describe('newsletter rate limiters', () => {
  it('exist regardless of which Upstash variable naming the environment uses', () => {
    // Neither pair is set in this process, which is exactly the case that used to produce `null`.
    expect(process.env.UPSTASH_REDIS_REST_URL).toBeFalsy();
    expect(process.env.KV_REST_API_URL).toBeFalsy();

    expect(emailLimit).toBeTruthy();
    expect(ipLimit).toBeTruthy();
    expect(typeof emailLimit.limit).toBe('function');
    expect(typeof ipLimit.limit).toBe('function');
  });
});
