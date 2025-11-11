// Re-export Place constants from core/constants for backward compatibility
export { 
  PLACE as PLACE_TYPE,
  ADDRESS as ADDRESS_TYPE,
  VENUE_PROPERTY,
  ADDRESS_PROPERTY, 
  MAPBOX_PROPERTY
} from '~/core/constants';

// Additional constants for Place functionality
export const SOURCES_TYPE = '49c5d5e1-679a-4dbd-bfd3-3f618f227c94';
export const SOURCE_DATABASE_IDENTIFIER_PROPERTY = '5e92c8a4-1714-4ee7-9a09-389ef4336aeb';
export const PROPERTIES_SOURCED = '198150d0-8f4e-410a-9329-9aab3ac3c1e3';
export const RELATIONS_SOURCED = '2596082f-f4d3-4a61-9b6a-831e253cb345';
