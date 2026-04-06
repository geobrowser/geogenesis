import { Cell, Property } from '~/core/types';

/**
 * Description line + long-text property values in list/gallery browse.
 * Uses explicit token sizes so property fields match the system description block (avoids `text-tableCell` bleed).
 */
export const LIST_GALLERY_BROWSE_BODY_CLASS =
  '!text-[length:var(--text-metadata)] !leading-[length:var(--text-metadata--line-height)] font-normal text-grey-04';

/**
 * Vertical gap before the next row in list/gallery browse (Figma):
 * - 4px before a text/scalar line (name→description, description→scalar, scalar→scalar, relation→scalar).
 * - 8px before a relation-pill row (description→relation, scalar→relation, relation→relation).
 *
 * So margin-top is driven only by whether the incoming row is a relation field.
 */
export function browseListStackMarginTopForField(isRelation: boolean): string {
  return isRelation ? 'mt-2' : 'mt-1';
}

/**
 * List/gallery browse: show name → description → URLs & other values → related entities last.
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
