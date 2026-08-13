import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { DATA_BLOCK_VIEW_EXPLORE_ID } from '~/core/data-block-ids';
import { ID } from '~/core/id';
import { RANKING_VIEW_PILL_ID } from '~/core/ranking-block-ids';
import { Relation } from '~/core/types';

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY' | 'BULLETED_LIST' | 'EXPLORE' | 'PILL';

/**
 * The view a block renders in, given the relations on its BLOCKS relation entity.
 *
 * Kept free of hooks so the server-rendered editor fallback can shape its loading placeholder
 * like the view it's loading into instead of always showing a table. `useView` imports the
 * editor store, so this can't live there without a cycle.
 */
export function dataBlockViewFromRelations(relations: Relation[]): DataBlockView {
  return getView(selectViewRelation(relations));
}

export function selectViewRelation(relations: Relation[]): Relation | undefined {
  const views = relations.filter(r => r.type.id === SystemIds.VIEW_PROPERTY && !r.isDeleted);
  if (views.length === 0) return undefined;

  const pool = views.some(r => r.isLocal) ? views.filter(r => r.isLocal) : views;

  return pool.reduce<Relation | undefined>((best, relation) => {
    if (!best) return relation;
    const bestTs = best.timestamp ?? '';
    const nextTs = relation.timestamp ?? '';
    return nextTs >= bestTs ? relation : best;
  }, undefined);
}

export const getView = (viewRelation: Relation | undefined): DataBlockView => {
  if (!viewRelation) return 'TABLE';

  const targetId = viewRelation.toEntity.id;
  if (ID.equals(targetId, SystemIds.TABLE_VIEW)) return 'TABLE';
  if (ID.equals(targetId, SystemIds.LIST_VIEW)) return 'LIST';
  if (ID.equals(targetId, SystemIds.GALLERY_VIEW)) return 'GALLERY';
  if (ID.equals(targetId, SystemIds.BULLETED_LIST_VIEW)) return 'BULLETED_LIST';
  if (ID.equals(targetId, DATA_BLOCK_VIEW_EXPLORE_ID)) return 'EXPLORE';
  if (ID.equals(targetId, RANKING_VIEW_PILL_ID)) return 'PILL';

  return 'TABLE';
};
