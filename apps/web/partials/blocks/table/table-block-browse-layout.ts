import { Cell, Property } from '~/core/types';

/**
 * List/gallery browse (Figma): show name → description → URLs & other values → related entities last.
 * Relation columns are rendered without chip styling via `browsePlainRelations` on the field component.
 */
export function orderCellsForBrowseFigma(cells: Cell[], properties: Record<string, Property> | undefined): Cell[] {
  if (!properties) return cells;
  const scalars: Cell[] = [];
  const relations: Cell[] = [];
  for (const c of cells) {
    const p = properties[c.slotId];
    if (!p) continue;
    if (p.dataType === 'RELATION') relations.push(c);
    else scalars.push(c);
  }
  return [...scalars, ...relations];
}
