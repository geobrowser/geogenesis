import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ACTION_COMPONENTS, snapshotActionContext } from './action-context';
import { authProperties } from './auth-attempt';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'geo-analytics-manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(publicDir, `geo-analytics-${manifest.shortHash}.js`), 'utf8');

type Runtime = Required<NonNullable<Window['lytics']>> & {
  validate: (event: string, properties: unknown) => { valid: boolean; missing: string[] };
};

function createRuntime() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://www.geobrowser.io/explore',
    runScripts: 'outside-only',
  });
  const browser = dom.window as unknown as Window & { lytics: Runtime };
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
  dom.window.eval(source);
  const records = () =>
    fetch.mock.calls.flatMap(call => {
      const body = JSON.parse((call as unknown as [string, { body: string }])[1].body);
      return (
        body.resourceLogs?.flatMap((resource: any) => resource.scopeLogs.flatMap((scope: any) => scope.logRecords)) ??
        []
      );
    });
  return { dom, browser, fetch, records };
}

describe('shipped action contract', () => {
  it('has a matching content hash and SRI', () => {
    const hash = crypto.createHash('sha256').update(source).digest();
    expect(hash.toString('hex')).toBe(manifest.hash);
    expect(`sha256-${hash.toString('base64')}`).toBe(manifest.integrity);
  });
  it('accepts and serializes all context fields through the actual runtime', async () => {
    const { dom, browser, fetch, records } = createRuntime();
    try {
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
      const shared = [
        'component',
        'page_path',
        'page_type',
        'page_view_id',
        'target_id',
        'target_type',
        'action_context_version',
      ];
      for (const [event, extra] of [
        ['action_completed', ['operation_id', 'action_kind', 'outcome']],
        ['component_impression', ['presentation_instance_id']],
      ] as const) {
        for (const field of [...shared, ...extra]) {
          // Explicit empty values prevent defaults (e.g. page_path) hiding a missing producer field.
          expect(browser.lytics.validate(event, { ...context, [field]: '' })).toMatchObject({
            valid: false,
            missing: expect.arrayContaining([field]),
          });
        }
        browser.lytics.capture(event, context);
      }
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(records().map((record: any) => record.body.stringValue)).toEqual([
        'action_completed',
        'component_impression',
      ]);
      for (const record of records()) {
        const attributes = Object.fromEntries(
          record.attributes.map((attribute: any) => [attribute.key, attribute.value])
        );
        for (const [key, value] of Object.entries(context)) {
          if (value !== undefined) expect(attributes[key], `${record.body.stringValue}/${key}`).toBeDefined();
        }
        expect(attributes.component).toEqual({ stringValue: 'debate_claim_ticker' });
        expect(attributes.session_id.stringValue).toBeTruthy();
        expect(attributes.anonymous_id.stringValue).toBeTruthy();
      }
    } finally {
      dom.window.close();
    }
  });

  it('delivers events emitted through the SDK helpers that Genesis uses', async () => {
    const { dom, browser, records } = createRuntime();
    try {
      const runtime = browser.lytics;
      runtime.pageViewed();
      runtime.voteCast('up', { entity_id: 'claim-1' });
      runtime.modeToggled('edit');
      runtime.graphEntityViewed({ entity_id: 'claim-1' });
      runtime.signedUp({ user_id: 'person-1' });
      runtime.loggedIn({ user_id: 'person-1' });
      runtime.sessionRestored({ user_id: 'person-1' });
      runtime.loggedOut();
      runtime.identityReset();
      const expected = [
        'page_viewed',
        'vote_cast',
        'mode_toggled',
        'graph_entity_viewed',
        'signed_up',
        'signed_in',
        'session_restored',
        'signed_out',
        'identity_reset',
      ];
      await vi.waitFor(() => expect(records().map((record: any) => record.body.stringValue)).toEqual(expected));
      // The SDK can serialize unknown events too; emission alone does not prove registration.
      for (const event of expected) {
        expect(runtime.validate(event, {}), event).toMatchObject({ unknown: false });
      }
    } finally {
      dom.window.close();
    }
  });
  it('serializes signup lifecycle and auth-attempt context through the actual runtime', async () => {
    const { dom, browser, fetch } = createRuntime();
    try {
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
      // Use the producer's attribution: lifecycle events do not have growth-v2 contracts.
      const lifecycle = {
        ...authProperties(context),
        auth_attempt_id: 'attempt',
        source: 'privy',
        user_id: 'did:privy:runtime-test',
      };
      for (const event of ['signed_up', 'signed_in']) {
        expect(browser.lytics.validate(event, lifecycle)).toMatchObject({ valid: true, missing: [] });
      }
      browser.lytics.signedUp({ user_id: lifecycle.user_id }, { ...lifecycle, operation_id: 'signup:runtime-test' });
      browser.lytics.loggedIn({ user_id: lifecycle.user_id }, { ...lifecycle, operation_id: 'login:runtime-test' });
      const auth = {
        ...context,
        auth_attempt_id: 'attempt',
        auth_control: 'disagree',
        auth_trigger: 'control',
        auth_attribution_version: 'v1',
        action_anonymous_id: 'visitor-before-login',
        action_session_id: 'session-before-login',
        auth_duration_ms: 1234,
        user_id: 'did:privy:test',
        onboarding_step: 'start',
      };
      const authEvents = [
        'auth_attempt_started',
        'auth_prompt_viewed',
        'auth_attempt_completed',
        'auth_identity_linked',
        'auth_onboarding_progress',
        'auth_action_completed',
      ] as const;
      for (const event of authEvents) {
        expect(browser.lytics.validate(event, auth)).toMatchObject({ valid: true, missing: [] });
        browser.lytics.capture(event, auth);
      }
      await vi.waitFor(() => {
        for (const event of authEvents) expect(JSON.stringify(fetch.mock.calls)).toContain(event);
      });
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
      const records = bodies.flatMap(
        body =>
          body.resourceLogs?.flatMap((resource: any) => resource.scopeLogs.flatMap((scope: any) => scope.logRecords)) ??
          []
      );
      for (const event of ['signed_up', 'signed_in', ...authEvents] as const) {
        const authRecord = records.find((row: any) => row.body.stringValue === event);
        expect(authRecord, event).toBeDefined();
        const attrs = Object.fromEntries(
          authRecord.attributes.map((attribute: any) => [attribute.key, attribute.value])
        );
        expect(attrs.auth_attempt_id).toEqual({ stringValue: 'attempt' });
        if (event !== 'signed_up' && event !== 'signed_in') {
          expect(attrs.action_anonymous_id).toEqual({ stringValue: 'visitor-before-login' });
          expect(attrs.action_session_id).toEqual({ stringValue: 'session-before-login' });
        }
        expect(attrs.anonymous_id.stringValue).toBeTruthy();
        expect(attrs.session_id.stringValue).toBeTruthy();
      }
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
