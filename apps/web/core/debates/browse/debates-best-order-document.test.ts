import { type DocumentNode, type FieldNode, Kind, type OperationDefinitionNode } from 'graphql';
import { describe, expect, it } from 'vitest';

import { exploreBestConnectionDocument } from '~/core/explore/explore-best-document';

import { debatesBestOrderDocument } from './debates-best-order-document';

function operation(doc: DocumentNode): OperationDefinitionNode {
  const op = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION);
  if (!op) throw new Error('no operation in document');
  return op as OperationDefinitionNode;
}

function rootField(doc: DocumentNode): FieldNode {
  const selections = operation(doc).selectionSet.selections.filter(s => s.kind === Kind.FIELD);
  expect(selections).toHaveLength(1);
  return selections[0] as FieldNode;
}

function argNames(field: FieldNode): string[] {
  return (field.arguments ?? []).map(a => a.name.value).sort();
}

/** Fields selected directly on the connection — where `totalCount` would sit, beside `nodes`. */
function connectionFieldNames(doc: DocumentNode): string[] {
  return (rootField(doc).selectionSet?.selections ?? [])
    .filter(s => s.kind === Kind.FIELD)
    .map(s => (s as FieldNode).name.value)
    .sort();
}

function nodeFieldNames(doc: DocumentNode): string[] {
  const nodes = (rootField(doc).selectionSet?.selections ?? []).find(
    s => s.kind === Kind.FIELD && s.name.value === 'nodes'
  ) as FieldNode | undefined;
  if (!nodes) throw new Error('no nodes selection');
  return (nodes.selectionSet?.selections ?? [])
    .filter(s => s.kind === Kind.FIELD)
    .map(s => (s as FieldNode).name.value)
    .sort();
}

describe('debatesBestOrderDocument', () => {
  // The whole point is that this is the same ranking the explore page sorts by, not a lookalike.
  // It reads the by-type sibling rather than the connection explore uses: same function body and
  // same `ranking_score DESC, entity_id DESC`, but the type predicate is planned as a semi-join
  // instead of a filter on a ranked walk (GEO-2793). This document must filter by type, and that
  // walk does not terminate for a type as rare as Debate; explore sends no `typeIds` at all, so
  // the walk is the right plan there. Both names are asserted so a drift in either is caught.
  it('reads the by-type ranked connection', () => {
    expect(rootField(debatesBestOrderDocument).name.value).toBe('entitiesRankedForFeedByTypeConnection');
  });

  // Explore stays on the original connection. Note its *document* still declares and passes
  // `typeIds` — it is `fetchBestEntitiesPage` that leaves the variable undefined at the call site
  // (#2345), so the walk gets no type argument in practice. That is a runtime decision and cannot
  // be asserted here; what this pins is that the two documents no longer read the same field.
  it('reads a different connection from explore Best', () => {
    expect(rootField(exploreBestConnectionDocument).name.value).toBe('entitiesRankedForFeedConnection');
    expect(rootField(debatesBestOrderDocument).name.value).not.toBe(
      rootField(exploreBestConnectionDocument).name.value
    );
  });

  // The by-type connection matches nothing when `type_ids` is null, so omitting the argument here
  // would silently empty the feed rather than fall back to an unfiltered ranking.
  it('always sends typeIds, which the by-type connection requires to match anything', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).toContain('typeIds');
  });

  it('asks for ids alone — the feed already has the debates', () => {
    expect(nodeFieldNames(debatesBestOrderDocument)).toEqual(['id']);
  });

  it('scopes to one space and to debates', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).toEqual(expect.arrayContaining(['spaceIds', 'typeIds']));
  });

  // Same fast-path constraints the explore document spells out: ordering is the ranking function's
  // own, and a `filter` argument is redundant with what the function already enforces.
  it.each(['filter', 'orderBy'])('does not send %s as an argument', arg => {
    expect(argNames(rootField(debatesBestOrderDocument))).not.toContain(arg);
  });

  // `totalCount` sits on the connection beside `nodes`, not inside a node — so it has to be
  // checked there. Alongside `edges` it scans the candidate set twice and can exceed the
  // statement timeout.
  it('does not select totalCount on the connection', () => {
    expect(connectionFieldNames(debatesBestOrderDocument)).toEqual(['nodes', 'pageInfo']);
    expect(connectionFieldNames(debatesBestOrderDocument)).not.toContain('totalCount');
  });

  // A debate feed has no time control, and windowing would strand older debates at the end.
  it('does not window by recency', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).not.toContain('createdAfter');
  });

  it('pages, so a space larger than one page still ranks in full', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).toEqual(expect.arrayContaining(['first', 'after']));
  });
});
