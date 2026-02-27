'use client';

import React from 'react';

import {
  DATA_TYPE_ENTITY_IDS,
  DATA_TYPE_PROPERTY,
  GRC_20_SPECIFICATION_LINK,
  RENDERABLE_TYPE_PROPERTY,
  SUGGESTED_DATETIME_FORMATS,
  SUGGESTED_DATE_FORMATS,
  SUGGESTED_FLOAT_FORMATS,
  SUGGESTED_NUMBER_FORMATS,
  SUGGESTED_TIME_FORMATS,
  SUGGESTED_URL_FORMATS,
  UNICODE_LINK,
} from '~/core/constants';
import { getStrictRenderableType } from '~/core/io/dto/properties';
import { useRelations } from '~/core/sync/use-store';
import { ValueOptions } from '~/core/types';

import { ArrowLeft } from './icons/arrow-left';
import { NewTab } from './icons/new-tab';

// Reverse map: entity ID → data type name (e.g. 'DATE', 'TIME', etc.)
const ENTITY_ID_TO_DATA_TYPE = Object.fromEntries(Object.entries(DATA_TYPE_ENTITY_IDS).map(([type, id]) => [id, type]));

const FORMAT_MAP = {
  URL: SUGGESTED_URL_FORMATS,
  DATE: SUGGESTED_DATE_FORMATS,
  DATETIME: SUGGESTED_DATETIME_FORMATS,
  TIME: SUGGESTED_TIME_FORMATS,
  FLOAT: SUGGESTED_FLOAT_FORMATS,
  NUMBER: SUGGESTED_NUMBER_FORMATS,
} as const;

type FormatKind = keyof typeof FORMAT_MAP;

const DATA_TYPE_TO_FORMAT_KIND: Record<string, FormatKind> = {
  DATE: 'DATE',
  DATETIME: 'DATETIME',
  TIME: 'TIME',
  FLOAT: 'FLOAT',
  DECIMAL: 'FLOAT',
};

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

  const dataTypeRelation = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === DATA_TYPE_PROPERTY,
  })[0];
  const dataType = ENTITY_ID_TO_DATA_TYPE[dataTypeRelation?.toEntity.id ?? ''];

  const renderableTypeRelation = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === RENDERABLE_TYPE_PROPERTY,
  })[0];
  const renderableTypeStrict = getStrictRenderableType(renderableTypeRelation?.toEntity.id ?? null);

  React.useEffect(() => {
    setVisible(true);
  }, [dataType, renderableTypeStrict]);

  const formatKind: FormatKind =
    renderableTypeStrict === 'URL' ? 'URL' : (DATA_TYPE_TO_FORMAT_KIND[dataType ?? ''] ?? 'NUMBER');

  const renderableFormats = FORMAT_MAP[formatKind];
  const isTemporalType = formatKind === 'DATE' || formatKind === 'DATETIME' || formatKind === 'TIME';
  const viewAllLink = isTemporalType
    ? GRC_20_SPECIFICATION_LINK
    : formatKind === 'NUMBER' || formatKind === 'FLOAT'
      ? UNICODE_LINK
      : null;
  const formatKindLabel = isTemporalType
    ? 'date/time'
    : formatKind === 'URL'
      ? 'URL'
      : formatKind === 'FLOAT'
        ? 'float'
        : 'number';
  const formatLabel =
    renderableFormats.find(f => f.format === value)?.label || (formatKind === 'URL' ? 'Custom URL' : 'Unspecified');

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
            <span className="text-tableProperty leading-5 font-medium text-text">
              Other common {formatKindLabel} formats
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
