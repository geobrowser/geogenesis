import { SearchResult } from '~/core/v2.types';

import { RemoteResult } from '../v2/v2.schema';

export function SearchResultDto(result: RemoteResult): SearchResult {
  const spaces = [...result.spaces]; // @TODO(migration): Richer spaces

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    types: [...result.types],
    spaces: spaces,
  };
}
