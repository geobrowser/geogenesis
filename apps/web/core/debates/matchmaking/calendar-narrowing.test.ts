import { describe, expect, it } from 'vitest';

import type { ParticipantPosition } from '../participant-positions';
import {
  NO_PICKS,
  claimListRows,
  claimPickKey,
  coversTopics,
  hiddenPicksSentence,
  narrowingSentence,
  passesPicks,
  personListRows,
  summarizeClaims,
  topicFacet,
} from './calendar-narrowing';
import { calendarHref, readCalendarPicks, writeCalendarPicks } from './debate-calendar-route';

const VIEWER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00';
const MAYA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01';
const JONAH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02';
const ANA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03';
const AI = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01';
const HEALTH = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02';
const PHONES = 'cccccccccccccccccccccccccccccc01';
const SEED_OILS = 'cccccccccccccccccccccccccccccc02';

const row = (profileSpaceId: string, claimId: string, spaceId: string, position: boolean): ParticipantPosition => ({
  profileSpaceId,
  claimId,
  spaceId,
  responseKind: 'stance',
  position,
});

function byClaim(rows: ParticipantPosition[]) {
  const map = new Map<string, ParticipantPosition[]>();
  for (const item of rows) map.set(item.claimId, [...(map.get(item.claimId) ?? []), item]);
  return map;
}

// The viewer agrees on phones (in AI); Maya disagrees, Jonah agrees. Ana alone holds seed oils.
const POSITIONS = byClaim([
  row(VIEWER, PHONES, AI, true),
  row(MAYA, PHONES, AI, false),
  row(JONAH, PHONES, AI, true),
  row(ANA, SEED_OILS, HEALTH, false),
]);
const POOL = new Set([MAYA, JONAH, ANA]);
const PHONES_KEY = claimPickKey(AI, PHONES);
const SEED_OILS_KEY = claimPickKey(HEALTH, SEED_OILS);

describe('summarizeClaims', () => {
  it('sorts everyone on the calendar onto a side, and names who opposes the viewer', () => {
    const { byKey } = summarizeClaims(POSITIONS, VIEWER, POOL);

    const phones = byKey.get(PHONES_KEY)!;
    expect(phones.viewerPosition).toBe(true);
    expect([...phones.agree]).toEqual([JONAH]);
    expect([...phones.disagree]).toEqual([MAYA]);
    expect([...phones.opponents]).toEqual([MAYA]);
    expect(byKey.get(SEED_OILS_KEY)!.opponents.size).toBe(0);
  });

  it('keeps a side apart per space: a position elsewhere is a different question', () => {
    const { byKey } = summarizeClaims(
      byClaim([row(VIEWER, PHONES, AI, true), row(MAYA, PHONES, HEALTH, false)]),
      VIEWER,
      POOL
    );

    expect(byKey.get(PHONES_KEY)).toBeUndefined();
    expect(byKey.get(claimPickKey(HEALTH, PHONES))!.viewerPosition).toBeNull();
  });

  it('leaves out people off the calendar, and claims nobody on it holds', () => {
    const { byKey } = summarizeClaims(POSITIONS, VIEWER, new Set([MAYA]));

    expect([...byKey.keys()]).toEqual([PHONES_KEY]);
    expect([...byKey.get(PHONES_KEY)!.agree]).toEqual([]);
  });
});

describe('passesPicks', () => {
  const claims = summarizeClaims(POSITIONS, VIEWER, POOL);
  const matches = (profileKey: string) => (profileKey === MAYA ? 1 : 0);

  it('passes everyone with nothing picked', () => {
    expect([MAYA, JONAH, ANA].every(person => passesPicks(person, NO_PICKS, claims, matches))).toBe(true);
  });

  it('ORs picks within a tab and ANDs across them', () => {
    const picks = { ...NO_PICKS, claims: [PHONES_KEY, SEED_OILS_KEY] };
    expect([MAYA, JONAH, ANA].filter(person => passesPicks(person, picks, claims, matches))).toEqual([
      MAYA,
      JONAH,
      ANA,
    ]);

    const withPerson = { ...picks, claims: [PHONES_KEY], people: [ANA, JONAH] };
    expect([MAYA, JONAH, ANA].filter(person => passesPicks(person, withPerson, claims, matches))).toEqual([JONAH]);
  });

  it('keeps only the other side of a picked claim with Matches only, and matched people without one', () => {
    const onClaim = { ...NO_PICKS, claims: [PHONES_KEY], matchesOnly: true };
    expect([MAYA, JONAH, ANA].filter(person => passesPicks(person, onClaim, claims, matches))).toEqual([MAYA]);

    const matchesOnly = { ...NO_PICKS, matchesOnly: true };
    expect([MAYA, JONAH, ANA].filter(person => passesPicks(person, matchesOnly, claims, matches))).toEqual([MAYA]);
  });
});

describe('the panel lists', () => {
  const claims = summarizeClaims(POSITIONS, VIEWER, POOL);
  const people = [
    { profileKey: ANA, matchCount: 0, firstFree: 1, inSpaces: true },
    { profileKey: MAYA, matchCount: 1, firstFree: 5, inSpaces: true },
    { profileKey: JONAH, matchCount: 0, firstFree: 2, inSpaces: false },
  ];

  it('orders claims by matches, narrows them by space, and keeps a pick the space hides in its place', () => {
    expect(claimListRows(claims, NO_PICKS, []).map(item => item.summary.key)).toEqual([PHONES_KEY, SEED_OILS_KEY]);

    const pinned = claimListRows(claims, { ...NO_PICKS, claims: [SEED_OILS_KEY] }, [AI]);
    // Not moved to the top: a ticked row stays where it was pressed.
    expect(pinned.map(item => [item.summary.key, item.selected, item.hidden])).toEqual([
      [PHONES_KEY, false, false],
      [SEED_OILS_KEY, true, true],
    ]);
  });

  it('narrows claims to those picked people hold, and to matches with Matches only', () => {
    expect(claimListRows(claims, { ...NO_PICKS, people: [ANA] }, []).map(item => item.summary.key)).toEqual([
      SEED_OILS_KEY,
    ]);
    expect(claimListRows(claims, { ...NO_PICKS, matchesOnly: true }, []).map(item => item.summary.key)).toEqual([
      PHONES_KEY,
    ]);
  });

  it('offers a claim to a picked person only as the week would judge them, with Matches only', () => {
    // Jonah agrees with the viewer on phones; Maya disagrees. Picking Jonah with Matches only, the
    // week would hide him on phones, so the list must not offer it to him.
    const withJonah = { ...NO_PICKS, people: [JONAH], matchesOnly: true };
    expect(claimListRows(claims, withJonah, []).map(item => item.summary.key)).toEqual([]);
    const withMaya = { ...NO_PICKS, people: [MAYA], matchesOnly: true };
    expect(claimListRows(claims, withMaya, []).map(item => item.summary.key)).toEqual([PHONES_KEY]);
    // And ticking what is offered never empties the week.
    for (const row of claimListRows(claims, withMaya, [])) {
      const picked = { ...withMaya, claims: [row.summary.key] };
      expect(passesPicks(MAYA, picked, claims, () => 1)).toBe(true);
    }
  });

  it('keeps a claim picked from a link that nobody on the calendar holds', () => {
    const stray = claimPickKey(AI, 'cccccccccccccccccccccccccccccc09');
    const rows = claimListRows(claims, { ...NO_PICKS, claims: [stray] }, []);
    expect(rows.find(item => item.summary.key === stray)).toMatchObject({ selected: true, hidden: true });
  });

  it('orders people by matches then soonest free, and narrows them by space and picked claims', () => {
    expect(personListRows(people, NO_PICKS, claims).map(item => item.person.profileKey)).toEqual([MAYA, ANA]);
    expect(
      personListRows(people, { ...NO_PICKS, claims: [PHONES_KEY], people: [JONAH] }, claims).map(item => [
        item.person.profileKey,
        item.hidden,
      ])
    ).toEqual([
      [MAYA, false],
      [JONAH, true],
    ]);
  });
});

describe('the line above the week', () => {
  it('says nothing with nothing picked, spaces included: that is the calendar as it was', () => {
    expect(narrowingSentence({ picks: NO_PICKS, shownCount: 3, spaceNames: [] })).toBeNull();
    expect(narrowingSentence({ picks: NO_PICKS, shownCount: 3, spaceNames: ['AI'] })).toBeNull();
  });

  it('agrees in number', () => {
    expect(
      narrowingSentence({
        picks: { ...NO_PICKS, claims: [PHONES_KEY], matchesOnly: true },
        shownCount: 1,
        spaceNames: [],
      })
    ).toBe('Showing 1 person who disagrees with you on the claim you picked.');
  });

  it('says what is narrowing the week', () => {
    expect(
      narrowingSentence({
        picks: { ...NO_PICKS, claims: [PHONES_KEY], matchesOnly: true },
        shownCount: 4,
        spaceNames: ['AI'],
      })
    ).toBe('Showing 4 people who disagree with you on the claim you picked in AI.');
    expect(narrowingSentence({ picks: { ...NO_PICKS, people: [MAYA, ANA] }, shownCount: 2, spaceNames: [] })).toBe(
      'Showing the 2 people you picked.'
    );
    expect(narrowingSentence({ picks: { ...NO_PICKS, matchesOnly: true }, shownCount: 1, spaceNames: [] })).toBe(
      'Showing 1 person you have matches with.'
    );
  });

  it('names hidden picks and why, and which week a hidden person is free', () => {
    expect(
      hiddenPicksSentence({
        hiddenPeople: [
          { name: 'Maya', freeThisWeek: false, freeOtherWeek: true },
          { name: 'Jonah', freeThisWeek: false },
          { name: 'Ana', freeThisWeek: true },
        ],
        hiddenClaimCount: 2,
      })
    ).toBe(
      "Maya is free next week, not this week. Jonah isn't free in the next two weeks. Ana doesn't match your other filters. 2 claims you picked don't match your other filters."
    );
    expect(
      hiddenPicksSentence({
        hiddenPeople: [{ name: 'Maya', freeThisWeek: false, freeOtherWeek: true }],
        hiddenClaimCount: 0,
        weekLabel: 'next week',
        otherWeekLabel: 'this week',
      })
    ).toBe('Maya is free this week, not next week.');
    expect(hiddenPicksSentence({ hiddenPeople: [], hiddenClaimCount: 0 })).toBeNull();
  });
});

describe('picks in the URL', () => {
  it('round-trips, in one spelling, and drops what is empty', () => {
    const params = new URLSearchParams({
      from: '/debates',
      people: `${MAYA},019FEDAE-72B6-7AB2-927A-DF044D57C511,${MAYA}`,
      claims: `${AI}:${PHONES},not-a-pair`,
      matches: '1',
    });
    const picks = readCalendarPicks(params);
    expect(picks).toEqual({
      people: [MAYA, '019fedae72b67ab2927adf044d57c511'],
      claims: [PHONES_KEY],
      matchesOnly: true,
    });

    expect(writeCalendarPicks(params, { ...picks, people: [], matchesOnly: false }).toString()).toBe(
      `from=%2Fdebates&claims=${AI}%3A${PHONES}`
    );
  });

  it('counts one id once, however it is spelled', () => {
    const hyphenated = '019fedae-72b6-7ab2-927a-df044d57c511';
    const bare = '019fedae72b67ab2927adf044d57c511';
    const picks = readCalendarPicks(
      new URLSearchParams({ people: `${hyphenated},${bare}`, claims: `${AI}:${PHONES},${AI}:${PHONES.toUpperCase()}` })
    );
    expect(picks.people).toEqual([bare]);
    expect(picks.claims).toEqual([PHONES_KEY]);
  });

  it('drops ids from the URL that are not UUIDs, before they reach the graph', () => {
    const picks = readCalendarPicks(
      new URLSearchParams({
        people: `nope,${MAYA}`,
        claims: `bad:${PHONES},${AI}:bad,${AI}:${PHONES}`,
      })
    );
    expect(picks.people).toEqual([MAYA]);
    expect(picks.claims).toEqual([PHONES_KEY]);
  });

  it('links to a narrowed calendar', () => {
    expect(calendarHref(null)).toBe('/matchmaking/calendar');
    expect(calendarHref('/space/x', { ...NO_PICKS, claims: [PHONES_KEY], matchesOnly: true })).toBe(
      `/matchmaking/calendar?from=%2Fspace%2Fx&claims=${AI}%3A${PHONES}&matches=1`
    );
  });
});

describe('topics', () => {
  const ai = { id: 'dddddddddddddddddddddddddddddd01', name: 'AI' };
  const jobs = { id: 'dddddddddddddddddddddddddddddd02', name: 'Jobs' };
  const health = { id: 'dddddddddddddddddddddddddddddd03', name: 'Health' };

  it('passes an item when one of its claims carries every picked topic', () => {
    // A person holding one AI+Jobs claim and one Health claim.
    const person = [[ai, jobs], [health]];
    expect(coversTopics(person, [])).toBe(true);
    expect(coversTopics(person, [ai.id, jobs.id])).toBe(true);
    // Across two different claims is not one claim in both topics.
    expect(coversTopics(person, [ai.id, health.id])).toBe(false);
  });

  it('counts what each topic would leave, keeps picks, and drops dead ends', () => {
    const items = [[[ai, jobs]], [[ai]], [[health]]];
    expect(topicFacet(items, [])).toEqual([
      { ...ai, count: 2 },
      { ...health, count: 1 },
      { ...jobs, count: 1 },
    ]);
    expect(topicFacet(items, [ai.id])).toEqual([
      { ...ai, count: 2 },
      { ...jobs, count: 1 },
    ]);
    // AI on one claim and Health on another is not one claim in both, so Health counts nobody here.
    expect(topicFacet([[[ai], [health]]], [ai.id])).toEqual([{ ...ai, count: 1 }]);
  });
});
