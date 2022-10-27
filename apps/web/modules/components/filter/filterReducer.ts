import {Filter, FilterClause} from 'geo-schema';
import produce from 'immer';

export type FilterAction =
  | {
      type: 'setClause';
      index: number;
      clause: FilterClause;
    }
  | {
      type: 'addClause';
      clause: FilterClause;
    }
  | {
      type: 'deleteClause';
      index: number;
    };

export function filterReducer(state: Filter, action: FilterAction): Filter {
  switch (action.type) {
    case 'addClause': {
      return produce(state, draft => {
        draft.clauses.push(action.clause);
      });
    }
    case 'setClause': {
      return produce(state, draft => {
        draft.clauses[action.index] = action.clause;
      });
    }
    case 'deleteClause': {
      return produce(state, draft => {
        draft.clauses.splice(action.index, 1);
      });
    }
    default:
      return state;
  }
}
