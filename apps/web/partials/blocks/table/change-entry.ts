import { EditEvent, EditEventContext } from '~/core/events/edit-events';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId } from '~/core/io/schema';

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
