import { Position, SystemIds } from '@geoprotocol/geo-sdk';

import { produce } from 'immer';
import { Effect } from 'effect';

import { getBatchEntities, getProperties } from '~/core/io/queries';
import { GeoStore } from '~/core/sync/store';
import { ID } from '~/core/id';
import type { DataType, Entity, Property, Relation, RenderableEntityType, Value } from '~/core/types';
import type { EntityDiff, RelationChange, ValueChange } from '~/core/utils/diff/types';

const {
  IMAGE_TYPE,
  IMAGE_BLOCK,
  VIDEO_TYPE,
  VIDEO_BLOCK,
  DATA_BLOCK,
  TEXT_BLOCK,
  NAME_PROPERTY,
} = SystemIds;

function valueChangeToDataType(vc: ValueChange): DataType {
  if (vc.type === 'TEXT') return 'TEXT';
  const t = vc.type as string;
  if (
    t === 'INTEGER' ||
    t === 'FLOAT' ||
    t === 'DECIMAL' ||
    t === 'BOOLEAN' ||
    t === 'DATE' ||
    t === 'DATETIME' ||
    t === 'TIME' ||
    t === 'POINT' ||
    t === 'BYTES' ||
    t === 'SCHEDULE' ||
    t === 'EMBEDDING'
  ) {
    return t as DataType;
  }
  return 'TEXT';
}

function propertyForValueChange(vc: ValueChange, fromMap: Map<string, Property | undefined>) {
  const fromApi = fromMap.get(vc.propertyId);
  if (fromApi) return fromApi;
  return {
    id: vc.propertyId,
    name: 'propertyName' in vc ? vc.propertyName ?? null : null,
    dataType: valueChangeToDataType(vc),
  };
}

function renderableTypeForToEntity(entity: Entity | undefined): RenderableEntityType {
  if (!entity) return 'RELATION';
  const typeIds = entity.types.map(t => t.id);
  const imageHex = IMAGE_TYPE.replace(/-/g, '');
  const videoHex = VIDEO_TYPE.replace(/-/g, '');
  const videoBlockHex = VIDEO_BLOCK.replace(/-/g, '');
  const dataHex = DATA_BLOCK.replace(/-/g, '');
  const textHex = TEXT_BLOCK.replace(/-/g, '');
  const imageBlockHex = IMAGE_BLOCK.replace(/-/g, '');

  if (typeIds.includes(imageHex) || typeIds.includes(imageBlockHex)) return 'IMAGE';
  if (typeIds.includes(videoHex) || typeIds.includes(videoBlockHex)) return 'VIDEO';
  if (typeIds.includes(dataHex)) return 'DATA';
  if (typeIds.includes(textHex)) return 'TEXT';
  return 'RELATION';
}

function resolveToEntityName(entity: Entity | undefined): string | null {
  if (!entity) return null;
  const nameVal = entity.values.find(v => v.property.id === NAME_PROPERTY);
  return nameVal?.value ?? entity.name ?? null;
}

function relationEntityIdForPublish(relationId: string, remote: Relation | undefined): string {
  const eid = remote?.entityId;
  if (eid && eid !== relationId) {
    return eid;
  }
  return ID.createEntityId();
}

function buildRelationFromChange(
  rc: RelationChange,
  fromEntityId: string,
  fromEntityName: string | null,
  remoteRelation: Relation | undefined,
  toEntity: Entity | undefined,
  after: NonNullable<RelationChange['after']>
): Relation {
  const name = resolveToEntityName(toEntity) ?? after.toEntityName ?? null;
  const rt = renderableTypeForToEntity(toEntity);
  const valueStr =
    rt === 'IMAGE' || rt === 'VIDEO'
      ? toEntity?.values.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'))?.value ?? after.toEntityId
      : after.toEntityId;

  return {
    id: rc.relationId,
    entityId: relationEntityIdForPublish(rc.relationId, remoteRelation),
    spaceId: rc.spaceId,
    type: {
      id: rc.typeId,
      name: rc.typeName ?? null,
    },
    fromEntity: {
      id: fromEntityId,
      name: fromEntityName,
    },
    toEntity: {
      id: after.toEntityId,
      name: name,
      value: valueStr,
    },
    position: after.position ?? (remoteRelation?.position ?? Position.generate()),
    toSpaceId: after.toSpaceId ?? undefined,
    verified: remoteRelation?.verified ?? false,
    renderableType: rt,
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
  };
}

/**
 * Materializes proposal {@link EntityDiff}s as unpublished local values/relations so the
 * review-edits flow matches freshly made edits.
 */
export async function applyEntityDiffsToLocalStore(entityDiffs: EntityDiff[], spaceId: string, store: GeoStore): Promise<void> {
  if (entityDiffs.length === 0) return;

  const propertyIds = new Set<string>();
  const entityIds = new Set<string>();

  for (const ed of entityDiffs) {
    entityIds.add(ed.entityId);
    for (const v of ed.values) propertyIds.add(v.propertyId);
    for (const r of ed.relations) {
      if (r.before?.toEntityId) entityIds.add(r.before.toEntityId);
      if (r.after?.toEntityId) entityIds.add(r.after.toEntityId);
    }
  }

  const [remoteEntities, properties] = await Promise.all([
    Effect.runPromise(getBatchEntities([...entityIds], spaceId)),
    propertyIds.size > 0 ? Effect.runPromise(getProperties([...propertyIds])) : Promise.resolve([]),
  ]);

  const entityById = new Map(remoteEntities.map(e => [e.id, e]));
  const propertyById = new Map(properties.map(p => [p.id, p]));

  const outValues: Value[] = [];
  const outRelations: Relation[] = [];

  for (const ed of entityDiffs) {
    const remoteEntity = entityById.get(ed.entityId);

    for (const vc of ed.values) {
      const prop = propertyForValueChange(vc, propertyById);
      const remoteValue = remoteEntity?.values.find(
        v => v.property.id === vc.propertyId && v.spaceId === vc.spaceId
      );

      if (vc.after === null && vc.before !== null) {
        if (remoteValue) {
          outValues.push(
            produce(remoteValue, draft => {
              draft.isDeleted = true;
              draft.isLocal = true;
              draft.hasBeenPublished = false;
            })
          );
        }
        continue;
      }

      if (vc.after !== null) {
        const id = ID.createValueId({
          entityId: ed.entityId,
          propertyId: vc.propertyId,
          spaceId: vc.spaceId,
        });
        outValues.push({
          id: remoteValue?.id ?? id,
          entity: { id: ed.entityId, name: ed.name ?? remoteEntity?.name ?? null },
          property: prop,
          spaceId: vc.spaceId,
          value: vc.after,
          isLocal: true,
          hasBeenPublished: false,
          isDeleted: false,
        });
      }
    }

    for (const rc of ed.relations) {
      const remoteRel = remoteEntity?.relations.find(r => r.id === rc.relationId);

      if (rc.changeType === 'REMOVE' || (rc.before && !rc.after)) {
        if (remoteRel) {
          outRelations.push(
            produce(remoteRel, draft => {
              draft.isDeleted = true;
              draft.isLocal = true;
              draft.hasBeenPublished = false;
            })
          );
        }
        continue;
      }

      if (rc.after) {
        const toEnt = entityById.get(rc.after.toEntityId);
        outRelations.push(
          buildRelationFromChange(rc, ed.entityId, ed.name ?? remoteEntity?.name ?? null, remoteRel, toEnt, rc.after)
        );
      }
    }
  }

  if (outValues.length > 0) {
    store.setValues(outValues);
  }
  if (outRelations.length > 0) {
    store.setRelations(outRelations);
  }
}
