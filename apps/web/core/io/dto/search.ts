import { SearchResult } from '~/core/types';
import { sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

import { RemoteSearchResult } from '../schema';

export function SearchResultDto(result: RemoteSearchResult): SearchResult {
  const spaces = sortSpaceIdsByRank([...result.spaceIds]);

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    types: [...result.types],
    spaces: spaces.map(s => {
      return {
        id: s,
        name: null,
        description: null,
        image: '',
        relations: [],
        spaceId: s,
        spaces: [s],
        values: [],
        types: [],
      };
    }),
  };
}
