import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { isDebateEntity } from './is-debate-entity';
import { DEBATE_TYPE_ID } from './ontology';

const type = (id: string) => ({ id });

describe('isDebateEntity', () => {
  it('recognises a debate', () => {
    expect(isDebateEntity([type(DEBATE_TYPE_ID)])).toBe(true);
  });

  it('recognises a debate that is also something else', () => {
    // "is a debate", not "is only a debate" — multi-typed entities are ordinary, and the
    // full-screen experience is what the entity has whatever else it also is.
    expect(isDebateEntity([type(CLAIM_TYPE_ID), type(DEBATE_TYPE_ID)])).toBe(true);
  });

  it('does not recognise anything else', () => {
    expect(isDebateEntity([type(CLAIM_TYPE_ID)])).toBe(false);
    expect(isDebateEntity([])).toBe(false);
  });

  it('treats a missing type list as not a debate', () => {
    // The entity route reads this off a fetch that can come back empty, so undefined has to be an
    // answer rather than a crash.
    expect(isDebateEntity(undefined)).toBe(false);
  });

  it('matches whichever spelling of the id arrives', () => {
    // Ids reach the client hyphenless from some queries and UUID-formatted from others.
    const hyphenated = DEBATE_TYPE_ID.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');

    expect(isDebateEntity([type(hyphenated)])).toBe(true);
    expect(isDebateEntity([type(hyphenated.toUpperCase())])).toBe(true);
  });
});
