import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { storage } from '~/core/sync/use-mutate';
import { store } from '~/core/sync/use-sync-engine';
import type { Relation } from '~/core/types';

import type { SerializedOp } from './inject-types';

/**
 * Where a pasted link was added from, so the source it becomes is linked back to that page
 * (GEO-3819). Without it the source lands in the space but never shows in the section whose `+`
 * the reader pressed.
 *
 * The relation is the one that page's section reads:
 * - `target-to-source`: page --property--> source (a News story's, Claim's, Event's or Post's
 *   `Sources`).
 * - `source-to-target`: source --property--> page (a Topic's "Sources & evidence" lists entities
 *   whose `Topics` point at the topic).
 */
export type IngestionLink = {
  targetEntityId: string;
  targetEntityName: string | null;
  propertyId: string;
  propertyName: string;
  direction: 'target-to-source' | 'source-to-target';
};

function quoteName(link: IngestionLink): string {
  return link.targetEntityName ? `"${link.targetEntityName}"` : 'the page I added it from';
}

/**
 * The extra ask for the chat-driven ingestion, which stages entities through the agent's own tool
 * calls: the client never learns the new entity's id, so the agent makes the link itself.
 */
export function ingestionLinkInstruction(link: IngestionLink): string {
  const relation =
    link.direction === 'target-to-source'
      ? `fromEntityId \`${link.targetEntityId}\`, typeId \`${link.propertyId}\` (${link.propertyName}), toEntityId = the new entity`
      : `fromEntityId = the new entity, typeId \`${link.propertyId}\` (${link.propertyName}), toEntityId \`${link.targetEntityId}\``;
  return `Then add the main entity you create as a source of ${quoteName(link)} with setEntityRelation (${relation}).`;
}

/** The message that starts a chat-driven ingestion, with the link-back ask when there is one. */
export function ingestionPromptText(url: string, link?: IngestionLink | null): string {
  // Backtick-wrap the URL so markdown doesn't mangle special chars.
  const base = `Please ingest this URL into this space and stage the entities: \`${url}\``;
  return link ? `${base}. ${ingestionLinkInstruction(link)}` : base;
}

/**
 * The relation that links an injected source to the page it was added from, or null when there is
 * nothing to add: the source is the page itself (an enrich of that same story), or the inject batch
 * or the graph already has the same link. An enrich of a source the page already lists restates
 * neither, so `existingRelations` is what stops a second, duplicate Sources / Topics relation.
 */
export function buildIngestionLinkRelation({
  link,
  sourceEntityId,
  sourceEntityName,
  spaceId,
  ops = [],
  existingRelations = [],
}: {
  link: IngestionLink;
  sourceEntityId: string;
  sourceEntityName: string | null;
  spaceId: string;
  ops?: readonly SerializedOp[];
  existingRelations?: readonly Relation[];
}): Relation | null {
  if (ID.equals(sourceEntityId, link.targetEntityId)) return null;

  const from =
    link.direction === 'target-to-source'
      ? { id: link.targetEntityId, name: link.targetEntityName }
      : { id: sourceEntityId, name: sourceEntityName };
  const to =
    link.direction === 'target-to-source'
      ? { id: sourceEntityId, name: sourceEntityName }
      : { id: link.targetEntityId, name: link.targetEntityName };

  const alreadyLinked =
    ops.some(
      op =>
        op.type === 'createRelation' &&
        ID.equals(op.relationType, link.propertyId) &&
        ID.equals(op.from, from.id) &&
        ID.equals(op.to, to.id)
    ) ||
    existingRelations.some(
      relation =>
        !relation.isDeleted &&
        ID.equals(relation.type.id, link.propertyId) &&
        ID.equals(relation.fromEntity.id, from.id) &&
        ID.equals(relation.toEntity.id, to.id)
    );
  if (alreadyLinked) return null;

  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
    type: { id: link.propertyId, name: link.propertyName },
    fromEntity: from,
    toEntity: { ...to, value: to.id },
  };
}

/**
 * Once an inject's ops are applied: stage the relation that links its primary entity back to the
 * page the link was added from (GEO-3819), unless the batch or the store already has it.
 */
export function stageIngestionLink({
  link,
  primaryEntityId,
  primaryEntityName,
  spaceId,
  ops,
}: {
  link: IngestionLink;
  primaryEntityId: string | null;
  primaryEntityName: string | null;
  spaceId: string;
  ops: readonly SerializedOp[];
}): Relation | null {
  if (!primaryEntityId) return null;
  const fromId = link.direction === 'target-to-source' ? link.targetEntityId : primaryEntityId;
  const toId = link.direction === 'target-to-source' ? primaryEntityId : link.targetEntityId;
  const relation = buildIngestionLinkRelation({
    link,
    sourceEntityId: primaryEntityId,
    sourceEntityName: primaryEntityName,
    spaceId,
    ops,
    existingRelations: [...store.getResolvedRelations(fromId), ...store.getRelationsToEntity(toId)],
  });
  if (relation) storage.relations.set(relation);
  return relation;
}
