import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';

export const Map = ({
  browseMode,
  latitude,
  longitude,
}: {
  browseMode: boolean;
  latitude?: number;
  longitude?: number;
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Initialize map when component mounts
  useEffect(() => {
    if (!browseMode || !mapContainerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    // arbitrary default coordinates
    const defaultLat = latitude ?? 40;
    const defaultLng = longitude ?? -74.5;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [defaultLng, defaultLat],
      zoom: 9,
    });

    // Add marker to the map
    const marker = new mapboxgl.Marker().setLngLat([defaultLng, defaultLat]).addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [browseMode, latitude, longitude]);

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
    <div
      className={`w-full rounded transition-all duration-200 ease-in-out ${browseMode ? 'h-[200px]' : 'h-0 overflow-hidden opacity-0'}`}
    >
      {browseMode ? <div ref={mapContainerRef} className="h-full w-full rounded" /> : null}
    </div>
  );
};