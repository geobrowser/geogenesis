import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createShareLink, expandShareLink } from './share-link';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'geo-analytics-manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(publicDir, `geo-analytics-${manifest.shortHash}.js`), 'utf8');
const target = '11111111111141118111111111111111';

describe('vendored share attribution', () => {
  it('retains the landing tags after navigation, serializes the handoff contract, and rotates for another share', async () => {
    const first = createShareLink(`https://www.geobrowser.io/debate/${target}?via=lobby`, 'lobby', target, 'x');
    const second = createShareLink(`https://www.geobrowser.io/debate/${target}?via=lobby`, 'lobby', target, 'x');
    const dom = new JSDOM('<!doctype html><body></body>', {
      url: expandShareLink(first.url)!,
      runScripts: 'outside-only',
    });
    const browser = dom.window as Window;
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    browser.fetch = fetch as unknown as typeof window.fetch;
    browser.lyticsConfig = {
      app: 'genesis',
      environment: 'production',
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
    const records = () =>
      fetch.mock.calls.flatMap(call => {
        const body = JSON.parse((call as unknown as [string, { body: string }])[1].body);
        return body.resourceLogs?.flatMap((r: any) => r.scopeLogs.flatMap((s: any) => s.logRecords)) ?? [];
      });
    const properties = (record: any) =>
      Object.fromEntries(record.attributes.map((a: any) => [a.key, a.value.stringValue]));
    try {
      dom.window.eval(source);
      const runtime = browser.lytics!;
      runtime.pageViewed!();
      const initial = runtime.getContext!();
      dom.window.history.replaceState({}, '', '/explore');
      runtime.signedUp!({ user_id: 'new-account' });
      runtime.loggedIn!({ user_id: 'returning-account' });
      runtime.capture!('share_link_handoff', {
        ...first.attribution,
        handoff_kind: 'copied',
        sharer_role: 'unknown',
        sharer_profile_space_id: target,
        component: 'share_dialog',
        page_path: '/explore',
        page_type: 'explore',
        page_view_id: 'page',
        target_id: target,
        target_type: 'lobby',
        action_context_version: 'v1',
      });
      await vi.waitFor(() =>
        expect(records().some((r: any) => r.body.stringValue === 'share_link_handoff')).toBe(true)
      );
      const signup = properties(records().find((r: any) => r.body.stringValue === 'signed_up'));
      expect(signup).toMatchObject({
        session_id: initial.session_id,
        utm_source: 'x',
        utm_medium: 'share',
        utm_campaign: 'geo_share',
        utm_content: new URL(expandShareLink(first.url)!).searchParams.get('utm_content'),
      });
      const handoff = properties(records().find((r: any) => r.body.stringValue === 'share_link_handoff'));
      expect(handoff).toMatchObject({ ...first.attribution, sharer_profile_space_id: target, handoff_kind: 'copied' });
      dom.window.history.replaceState({}, '', expandShareLink(second.url)!);
      runtime.pageViewed!();
      const next = runtime.getContext!();
      expect(next.session_id).not.toBe(initial.session_id);
      await vi.waitFor(() =>
        expect(records().filter((r: any) => r.body.stringValue === 'page_viewed')).toHaveLength(2)
      );
      expect(properties(records().filter((r: any) => r.body.stringValue === 'page_viewed')[1])).toMatchObject({
        utm_source: 'x',
        utm_content: new URL(expandShareLink(second.url)!).searchParams.get('utm_content'),
      });
      expect(records().filter((r: any) => r.body.stringValue === 'signed_up')).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });
});
