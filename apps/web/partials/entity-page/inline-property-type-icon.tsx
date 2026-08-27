import { DataType } from '~/core/types';

import { TYPE_ICONS, resolveRenderableTypeKey } from '~/partials/entity-page/type-icons';

type Props = {
  dataType: DataType;
  renderableType?: string | null;
};

export function InlinePropertyTypeIcon({ dataType, renderableType }: Props) {
  const hasIconKey = (key: string): key is keyof typeof TYPE_ICONS => key in TYPE_ICONS;
  const resolvedKey = resolveRenderableTypeKey(renderableType, renderableType);
  const iconKey: keyof typeof TYPE_ICONS = resolvedKey ?? (hasIconKey(dataType) ? dataType : 'TEXT');

  const Icon = TYPE_ICONS[iconKey];
  return (
    <span className="inline-flex items-center justify-center text-text [&_svg]:size-4">
      <Icon color="text" />
    </span>
  );
}
