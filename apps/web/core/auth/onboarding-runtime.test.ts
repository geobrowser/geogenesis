import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'geo-analytics-manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(publicDir, `geo-analytics-${manifest.shortHash}.js`), 'utf8');

it.each([3, 0])(
  'exports the customize-feed decision and counts through the shipped runtime (%i topics)',
  async count => {
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
      const auth = await import('../auth-attempt');
      const attempt = auth.beginAuthAttempt({ component: 'navbar' });
      auth.finishAuthAttempt('signed_up', attempt);
      const outcome = count > 0 ? 'completed' : 'skipped';
      auth.trackAuthOnboarding('customize-feed', outcome, { topic_count: count, space_pick_count: 2 });
      const records = () =>
        fetch.mock.calls.flatMap(call => {
          const body = JSON.parse((call as unknown as [string, { body: string }])[1].body);
          return body.resourceLogs?.flatMap((r: any) => r.scopeLogs.flatMap((s: any) => s.logRecords)) ?? [];
        });
      await vi.waitFor(() => expect(records().some(r => r.body.stringValue === 'auth_onboarding_progress')).toBe(true));
      const record = records().find(r => r.body.stringValue === 'auth_onboarding_progress');
      const properties = Object.fromEntries(record.attributes.map((a: any) => [a.key, Object.values(a.value)[0]]));
      expect(properties).toMatchObject({
        auth_attempt_id: attempt.id,
        onboarding_step: 'customize-feed',
        outcome,
        topic_count: String(count),
        space_pick_count: '2',
        measurement_version: 'growth-v2',
      });
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
);
