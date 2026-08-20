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
  it('reads the same ranked connection the explore Best sort does', () => {
    expect(rootField(debatesBestOrderDocument).name.value).toBe(rootField(exploreBestConnectionDocument).name.value);
    expect(rootField(debatesBestOrderDocument).name.value).toBe('entitiesRankedForFeedConnection');
  });

  it('asks for ids alone — the feed already has the debates', () => {
    expect(nodeFieldNames(debatesBestOrderDocument)).toEqual(['id']);
  });

  it('scopes to one space and to debates', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).toEqual(expect.arrayContaining(['spaceIds', 'typeIds']));
  });

  // Same fast-path constraints the explore document documents: `filter` or `totalCount` alongside
  // `edges` can exceed the statement timeout, and ordering is the ranking function's own.
  it.each(['filter', 'totalCount', 'orderBy'])('does not send %s', arg => {
    expect(argNames(rootField(debatesBestOrderDocument))).not.toContain(arg);
    expect(nodeFieldNames(debatesBestOrderDocument)).not.toContain(arg);
  });

  // A debate feed has no time control, and windowing would strand older debates at the end.
  it('does not window by recency', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).not.toContain('createdAfter');
  });

  it('pages, so a space larger than one page still ranks in full', () => {
    expect(argNames(rootField(debatesBestOrderDocument))).toEqual(expect.arrayContaining(['first', 'after']));
  });
});
