import { getClaimSources } from './claims/browse/claim-sources';
import { isDebateEntity } from './debates/is-debate-entity';
import type { Entity } from './types';
import { entityBrowseViewFromTypes } from './utils/entity-browse-view';

export function entityActionScope(entity: Entity | null | undefined) {
  if (!entity) return {};
  const targetType = isDebateEntity(entity.types) ? 'debate' : (entityBrowseViewFromTypes(entity.types) ?? 'entity');
  return {
    target_id: entity.id,
    target_type: targetType,
    target_type_ids: entity.types.map(type => type.id),
    origin_entity_ids: getClaimSources(entity.relations).map(source => source.id),
  };
}
