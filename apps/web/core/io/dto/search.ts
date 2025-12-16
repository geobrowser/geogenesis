import { SearchResult } from '~/core/v2.types';

import { RemoteSearchResult } from '../v2/v2.schema';

export function SearchResultDto(result: RemoteSearchResult): SearchResult {
  const spaces = [...result.spaceIds]; // @TODO(migration): Richer spaces

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
