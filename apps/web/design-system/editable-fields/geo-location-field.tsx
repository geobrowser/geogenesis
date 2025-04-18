import * as React from 'react';
import { useEffect } from 'react';
import Textarea from 'react-textarea-autosize';

import { useOptimisticValueWithSideEffect } from '~/core/hooks/use-debounced-value';
import { Map } from '../map';
import { cva } from 'class-variance-authority';

const DISAPLY_MAP_FORMAT_OPTION = 'EARTH COORDINATES';

const textareaStyles = cva(
  'm-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-03 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'text-mainPage',
        body: 'text-body',
        tableCell: '-mb-0 text-tableCell',
        smallTitle: 'text-smallTitle',
      },
    },
    defaultVariants: {
      variant: 'body',
    },
  }
);

interface PageGeoLocationFieldProps {
  onChange: (value: string, isBrowseMode: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
  format?: string;
}

export function GeoLocationPointFields({ ...props }: PageGeoLocationFieldProps) {
  const [localFormat, setLocalFormat] = React.useState(props.format || '');
  
  const { value: localValue, onChange: setLocalValue } = useOptimisticValueWithSideEffect({
    callback: (value) => props.onChange(value, localFormat),
    delay: 1000,
    initialValue: props.value || '',
  });
  
  const [pointValues, setPointsValues] = React.useState({
    latitude: props.value?.split(',')[0]?.replaceAll(' ', '') || '',
    longitude: props.value?.split(',')[1]?.replaceAll(' ', '') || '',
  });

  const validNumberPattern = /^-?\d*\.?\d*$/;

  const handlePointValueChange = (label: string, newValue: string) => {
    if (newValue === '' || validNumberPattern.test(newValue)) {
      const updatedPoints = {
        ...pointValues,
        [label]: newValue,
      };
      setPointsValues(updatedPoints);
      setLocalValue(`${updatedPoints.latitude},${updatedPoints.longitude}`);
    } else {
      console.error('Invalid input');
    }
  };

  // Update point values when props.value changes from outside
  useEffect(() => {
    if (props.value && props.value !== localValue) {
      const parts = props.value.split(',');
      setPointsValues({
        latitude: parts[0]?.replaceAll(' ', '') || '',
        longitude: parts[1]?.replaceAll(' ', '') || '',
      });
    }
  }, [props.value]);

  // Update format when props.format changes
  useEffect(() => {
    if (props.format !== undefined) {
      setLocalFormat(props.format);
    }
  }, [props.format]);

  // Handle map visibility toggle
  const handleShowMapToggle = () => {
    const newFormat = localFormat === DISAPLY_MAP_FORMAT_OPTION ? '' : DISAPLY_MAP_FORMAT_OPTION;
    setLocalFormat(newFormat);
    // Notify parent of format change immediately
    props.onChange(localValue, newFormat);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="mt-[3px] flex w-full justify-between  leading-[29px]">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <label className="text-[19px] text-bodySemibold font-normal text-text">Latitude</label>
            <span className="w-[11px] border-t border-t-[#606060]"></span>
            <Textarea
              {...props}
              onChange={e => handlePointValueChange('latitude', e.currentTarget.value)}
              value={pointValues.latitude}
              className={`${textareaStyles({ variant: props.variant })} max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[19px] text-bodySemibold font-normal text-text">Longitude</label>
            <span className="w-[11px] border-t border-t-[#606060]"></span>
            <Textarea
              {...props}
              onChange={e => handlePointValueChange('longitude', e.currentTarget.value)}
              value={pointValues.longitude}
              className={`${textareaStyles({ variant: props.variant })} max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
            />
          </div>
        </div>
        <div className="flex h-7 items-center gap-[6px]">
          {/* Toggle */}
          <div className="relative h-3 w-5 cursor-pointer rounded-lg bg-black" onClick={handleShowMapToggle}>
            <div
              className={`absolute top-[1px] h-[10px] w-[10px] rounded-full bg-white transition-all duration-300 ease-in-out ${localFormat === DISAPLY_MAP_FORMAT_OPTION ? 'right-[1px]' : 'right-[9px]'}`}
            ></div>
          </div>
          <span className="text-[1rem] font-normal leading-5 text-grey-04">Show map in browse mode</span>
        </div>
      </div>
      <Map
        showMap={localFormat === DISAPLY_MAP_FORMAT_OPTION}
        latitude={parseFloat(pointValues.latitude) || 0}
        longitude={parseFloat(pointValues.longitude) || 0}
      />
    </div>
  );
}
