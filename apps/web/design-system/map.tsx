import mapboxgl from 'mapbox-gl';
import * as React from 'react';
import { useEffect, useRef } from 'react';

import 'mapbox-gl/dist/mapbox-gl.css';

interface MapProps {
  showMap: boolean;
  latitude?: number;
  longitude?: number;
}

export const Map = ({ 
  showMap, 
  latitude, 
  longitude 
}: MapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Initialize map when component mounts
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
    
    const defaultLat = latitude ?? 40;
    const defaultLng = longitude ?? -74.5;
    
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [defaultLng, defaultLat],
      zoom: 9
    });

    // Add marker to the map
    const marker = new mapboxgl.Marker()
      .setLngLat([defaultLng, defaultLat])
      .addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [showMap, latitude, longitude]);

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
      className={`w-full rounded transition-all duration-200 ease-in-out ${
        showMap ? 'h-[200px]' : 'h-0 opacity-0 overflow-hidden'
      }`}
    >
      {showMap ? (
        <div ref={mapContainerRef} className="h-full w-full rounded" />
      ) : null}
    </div>
  );
};