'use client';

import React from 'react';

import { DATA_TYPE_PROPERTY } from '~/core/constants';
import { SUGGESTED_NUMBER_FORMATS } from '~/core/constants';
import { useValue } from '~/core/sync/use-store';
import { ValueOptions } from '~/core/v2.types';

import { ArrowLeft } from './icons/arrow-left';

const SuggestedFormats = ({
  propertyId,
  entityId,
  spaceId,
  value,
  onChange,
}: {
  propertyId: string;
  entityId: string;
  spaceId: string;
  value: string;
  onChange: (value: string, options?: ValueOptions) => void;
}) => {
  const [visible, setVisible] = React.useState(true);

  const dataType = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === DATA_TYPE_PROPERTY,
  })?.value;

  return (
    visible && (
      <div className="mt-3 h-[200px] w-full rounded-md bg-grey-01 p-3">
        <div className="w-full">
          <span className="text-tableProperty font-medium leading-5 text-text">
            Other common {dataType === 'TIME' ? 'time' : 'number'} formats
          </span>
        </div>
        <div className="mt-2 flex flex-col">
          {SUGGESTED_NUMBER_FORMATS.filter(format => format.format !== value).map(option => (
            <FormatOption format={option.format} label={option.label} onChange={onChange} />
          ))}
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
