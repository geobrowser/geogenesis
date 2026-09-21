import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import 'mapbox-gl/dist/mapbox-gl.css';

import { GeoPoint } from '~/core/utils/utils';

import { Skeleton } from './skeleton';

const DEFAULT_ZOOM = 9;

interface MapProps {
  latitude?: number;
  longitude?: number;
}

export const Map = ({ latitude = 0, longitude = 0 }: MapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [isMapboxLoaded, setIsMapboxLoaded] = useState(false);

  const lat = GeoPoint.clampLatForMap(latitude);
  const lng = GeoPoint.clampLngForMap(longitude);
  const center = React.useMemo<[number, number]>(() => [lng, lat], [lng, lat]);

  // Initialize map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const loadMapbox = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      if (!mapContainerRef.current) return;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center,
        zoom: DEFAULT_ZOOM,
      });

      const marker = new mapboxgl.Marker().setLngLat(center).addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
      setIsMapboxLoaded(true);
    };

    loadMapbox();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // Mount only: this creates the map and tears it down. `center` is read for the initial view,
    // and depending on it would rebuild the whole map every time the coordinates moved — which is
    // what the effect below exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map when coordinates change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const validLat = latitude !== undefined && !isNaN(latitude);
    const validLng = longitude !== undefined && !isNaN(longitude);

    if (validLat && validLng) {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(DEFAULT_ZOOM);
      markerRef.current.setLngLat(center);
    }
  }, [center, latitude, longitude]);

  return (
    <div className="h-[200px] w-full rounded transition-all duration-200 ease-in-out">
      <div ref={mapContainerRef} className="h-full w-full rounded">
        {!isMapboxLoaded && <Skeleton className="h-full w-full rounded" />}
      </div>
    </div>
  );
};
