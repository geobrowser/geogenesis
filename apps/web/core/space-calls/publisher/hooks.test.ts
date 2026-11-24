import { describe, expect, it, vi } from 'vitest';

import { fetchGeoPublisherStatus, geoPublisherNoticeState } from './hooks';

describe('geoPublisherNoticeState', () => {
  it('shows the button only on a definite not_editor', () => {
    expect(geoPublisherNoticeState({ status: 'not_editor', sent: false })).toBe('add');
    expect(geoPublisherNoticeState({ status: 'pending', sent: false })).toBe('pending');
    expect(geoPublisherNoticeState({ status: 'editor', sent: true })).toBe('hidden');
    expect(geoPublisherNoticeState({ status: 'unknown', sent: false })).toBe('hidden');
    expect(geoPublisherNoticeState({ status: undefined, sent: false })).toBe('hidden');
  });

  it('shows a passed proposal as waiting to execute, even after a send', () => {
    expect(geoPublisherNoticeState({ status: 'executable', sent: false })).toBe('executable');
    expect(geoPublisherNoticeState({ status: 'executable', sent: true })).toBe('executable');
  });

  it('shows a failed check as such, never the add button', () => {
    expect(geoPublisherNoticeState({ status: 'check_failed', sent: false })).toBe('check_failed');
    expect(geoPublisherNoticeState({ status: 'check_failed', sent: true })).toBe('check_failed');
  });

  it('stays pending after a send while the graph has not caught up', () => {
    expect(geoPublisherNoticeState({ status: 'not_editor', sent: true })).toBe('pending');
  });
});

describe('fetchGeoPublisherStatus', () => {
  it('is unknown signed out or on any refusal', async () => {
    expect(await fetchGeoPublisherStatus('a'.repeat(32), async () => null)).toBe('unknown');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }));
    expect(await fetchGeoPublisherStatus('a'.repeat(32), async () => 't')).toBe('unknown');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'not_editor' }), { status: 200 }));
    expect(await fetchGeoPublisherStatus('a'.repeat(32), async () => 't')).toBe('not_editor');
    fetchMock.mockRestore();
  });
});
