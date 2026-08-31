import { type DocumentNode, type FieldNode, Kind, type OperationDefinitionNode, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { topicCompositionDocument } from './topic-composition';

function operation(doc: DocumentNode): OperationDefinitionNode {
  const op = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION);
  if (!op) throw new Error('no operation in document');
  return op as OperationDefinitionNode;
}

function buckets(): FieldNode[] {
  return operation(topicCompositionDocument).selectionSet.selections.filter(
    s => s.kind === Kind.FIELD
  ) as FieldNode[];
}

function bucket(alias: string): FieldNode {
  const found = buckets().find(f => (f.alias?.value ?? f.name.value) === alias);
  if (!found) throw new Error(`no \`${alias}\` bucket`);
  return found;
}

describe('the topic composition document', () => {
  it('counts debates as entities, not as links', () => {
    // One debate arguing three of a topic's claims is three `Claims` relations. Counting the
    // relations would treble that debate's share of the bar — measured 5 relations against 4
    // debates on `AI regulation`, so this is a real difference and not a theoretical one.
    expect(bucket('debates').name.value).toBe('entitiesConnection');
  });

  it('reaches debates through their claims, since a debate never carries Topics', () => {
    const printed = print(topicCompositionDocument).replace(/\s+/g, ' ');
    expect(printed).toContain('toEntity: {relations: {some: {typeId: {is: $topicsPropertyId}');
  });

  it('counts every other bucket over the Topics relation', () => {
    // The remainder is `total` minus these, so a bucket that counted something else would silently
    // eat into "other" instead of adding to the bar.
    for (const alias of ['total', 'claims', 'episodes', 'news', 'tweets', 'posts']) {
      expect(bucket(alias).name.value).toBe('relationsConnection');
    }
  });

  it('asks for every bucket in one request', () => {
    expect(buckets().map(f => f.alias?.value ?? f.name.value).sort()).toEqual(
      ['claims', 'debates', 'episodes', 'news', 'posts', 'total', 'tweets'].sort()
    );
  });
});
