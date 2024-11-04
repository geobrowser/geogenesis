import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import type { EditEvent } from '~/core/events/edit-events';
import { RenderableProperty, SwitchableRenderableType, ValueTypeId } from '~/core/types';

import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';

export function getRenderableTypeFromValueType(valueType: ValueTypeId) {
  switch (valueType) {
    case SYSTEM_IDS.TEXT:
      return 'TEXT';
    case SYSTEM_IDS.CHECKBOX:
      return 'CHECKBOX';
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
  onSelect: (renderableType: RenderableProperty) => void,
  send: (event: EditEvent) => void
): {
  label: React.ReactNode;
  value: SwitchableRenderableType;
  onClick: () => void;
}[] => {
  return [
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <Text />
          </IconWrapper>
          <p>Text</p>
        </div>
      ),
      value: 'TEXT' as const,
      onClick: () => {
        onSelect({
          type: 'TEXT',
          entityId: renderable.entityId,
          entityName: renderable.entityName,
          attributeId: renderable.attributeId,
          attributeName: renderable.attributeName,
          value: '',
          spaceId: renderable.spaceId,
          placeholder: true,
        });
      },
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <CheckboxChecked />
          </IconWrapper>
          <p>Checkbox</p>
        </div>
      ),
      value: 'CHECKBOX' as const,
      onClick: () => {
        onSelect({
          type: 'CHECKBOX',
          entityId: renderable.entityId,
          entityName: renderable.entityName,
          attributeId: renderable.attributeId,
          attributeName: renderable.attributeName,
          value: '0',
          spaceId: renderable.spaceId,
          placeholder: true,
        });
        send({
          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          payload: {
            renderable: {
              ...renderable,
              type: 'CHECKBOX',
              placeholder: false,
              value: '0',
            },
            value: {
              type: 'CHECKBOX',
              value: '0',
            },
          },
        });
      },
    },
    // @TODO(relations): Add image support
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <Date />
          </IconWrapper>
          <p>Date</p>
        </div>
      ),
      value: 'TIME' as const,
      onClick: () =>
        onSelect({
          type: 'TIME',
          entityId: renderable.entityId,
          entityName: renderable.entityName,
          attributeId: renderable.attributeId,
          attributeName: renderable.attributeName,
          value: '',
          spaceId: renderable.spaceId,
          placeholder: true,
        }),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <Url />
          </IconWrapper>
          <p>URI</p>
        </div>
      ),
      value: 'URI' as const,
      onClick: () =>
        onSelect({
          type: 'URI',
          entityId: renderable.entityId,
          entityName: renderable.entityName,
          attributeId: renderable.attributeId,
          attributeName: renderable.attributeName,
          value: '',
          spaceId: renderable.spaceId,
          placeholder: true,
        }),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <RelationSmall />
          </IconWrapper>
          <p>Relation</p>
        </div>
      ),
      value: 'RELATION' as const,
      onClick: () =>
        onSelect({
          type: 'RELATION',
          entityId: renderable.entityId,
          entityName: renderable.entityName,
          attributeId: renderable.attributeId,
          attributeName: renderable.attributeName,
          value: '',
          relationId: '',
          valueName: null,
          spaceId: renderable.spaceId,
          placeholder: true,
        }),
    },
  ];
};

type IconWrapperProps = {
  children: React.ReactNode;
};

const IconWrapper = ({ children }: IconWrapperProps) => {
  return <div className="inline-flex w-5 items-center justify-center">{children}</div>;
};
