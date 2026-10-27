import { describe, expect, it } from 'vitest';

import { tokenAllowsCamera } from './livekit-grant';

function token(video: unknown) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ video })}.signature`;
}

describe('tokenAllowsCamera', () => {
  it('allows a camera that the source list names', () => {
    expect(tokenAllowsCamera(token({ canPublish: true, canPublishSources: ['microphone', 'camera'] }))).toBe(true);
  });

  it('refuses a camera the source list leaves out', () => {
    expect(tokenAllowsCamera(token({ canPublish: true, canPublishSources: ['microphone'] }))).toBe(false);
  });

  it('allows a camera when no source list is given', () => {
    expect(tokenAllowsCamera(token({ canPublish: true }))).toBe(true);
  });

  it('refuses a camera when the token cannot publish at all', () => {
    expect(tokenAllowsCamera(token({ canPublish: false, canPublishSources: ['camera'] }))).toBe(false);
  });

  it('refuses a camera when the token says nothing it can read', () => {
    expect(tokenAllowsCamera('')).toBe(false);
    expect(tokenAllowsCamera('not-a-jwt')).toBe(false);
    expect(tokenAllowsCamera('header.!!!not-base64!!!.signature')).toBe(false);
    expect(tokenAllowsCamera(token(undefined))).toBe(false);
  });

  it('reads a payload whose base64url needs repairing', () => {
    const wide = { canPublish: true, canPublishSources: ['microphone', 'camera'], room: 'geo-rematch-????>>>' };
    expect(tokenAllowsCamera(token(wide))).toBe(true);
  });
});
