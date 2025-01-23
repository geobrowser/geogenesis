import { FilterableValueType } from '~/core/value-types';

export type Filter = {
  columnId: string;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
};
