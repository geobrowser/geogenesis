import { describe, expect, it } from 'vitest';

import { debateFeedHref, debateIdFromEntityPath } from './debate-feed-url';

const SPACE = '4582fbbee28a16589154f7e36f1ee3c5';
const OPENED = '01a0cfe292a37b32b51c7e6275d28cc4';
const NEXT = '01a0cfdbc0c770718568c651a659d118';
const NEXT_UUID = '01a0cfdb-c0c7-7071-8568-c651a659d118';

describe('debateFeedHref on a debate page', () => {
  const href = (pathname: string, search: string, debateId: string) =>
    debateFeedHref({ pathname, search }, { surface: 'debate-page', spaceId: SPACE, debateId });

  it('leaves a URL that already names the debate alone, timecode and all', () => {
    expect(href(`/space/${SPACE}/${OPENED}`, '?t=42', OPENED)).toBeNull();
  });

  it('matches the debate however its id is spelled', () => {
    expect(href(`/space/${SPACE}/${NEXT}`, '', NEXT_UUID)).toBeNull();
  });

  it('moves to the next debate in the hex form the share dialog uses, without the timecode', () => {
    expect(href(`/space/${SPACE}/${OPENED}`, '?t=42', NEXT_UUID)).toBe(`/space/${SPACE}/${NEXT}`);
  });

  it('keeps any other query parameters', () => {
    expect(href(`/space/${SPACE}/${OPENED}`, '?t=42&utm_source=x', NEXT)).toBe(`/space/${SPACE}/${NEXT}?utm_source=x`);
  });
});

describe('debateFeedHref on the Debates tab', () => {
  const href = (search: string, debateId: string) =>
    debateFeedHref(
      { pathname: `/space/${SPACE}/debates`, search },
      { surface: 'debates-tab', spaceId: SPACE, debateId }
    );

  it('names the debate in a param and keeps the path', () => {
    expect(href('', NEXT_UUID)).toBe(`/space/${SPACE}/debates?debate=${NEXT}`);
  });

  it('leaves a URL that already names the debate alone', () => {
    expect(href(`?debate=${NEXT}`, NEXT_UUID)).toBeNull();
  });

  it('replaces the previous debate and drops a timecode', () => {
    expect(href(`?debate=${OPENED}&t=10`, NEXT)).toBe(`/space/${SPACE}/debates?debate=${NEXT}`);
  });
});

describe('debateIdFromEntityPath', () => {
  it("reads the entity from this space's entity path", () => {
    expect(debateIdFromEntityPath(`/space/${SPACE}/${NEXT}`, SPACE)).toBe(NEXT);
  });

  it('ignores another space, a deeper route, and anything that is not an entity path', () => {
    expect(debateIdFromEntityPath(`/space/0000000000000000000000000000000a/${NEXT}`, SPACE)).toBeNull();
    expect(debateIdFromEntityPath(`/space/${SPACE}/${NEXT}/claims`, SPACE)).toBeNull();
    expect(debateIdFromEntityPath(`/space/${SPACE}`, SPACE)).toBeNull();
    expect(debateIdFromEntityPath('/explore', SPACE)).toBeNull();
    expect(debateIdFromEntityPath(null, SPACE)).toBeNull();
  });
});
