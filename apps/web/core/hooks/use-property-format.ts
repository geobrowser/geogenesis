'use client';

import { FORMAT_PROPERTY } from '~/core/constants';
import { useValue } from '~/core/sync/use-store';
import { isUrlTemplate, resolveUrlTemplate } from '~/core/utils/url-template';

export function usePropertyFormat(propertyId: string, spaceId: string) {
  const formatValue = useValue({
    selector: v => v.entity.id === propertyId && v.spaceId === spaceId && v.property.id === FORMAT_PROPERTY,
  });

  const format = formatValue?.value ?? null;
  const hasUrlTemplate = isUrlTemplate(format);

  return {
    format,
    hasUrlTemplate,
    resolveUrl: (value: string) => (hasUrlTemplate ? resolveUrlTemplate(format, value) : value),
  };
}
