import { type DocumentNode, type FieldNode, Kind, type OperationDefinitionNode, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { exploreEntitiesConnectionDocument } from '~/core/explore/explore-entities-document';

import { topicCoverageDocument } from './use-topic-coverage';

function operation(doc: DocumentNode): OperationDefinitionNode {
  const op = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION);
  if (!op) throw new Error('no operation in document');
  return op as OperationDefinitionNode;
}

function fields(selections: readonly unknown[] | undefined): FieldNode[] {
  return ((selections ?? []) as { kind: string }[]).filter(s => s.kind === Kind.FIELD) as FieldNode[];
}

function child(node: { selectionSet?: { selections: readonly unknown[] } }, name: string): FieldNode {
  const found = fields(node.selectionSet?.selections).find(f => f.name.value === name);
  if (!found) throw new Error(`no \`${name}\` selection`);
  return found;
}

function names(node: { selectionSet?: { selections: readonly unknown[] } }): string[] {
  return fields(node.selectionSet?.selections)
    .map(f => f.alias?.value ?? f.name.value)
    .sort();
}

/** The card's per-entity selection, wherever it hangs in a given document. */
function coverageEntityFields(): string[] {
  const root = fields(operation(topicCoverageDocument).selectionSet.selections)[0];
  return names(child(child(root, 'nodes'), 'fromEntity'));
}

describe('the topic coverage document', () => {
  it('selects the same per-entity fields the explore feed decodes', () => {
    // Coverage renders `ExploreFeedCard` from these rows. A field the feed selects and this one
    // doesn't is not a type error — it decodes to a missing thumbnail, an empty type line or a
    // timestamp that reads as the epoch, on a card that otherwise looks right.
    const feedNodeFields = names(child(fields(operation(exploreEntitiesConnectionDocument).selectionSet.selections)[0], 'nodes'));
    expect(coverageEntityFields()).toEqual(feedNodeFields);
  });

  it('scopes the relation, both its ends, and nothing else', () => {
    // `print` reformats every object argument across several lines, so the clauses are compared
    // against the whitespace-collapsed document rather than the source text.
    const printed = print(topicCoverageDocument).replace(/\s+/g, ' ');
    // Without `typeId` the filter matches any relation aimed at the topic — a parent's `Subtopics`
    // link included — and returns a count that looks plausible and is wrong.
    expect(printed).toContain('typeId: {is: $topicsPropertyId}');
    expect(printed).toContain('toEntityId: {is: $topicId}');
    // `overlaps`, not `containedBy`: the latter requires the entity's types to be a subset of the
    // list, so an episode that picks up a second type would silently vanish. The two agree on
    // today's data, which is what makes the mistake easy to make and hard to see.
    expect(printed).toContain('fromEntity: {typeIds: {overlaps: $typeIds}}');
    expect(printed).not.toContain('containedBy');
  });

  it('does not scope its value and relation lists to a space list it cannot have', () => {
    // A topic gathers across every space in the graph, so there is no list to narrow to before the
    // rows say which spaces they came from. The variable must be absent, not empty.
    expect(print(topicCoverageDocument)).not.toContain('spaceIdsForLists');
    expect((operation(topicCoverageDocument).variableDefinitions ?? []).map(v => v.variable.name.value)).not.toContain(
      'spaceIdsForLists'
    );
  });

  it('pages with a cursor, and asks for no total it does not render', () => {
    // `totalCount` is a second scan of the filtered set on every page. Nothing shows it — the
    // composition strip is what says how much a topic holds.
    const root = fields(operation(topicCoverageDocument).selectionSet.selections)[0];
    expect(names(root)).toEqual(['nodes', 'pageInfo']);
  });
});
