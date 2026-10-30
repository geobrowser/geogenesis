import { describe, expect, it } from 'vitest';

import { debateRecordingFromPath, debateRecordingPath } from './recording-routes';

const SPACE_ID = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATE_ID = '01a13b2c93b4702384da0926a56c265a';

describe('debate recording routes (GEO-3435)', () => {
  it('writes the recording viewer path', () => {
    expect(debateRecordingPath(SPACE_ID, DEBATE_ID)).toBe(`/space/${SPACE_ID}/debates/${DEBATE_ID}/recording`);
  });

  it('reads the space and debate back, with or without a trailing slash', () => {
    for (const suffix of ['', '/']) {
      expect(debateRecordingFromPath(`${debateRecordingPath(SPACE_ID, DEBATE_ID)}${suffix}`)).toEqual({
        spaceId: SPACE_ID,
        debateId: DEBATE_ID,
      });
    }
  });

  it.each([
    `/space/${SPACE_ID}/debates/${DEBATE_ID}`,
    `/space/${SPACE_ID}/debates/${DEBATE_ID}/recording/extra`,
    `/space/${SPACE_ID}/${DEBATE_ID}/recording`,
    `/debate/${DEBATE_ID}/recording`,
    `/space/${SPACE_ID}/debates`,
  ])('is not a recording path: %s', path => {
    expect(debateRecordingFromPath(path)).toBeNull();
  });
});
