import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { RenderableProperty } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

export function TableBlockPropertyField(props: {
  renderables: RenderableProperty[];
  spaceId: string;
  entityId: string;
}) {
  const isEditing = useUserIsEditing(props.spaceId);

  if (isEditing) {
    return <div className="flex flex-wrap gap-2">Hello world</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.renderables.map(renderable => {
        console.log('renderable', renderable);
        switch (renderable.type) {
          case 'TEXT':
          case 'NUMBER':
            return (
              <Text key={`string-${renderable.attributeId}-${renderable.value}`} as="p">
                {renderable.value}
              </Text>
            );
          case 'CHECKBOX': {
            const checked = getChecked(renderable.value);
            return <Checkbox key={`checkbox-${renderable.attributeId}-${renderable.value}`} checked={checked} />;
          }
          case 'TIME': {
            const time = new Date(renderable.value).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });

            return (
              <Text variant="breadcrumb" color="text" key={`time-${renderable.attributeId}-${renderable.value}`}>
                {time}
              </Text>
            );
          }
          case 'URL': {
            return (
              <WebUrlField
                key={`uri-${renderable.attributeId}-${renderable.value}`}
                isEditing={false}
                spaceId={props.spaceId}
                value={renderable.value}
              />
            );
          }
          case 'IMAGE':
            // We don't support rendering images in list or gallery views except the main image
            return null;
          case 'RELATION':
            return (
              <LinkableRelationChip
                isEditing={false}
                entityHref={NavUtils.toEntity(renderable.spaceId, renderable.value)}
                relationHref={NavUtils.toEntity(renderable.spaceId, renderable.relationId)}
              >
                {renderable.valueName ?? renderable.value}
              </LinkableRelationChip>
            );
        }
      })}
    </div>
  );
}
