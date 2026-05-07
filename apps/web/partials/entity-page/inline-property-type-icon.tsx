import * as React from 'react';

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

  if (iconKey === 'RELATION') {
    return (
      <span className="inline-flex items-center p-0.5 text-text">
        <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="9.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="9.5" r="5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
    );
  }

  const Icon = TYPE_ICONS[iconKey];
  return (
    <span className="inline-flex items-center text-text [&_svg]:size-4">
      <Icon color="text" />
    </span>
  );
}
