import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import type { DebatePerson } from '../api';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  personalSpaceId: 'viewer-space' as string | null,
  currentUserId: 'viewer-user' as string | null,
  responders: [] as { userId: string; direction: 'positive' | 'negative' }[],
  respondersLoading: false,
  people: [] as DebatePerson[],
  peopleLoading: false,
  schedulable: { people: [] as { user: Pick<DebatePerson, 'user_id' | 'profile_space_id'> }[] },
  slots: new Map<string, { start: number; viewerFree: boolean }[]>(),
  excluded: new Set<string>(),
}));

vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => mocks.currentUserId }));
vi.mock('~/core/responses/use-entity-responders', () => ({
  useEntityResponders: () => ({ responders: mocks.responders, isLoading: mocks.respondersLoading }),
}));
vi.mock('./hooks', () => ({
  useDebatePeople: () => ({ data: { people: mocks.people }, isLoading: mocks.peopleLoading }),
  useSchedulablePeople: () => ({ data: mocks.schedulable, isLoading: false }),
}));
vi.mock('./debate-calendar-controls', () => ({ useMinuteClock: () => 0 }));
vi.mock('./debate-calendar-model', () => ({ freeSlotsByUser: () => mocks.slots }));
vi.mock('./people-tab-exclusions', () => ({ isExcludedFromPeopleTab: (id: string) => mocks.excluded.has(id) }));

const { useClaimOpponents } = await import('./use-claim-opponents');

function person(id: string, overrides: Partial<DebatePerson> = {}): DebatePerson {
  return {
    user_id: `${id}-user`,
    profile_space_id: `${id}-space`,
    display_name: id,
    online: true,
    in_debate: false,
    away: false,
    can_challenge: true,
    ...overrides,
  } as DebatePerson;
}

function run(viewerPosition: boolean | null | undefined) {
  return renderHook(() => useClaimOpponents({ claimId: 'claim', spaceId: 'space', viewerPosition })).result.current;
}

beforeEach(() => {
  mocks.authenticated = true;
  mocks.personalSpaceId = 'viewer-space';
  mocks.currentUserId = 'viewer-user';
  mocks.respondersLoading = false;
  mocks.peopleLoading = false;
  mocks.excluded = new Set();
  // Viewer agrees; "dis" and "away" and "busy" disagree; "ally" agrees.
  mocks.responders = [
    { userId: 'viewer-space', direction: 'negative' },
    { userId: 'dis-space', direction: 'negative' },
    { userId: 'away-space', direction: 'negative' },
    { userId: 'busy-space', direction: 'negative' },
    { userId: 'later-space', direction: 'negative' },
    { userId: 'ally-space', direction: 'positive' },
  ];
  mocks.people = [
    person('busy', { in_debate: true }),
    person('away', { away: true }),
    person('dis'),
    person('ally'),
    person('viewer'),
    person('offline', { online: false }),
  ];
  mocks.schedulable = {
    people: [{ user: person('later') }, { user: person('ally') }, { user: person('dis') }],
  };
  mocks.slots = new Map([
    [normId('later-user'), [{ start: 1, viewerFree: true }]],
    [normId('ally-user'), [{ start: 1, viewerFree: true }]],
  ]);
});

describe('useClaimOpponents', () => {
  it('lists only online people on the other side, askable ones first', () => {
    const result = run(true);
    expect(result.status).toBe('ready');
    expect(result.online.map(p => p.display_name)).toEqual(['dis', 'away', 'busy']);
    expect(result.askableCount).toBe(1);
  });

  it('flips sides with the viewer', () => {
    const result = run(false);
    expect(result.online.map(p => p.display_name)).toEqual(['ally']);
    expect([...result.withFreeTime]).toEqual([normId('ally-space')]);
  });

  it('counts free time only for opponents who have future slots', () => {
    // "dis" is schedulable but has no free slot left; "ally" has one but agrees.
    expect([...run(true).withFreeTime]).toEqual([normId('later-space')]);
  });

  it('never lists the viewer, even when the graph has them on the other side', () => {
    mocks.responders.push({ userId: 'viewer-space', direction: 'negative' });
    expect(run(true).online.some(p => p.profile_space_id === 'viewer-space')).toBe(false);
  });

  it('drops people the People tab excludes', () => {
    mocks.excluded = new Set(['dis-space']);
    expect(run(true).online.map(p => p.display_name)).toEqual(['away', 'busy']);
  });

  it('is loading while the side is unknown, and offers nothing without one', () => {
    expect(run(undefined)).toMatchObject({ status: 'loading', online: [], askableCount: 0 });
    expect(run(null)).toMatchObject({ status: 'none', online: [], askableCount: 0 });
  });

  it('offers nothing signed out', () => {
    mocks.authenticated = false;
    expect(run(true).status).toBe('none');
  });
});
