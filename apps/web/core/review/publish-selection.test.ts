import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation, Value } from '~/core/types';
import type { EntityDiff } from '~/core/utils/diff/types';

import {
  buildIsNewEntity,
  buildOwnershipIndex,
  collectCandidateEntityIds,
  collectOpsForEntities,
  countEntityChanges,
  expandDiscardSet,
  findDanglingDependencies,
  getDeselectionBlockers,
  selectOpsForPublish,
} from './publish-selection';

const SPACE = 'space-1';

const value = (entityId: string, id = `value-${entityId}`): Value => ({
  id,
  entity: { id: entityId, name: entityId },
  property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
  value: `content of ${entityId}`,
  spaceId: SPACE,
});

const relation = (
  from: string,
  to: string,
  { typeId = 'property-1', entityId = `relation-entity-${from}-${to}` } = {}
): Relation => ({
  id: `relation-${from}-${to}`,
  entityId,
  type: { id: typeId, name: 'Property' },
  fromEntity: { id: from, name: from },
  toEntity: { id: to, name: to, value: to },
  renderableType: 'RELATION',
  spaceId: SPACE,
});

const blocksRelation = (parent: string, block: string) =>
  relation(parent, block, { typeId: SystemIds.BLOCKS, entityId: `blocks-rel-${parent}-${block}` });

const diff = (entityId: string, blockIds: string[] = []): EntityDiff => ({
  entityId,
  name: entityId,
  values: [],
  relations: [],
  blocks: blockIds.map(id => ({ id, type: 'textBlock', before: null, after: 'text', diff: [] })),
});

const never = () => false;
const always = () => true;

describe('buildOwnershipIndex', () => {
  it('gives every folded block back to the row that shows it', () => {
    const index = buildOwnershipIndex([diff('parent', ['block-a', 'block-b'])], []);

    expect(index.ownerOf.get('block-a')).toBe('parent');
    expect(index.ownerOf.get('block-b')).toBe('parent');
    expect(index.ownerOf.get('parent')).toBe('parent');
    expect(index.displayIds).toEqual(new Set(['parent']));
  });

  it('claims blocks reachable only through this proposal’s BLOCKS relations', () => {
    const index = buildOwnershipIndex([diff('parent')], [blocksRelation('parent', 'block-a')]);

    expect(index.ownerOf.get('block-a')).toBe('parent');
  });

  it('follows a chain of nested blocks regardless of the order they arrive in', () => {
    const index = buildOwnershipIndex(
      [diff('parent')],
      [blocksRelation('block-a', 'block-b'), blocksRelation('parent', 'block-a')]
    );

    expect(index.ownerOf.get('block-b')).toBe('parent');
  });

  it('does not let one row swallow another row’s block', () => {
    const index = buildOwnershipIndex([diff('parent'), diff('other')], [blocksRelation('parent', 'other')]);

    expect(index.ownerOf.get('other')).toBe('other');
  });

  it('gives a relation entity to whoever owns the relation', () => {
    const index = buildOwnershipIndex([diff('parent')], [relation('parent', 'target', { entityId: 'rel-entity' })]);
    expect(index.ownerOf.get('rel-entity')).toBe('parent');
    expect(index.ownerOf.has('target')).toBe(false);
  });
});

describe('selectOpsForPublish', () => {
  it('passes everything through untouched when nothing is deselected', () => {
    const values = [value('parent'), value('block-a')];
    const relations = [blocksRelation('parent', 'block-a')];
    const index = buildOwnershipIndex([diff('parent', ['block-a'])], relations);

    const result = selectOpsForPublish(index, new Set(['parent']), values, relations);

    expect(result.values).toEqual(values);
    expect(result.relations).toEqual(relations);
    expect(result.unattributed.values).toEqual([]);
  });

  it('keeps the block content of a row that stays selected', () => {
    const values = [value('kept'), value('kept-block'), value('dropped'), value('dropped-block')];
    const relations = [blocksRelation('kept', 'kept-block'), blocksRelation('dropped', 'dropped-block')];
    const index = buildOwnershipIndex([diff('kept', ['kept-block']), diff('dropped', ['dropped-block'])], relations);

    const result = selectOpsForPublish(index, new Set(['kept']), values, relations);

    expect(result.values.map(v => v.entity.id)).toEqual(['kept', 'kept-block']);
    expect(result.relations).toEqual([blocksRelation('kept', 'kept-block')]);
  });

  it('drops the block content of a row that is deselected', () => {
    const values = [value('parent'), value('block-a')];
    const index = buildOwnershipIndex([diff('parent', ['block-a'])], []);

    const result = selectOpsForPublish(index, new Set(), values, []);

    expect(result.values).toEqual([]);
  });

  it('keeps ops it cannot attribute, and reports them rather than dropping them quietly', () => {
    const orphan = value('unknown-entity');
    const values = [value('kept'), orphan];
    const index = buildOwnershipIndex([diff('kept'), diff('dropped')], []);

    const result = selectOpsForPublish(index, new Set(['kept']), values, []);

    expect(result.values).toContain(orphan);
    expect(result.unattributed.values).toEqual([orphan]);
  });
});

describe('collectOpsForEntities', () => {
  it('takes a row’s folded blocks with it, so no orphan block is left behind', () => {
    const values = [value('page'), value('table-block'), value('other')];
    const relations = [blocksRelation('page', 'table-block'), relation('other', 'somewhere')];
    const index = buildOwnershipIndex([diff('page', ['table-block']), diff('other')], relations);

    const discarded = collectOpsForEntities(index, new Set(['page']), values, relations);

    expect(discarded.values.map(v => v.entity.id)).toEqual(['page', 'table-block']);
    expect(discarded.relations).toEqual([blocksRelation('page', 'table-block')]);
  });

  it('leaves every other row untouched', () => {
    const values = [value('kept'), value('dropped')];
    const relations = [relation('kept', 'x'), relation('dropped', 'y')];
    const index = buildOwnershipIndex([diff('kept'), diff('dropped')], relations);

    const discarded = collectOpsForEntities(index, new Set(['dropped']), values, relations);

    expect(discarded.values.map(v => v.entity.id)).toEqual(['dropped']);
    expect(discarded.relations).toEqual([relation('dropped', 'y')]);
  });

  it('is the exact complement of what publishing the others would keep', () => {
    const values = [value('kept'), value('dropped')];
    const relations = [relation('kept', 'x'), relation('dropped', 'y')];
    const index = buildOwnershipIndex([diff('kept'), diff('dropped')], relations);

    const kept = selectOpsForPublish(index, new Set(['kept']), values, relations);
    const discarded = collectOpsForEntities(index, new Set(['dropped']), values, relations);

    expect(kept.values.length + discarded.values.length).toBe(values.length);
    expect(kept.relations.length + discarded.relations.length).toBe(relations.length);
  });

  it('takes nothing when nothing is named', () => {
    const index = buildOwnershipIndex([diff('page')], []);

    expect(collectOpsForEntities(index, new Set(), [value('page')], [])).toEqual({ values: [], relations: [] });
  });
});

describe('expandDiscardSet', () => {
  it('cascades a new target that nothing outside the discard set still links to', () => {
    const relations = [relation('holder', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);

    expect(expandDiscardSet(index, new Set(['holder']), relations, always)).toEqual(new Set(['holder', 'fresh']));
  });

  it('leaves a target alone when another row still links to it', () => {
    const relations = [relation('holder', 'fresh'), relation('other', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('other'), diff('fresh')], relations);

    expect(expandDiscardSet(index, new Set(['holder']), relations, always)).toEqual(new Set(['holder']));
  });

  it('does not cascade an established graph entity', () => {
    const relations = [relation('holder', 'existing')];
    const index = buildOwnershipIndex([diff('holder'), diff('existing')], relations);

    expect(expandDiscardSet(index, new Set(['holder']), relations, never)).toEqual(new Set(['holder']));
  });

  it('does not cascade a standalone new row that was never linked from the discard set', () => {
    const relations = [relation('other', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('other'), diff('fresh')], relations);

    expect(expandDiscardSet(index, new Set(['holder']), relations, always)).toEqual(new Set(['holder']));
  });

  it('cascades a chain of orphans', () => {
    const relations = [relation('a', 'b'), relation('b', 'c')];
    const index = buildOwnershipIndex([diff('a'), diff('b'), diff('c')], relations);

    expect(expandDiscardSet(index, new Set(['a']), relations, always)).toEqual(new Set(['a', 'b', 'c']));
  });
});

/**
 * Discarding a row removes its ops, and with them its diff row — so the entity vanishes from the
 * ownership index. Treating an unowned target as safe let discard walk straight past the guard that
 * refuses the very same deselection, and published a relation pointing at nothing.
 */
describe('a target discarded out from under its holder', () => {
  const relations = [relation('holder', 'fresh')];

  it('refuses the deselection while both rows are present', () => {
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);

    expect(getDeselectionBlockers(index, new Set(['holder', 'fresh']), relations, always).get('fresh')).toEqual([
      'holder',
    ]);
  });

  it('still reports the dangle once the target has no row left', () => {
    const index = buildOwnershipIndex([diff('holder')], relations);

    expect(findDanglingDependencies(index, new Set(['holder']), relations, always)).toEqual([
      { entityId: 'fresh', requiredBy: ['holder'] },
    ]);
  });

  it('says nothing when the vanished target was already on the graph', () => {
    // No row and never created here — an ordinary link to an existing entity, which must publish.
    const index = buildOwnershipIndex([diff('holder')], relations);

    expect(findDanglingDependencies(index, new Set(['holder']), relations, never)).toEqual([]);
  });

  it('asks about relation targets, so the graph check can tell those two apart', () => {
    const index = buildOwnershipIndex([diff('holder')], relations);

    expect(collectCandidateEntityIds(index, relations).has('fresh')).toBe(true);
  });
});

describe('countEntityChanges', () => {
  it('counts values, relations and blocks together', () => {
    const entity: EntityDiff = {
      ...diff('parent', ['block-a', 'block-b']),
      values: [{ propertyId: 'p', spaceId: SPACE, type: 'TEXT', before: null, after: 'x', diff: [] }],
      relations: [{ relationId: 'r', typeId: 't', spaceId: SPACE, changeType: 'ADD', after: { toEntityId: 'target' } }],
    };

    expect(countEntityChanges(entity)).toBe(4);
  });

  it('counts a block once however many words moved inside it', () => {
    const entity: EntityDiff = {
      ...diff('parent'),
      blocks: [
        {
          id: 'block-a',
          type: 'textBlock',
          before: 'a',
          after: 'b',
          diff: [{ value: 'a', removed: true }, { value: 'b', added: true }, { value: ' rest' }],
        },
      ],
    };

    expect(countEntityChanges(entity)).toBe(1);
  });

  it('counts a newly added data block once, not once per config write', () => {
    // Adding a table writes its name, view and source together. The viewer did one thing.
    const entity: EntityDiff = {
      ...diff('parent'),
      blocks: [
        {
          id: 'block-a',
          type: 'dataBlock',
          before: null,
          after: 'AAA',
          values: [{ propertyId: 'p', spaceId: SPACE, type: 'TEXT', before: null, after: 'x', diff: [] }],
          relations: [
            { relationId: 'r', typeId: 't', spaceId: SPACE, changeType: 'ADD', after: { toEntityId: 'view' } },
          ],
        },
      ],
    };

    expect(countEntityChanges(entity)).toBe(1);
  });

  it('counts an edited data block once — it is still one panel below', () => {
    const entity: EntityDiff = {
      ...diff('parent'),
      blocks: [
        {
          id: 'block-a',
          type: 'dataBlock',
          before: 'existing',
          after: 'x',
          values: [{ propertyId: 'p', spaceId: SPACE, type: 'TEXT', before: null, after: 'x', diff: [] }],
          relations: [
            { relationId: 'r', typeId: 't', spaceId: SPACE, changeType: 'ADD', after: { toEntityId: 'target' } },
          ],
        },
      ],
    };

    expect(countEntityChanges(entity)).toBe(1);
  });

  it('counts nothing for a row with no changes', () => {
    expect(countEntityChanges(diff('parent'))).toBe(0);
  });
});

describe('collectCandidateEntityIds', () => {
  it('names the row, its folded blocks, its relation entities and every relation target', () => {
    const relations = [blocksRelation('parent', 'block-a'), relation('parent', 'target', { entityId: 'rel-entity' })];
    const index = buildOwnershipIndex([diff('parent', ['block-a'])], relations);

    const candidates = collectCandidateEntityIds(index, relations);

    expect(candidates).toEqual(new Set(['parent', 'block-a', 'blocks-rel-parent-block-a', 'rel-entity', 'target']));
  });

  /** Relation targets must be candidates too — else discarded existing entities look "new". */
  it('includes a target no row owns, so the graph check can answer for it', () => {
    const relations = [relation('holder', 'somewhere-else')];
    const index = buildOwnershipIndex([diff('holder')], relations);

    expect(index.ownerOf.has('somewhere-else')).toBe(false);
    expect(collectCandidateEntityIds(index, relations).has('somewhere-else')).toBe(true);
  });

  it('covers every id the dependency checks actually ask about', () => {
    const relations = [relation('holder', 'fresh'), relation('holder', 'outside')];
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);
    const candidates = collectCandidateEntityIds(index, relations);

    const asked: string[] = [];
    const record = (id: string) => {
      asked.push(id);
      return true;
    };

    getDeselectionBlockers(index, new Set(['holder', 'fresh']), relations, record);
    findDanglingDependencies(index, new Set(['holder']), relations, record);

    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(id => candidates.has(id))).toBe(true);
  });
});

describe('buildIsNewEntity', () => {
  const local = <T extends Value | Relation>(record: T): T => ({ ...record, isLocal: true, hasBeenPublished: false });

  it('calls an entity new when every trace of it is an unpublished local write', () => {
    const isNew = buildIsNewEntity([local(value('fresh'))], []);

    expect(isNew('fresh')).toBe(true);
  });

  it('calls an entity established once it holds anything from the graph', () => {
    const isNew = buildIsNewEntity([value('existing')], []);

    expect(isNew('existing')).toBe(false);
  });

  it('treats a local write that has already been published as established', () => {
    const published: Value = { ...value('published'), isLocal: true, hasBeenPublished: true };

    expect(buildIsNewEntity([published], [])('published')).toBe(false);
  });

  it('reads a published relation as proof that both of its ends exist', () => {
    const isNew = buildIsNewEntity([], [relation('from', 'to')]);

    expect(isNew('from')).toBe(false);
    expect(isNew('to')).toBe(false);
  });

  it('does not let an unpublished relation vouch for its ends', () => {
    const isNew = buildIsNewEntity([], [local(relation('from', 'to'))]);

    expect(isNew('from')).toBe(true);
    expect(isNew('to')).toBe(true);
  });

  it('calls an entity it has never heard of new', () => {
    expect(buildIsNewEntity([], [])('unknown')).toBe(true);
  });

  /** Pending-only arrays mark everything new — the footgun at the call site. */
  it('finds nothing established when given only pending writes', () => {
    const pendingOnly = [local(value('a')), local(value('b'))];

    const isNew = buildIsNewEntity(pendingOnly, []);

    expect(isNew('a')).toBe(true);
    expect(isNew('b')).toBe(true);
  });
});

describe('getDeselectionBlockers', () => {
  it('refuses to let a new entity go while a selected row still points at it', () => {
    const relations = [relation('holder', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);

    const blockers = getDeselectionBlockers(index, new Set(['holder', 'fresh']), relations, always);

    expect(blockers.get('fresh')).toEqual(['holder']);
    expect(blockers.has('holder')).toBe(false);
  });

  it('leaves a target alone once the row pointing at it is already deselected', () => {
    const relations = [relation('holder', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);

    expect(getDeselectionBlockers(index, new Set(['fresh']), relations, always).size).toBe(0);
  });

  it('does not block on a target that already exists on the graph', () => {
    const relations = [relation('holder', 'existing')];
    const index = buildOwnershipIndex([diff('holder'), diff('existing')], relations);

    expect(getDeselectionBlockers(index, new Set(['holder', 'existing']), relations, never).size).toBe(0);
  });

  it('names every selected row holding the same target', () => {
    const relations = [relation('b', 'fresh'), relation('a', 'fresh')];
    const index = buildOwnershipIndex([diff('a'), diff('b'), diff('fresh')], relations);

    const blockers = getDeselectionBlockers(index, new Set(['a', 'b', 'fresh']), relations, always);

    expect(blockers.get('fresh')).toEqual(['a', 'b']);
  });

  it('does not block a row on account of its own blocks', () => {
    const relations = [blocksRelation('parent', 'block-a'), relation('block-a', 'parent')];
    const index = buildOwnershipIndex([diff('parent', ['block-a'])], relations);

    expect(getDeselectionBlockers(index, new Set(['parent']), relations, always).size).toBe(0);
  });

  /**
   * The two functions are complements, and between them nothing slips through: whatever the UI
   * refuses to deselect is exactly what would have been reported as dangling had it gone ahead.
   */
  it('blocks precisely what would otherwise publish as dangling', () => {
    const relations = [relation('holder', 'fresh')];
    const index = buildOwnershipIndex([diff('holder'), diff('fresh')], relations);

    const blocked = getDeselectionBlockers(index, new Set(['holder', 'fresh']), relations, always);
    const wouldDangle = findDanglingDependencies(index, new Set(['holder']), relations, always);

    expect([...blocked.keys()]).toEqual(wouldDangle.map(d => d.entityId));
    expect(blocked.get('fresh')).toEqual(wouldDangle[0].requiredBy);
  });
});

describe('findDanglingDependencies', () => {
  it('reports a new entity that a selected row still points at', () => {
    const relations = [relation('kept', 'fresh')];
    const index = buildOwnershipIndex([diff('kept'), diff('fresh')], relations);

    const dangling = findDanglingDependencies(index, new Set(['kept']), relations, always);

    expect(dangling).toEqual([{ entityId: 'fresh', requiredBy: ['kept'] }]);
  });

  it('says nothing about a target that already exists on the graph', () => {
    // Existing graph entities cannot dangle.
    const relations = [relation('kept', 'existing')];
    const index = buildOwnershipIndex([diff('kept'), diff('existing')], relations);

    expect(findDanglingDependencies(index, new Set(['kept']), relations, never)).toEqual([]);
  });

  it('says nothing while both ends are still selected', () => {
    const relations = [relation('kept', 'fresh')];
    const index = buildOwnershipIndex([diff('kept'), diff('fresh')], relations);

    expect(findDanglingDependencies(index, new Set(['kept', 'fresh']), relations, always)).toEqual([]);
  });

  it('ignores a relation held by a row that is itself deselected', () => {
    const relations = [relation('dropped', 'fresh')];
    const index = buildOwnershipIndex([diff('dropped'), diff('fresh')], relations);

    expect(findDanglingDependencies(index, new Set(), relations, always)).toEqual([]);
  });

  it('names every selected row that needs the same held-back entity', () => {
    const relations = [relation('a', 'fresh'), relation('b', 'fresh')];
    const index = buildOwnershipIndex([diff('a'), diff('b'), diff('fresh')], relations);

    const dangling = findDanglingDependencies(index, new Set(['a', 'b']), relations, always);

    expect(dangling).toEqual([{ entityId: 'fresh', requiredBy: ['a', 'b'] }]);
  });

  it('does not report a block pointing at its own parent’s subtree', () => {
    const relations = [blocksRelation('parent', 'block-a'), relation('block-a', 'parent')];
    const index = buildOwnershipIndex([diff('parent', ['block-a'])], relations);

    expect(findDanglingDependencies(index, new Set(['parent']), relations, always)).toEqual([]);
  });
});
