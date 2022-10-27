import {Comparator, FilterClause, GeoValueType} from 'geo-schema';
import produce from 'immer';
import {
  createEmptyGeoValue,
  validateGeoAttributeData,
} from '@everest/react-native-slate';

export type FilterClauseAction =
  | {
      type: 'setPath';
      path: string[];
      valueId: string;
      valueType: GeoValueType;
    }
  | {
      type: 'setComparator';
      comparator: Comparator;
    }
  | {
      type: 'setText';
      text: string;
    };

export function filterClauseReducer(
  state: FilterClause,
  action: FilterClauseAction
): FilterClause {
  switch (action.type) {
    case 'setPath': {
      return produce(state, draft => {
        draft.path = action.path;
        draft.value = createEmptyGeoValue(action.valueId, action.valueType);
      });
    }
    case 'setComparator': {
      return produce(state, draft => {
        draft.comparator = action.comparator;
      });
    }
    case 'setText': {
      return produce(state, draft => {
        draft.value = validateGeoAttributeData(action.text, draft.value).value;
      });
    }
    default:
      return state;
  }
}
