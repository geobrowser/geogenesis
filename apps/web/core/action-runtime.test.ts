import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ACTION_COMPONENTS, snapshotActionContext } from './action-context';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'geo-analytics-manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(publicDir, `geo-analytics-${manifest.shortHash}.js`), 'utf8');

describe('shipped action contract', () => {
  it('has a matching content hash and SRI', () => {
    const hash = crypto.createHash('sha256').update(source).digest();
    expect(hash.toString('hex')).toBe(manifest.hash);
    expect(`sha256-${hash.toString('base64')}`).toBe(manifest.integrity);
  });
  it('accepts and serializes all context fields through the actual runtime', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', {
      url: 'https://www.geobrowser.io/explore',
      runScripts: 'outside-only',
    });
    const browser = dom.window as unknown as Window & {
      lytics: {
        capture: (event: string, properties: unknown) => void;
        validate: (event: string, properties: unknown) => { valid: boolean; missing: string[] };
      };
    };
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
      const context = {
        ...snapshotActionContext('debate_claim_ticker', 'claim', 'claim'),
        action_context_version: 'v1',
        measurement_version: 'growth-v2',
        operation_id: 'operation',
        action_kind: 'vote',
        outcome: 'succeeded',
        origin_entity_ids: ['debate'],
        overlay: 'entity_side_panel',
        overlay_entity_id: 'claim',
        overlay_entity_type: 'claim',
        list_id: 'explore',
        item_position: 10,
        presentation_instance_id: 'display',
        playback_instance_id: 'playback',
        playback_position_ms: 30000,
        debate_id: 'debate',
        variant: 'default',
        is_automated: true,
        is_internal: false,
      };
      for (const component of ACTION_COMPONENTS) {
        expect(browser.lytics.validate('action_completed', { ...context, component })).toMatchObject({
          valid: true,
          missing: [],
        });
      }
      expect(browser.lytics.validate('component_impression', context)).toMatchObject({ valid: true, missing: [] });
      browser.lytics.capture('action_completed', context);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      const bodies = fetch.mock.calls.map(call => JSON.parse((call as unknown as [string, { body: string }])[1].body));
      const record = bodies
        .flatMap(
          body =>
            body.resourceLogs?.flatMap((resource: any) =>
              resource.scopeLogs.flatMap((scope: any) => scope.logRecords)
            ) ?? []
        )
        .find(record => record.body.stringValue === 'action_completed');
      expect(record).toBeDefined();
      const attributes = Object.fromEntries(
        record.attributes.map((attribute: any) => [attribute.key, attribute.value])
      );
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) expect(attributes[key], key).toBeDefined();
      }
      expect(attributes.component).toEqual({ stringValue: 'debate_claim_ticker' });
      expect(attributes.session_id.stringValue).toBeTruthy();
      expect(attributes.anonymous_id.stringValue).toBeTruthy();
    } finally {
      dom.window.close();
    }
  });
});
