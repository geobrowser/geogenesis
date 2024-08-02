import { SpaceMetadataDto } from '../dto';
import { EntityId, SubstreamSearchResult } from '../schema';
import { SpaceConfigEntity } from './spaces';

export type Result = {
  id: EntityId;
  name: string | null;
  nameTripleSpaces: Array<string>;
  spaces: Array<SpaceConfigEntity>;
};

export function SearchResultDto(result: SubstreamSearchResult): Result {
  const triples = result.triples.nodes;

  // If there is no latest version just return an empty entity.
  if (triples.length === 0) {
    return {
      id: result.id,
      name: result.name,
      nameTripleSpaces: [],
      spaces: [],
    };
  }

  const nameTripleSpaces = triples.map(triple => triple.space.id);
  const spaces = triples.flatMap(triple =>
    SpaceMetadataDto(triple.space.id, triple.space.spacesMetadata.nodes[0]?.entity)
  );

  return {
    id: result.id,
    name: result.name,
    nameTripleSpaces,
    spaces,
  };
}
