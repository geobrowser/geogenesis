import { describe, expect, it } from 'vitest';

import {
  CLAIM_CONTROVERSY_SCORE_PROPERTY_ID,
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_HIGHLIGHT_SCORE_PROPERTY_ID,
  CLAIM_QUALITY_SCORE_PROPERTY_ID,
  CLAIM_RELEVANCE_SCORE_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
} from '~/core/debates/ontology';

import { debateTranscriptClaimsVariables } from './debate-transcript-claims-document';

describe('debateTranscriptClaimsVariables', () => {
  /**
   * The value filter is the only thing that lets the relation entity's values through: a property
   * missing here is read as "never published" by every consumer, with every reader test still
   * green, because those feed fixtures straight past the query.
   */
  it('asks for every value the app reads off the block → claim relation entity', () => {
    const variables = debateTranscriptClaimsVariables('debate', 'space');
    expect(variables.offsetPropertyIds).toEqual([
      CLAIM_START_OFFSET_PROPERTY_ID,
      CLAIM_END_OFFSET_PROPERTY_ID,
      CLAIM_HIGHLIGHT_SCORE_PROPERTY_ID,
      CLAIM_RELEVANCE_SCORE_PROPERTY_ID,
      CLAIM_QUALITY_SCORE_PROPERTY_ID,
      CLAIM_CONTROVERSY_SCORE_PROPERTY_ID,
    ]);
    expect(variables.claimsPropertyId).toBe(DEBATE_CLAIMS_PROPERTY_ID);
    expect(variables).toMatchObject({ id: 'debate', spaceId: 'space' });
    expect('first' in variables).toBe(false);
    expect(debateTranscriptClaimsVariables('debate', 'space', 1000).first).toBe(1000);
  });
});
