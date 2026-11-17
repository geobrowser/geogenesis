import { describe, expect, it } from 'vitest';

import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
  TYPES_PROPERTY_ID,
} from '~/core/debates/ontology';
import type { Entity, Relation } from '~/core/types';

import { bestDebateDisplayFromEntity, debateAgeLabel, debatersLabel, shortPersonName } from './best-debate-display';

const relation = (typeId: string, toId: string, toName: string | null = null, spaceId = 'sp'): Relation =>
  ({
    id: `${typeId}-${toId}-${spaceId}`,
    entityId: 'r',
    type: { id: typeId, name: null },
    fromEntity: { id: 'debate', name: null },
    toEntity: { id: toId, name: toName, value: toId },
    renderableType: 'RELATION',
    spaceId,
  }) as Relation;

const debate = (relations: Relation[], extra: Partial<Entity> = {}): Entity => ({
  id: 'aaaabbbbccccddddeeeeffff00001111',
  name: 'The claim | Chris Brown vs. Ben Taylor',
  description: null,
  spaces: [],
  types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }],
  relations,
  values: [],
  ...extra,
});

describe('bestDebateDisplayFromEntity', () => {
  it('reads the claim, debaters and own space off the relations, not the name', () => {
    const display = bestDebateDisplayFromEntity(
      debate(
        [
          relation(DEBATE_CLAIMS_PROPERTY_ID, 'claim1', 'Democrats are better for the economy'),
          relation(DEBATE_OPPOSED_BY_PROPERTY_ID, 'ben'),
          relation(DEBATE_SUPPORTED_BY_PROPERTY_ID, 'chris'),
          relation(TYPES_PROPERTY_ID, DEBATE_TYPE_ID, 'Debate', '25b4bd2a1c2b4ab3a4ad59ec0e7cf1ed'),
        ],
        { createdAt: 1_700_000_000 }
      )
    );

    expect(display.title).toBe('Democrats are better for the economy');
    expect(display.debaterSpaceIds).toEqual(['chris', 'ben']);
    expect(display.ownSpaceId).toBe('25b4bd2a1c2b4ab3a4ad59ec0e7cf1ed');
    expect(display.createdAtMs).toBe(1_700_000_000_000);
  });

  it('falls back to the debate name and no space when the relations are missing', () => {
    const display = bestDebateDisplayFromEntity(debate([], { createdAt: '2026-11-10T12:00:00Z' }));

    expect(display.title).toBe('The claim | Chris Brown vs. Ben Taylor');
    expect(display.ownSpaceId).toBeNull();
    expect(display.createdAtMs).toBe(Date.parse('2026-11-10T12:00:00Z'));
  });
});

describe('row labels', () => {
  it('shortens names to first name and last initial', () => {
    expect(shortPersonName('Chris Brown')).toBe('Chris B.');
    expect(shortPersonName('Alexa Dominique (alexadominique.8)')).toBe('Alexa D.');
    expect(shortPersonName('CptMoh')).toBe('CptMoh');
    expect(shortPersonName('  ')).toBeNull();
  });

  it('joins debaters with "and"', () => {
    expect(debatersLabel(['Chris B.', 'Ben T.'])).toBe('Chris B. and Ben T.');
    expect(debatersLabel(['Chris B.', null])).toBe('Chris B.');
    expect(debatersLabel([null])).toBeNull();
  });

  it('says how old a debate is', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    expect(debateAgeLabel(now - 6 * 3_600_000, now)).toBe('6h ago');
    expect(debateAgeLabel(now - 7 * 86_400_000, now)).toBe('7d ago');
    expect(debateAgeLabel(now - 5 * 60_000, now)).toBe('5m ago');
    expect(debateAgeLabel(null, now)).toBeNull();
  });
});
