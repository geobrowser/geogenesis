import { EntityId, SubstreamSearchResult, SubstreamType } from '../schema';
import { SpaceConfigEntity, SpaceMetadataDto } from './spaces';

export type SearchResult = {
  id: EntityId;
  name: string | null;
  description: string | null;
  spaces: Array<SpaceConfigEntity>;
  types: Array<SubstreamType>;
};

export function SearchResultDto(result: SubstreamSearchResult): SearchResult {
  const spaces = result.entitySpaces.nodes.flatMap(result =>
    SpaceMetadataDto(result.space.id, result.space.spacesMetadata.nodes[0]?.entity)
  );

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    types: result.entityTypes.nodes.map(t => t.type),
    spaces,
  };
}
