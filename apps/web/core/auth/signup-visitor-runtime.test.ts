import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'geo-analytics-manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(publicDir, `geo-analytics-${manifest.shortHash}.js`), 'utf8');

describe('signup visitor collector payload', () => {
  it.each([true, false])('ships both join keys with the account (starting snapshot: %s)', async hasStart => {
    vi.resetModules();
    const dom = new JSDOM('<!doctype html><body></body>', {
      url: 'https://www.geobrowser.io/explore',
      runScripts: 'outside-only',
    });
    const browser = dom.window as Window;
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    browser.fetch = fetch as unknown as typeof window.fetch;
    browser.lyticsConfig = {
      app: 'genesis',
      amplitudeApiKey: false,
      posthogToken: false,
      xPixelId: false,
      collectorUrl: 'https://collector.example',
      collectorBatchSize: 1,
      collectorFlushIntervalMs: false,
      autoPageViews: false,
      autoRouteTracking: false,
      autoClickTracking: false,
      autoScrollTracking: false,
    };
    try {
      dom.window.eval(source);
      vi.stubGlobal('window', browser);
      vi.stubGlobal('document', dom.window.document);
      const auth = await import('../privy-auth-events');
      const before = browser.lytics!.getContext!();
      browser.lytics!.pageViewed!();
      if (hasStart) auth.beginPrivyAuth();
      auth.completePrivyAuth({
        user: { id: 'did:privy:new-account' },
        isNewUser: true,
        wasAlreadyAuthenticated: false,
        loginMethod: 'email',
        loginAccount: { type: 'email' },
      });
      const records = () =>
        fetch.mock.calls.flatMap(call => {
          const body = JSON.parse((call as unknown as [string, { body: string }])[1].body);
          return body.resourceLogs?.flatMap((r: any) => r.scopeLogs.flatMap((s: any) => s.logRecords)) ?? [];
        });
      await vi.waitFor(() => expect(records().some(r => r.body.stringValue === 'signed_up')).toBe(true));
      const attributes = (name: string) =>
        Object.fromEntries(
          records()
            .find(r => r.body.stringValue === name)
            .attributes.map((a: any) => [a.key, a.value.stringValue])
        );
      const signup = attributes('signed_up');
      const page = attributes('page_viewed');
      expect(signup).toMatchObject({
        privy_user_id: 'did:privy:new-account',
        user_id: 'did:privy:new-account',
        signup_anonymous_id: before.anonymous_id,
        signup_session_id: before.session_id,
        signup_context_source: hasStart ? 'auth_start' : 'completion',
      });
      expect(signup.signup_anonymous_id).toBe(page.anonymous_id);
      expect(signup.signup_session_id).toBe(page.session_id);
      expect(records().some(r => r.body.stringValue === 'identity_linked')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });
});
