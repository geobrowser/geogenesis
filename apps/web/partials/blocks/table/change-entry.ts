import { EditEvent, EditEventContext } from '~/core/events/edit-events';
import { EntityId } from '~/core/io/schema';
import { SearchResult } from '~/core/v2.types';

export type ChangeEntryParams =
  | {
      type: 'EVENT';
      data: EditEvent;
    }
  | {
      type: 'Create';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean };
    }
  | {
      type: 'Find';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean };
    };

export type onChangeEntryFn = (context: EditEventContext, event: ChangeEntryParams) => void;

export type onLinkEntryFn = (
  id: string,
  to: {
    id: EntityId;
    name: string | null;
    space?: EntityId;
    verified?: boolean;
  },
  currentlyVerified?: boolean
) => void;
