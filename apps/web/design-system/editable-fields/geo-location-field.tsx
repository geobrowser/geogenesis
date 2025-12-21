import { cva } from 'class-variance-authority';
import Textarea from 'react-textarea-autosize';

import * as React from 'react';
import { useEffect } from 'react';

import { useOptimisticValueWithSideEffect } from '~/core/hooks/use-debounced-value';
import { useGeoCoordinates } from '~/core/hooks/use-geo-coordinates';
import { GeoPoint } from '~/core/utils/utils';

import { Map } from '../map';

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
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
  hideInputs?: boolean;
}

export function GeoLocationPointFields({ ...props }: PageGeoLocationFieldProps) {
  const [pointValues, setPointsValues] = React.useState(() => {
    const coordinates = GeoPoint.parseCoordinates(props.value);
    return {
      latitude: coordinates?.latitude.toString() || '',
      longitude: coordinates?.longitude.toString() || '',
    };
  });

  const validNumberPattern = /^-?\d*\.?\d*$/;

  const handlePointValueChange = (label: string, newValue: string) => {
    if (newValue === '' || validNumberPattern.test(newValue)) {
      const updatedPoints = {
        ...pointValues,
        [label]: newValue,
      };
      setPointsValues(updatedPoints);
      const lat = parseFloat(updatedPoints.latitude) || 0;
      const lon = parseFloat(updatedPoints.longitude) || 0;
      props.onChange(GeoPoint.formatCoordinates(lat, lon));
    } else {
      console.error(`Invalid ${label} input: "${newValue}". Coordinate values must be numeric.`);
    }
  };

  // Update point values when props.value changes from outside
  useEffect(() => {
    const coordinates = GeoPoint.parseCoordinates(props.value);
    if (coordinates) {
      const newLat = coordinates.latitude.toString();
      const newLon = coordinates.longitude.toString();
      // Only update if values actually changed to prevent overwriting user input
      if (pointValues.latitude !== newLat || pointValues.longitude !== newLon) {
        setPointsValues({
          latitude: newLat,
          longitude: newLon,
        });
      }
    }
  }, [props.value, pointValues.latitude, pointValues.longitude]);

  return (
    <div className="flex w-full flex-col gap-4">
      {!props.hideInputs && (
        <div className="mt-[3px] flex w-full justify-between leading-[29px]">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <label className="text-[19px] text-bodySemibold font-normal text-text">Latitude</label>
              <span className="w-[11px] border-t border-t-[#606060]"></span>
              <Textarea
                {...props}
                onChange={e => handlePointValueChange('latitude', e.currentTarget.value)}
                value={pointValues.latitude}
                maxRows={1}
                className={`${textareaStyles({ variant: props.variant })} max-w-[190px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[19px] text-bodySemibold font-normal text-text">Longitude</label>
              <span className="w-[11px] border-t border-t-[#606060]"></span>
              <Textarea
                {...props}
                onChange={e => handlePointValueChange('longitude', e.currentTarget.value)}
                value={pointValues.longitude}
                maxRows={1}
                className={`${textareaStyles({ variant: props.variant })} max-w-[190px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
              />
            </div>
          </div>
        </div>
      )}
      <Map latitude={parseFloat(pointValues.latitude) || 0} longitude={parseFloat(pointValues.longitude) || 0} />
    </div>
  );
}

export function GeoLocationWrapper({
  id,
  spaceId,
  propertyType,
}: {
  relationId?: string;
  id: string;
  spaceId: string;
  propertyType?: string;
}) {
  const geoData = useGeoCoordinates(id, spaceId, propertyType);

  // Only render if there's geo location data
  if (!geoData?.geoLocation) {
    return null;
  }

  // Parse coordinates for the map
  const coordinates = GeoPoint.parseCoordinates(geoData.geoLocation);

  if (!coordinates) {
    return null;
  }

  return (
    <div className="mt-2 w-full">
      <Map latitude={coordinates.latitude} longitude={coordinates.longitude} />
    </div>
  );
}
