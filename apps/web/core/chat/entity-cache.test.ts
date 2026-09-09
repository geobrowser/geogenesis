import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { buildEntityCacheFromMessages } from './entity-cache';

const ID = 'a'.repeat(32);
const SPACE_ID = 'b'.repeat(32);

function toolPart(type: string, output: unknown) {
  return { type, toolCallId: 'call_1', state: 'output-available', input: {}, output } as unknown as UIMessage['parts'][number];
}

function assistant(parts: UIMessage['parts']): UIMessage {
  return { id: 'a1', role: 'assistant', parts };
}

describe('buildEntityCacheFromMessages', () => {
  it('ingests geoQuery rows so its results can render as pills', () => {
    // geoQuery is often the only tool that saw a given entity — a block's
    // contents or the 11th-through-15th result never pass through searchGraph.
    // Without this the cache misses and the citation degrades to plain text,
    // so the rows come back as prose instead of pills.
    const messages = [
      assistant([toolPart('tool-geoQuery', { answer: '1 project', rows: [{ id: ID, name: 'Ether', spaceId: SPACE_ID }] })]),
    ];

    expect(buildEntityCacheFromMessages(messages).get(ID)).toEqual({ id: ID, name: 'Ether', spaceId: SPACE_ID });
  });

  it('ignores a geoQuery answer that carried no rows', () => {
    // A count question returns `totalCount` and no rows at all.
    const messages = [assistant([toolPart('tool-geoQuery', { answer: '13 articles', totalCount: 13 })])];

    expect(buildEntityCacheFromMessages(messages).size).toBe(0);
  });

  it('still ingests searchGraph results', () => {
    const messages = [assistant([toolPart('tool-searchGraph', { results: [{ id: ID, name: 'Ether', spaceId: SPACE_ID }] })])];

    expect(buildEntityCacheFromMessages(messages).get(ID)?.name).toBe('Ether');
  });

  it('skips tool parts whose output has not arrived', () => {
    const pending = { type: 'tool-geoQuery', toolCallId: 'call_1', state: 'input-available', input: {} };

    expect(buildEntityCacheFromMessages([assistant([pending as unknown as UIMessage['parts'][number]])]).size).toBe(0);
  });
});
