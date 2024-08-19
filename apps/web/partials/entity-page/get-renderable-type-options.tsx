import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { RenderableProperty, SwitchableRenderableType, ValueTypeId } from '~/core/types';

import { Date } from '~/design-system/icons/date';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';

export function getRenderableTypeFromValueType(valueType: ValueTypeId) {
  switch (valueType) {
    case SYSTEM_IDS.TEXT:
      return 'TEXT';
    case SYSTEM_IDS.DATE:
      return 'TIME';
    case SYSTEM_IDS.WEB_URL:
      return 'URI';
    // @TODO(relations): Add relation support
    // @TODO(relations): Add image support
    // Currently we don't have a value type id for relations
    default:
      return 'TEXT';
  }
}

export const getRenderableTypeSelectorOptions = (
  renderable: RenderableProperty,
  send: ReturnType<typeof useEditEvents>
): {
  label: React.ReactNode;
  value: SwitchableRenderableType;
  onClick: () => void;
}[] => {
  return [
    {
      label: (
        <div className="flex items-center gap-2">
          <Text />
          <p>Text</p>
        </div>
      ),
      value: 'TEXT' as const,
      onClick: () => send({ type: 'CHANGE_RENDERABLE_TYPE', payload: { renderable, type: 'TEXT' } }),
    },
    // @TODO(relations): Add image support
    {
      label: (
        <div className="flex items-center gap-2">
          <Date />
          <p>Date</p>
        </div>
      ),
      value: 'TIME' as const,
      onClick: () => send({ type: 'CHANGE_RENDERABLE_TYPE', payload: { renderable, type: 'TIME' } }),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <Url />
          <p>URI</p>
        </div>
      ),
      value: 'URI' as const,
      onClick: () => send({ type: 'CHANGE_RENDERABLE_TYPE', payload: { renderable, type: 'URI' } }),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <RelationSmall />
          <p>Relation</p>
        </div>
      ),
      value: 'RELATION' as const,
      onClick: () => send({ type: 'CHANGE_RENDERABLE_TYPE', payload: { renderable, type: 'RELATION' } }),
    },
  ];
};
