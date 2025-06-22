import { Property } from '~/core/v2.types';

// Since propertyQuery returns a minimal subset of Property data,
// we need a custom type for the query result
type PropertyQueryResult = {
  id: string;
  dataType: string;
  renderableType: string | null;
};

export function PropertyDtoLive(queryResult: PropertyQueryResult): Property {
  return {
    id: queryResult.id,
    name: null, // Not available from propertyQuery
    dataType: queryResult.dataType as Property['dataType'],
    relationValueTypes: undefined, // Not available from propertyQuery
    renderableType: queryResult.renderableType as Property['renderableType'],
  };
}