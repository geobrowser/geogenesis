import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import type { EditEvent } from '~/core/events/edit-events';
import { RenderableProperty, SwitchableRenderableType, ValueTypeId } from '~/core/types';

import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { Image } from '~/design-system/icons/image';
import { Number } from '~/design-system/icons/number';
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
    case SYSTEM_IDS.URI:
      return 'URL';
    case SYSTEM_IDS.RELATION:
      return 'RELATION';
    case SYSTEM_IDS.IMAGE:
      return 'IMAGE';
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
        // A triple is created to set the default state to false instead of indeterminate
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
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <Image />
          </IconWrapper>
          <p>Image</p>
        </div>
      ),
      value: 'IMAGE' as const,
      onClick: () =>
        onSelect({
          type: 'IMAGE',
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
    {
      label: (
        <div className="flex items-center gap-2">
          <IconWrapper>
            <Date />
          </IconWrapper>
          <p>Date & time</p>
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
          <p>URL</p>
        </div>
      ),
      value: 'URL' as const,
      onClick: () =>
        onSelect({
          type: 'URL',
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
            <Number />
          </IconWrapper>
          <p>Number</p>
        </div>
      ),
      value: 'NUMBER' as const,
      onClick: () =>
        onSelect({
          type: 'NUMBER',
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

// Reserves a consistent amount of space for the icon
// (ensures the accompanying label text is aligned)
const IconWrapper = ({ children }: IconWrapperProps) => {
  return <div className="inline-flex w-5 items-center justify-center">{children}</div>;
};
