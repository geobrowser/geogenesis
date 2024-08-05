import { SpaceMetadataDto } from '../dto';
import { EntityId, SubstreamSearchResult } from '../schema';
import { SpaceConfigEntity } from './spaces';

export type Result = {
  id: EntityId;
  name: string | null;
  spaces: Array<SpaceConfigEntity>;
};

export function SearchResultDto(result: SubstreamSearchResult): Result {
  const spaces = result.entitySpaces.nodes.flatMap(space =>
    SpaceMetadataDto(space.id, space.spacesMetadata.nodes[0]?.entity)
  );

  return {
    id: result.id,
    name: result.name,
    spaces,
  };
}
