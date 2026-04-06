import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { produce } from 'immer';
import { Effect } from 'effect';

import { getBatchEntities, getProperties } from '~/core/io/queries';
import { GeoStore } from '~/core/sync/store';
import { ID } from '~/core/id';
import type { DataType, Entity, Property, Relation, RenderableEntityType, Value } from '~/core/types';
import type {
  BlockChange,
  DataBlockChange,
  DiffChunk,
  EntityDiff,
  RelationChange,
  TextBlockChange,
  TextValueChange,
  ValueChange,
} from '~/core/utils/diff/types';

const {
  IMAGE_TYPE,
  IMAGE_BLOCK,
  VIDEO_TYPE,
  VIDEO_BLOCK,
  DATA_BLOCK,
  TEXT_BLOCK,
  NAME_PROPERTY,
  MARKDOWN_CONTENT,
  IMAGE_URL_PROPERTY,
  BLOCKS,
} = SystemIds;

const ENTITY_GRAPHQL_BATCH = 64;

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
    t === 'EMBEDDING' ||
    t === 'RECT' ||
    t === 'JSON'
  ) {
    return t as DataType;
  }
  return 'TEXT';
}

function textAfterFromDiffChunks(chunks: DiffChunk[]): string {
  return chunks.filter(c => !c.removed).map(c => c.value).join('');
}

function resolvedScalarAfter(vc: ValueChange): string | null {
  if (vc.after != null) return vc.after;
  if (vc.type === 'TEXT') {
    const d = (vc as TextValueChange).diff;
    if (d?.length) return textAfterFromDiffChunks(d);
  }
  return null;
}

function getEntityFromMap(map: Map<string, Entity>, id: string): Entity | undefined {
  return map.get(ID.uuidToHex(id));
}

function wireEntityId(diffEntityId: string, remote: Entity | undefined): string {
  return remote?.id ?? diffEntityId;
}

function isValidGraphQlUuid(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const h = id.replace(/-/g, '');
  return h.length === 32 && /^[0-9a-f]+$/i.test(h);
}

async function fetchEntitiesInBatches(ids: string[], spaceId: string): Promise<Entity[]> {
  if (ids.length === 0) return [];
  const out: Entity[] = [];
  for (let i = 0; i < ids.length; i += ENTITY_GRAPHQL_BATCH) {
    const chunk = ids.slice(i, i + ENTITY_GRAPHQL_BATCH);
    const batch = await Effect.runPromise(getBatchEntities(chunk, spaceId));
    out.push(...batch);
  }
  return out;
}

function propertyForValueChange(vc: ValueChange, fromMap: Map<string, Property | undefined>) {
  const fromApi = fromMap.get(ID.uuidToHex(vc.propertyId));
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
  const nameVal = entity.values.find(v => ID.equals(v.property.id, NAME_PROPERTY));
  return nameVal?.value ?? entity.name ?? null;
}

function relationEntityIdForPublish(relationId: string, remote: Relation | undefined): string {
  const eid = remote?.entityId;
  if (eid && eid !== relationId) {
    return eid;
  }
  return ID.createEntityId();
}

type BuildRelationOptions = {
  renderableTypeOverride?: RenderableEntityType;
  toEntityValueHint?: string | null;
};

function buildRelationFromChange(
  rc: RelationChange,
  fromEntityId: string,
  fromEntityName: string | null,
  remoteRelation: Relation | undefined,
  toEntity: Entity | undefined,
  after: NonNullable<RelationChange['after']>,
  options?: BuildRelationOptions
): Relation {
  const name = resolveToEntityName(toEntity) ?? after.toEntityName ?? null;
  const imageUrlTrimmed = after.imageUrl?.trim() ?? '';
  const videoUrlTrimmed = after.videoUrl?.trim() ?? '';
  const mediaFromAfter = imageUrlTrimmed || videoUrlTrimmed || '';
  const rt =
    options?.renderableTypeOverride ??
    (imageUrlTrimmed ? 'IMAGE' : videoUrlTrimmed ? 'VIDEO' : renderableTypeForToEntity(toEntity));
  const valueStr =
    mediaFromAfter ||
    (rt === 'IMAGE' || rt === 'VIDEO'
      ? options?.toEntityValueHint?.trim() ||
        toEntity?.values.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'))?.value ||
        after.toEntityId
      : after.toEntityId);

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

function looksLikeStandaloneMediaUrl(s: string): boolean {
  const t = s.trim();
  if (t.startsWith('ipfs://')) return true;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    if (/\/ipfs\//i.test(t)) return true;
    return /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|m4v|ogv)(\?|$)/i.test(t);
  }
  return false;
}

function effectiveBlockRenderableAndUrl(block: BlockChange): {
  renderableType: RenderableEntityType;
  imageOrVideoUrl: string | null;
  textMarkdown: string | null;
} {
  if (block.type === 'dataBlock') {
    return { renderableType: 'DATA', imageOrVideoUrl: null, textMarkdown: null };
  }
  if (block.type === 'imageBlock') {
    const url = block.after ?? block.before;
    return {
      renderableType: 'IMAGE',
      imageOrVideoUrl: url && url !== '' ? url : null,
      textMarkdown: null,
    };
  }
  if (block.type === 'videoBlock') {
    const url = block.after ?? block.before;
    return {
      renderableType: 'VIDEO',
      imageOrVideoUrl: url && url !== '' ? url : null,
      textMarkdown: null,
    };
  }
  const tb = block as TextBlockChange;
  const content =
    tb.after ?? tb.before ?? (tb.type === 'textBlock' && tb.diff?.length ? textAfterFromDiffChunks(tb.diff) : null);
  if (content !== null && looksLikeStandaloneMediaUrl(content)) {
    return {
      renderableType: 'IMAGE',
      imageOrVideoUrl: content.trim(),
      textMarkdown: null,
    };
  }
  return {
    renderableType: 'TEXT',
    imageOrVideoUrl: null,
    textMarkdown: content,
  };
}

function collectBlockFetchIds(block: BlockChange, entityIds: Set<string>, propertyIds: Set<string>): void {
  entityIds.add(block.id);
  switch (block.type) {
    case 'textBlock':
      propertyIds.add(MARKDOWN_CONTENT);
      propertyIds.add(IMAGE_URL_PROPERTY);
      propertyIds.add(NAME_PROPERTY);
      return;
    case 'imageBlock':
    case 'videoBlock':
      propertyIds.add(IMAGE_URL_PROPERTY);
      propertyIds.add(NAME_PROPERTY);
      return;
    case 'dataBlock': {
      const b = block as DataBlockChange;
      propertyIds.add(NAME_PROPERTY);
      for (const v of b.values ?? []) propertyIds.add(v.propertyId);
      for (const r of b.relations ?? []) {
        propertyIds.add(r.typeId);
        if (r.before?.toEntityId) entityIds.add(r.before.toEntityId);
        if (r.after?.toEntityId) entityIds.add(r.after.toEntityId);
      }
      return;
    }
    default:
      return;
  }
}

function materializeValueChanges(
  entityId: string,
  entityName: string | null,
  values: ValueChange[],
  remoteEntity: Entity | undefined,
  propertyById: Map<string, Property | undefined>,
  outValues: Value[]
): void {
  for (const vc of values) {
    const prop = propertyForValueChange(vc, propertyById);
    const remoteValue = remoteEntity?.values.find(
      v => ID.equals(v.property.id, vc.propertyId) && v.spaceId === vc.spaceId
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

    const afterScalar = resolvedScalarAfter(vc);
    if (afterScalar !== null) {
      const id = ID.createValueId({
        entityId,
        propertyId: vc.propertyId,
        spaceId: vc.spaceId,
      });
      outValues.push({
        id: remoteValue?.id ?? id,
        entity: { id: entityId, name: entityName ?? remoteEntity?.name ?? null },
        property: prop,
        spaceId: vc.spaceId,
        value: afterScalar,
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: false,
      });
    }
  }
}

function materializeRelationChanges(
  entityId: string,
  entityName: string | null,
  relations: RelationChange[],
  remoteEntity: Entity | undefined,
  entityById: Map<string, Entity>,
  propertyById: Map<string, Property | undefined>,
  spaceId: string,
  outValues: Value[],
  outRelations: Relation[]
): void {
  for (const rc of relations) {
    const remoteRel = remoteEntity?.relations.find(r => ID.equals(r.id, rc.relationId));

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
      const injectedMedia = rc.after.imageUrl?.trim() || rc.after.videoUrl?.trim() || '';
      if (injectedMedia) {
        const remoteTo = getEntityFromMap(entityById, rc.after.toEntityId);
        const toWiredId = wireEntityId(rc.after.toEntityId, remoteTo);
        materializeValueChanges(
          toWiredId,
          resolveToEntityName(remoteTo) ?? rc.after.toEntityName ?? null,
          [
            {
              propertyId: IMAGE_URL_PROPERTY,
              propertyName: null,
              spaceId,
              type: 'TEXT',
              before: null,
              after: injectedMedia,
              diff: [],
            } as TextValueChange,
          ],
          remoteTo,
          propertyById,
          outValues
        );
      }

      const toEnt = getEntityFromMap(entityById, rc.after.toEntityId);
      outRelations.push(
        buildRelationFromChange(rc, entityId, entityName ?? remoteEntity?.name ?? null, remoteRel, toEnt, rc.after)
      );
    }
  }
}

function materializeBlockChanges(
  ed: EntityDiff,
  spaceId: string,
  entityById: Map<string, Entity>,
  propertyById: Map<string, Property | undefined>,
  outValues: Value[],
  outRelations: Relation[]
): void {
  if (!ed.blocks?.length) return;

  const remoteParent = getEntityFromMap(entityById, ed.entityId);
  const parentId = wireEntityId(ed.entityId, remoteParent);

  for (const block of ed.blocks) {
    const remoteBlock = getEntityFromMap(entityById, block.id);
    const blockEntityId = wireEntityId(block.id, remoteBlock);
    const blockDisplayName = remoteBlock?.name ?? null;

    const eff =
      block.type === 'dataBlock'
        ? { renderableType: 'DATA' as RenderableEntityType, imageOrVideoUrl: null, textMarkdown: null }
        : effectiveBlockRenderableAndUrl(block);

    if (block.type === 'dataBlock') {
      const b = block as DataBlockChange;
      const values: ValueChange[] = [...(b.values ?? [])];
      const nameAfter = b.after ?? b.before;
      if (nameAfter !== null) {
        values.unshift({
          propertyId: NAME_PROPERTY,
          propertyName: null,
          spaceId,
          type: 'TEXT',
          before: null,
          after: nameAfter,
          diff: [],
        } as TextValueChange);
      }
      materializeValueChanges(
        blockEntityId,
        b.blockName ?? blockDisplayName,
        values,
        remoteBlock,
        propertyById,
        outValues
      );
      materializeRelationChanges(
        blockEntityId,
        b.blockName ?? blockDisplayName,
        b.relations ?? [],
        remoteBlock,
        entityById,
        propertyById,
        spaceId,
        outValues,
        outRelations
      );
    } else if (eff.renderableType === 'TEXT' && eff.textMarkdown !== null) {
      materializeValueChanges(
        blockEntityId,
        blockDisplayName,
        [
          {
            propertyId: MARKDOWN_CONTENT,
            propertyName: null,
            spaceId,
            type: 'TEXT',
            before: null,
            after: eff.textMarkdown,
            diff: [],
          } as TextValueChange,
        ],
        remoteBlock,
        propertyById,
        outValues
      );
    } else if (eff.renderableType === 'IMAGE' || eff.renderableType === 'VIDEO') {
      const remoteMedia = remoteBlock?.values.find(v => ID.equals(v.property.id, IMAGE_URL_PROPERTY))?.value;
      const mediaUrl =
        (eff.imageOrVideoUrl && eff.imageOrVideoUrl !== '' ? eff.imageOrVideoUrl : null) ??
        (typeof remoteMedia === 'string' && remoteMedia !== '' ? remoteMedia : null);
      if (mediaUrl) {
        materializeValueChanges(
          blockEntityId,
          blockDisplayName,
          [
            {
              propertyId: IMAGE_URL_PROPERTY,
              propertyName: null,
              spaceId,
              type: 'TEXT',
              before: null,
              after: mediaUrl,
              diff: [],
            } as TextValueChange,
          ],
          remoteBlock,
          propertyById,
          outValues
        );
      }
    }

    const remoteBlocksRel = remoteParent?.relations.find(
      r => ID.equals(r.type.id, BLOCKS) && ID.equals(r.toEntity.id, block.id)
    );

    const rc: RelationChange = {
      relationId: remoteBlocksRel?.id ?? IdUtils.generate(),
      typeId: BLOCKS,
      spaceId,
      changeType: 'ADD',
      before: null,
      after: {
        toEntityId: blockEntityId,
        toSpaceId: null,
        position: remoteBlocksRel?.position ?? null,
      },
    };

    if (rc.after) {
      const mediaHint =
        eff.renderableType === 'IMAGE' || eff.renderableType === 'VIDEO' ? eff.imageOrVideoUrl : undefined;

      outRelations.push(
        buildRelationFromChange(
          rc,
          parentId,
          ed.name ?? remoteParent?.name ?? null,
          remoteBlocksRel,
          getEntityFromMap(entityById, block.id),
          rc.after,
          {
            renderableTypeOverride: eff.renderableType,
            toEntityValueHint: mediaHint ?? undefined,
          }
        )
      );
    }
  }
}

export async function applyEntityDiffsToLocalStore(entityDiffs: EntityDiff[], spaceId: string, store: GeoStore): Promise<void> {
  if (entityDiffs.length === 0) return;

  const propertyIds = new Set<string>();
  const entityIds = new Set<string>();
  let hasBlocks = false;

  for (const ed of entityDiffs) {
    entityIds.add(ed.entityId);
    for (const v of ed.values) propertyIds.add(v.propertyId);
    for (const r of ed.relations) {
      if (r.before?.toEntityId) entityIds.add(r.before.toEntityId);
      if (r.after?.toEntityId) entityIds.add(r.after.toEntityId);
    }
    for (const block of ed.blocks ?? []) {
      hasBlocks = true;
      collectBlockFetchIds(block, entityIds, propertyIds);
    }
  }

  if (hasBlocks) {
    propertyIds.add(BLOCKS);
  }

  const validEntityIds = [...entityIds].filter(isValidGraphQlUuid);
  const validPropertyIds = [...propertyIds].filter(isValidGraphQlUuid);

  const [remoteEntities, properties] = await Promise.all([
    fetchEntitiesInBatches(validEntityIds, spaceId),
    validPropertyIds.length > 0 ? Effect.runPromise(getProperties(validPropertyIds)) : Promise.resolve([]),
  ]);

  const entityById = new Map(remoteEntities.map(e => [ID.uuidToHex(e.id), e]));
  const propertyById = new Map(properties.map(p => [ID.uuidToHex(p.id), p]));

  const outValues: Value[] = [];
  const outRelations: Relation[] = [];

  for (const ed of entityDiffs) {
    const remoteEntity = getEntityFromMap(entityById, ed.entityId);
    const pageId = wireEntityId(ed.entityId, remoteEntity);
    materializeValueChanges(pageId, ed.name ?? remoteEntity?.name ?? null, ed.values, remoteEntity, propertyById, outValues);
    materializeRelationChanges(
      pageId,
      ed.name ?? remoteEntity?.name ?? null,
      ed.relations,
      remoteEntity,
      entityById,
      propertyById,
      spaceId,
      outValues,
      outRelations
    );
  }

  for (const ed of entityDiffs) {
    materializeBlockChanges(ed, spaceId, entityById, propertyById, outValues, outRelations);
  }

  if (outValues.length > 0) {
    store.setValues(outValues);
  }
  if (outRelations.length > 0) {
    store.setRelations(outRelations);
  }
}
