import { describe, expect, it } from 'vitest';

import { isViewerId, viewerPersonId } from './viewer';

const viewer = { userId: '0191aaaa-0000-7000-8000-000000000001', personId: '0191aaaa000070008000000000000009' };

describe('isViewerId', () => {
  it('matches the user id or the person id, however spelled', () => {
    expect(isViewerId(viewer, '0191AAAA000070008000000000000001')).toBe(true);
    expect(isViewerId(viewer, '0191aaaa-0000-7000-8000-000000000009')).toBe(true);
    expect(isViewerId(viewer, '0191aaaa000070008000000000000002')).toBe(false);
  });

  it('matches only the user id before geo-chat sends a person id, and nothing signed out', () => {
    expect(isViewerId({ ...viewer, personId: null }, viewer.userId)).toBe(true);
    expect(isViewerId({ ...viewer, personId: null }, viewer.personId)).toBe(false);
    expect(isViewerId(null, viewer.userId)).toBe(false);
  });
});

describe('viewerPersonId', () => {
  it('looks the viewer up by person, falling back to the user id', () => {
    expect(viewerPersonId(viewer)).toBe(viewer.personId);
    expect(viewerPersonId({ ...viewer, personId: null })).toBe(viewer.userId);
    expect(viewerPersonId(null)).toBeNull();
  });
});
