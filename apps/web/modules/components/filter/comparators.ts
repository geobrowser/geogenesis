import {Comparator, GeoValueType} from 'geo-schema';

export function getComparators(valueType: GeoValueType): Comparator[] {
  switch (valueType) {
    case GeoValueType.NUMBER:
      return [
        Comparator.IS_EQUAL_TO,
        Comparator.IS_GREATER_THAN,
        Comparator.IS_LESS_THAN,
      ];
    case GeoValueType.STRING:
      return [Comparator.IS_EQUAL_TO, Comparator.CONTAINS];
    default:
      return [Comparator.IS_EQUAL_TO];
  }
}

export function getComparatorDisplayName(comparator: Comparator) {
  switch (comparator) {
    case Comparator.CONTAINS:
      return 'Contains';
    case Comparator.IS_EQUAL_TO:
      return 'Is equal to';
    case Comparator.IS_GREATER_THAN:
      return 'Is greater than';
    case Comparator.IS_LESS_THAN:
      return 'Is less than';
    default:
      return 'Unsupported comparison';
  }
}
