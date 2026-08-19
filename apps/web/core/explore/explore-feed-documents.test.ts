import { type DocumentNode, type FieldNode, Kind, type OperationDefinitionNode, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { exploreBestConnectionDocument } from './explore-best-document';
import { exploreEntitiesByPropertyConnectionDocument } from './explore-entities-by-property-document';
import { exploreEntitiesConnectionDocument } from './explore-entities-document';

function operation(doc: DocumentNode): OperationDefinitionNode {
  const op = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION);
  if (!op) throw new Error('no operation in document');
  return op as OperationDefinitionNode;
}

/** The single root field of the query — the connection being paged. */
function rootField(doc: DocumentNode): FieldNode {
  const selections = operation(doc).selectionSet.selections.filter(s => s.kind === Kind.FIELD);
  expect(selections).toHaveLength(1);
  return selections[0] as FieldNode;
}

function variableNames(doc: DocumentNode): string[] {
  return (operation(doc).variableDefinitions ?? []).map(v => v.variable.name.value).sort();
}

function argNames(field: FieldNode): string[] {
  return (field.arguments ?? []).map(a => a.name.value).sort();
}

/** Field names selected directly under `nodes { ... }`, which is what the card decodes. */
function nodeFieldNames(doc: DocumentNode): string[] {
  const nodes = (rootField(doc).selectionSet?.selections ?? []).find(
    s => s.kind === Kind.FIELD && s.name.value === 'nodes'
  ) as FieldNode | undefined;
  if (!nodes) throw new Error('no nodes selection');
  return (nodes.selectionSet?.selections ?? [])
    .filter(s => s.kind === Kind.FIELD)
    .map(s => (s as FieldNode).alias?.value ?? (s as FieldNode).name.value)
    .sort();
}

describe('explore feed documents', () => {
  it('each sort targets its own connection', () => {
    expect(rootField(exploreEntitiesConnectionDocument).name.value).toBe('entitiesConnection');
    expect(rootField(exploreEntitiesByPropertyConnectionDocument).name.value).toBe(
      'entitiesOrderedByPropertyConnection'
    );
    expect(rootField(exploreBestConnectionDocument).name.value).toBe('entitiesRankedForFeedConnection');
  });

  it('all three select an identical per-entity field set', () => {
    // The card decoder is shared, so a field present for one sort and missing from
    // another renders a subtly different card on that tab. These came from one builder
    // (explore-card-selection) precisely so this cannot drift.
    const forNew = nodeFieldNames(exploreEntitiesConnectionDocument);
    expect(nodeFieldNames(exploreEntitiesByPropertyConnectionDocument)).toEqual(forNew);
    expect(nodeFieldNames(exploreBestConnectionDocument)).toEqual(forNew);
    expect(forNew).toContain('name');
    expect(forNew).toContain('createdAt');
  });

  describe('the Best sort', () => {
    it('passes space, type and recency scoping as connection arguments', () => {
      expect(argNames(rootField(exploreBestConnectionDocument))).toEqual(
        ['after', 'createdAfter', 'first', 'spaceIds', 'typeIds'].sort()
      );
    });

    it('sends no `filter`', () => {
      // Every clause buildFeedFilter would add is enforced inside
      // entities_ranked_for_feed: name presence (0075), system entities (0076),
      // excluded block types (config), space/type/recency (0077 arguments).
      //
      // Re-adding one is not merely redundant: `filter` together with `totalCount` and
      // `edges` on this connection exceeds the statement timeout.
      expect(variableNames(exploreBestConnectionDocument)).not.toContain('filter');
      expect(argNames(rootField(exploreBestConnectionDocument))).not.toContain('filter');
    });

    it('requests no top-level totalCount', () => {
      // The nested backlinks totalCount (comment count) is expected; a totalCount on the
      // connection itself is the half of the timeout pair this document must not ask for.
      const top = (rootField(exploreBestConnectionDocument).selectionSet?.selections ?? [])
        .filter(s => s.kind === Kind.FIELD)
        .map(s => (s as FieldNode).name.value);
      expect(top).not.toContain('totalCount');
      expect(top).toEqual(expect.arrayContaining(['pageInfo', 'nodes']));
    });

    it('does not try to order the results itself', () => {
      // Ordering is the function's own ORDER BY ranking_score DESC, entity_id DESC.
      // The connection exposes no orderBy, so passing one would be a schema error.
      expect(argNames(rootField(exploreBestConnectionDocument))).not.toContain('orderBy');
      expect(variableNames(exploreBestConnectionDocument)).not.toContain('orderBy');
    });

    it('pages with a cursor, so the feed can scroll', () => {
      expect(variableNames(exploreBestConnectionDocument)).toContain('after');
      expect(print(exploreBestConnectionDocument)).toContain('endCursor');
      expect(print(exploreBestConnectionDocument)).toContain('hasNextPage');
    });
  });
});
