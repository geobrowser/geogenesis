import * as React from 'react';

import { Filter } from './filters';

export function useLocalFilters(canEdit: boolean, initialFilters: Filter[]) {
  const [temporaryFilters, setTemporaryFilters] = React.useState<Filter[]>(initialFilters);

  // Clear temporary filters when canEdit changes to true (user gains edit access)
  React.useEffect(() => {
    if (canEdit) {
      setTemporaryFilters([]);
    }
  }, [canEdit]);

  return {
    temporaryFilters,
    setTemporaryFilters,
  };
}
