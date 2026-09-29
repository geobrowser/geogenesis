import { getClaimSources } from './claims/browse/claim-sources';
import { isDebateEntity } from './debates/is-debate-entity';
import type { Entity } from './types';
import { entityBrowseViewFromTypes } from './utils/entity-browse-view';

export function entityActionType(types: Entity['types']) {
  return isDebateEntity(types) ? 'debate' : (entityBrowseViewFromTypes(types) ?? 'entity');
}

export function entityActionScope(entity: Entity | null | undefined) {
  if (!entity) return {};
  const targetType = entityActionType(entity.types);
  return {
    target_id: entity.id,
    target_type: targetType,
    target_type_ids: entity.types.map(type => type.id),
    origin_entity_ids: getClaimSources(entity.relations).map(source => source.id),
  };
}
