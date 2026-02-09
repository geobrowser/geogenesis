'use client';

import React from 'react';

import { DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY, SUGGESTED_URL_FORMATS } from '~/core/constants';
import {
  GRC_20_SPECIFICATION_LINK,
  SUGGESTED_NUMBER_FORMATS,
  SUGGESTED_TIME_FORMATS,
  UNICODE_LINK,
} from '~/core/constants';
import { useRelations, useValue } from '~/core/sync/use-store';
import { ValueOptions } from '~/core/types';
import { getStrictRenderableType } from '~/core/io/dto/properties';

import { ArrowLeft } from './icons/arrow-left';
import { NewTab } from './icons/new-tab';

const SuggestedFormats = ({
  entityId,
  spaceId,
  value,
  onChange,
}: {
  entityId: string;
  spaceId: string;
  value: string;
  onChange: (value: string, options?: ValueOptions) => void;
}) => {
  const [visible, setVisible] = React.useState(true);

  const dataType = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === DATA_TYPE_PROPERTY,
  })?.value;

  const renderableTypeRelation = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === RENDERABLE_TYPE_PROPERTY,
  })[0];
  const renderableTypeStrict = getStrictRenderableType(renderableTypeRelation?.toEntity.id ?? null);

  React.useEffect(() => {
    setVisible(true);
  }, [dataType, renderableTypeStrict]);

  const formatKind =
    renderableTypeStrict === 'URL' ? 'URL' : dataType === 'TIME' ? 'TIME' : 'NUMBER';
  const renderableFormats =
    formatKind === 'URL'
      ? SUGGESTED_URL_FORMATS
      : formatKind === 'TIME'
        ? SUGGESTED_TIME_FORMATS
        : SUGGESTED_NUMBER_FORMATS;
  const viewAllLink =
    formatKind === 'TIME' ? GRC_20_SPECIFICATION_LINK : formatKind === 'NUMBER' ? UNICODE_LINK : null;
  const formatLabel =
    renderableFormats.find(f => f.format === value)?.label ||
    (formatKind === 'URL' ? 'Custom URL' : 'Unspecified');

  return (
    visible && (
      <div className="mt-1 flex w-full flex-col">
        <div className="flex items-center gap-1 text-[13px] font-normal text-grey-04">
          <span>Browse format</span>
          <span className="h-[2px] w-[2px] rounded-full bg-grey-04"></span>
          <span>{formatLabel}</span>
        </div>
        <div className="mt-3 w-full rounded-md bg-grey-01 p-3">
          <div className="flex w-full justify-between">
            <span className="text-tableProperty font-medium leading-5 text-text">
              Other common {formatKind === 'URL' ? 'URL' : formatKind === 'TIME' ? 'time' : 'number'} formats
            </span>
            <div className="flex">
              {viewAllLink && (
                <a
                  className="mr-4 flex items-center gap-[6px] text-ctaHover"
                  target="_blank"
                  rel="noreferrer"
                  href={viewAllLink}
                >
                  View all
                  <NewTab />
                </a>
              )}
              <button onClick={() => setVisible(false)} className="text-ctaHover">
                Dismiss
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-col">
            {renderableFormats
              .filter(format => format.format !== value)
              .map(option => (
                <FormatOption key={option.format} format={option.format} label={option.label} onChange={onChange} />
              ))}
          </div>
        </div>
      </div>
    )
  );
};

export default SuggestedFormats;

const FormatOption = ({
  format,
  label,
  onChange,
}: {
  format: string;
  label: string;
  onChange: (value: string, options?: ValueOptions) => void;
}) => {
  return (
    <span className="flex items-center">
      <button onClick={() => onChange(format)} className="mr-2 text-[1rem] text-ctaHover">
        Use
      </button>
      <span className="mr-2">{format}</span>
      <div className="mr-2 rotate-180">
        <ArrowLeft color="grey-04" />
      </div>
      <span className="mr-2">{label}</span>
    </span>
  );
};
