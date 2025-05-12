import 'mapbox-gl/dist/mapbox-gl.css';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { Skeleton } from './skeleton';

interface MapProps {
  latitude?: number;
  longitude?: number;
}

export const Map = ({ latitude = 0, longitude = 0 }: MapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [isMapboxLoaded, setIsMapboxLoaded] = useState(false);

  // Initialize map when component mounts
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const loadMapbox = async () => {
      // Dynamically import mapbox only when needed
      const mapboxgl = (await import('mapbox-gl')).default;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      if (mapContainerRef.current) {
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v11',
          center: [longitude, latitude],
          zoom: 9,
        });

        const marker = new mapboxgl.Marker().setLngLat([longitude, latitude]).addTo(map);

        mapRef.current = map;
        markerRef.current = marker;
        setIsMapboxLoaded(true);
      }
    };

    loadMapbox();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [latitude, longitude]);

  // Update map when coordinates change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const validLat = latitude !== undefined && !isNaN(latitude);
    const validLng = longitude !== undefined && !isNaN(longitude);

    if (validLat && validLng) {
      mapRef.current.setCenter([longitude, latitude]);
      markerRef.current.setLngLat([longitude, latitude]);
    }
  }, [latitude, longitude]);

  return (
    <div className="h-[200px] w-full rounded transition-all duration-200 ease-in-out">
      <div ref={mapContainerRef} className="h-full w-full rounded">
        {!isMapboxLoaded && <Skeleton className="h-full w-full rounded" />}
      </div>
    </div>
  );
};
