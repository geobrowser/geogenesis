import { EntityId, SubstreamSearchResult } from '../schema';
import { SpaceConfigEntity, SpaceMetadataDto } from './spaces';

export type SearchResult = {
  id: EntityId;
  name: string | null;
  description: string | null;
  spaces: Array<SpaceConfigEntity>;
  types: Array<{ id: EntityId; name: string | null }>;
};

export function SearchResultDto(result: SubstreamSearchResult): SearchResult {
  const spaces = result.currentVersion.version.versionSpaces.nodes.flatMap(result =>
    SpaceMetadataDto(result.space.id, result.space.spacesMetadatum.version)
  );

  return {
    id: result.id,
    name: result.currentVersion.version.name,
    description: result.currentVersion.version.description,
    types: result.currentVersion.version.versionTypes.nodes.map(t => {
      return {
        id: t.type.entityId,
        name: t.type.name,
      };
    }),
    spaces,
  };
}
