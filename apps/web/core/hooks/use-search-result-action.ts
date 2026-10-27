'use client';

import { useCallback } from 'react';

import type { ActionScope } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { entityActionType } from '~/core/action-entity-context';
import { recordAction } from '~/core/analytics-operations';
import type { SearchResult } from '~/core/types';

/** Shared by mouse, keyboard, and per-space selection in both search surfaces. */
export function useSearchResultAction(scope: ActionScope = {}) {
  const getContext = useActionContext('search', 'entity', '', scope);
  return useCallback(
    (result: SearchResult, index: number, listId: string) => {
      recordAction(
        'search_result',
        getContext({
          target_id: result.id,
          target_type: entityActionType(result.types),
          target_type_ids: result.types.map(type => type.id),
          list_id: listId,
          item_position: index + 1,
        })
      );
    },
    [getContext]
  );
}
