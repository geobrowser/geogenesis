import { Triple } from '~/modules/triple';
import { Column, Row, Triple as TripleType } from '~/modules/types';
import { DEFAULT_PAGE_SIZE, Entity } from '..';

export function fromColumnsAndRows(
  spaceId: string,
  rows: TripleType[],
  columns: Column[],
  columnsSchema: TripleType[][]
) {
  const rowTriplesWithEntityIds = Entity.entitiesFromTriples(rows);

  /* Finally, we can build our initialRows */
  const aggregatedRows = rowTriplesWithEntityIds.map(({ triples, id }) => {
    return columns.reduce((acc, column) => {
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);

      /* We are optional chaining here since there might not be any value type triples associated with the type attribute */
      const columnTypeTriple = columnsSchema.find(cs => cs[0]?.entityId === column.id);
      const columnValueType = columnTypeTriple?.[0].value.id;

      const defaultTriple = {
        ...Triple.emptyPlaceholder(spaceId, id, columnValueType),
        attributeId: column.id,
      };

      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [defaultTriple];

      const cell = {
        columnId: column.id,
        entityId: id,
        triples: cellTriples,
      };

      return {
        ...acc,
        [column.id]: cell,
      };
    }, {} as Row);
  });

  return {
    rows: aggregatedRows,
    hasNextPage: rowTriplesWithEntityIds.length > DEFAULT_PAGE_SIZE,
  };
}
